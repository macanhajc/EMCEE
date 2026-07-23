"""Emote module — one of the modules composed into EmceeBot (catalog/emcee.py,
docs/decisions.md 2026-07-20 "Emcee merge"). Spec: specs/bots/emote.md.

Say an emote's name in chat → your avatar performs it, on repeat, until you
say "stop" or leave — Loop is on by default (2026-07-23) and merged into the
bare-word trigger, not a separate opt-in command anymore. The explicit
"loop <emote>" prefix still works and lands on the exact same mechanism; it's
kept mostly so existing muscle memory (and any customer-facing copy already
written around it) doesn't break. Turning `loop.enabled` off reverts
emote-on-say to a single one-shot emote per trigger, matching the original
(pre-2026-07-23) behavior. Permitted users can also trigger "all <emote>" —
a staggered room-wide wave through the BACKGROUND throttle class; that one
stays one-shot regardless of the `loop` setting.

`EmoteEngine` is a plain class, not a `CatalogBot` — it reads and writes
through the `EmceeBot` instance passed to its constructor (`self.bot.highrise`,
`.throttle`, `.config`, `._room_owner_id`) so two modules can share one
connection, one throttle, and one config object without either module
knowing the other exists. Nothing here is an SDK handler in its own right;
`EmceeBot`'s own (shielded) handlers call into this engine's same-named
methods.

Read-only SDK calls (get_room_users, get_room_privilege) don't go through
the action throttle — the throttle governs room-visible writes (chat,
whisper, emote), matching the "chat/whisper/emote actions go through it"
language in the runtime spec; a read produces no room-visible output to
rate-limit against. Judgment call, not a confirmed platform rule.

The emote-all fan-out and loop repeats both share the single per-instance
throttle with emote-on-say rather than getting their own faster-configured
pacing, so they run at whatever rate the (currently conservative,
unverified) throttle default allows — slower than the spec's "~2-4
users/sec" aspiration for emote-all. Reconciling those numbers is exactly
what "tune with saturation telemetry" (specs/04-bot-runtime.md) is for;
picking more unverified rates to hit faster targets wouldn't actually
resolve that.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from highrise import Error, User

from .base import Priority
from .emotes import EmoteCatalog, EmoteDef, normalize
from .permissions import check_cooldown, check_tiered_permission

if TYPE_CHECKING:
    from .emcee import EmceeBot

log = logging.getLogger("catalog.emote")

LIST_COMMAND_TRIGGERS = frozenset({"emotes", "!emotes"})
ABORT_WORD = "stopall"  # aborts an emote-all wave
STOP_WORD = "stop"  # stops the speaker's own loop — distinct word, no collision
ALL_PREFIX = "all "
LOOP_PREFIX = "loop "
MAX_WHISPER_CHARS = 300  # unverified platform limit — conservative guess, not confirmed


def _chunk_text(text: str, max_len: int) -> list[str]:
    """Splits on whitespace where possible so a whisper never cuts a word mid-token."""
    if len(text) <= max_len:
        return [text]
    chunks: list[str] = []
    while text:
        if len(text) <= max_len:
            chunks.append(text)
            break
        cut = text.rfind(" ", 0, max_len)
        if cut <= 0:
            cut = max_len
        chunks.append(text[:cut].rstrip())
        text = text[cut:].lstrip()
    return chunks


class EmoteEngine:
    # One load per process — static data shared read-only across every
    # EmoteEngine the supervisor spawns, not per-instance state.
    _catalog = EmoteCatalog()

    def __init__(self, bot: "EmceeBot") -> None:
        self.bot = bot
        self._last_say_at: dict[str, float] = {}
        self._last_all_at: float = 0.0
        self._all_task: asyncio.Task | None = None
        self._loops: dict[str, asyncio.Task] = {}  # user_id -> their active loop task
        self._last_loop_start_at: dict[str, float] = {}

    async def on_chat(self, user: User, message: str) -> None:
        text = normalize(message)

        if text in LIST_COMMAND_TRIGGERS:
            if self.bot.config.get("list_command", {}).get("enabled", True):
                await self._send_emote_list(user)
            return

        if text == ABORT_WORD:
            await self._maybe_abort(user)
            return

        if text == STOP_WORD:
            await self._stop_loop(user)
            return

        if text.startswith(ALL_PREFIX):
            await self._trigger_emote_all(user, text[len(ALL_PREFIX) :].strip())
            return

        if text.startswith(LOOP_PREFIX):
            await self._trigger_loop(user, text[len(LOOP_PREFIX) :].strip())
            return

        # Emote on say: unknown text is ignored silently — no "command not
        # found" noise in a busy room (specs/bots/emote.md).
        await self._trigger_emote_on_say(user, text)

    async def on_user_leave(self, user: User) -> None:
        task = self._loops.get(user.id)
        if task is not None and not task.done():
            task.cancel()

    async def _trigger_emote_on_say(self, user: User, text: str) -> None:
        cfg = self.bot.config.get("emote_on_say", {})
        if not cfg.get("enabled", True):
            return

        emote = self._catalog.resolve(text)
        if emote is None:
            return

        disabled = {normalize(x) for x in cfg.get("disabled_emotes", [])}
        if normalize(emote.id) in disabled or normalize(emote.name) in disabled:
            return

        loop_cfg = self.bot.config.get("loop", {})
        if loop_cfg.get("enabled", True):
            # Loop is on by default (specs/bots/emote.md, 2026-07-23): a bare
            # emote word starts/switches the same repeating loop "loop
            # <emote>" does, sharing its cooldown/cap state (`_start_or_
            # switch_loop`) rather than firing once. `emote_on_say.cooldown_s`
            # is only consulted below, on the one-shot fallback path — once
            # looping, `loop.cooldown_s` is what governs restarting/switching.
            await self._start_or_switch_loop(user, emote, loop_cfg)
            return

        if not check_cooldown(self._last_say_at, user.id, cfg.get("cooldown_s", 3)):
            return

        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.send_whisper(user.id, f'Doing "{emote.name}"!')
        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.send_emote(emote.id, user.id)

    async def _trigger_emote_all(self, user: User, emote_text: str) -> None:
        cfg = self.bot.config.get("emote_all", {})
        if not cfg.get("enabled", True):
            return
        if not await check_tiered_permission(user, cfg, self.bot._room_owner_id, self.bot.highrise):
            return

        emote = self._catalog.resolve(emote_text)
        if emote is None:
            return

        # Room-wide cooldown, not per-user — check_cooldown's dict-keyed
        # shape is for per-user state, so this one's a direct check instead.
        now = time.monotonic()
        if now - self._last_all_at < cfg.get("cooldown_s", 60):
            return
        if self._all_task is not None and not self._all_task.done():
            return  # a wave is already running
        self._last_all_at = now

        self._all_task = asyncio.create_task(self._run_emote_all(emote.id))

    async def _run_emote_all(self, emote_id: str) -> None:
        response = await self.bot.highrise.get_room_users()
        if isinstance(response, Error):
            log.warning("emote-all: get_room_users failed: %s", response)
            return
        # Snapshot at trigger — users who join mid-wave are not included
        # (specs/bots/emote.md: "new joiners during a wave are not included").
        for room_user, _position in response.content:
            await self.bot.throttle.acquire(Priority.BACKGROUND)
            await self.bot.highrise.send_emote(emote_id, room_user.id)

    async def _trigger_loop(self, user: User, emote_text: str) -> None:
        cfg = self.bot.config.get("loop", {})
        if not cfg.get("enabled", True):
            return

        emote = self._catalog.resolve(emote_text)
        if emote is None:
            return

        await self._start_or_switch_loop(user, emote, cfg)

    async def _start_or_switch_loop(self, user: User, emote: EmoteDef, cfg: dict) -> None:
        """Shared by the explicit "loop <emote>" command and (since Loop
        defaults to on, 2026-07-23) the bare-word emote-on-say trigger — both
        land on the same per-user cooldown/task state so alternating between
        "macarena" and "loop macarena" can't be used to dodge
        `loop.cooldown_s`. No cap on how many users in a room can loop at
        once (`max_concurrent_loopers` removed 2026-07-23) — now that Loop is
        every emote-on-say's default behavior, a cap would mean whoever's
        past it gets nothing at all, not a plain emote."""
        if not check_cooldown(self._last_loop_start_at, user.id, cfg.get("cooldown_s", 10)):
            return

        existing = self._loops.get(user.id)
        if existing is not None and not existing.done():
            existing.cancel()  # switch to the new emote, not stacking loops

        interval_s = cfg.get("interval_s", 5)
        max_duration_s = cfg.get("max_duration_s", 1800)
        self._loops[user.id] = asyncio.create_task(self._run_loop(user.id, emote.id, interval_s, max_duration_s))

        # Loop is the one trigger here that doesn't resolve in a single
        # action, so tell the speaker what to expect up front — a forced
        # timeout already explains itself (below); a successful start
        # silently changing their avatar's future behavior for the next N
        # minutes deserved the same.
        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.send_whisper(
            user.id,
            f'Looping {emote.name} every {interval_s}s — say "stop" anytime, '
            f"or it'll auto-stop after {round(max_duration_s / 60)} min.",
        )

    async def _run_loop(self, user_id: str, emote_id: str, interval_s: float, max_duration_s: float) -> None:
        task = asyncio.current_task()
        start = time.monotonic()
        try:
            while time.monotonic() - start < max_duration_s:
                await self.bot.throttle.acquire(Priority.BACKGROUND)
                await self.bot.highrise.send_emote(emote_id, user_id)
                await asyncio.sleep(interval_s)
            # Safety cap hit, not an explicit "stop" — say why, since the
            # user's avatar just stopped for no reason they said.
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.send_whisper(
                user_id, "Your loop timed out after a while — say an emote's name again to restart it."
            )
        finally:
            # Compare-and-delete: if `_trigger_loop` already replaced this
            # entry with a new task (switching emotes), don't let this
            # (now-superseded) task's cleanup remove the new one.
            if self._loops.get(user_id) is task:
                self._loops.pop(user_id, None)

    async def _stop_loop(self, user: User) -> None:
        task = self._loops.get(user.id)
        if task is not None and not task.done():
            task.cancel()

    async def _maybe_abort(self, user: User) -> None:
        if self._all_task is None or self._all_task.done():
            return
        cfg = self.bot.config.get("emote_all", {})
        if not await check_tiered_permission(user, cfg, self.bot._room_owner_id, self.bot.highrise):
            return
        self._all_task.cancel()

    async def _send_emote_list(self, user: User) -> None:
        # Numbered so a player can say "1" instead of the full name
        # (EmoteCatalog.resolve, added 2026-07-23) — the position shown here
        # is exactly the position that lookup uses.
        names = [f"{i}. {e.name}" for i, e in enumerate(self._catalog.all(), start=1)]
        text = "Emotes: " + ", ".join(names)
        for chunk in _chunk_text(text, MAX_WHISPER_CHARS):
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.send_whisper(user.id, chunk)
