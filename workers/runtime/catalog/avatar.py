"""Avatar module — one of the modules composed into EmceeBot (catalog/emcee.py,
docs/decisions.md 2026-07-20 "Emcee merge"). Spec: specs/bots/avatar.md.

Four independent pieces, each gated by its own config section and (where the
action changes something room-visible) the same owner/owner_designers/
allowlist permission shape Emote's `emote_all` already uses — both now go
through the shared `permissions.check_tiered_permission` rather than two
copies of the same tier logic.

- **Anchor spot** — saying "anchor" teleports the bot to the speaker's
  current position and persists it (`avatar_positions`, one row per
  instance); restored on every `on_start` so the bot doesn't spawn wherever
  the room happens to drop it. Deliberately *not* driven by dragging the
  bot's own avatar around: there's no confirmed SDK event for "this bot was
  moved by someone else," only for reading *other* users' positions
  (`on_user_join`/`on_user_move`, both already confirmed handlers). Tracking
  the speaker's own last-known `Position` and teleporting the bot there on
  command sidesteps that unknown entirely. The same saved row can also be
  set directly from the dashboard (raw x/y/z/facing, for an owner who
  already knows the coordinates rather than standing in-room) — that write
  goes straight to `avatar_positions`, then a dedicated `avatar_position.
  updated` Postgres NOTIFY (separate from `config.updated`, since this isn't
  part of the JSON config) tells the supervisor to call `restore_position`
  again on the running bot, live, no reconnect needed.
- **Idle emote loop** — solo `send_emote(emote_id)` (no target) on a repeat
  interval. Re-reads config every tick rather than capturing it once, so
  turning it off takes effect within one interval; turning it back on needs
  a reconnect in v1 (same class of gap as any other `requires_reconnect`-ish
  field, specs/04-bot-runtime.md) since nothing currently re-triggers
  `_maybe_start_idle_loop` outside of `on_start`.
- **Reaction back** — `on_reaction`'s `receiver` field is the ReactionEvent's
  target; only reacts back when `receiver.id == self.bot.highrise.my_id`
  (someone reacted *at* the bot). No extra loop guard needed: the bot's own
  `react()` call echoes back (if at all) with `receiver` set to the original
  human, not the bot, so it can never re-trigger itself. Per-reactor cooldown
  (`reaction_back.cooldown_s`) matches every other player-triggered action in
  this bot (`emote_on_say`, `loop`, `welcome`) — without one, a single user
  spamming reactions at the bot would burn through the shared NORMAL-priority
  throttle budget and crowd out anchor/whisper/preset actions for the whole
  room (CLAUDE.md: "a spammy catalog is an existential risk").
- **Outfit** — three separate sections (`default_outfit`, `outfit_presets`,
  `outfit_clone`), all built on facts confirmed 2026-07-21 by reading the
  pinned SDK source directly (highrise-bot-sdk 25.1.0's `models.py`/
  `webapi.py`/`models_webapi.py`), not just the docs — see docs/decisions.md:
  - `set_outfit(outfit: list[Item])` *replaces* the whole outfit; Highrise's
    own server enforces required-slot completeness (body/eyes/nose/mouth/
    eyebrows + a lower-body combo) and rejects an incomplete list outright.
    This module never tries to reimplement that completeness rule itself —
    Highrise's own rejection (an `Error` return) is treated as authoritative,
    and a rejection just keeps the bot's previous outfit, same "keep
    last-good" posture as `CatalogBot.apply_config`.
  - `default_outfit`/`outfit_presets` expect the *owner* to supply a
    complete item id list (the schema's own field description says so) —
    ids the bot doesn't currently own are filtered out before the call
    (`_equip_owned`), which can turn an otherwise-complete list incomplete
    and get the whole change rejected; that's a config mistake to fix on
    the dashboard, not something this module can safely paper over.
  - `outfit_clone` can't assume that: a stranger's outfit intersected with
    the bot's own inventory is very unlikely to be complete on its own
    (most of what a real player wears, the bot won't own). So clone merges
    matched items *on top of* the bot's current outfit by category
    (`_merge_by_category`, one `self.bot.webapi.get_item()` call per
    candidate item to learn its category — the outfit/inventory `Item`
    model itself carries no category field, only the webapi's fuller Item
    does) rather than replacing wholesale — this guarantees the result is
    never less complete than what the bot already had. `min_match` still
    guards against a near-empty match (e.g. only a hat matched) applying at
    all and looking like a broken swap rather than a deliberate one. A
    per-item category lookup that itself fails (`ResponseError` — a delisted
    item, a transient webapi hiccup) is treated the same way an unowned id
    already is in `_equip_owned`: that one item is left out of the merge
    rather than aborting the whole clone, since `webapi.py` raises on a
    non-200 response instead of returning an `Error` value the way the
    `self.highrise` action methods do — this module has to catch it
    explicitly rather than the usual `isinstance(x, Error)` check.
  - `_equip_owned` and clone's read-current/merge/write sequence both hold a
    per-engine `asyncio.Lock` (`_outfit_lock`) across their read-then-write
    span. The SDK dispatches every chat message as its own concurrent task
    (`tg.create_task(bot.on_chat(...))` in `highrise/__main__.py`), so two
    outfit-changing commands landing close together (owner + a designer, or
    a double-tap) would otherwise interleave — whichever finishes its HTTP
    round trips last would win outright and silently discard the other's
    change. The lock makes the two commands apply in the order they
    started, one fully finishing before the next one's read begins, instead
    of racing on `set_outfit`.
  - No auto-buying anything, ever: `buy_item()`/`tip_user()` spend the bot's
    own Highrise wallet, which is Gold-adjacent enough (CLAUDE.md's "never
    accept, hold, or transfer Highrise Gold") that it's out of scope
    entirely rather than a judgment call made silently in code.

`AvatarEngine` is a plain class, not a `CatalogBot` — same reasoning as
every other module here: it reads and writes through the `EmceeBot`
instance passed to its constructor so multiple modules share one
connection, one throttle, and one config object without knowing about each
other. Nothing here is an SDK handler in its own right; `EmceeBot`'s own
(shielded) handlers call into this engine's same-named methods.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

import db

from highrise import Error, ResponseError, User
from highrise.models import AnchorPosition, Item, Position, Reaction

from .base import Priority
from .emotes import normalize
from .permissions import check_cooldown, check_tiered_permission

if TYPE_CHECKING:
    from .emcee import EmceeBot

log = logging.getLogger("catalog.avatar")

ANCHOR_WORD = "anchor"
LOOK_PREFIX = "look "
COPY_PREFIX = "copy "


def _parse_presets(lines: list[str]) -> dict[str, list[str]]:
    """Parses "name: id1, id2, ..." lines into {normalized name: [item ids]}.
    A malformed line (no colon) or one with no ids after it is skipped
    rather than raising — a typo'd preset just doesn't show up, matching
    this module's silent-on-unrecognized convention elsewhere."""
    presets: dict[str, list[str]] = {}
    for line in lines:
        name, sep, ids = line.partition(":")
        if not sep:
            continue
        item_ids = [i.strip() for i in ids.split(",") if i.strip()]
        if item_ids:
            presets[normalize(name)] = item_ids
    return presets


class AvatarEngine:
    def __init__(self, bot: "EmceeBot") -> None:
        self.bot = bot
        self._last_position: dict[str, Position] = {}  # user_id -> last known floor Position
        self._idle_task: asyncio.Task | None = None
        self._last_reaction_at: dict[str, float] = {}  # user_id -> last time we reacted back at them
        self._outfit_lock = asyncio.Lock()  # serializes read-then-set_outfit across concurrent commands

    # --- lifecycle -------------------------------------------------------

    async def on_start(self) -> None:
        await self.restore_position()
        await self._apply_default_outfit()
        self._maybe_start_idle_loop()

    async def on_user_join(self, user: User, position: Position | AnchorPosition) -> None:
        if isinstance(position, Position):
            self._last_position[user.id] = position

    async def on_user_move(self, user: User, destination: Position | AnchorPosition) -> None:
        if isinstance(destination, Position):
            self._last_position[user.id] = destination

    async def on_user_leave(self, user: User) -> None:
        self._last_position.pop(user.id, None)

    async def on_reaction(self, user: User, reaction: Reaction, receiver: User) -> None:
        cfg = self.bot.config.get("reaction_back", {})
        if not cfg.get("enabled", True):
            return
        if receiver.id != self.bot.highrise.my_id:
            return
        if not check_cooldown(self._last_reaction_at, user.id, cfg.get("cooldown_s", 2)):
            return
        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.react(reaction, user.id)

    async def on_chat(self, user: User, message: str) -> None:
        text = normalize(message)

        if text == ANCHOR_WORD:
            await self._anchor(user)
            return

        if text.startswith(LOOK_PREFIX):
            await self._switch_preset(user, text[len(LOOK_PREFIX) :].strip())
            return

        if text.startswith(COPY_PREFIX):
            await self._clone(user, text[len(COPY_PREFIX) :].strip())
            return

    async def _find_room_user(self, username: str) -> User | None:
        response = await self.bot.highrise.get_room_users()
        if isinstance(response, Error):
            log.warning("avatar: get_room_users failed: %s", response)
            return None
        target = normalize(username)
        for room_user, _position in response.content:
            if normalize(room_user.username) == target:
                return room_user
        return None

    # --- anchor spot -------------------------------------------------------

    async def _anchor(self, user: User) -> None:
        cfg = self.bot.config.get("position", {})
        if not cfg.get("enabled", True):
            return
        if not await check_tiered_permission(user, cfg, self.bot._room_owner_id, self.bot.highrise):
            return

        position = self._last_position.get(user.id)
        if position is None:
            # No cached floor Position — most likely the speaker is seated
            # on furniture right now (an AnchorPosition, which teleport()
            # can't target) rather than standing.
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.send_whisper(
                user.id, "Stand on the floor (not seated) where you want me, then say \"anchor\" again."
            )
            return

        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.teleport(self.bot.highrise.my_id, position)
        await self._save_position(position)

    async def restore_position(self) -> None:
        """Loads the saved anchor spot from `avatar_positions` and teleports
        the bot there. Called on `on_start` (so a reconnect walks back to
        the last spot instead of spawning wherever the room drops it) and
        again, live, whenever the dashboard saves a position directly —
        `EmceeBot.apply_avatar_position` is the supervisor's entry point for
        the latter (specs/bots/avatar.md's dashboard-set coordinates path),
        no reconnect required since this just re-reads the same row the
        in-game "anchor" command already writes to."""
        cfg = self.bot.config.get("position", {})
        if not cfg.get("enabled", True):
            return
        pool, instance_id = self.bot.db_pool, self.bot.bot_instance_id
        if pool is None or instance_id is None:
            return
        try:
            row = await db.get_avatar_position(pool, instance_id)
        except Exception:
            log.warning("avatar: failed to load saved anchor position for instance %s", instance_id)
            return
        if row is None:
            return
        position = Position(x=row["x"], y=row["y"], z=row["z"], facing=row["facing"])
        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.teleport(self.bot.highrise.my_id, position)

    async def _save_position(self, position: Position) -> None:
        pool, instance_id = self.bot.db_pool, self.bot.bot_instance_id
        if pool is None or instance_id is None:
            return
        try:
            await db.set_avatar_position(pool, instance_id, position.x, position.y, position.z, position.facing)
        except Exception:
            log.warning("avatar: failed to persist anchor position for instance %s", instance_id)

    # --- idle emote loop -----------------------------------------------------

    def _maybe_start_idle_loop(self) -> None:
        cfg = self.bot.config.get("idle_emote", {})
        if not cfg.get("enabled", False) or not cfg.get("emote_id"):
            return
        if self._idle_task is not None and not self._idle_task.done():
            return
        self._idle_task = asyncio.create_task(self._run_idle_loop())

    async def _run_idle_loop(self) -> None:
        while True:
            cfg = self.bot.config.get("idle_emote", {})
            if not cfg.get("enabled", False):
                return  # re-enabling needs a reconnect in v1 — see module docstring
            emote_id = cfg.get("emote_id")
            if emote_id:
                await self.bot.throttle.acquire(Priority.BACKGROUND)
                await self.bot.highrise.send_emote(emote_id)
            await asyncio.sleep(cfg.get("interval_s", 60))

    # --- outfit: shared apply helper -----------------------------------------

    async def _equip_owned(self, item_ids: list[str]) -> None:
        """Filters `item_ids` down to ones the bot actually owns and calls
        `set_outfit` with just those — an id it doesn't own is dropped
        rather than blocking the whole attempt, but the caller (owner) is
        responsible for the surviving list still being a complete outfit;
        see the module docstring on why that's not re-validated here.
        Holds `_outfit_lock` across the read-then-write span — see the
        module docstring's note on why concurrent outfit commands need it."""
        async with self._outfit_lock:
            inventory = await self.bot.highrise.get_inventory()
            if isinstance(inventory, Error):
                log.warning("avatar: get_inventory failed: %s", inventory)
                return
            owned = {item.id: item for item in inventory.items}
            matched = [owned[i] for i in item_ids if i in owned]
            if not matched:
                return

            await self.bot.throttle.acquire(Priority.NORMAL)
            result = await self.bot.highrise.set_outfit(matched)
            if isinstance(result, Error):
                log.warning("avatar: set_outfit failed: %s", result)

    async def _apply_default_outfit(self) -> None:
        cfg = self.bot.config.get("default_outfit", {})
        if not cfg.get("enabled", True):
            return
        item_ids = cfg.get("item_ids") or []
        if item_ids:
            await self._equip_owned(item_ids)

    # --- outfit: presets -----------------------------------------------------

    async def _switch_preset(self, user: User, name: str) -> None:
        cfg = self.bot.config.get("outfit_presets", {})
        if not cfg.get("enabled", True):
            return
        if not await check_tiered_permission(user, cfg, self.bot._room_owner_id, self.bot.highrise):
            return

        presets = _parse_presets(cfg.get("presets", []))
        item_ids = presets.get(normalize(name))
        if item_ids is None:
            return  # unrecognized preset name — silent, same as an unknown emote

        await self._equip_owned(item_ids)

    # --- outfit: clone -------------------------------------------------------

    async def _clone(self, user: User, target_username: str) -> None:
        cfg = self.bot.config.get("outfit_clone", {})
        if not cfg.get("enabled", True):
            return
        if not await check_tiered_permission(user, cfg, self.bot._room_owner_id, self.bot.highrise):
            return

        target = await self._find_room_user(target_username)
        if target is None:
            return  # unknown/offline username — silent, same convention

        target_outfit = await self.bot.highrise.get_user_outfit(target.id)
        if isinstance(target_outfit, Error):
            log.warning("avatar: get_user_outfit(%s) failed: %s", target.id, target_outfit)
            return

        inventory = await self.bot.highrise.get_inventory()
        if isinstance(inventory, Error):
            log.warning("avatar: get_inventory failed: %s", inventory)
            return
        owned_ids = {item.id for item in inventory.items}
        matched = [item for item in target_outfit.outfit if item.id in owned_ids]

        if len(matched) < cfg.get("min_match", 2):
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.send_whisper(
                user.id, f"Couldn't find enough of {target.username}'s look in my own closet to copy it."
            )
            return

        # Everything above only reads the *target's* outfit/the bot's
        # inventory, neither of which the lock needs to protect. Only the
        # bot's own current-outfit read and the resulting write need to be
        # atomic with each other — see module docstring.
        async with self._outfit_lock:
            current = await self.bot.highrise.get_my_outfit()
            if isinstance(current, Error):
                log.warning("avatar: get_my_outfit failed: %s", current)
                return

            merged = await self._merge_by_category(current.outfit, matched)

            await self.bot.throttle.acquire(Priority.NORMAL)
            result = await self.bot.highrise.set_outfit(merged)
            if isinstance(result, Error):
                log.warning("avatar: set_outfit (clone) failed: %s", result)

    async def _merge_by_category(self, base: list[Item], overrides: list[Item]) -> list[Item]:
        """Replaces `base` items with `overrides` one category at a time
        instead of concatenating or replacing wholesale, so the result is
        never less complete than `base` already was — see module docstring
        on why clone can't just equip the raw matched intersection. An item
        whose category lookup itself fails is left out of the merge
        entirely (see `_item_category`) rather than aborting the clone."""
        by_category: dict[str, Item] = {}
        for item in base:
            category = await self._item_category(item)
            if category is not None:
                by_category[category] = item
        for item in overrides:
            category = await self._item_category(item)
            if category is not None:
                by_category[category] = item
        return list(by_category.values())

    async def _item_category(self, item: Item) -> str | None:
        """`self.bot.webapi.get_item` raises `ResponseError` on a non-200
        response (unlike the `self.highrise` action methods, which return an
        `Error` value) — a delisted item or a transient webapi hiccup must
        not take the whole clone down with it, so a failed lookup is
        reported as "unknown category" rather than propagating."""
        try:
            info = await self.bot.webapi.get_item(item.id)
        except ResponseError:
            log.warning("avatar: webapi.get_item(%s) failed, leaving it out of the outfit merge", item.id)
            return None
        return info.item.category
