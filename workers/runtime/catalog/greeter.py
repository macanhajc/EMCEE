"""Concierge module — one of the modules composed into EmceeBot
(catalog/emcee.py, docs/decisions.md 2026-07-20 "Emcee merge"). Spec:
specs/bots/greeter.md.

Every guest greeted, every regular remembered, every VIP treated like one.
On `on_user_join`: VIPs get a distinct greeting that bypasses the generic
welcome's anti-noise controls entirely (a VIP is always worth interrupting
for); everyone else gets a templated welcome whisper gated by per-user
cooldown, busy-mode, and quiet hours. `on_user_leave` logs a farewell for
regulars (no whisper is possible — they're already gone) and can optionally
post a public send-off.

`GreeterEngine` is a plain class, not a `CatalogBot` — it reads and writes
through the `EmceeBot` instance passed to its constructor (`self.bot.highrise`,
`.throttle`, `.config`, `._room_owner_id`, `._room_name`) so two modules can
share one connection, one throttle, and one config object without either
module knowing the other exists. Nothing here is an SDK handler in its own
right; `EmceeBot`'s own (shielded) handlers call into this engine's
same-named methods.

v1 scope trims two things out of the original draft (docs/decisions.md,
2026-07-20 "Concierge v1 scope locked"): VIP tiers (VIP/MVP with separate
templates) collapse to one flat tier, and presence & flair (bot position,
idle emote loop, reaction-back) moved to avatar.py entirely. Both keep this
module's config schema a flat two-level shape (section -> primitive leaves
or arrays of primitives), matching what the dashboard's schema-form
generator can actually render today (decisions.md, 2026-07-20 instance-
creation entry: "walk the schema's fixed two-level shape ... extend when a
bot config actually needs deeper nesting"). A per-entry VIP tier would need
an array of objects, which that generator doesn't handle yet — extend it
when a real module needs the nesting rather than speculatively here.

Visit counts persist in Postgres (`greeter_visits`, one row per instance +
Highrise user id — `db.record_visit`), wired 2026-07-20 alongside the Emcee
merge: `CatalogBot.db_pool`/`.bot_instance_id` are set by the supervisor
after construction (generic capability, specs/04-bot-runtime.md), so
farewell's `min_visits` and the dashboard's regulars table now survive
reconnects and redeploys instead of resetting every time. `_visits` stays as
an in-memory cache of each user's latest known count this session —
refreshed on every join so farewell doesn't need a second query to re-read
what the join handler already just learned — and doubles as the fallback
when no pool is configured (standalone/unit-test construction) or a write
fails (a DB hiccup degrades to an uncounted-but-still-sent greeting, never
silence).

`{visit_count}` was dropped from the whitelisted template tokens 2026-07-21
(docs/decisions.md) — closing the spec's "any user creeped out by 'your
47th visit'?" open question by not exposing the number at all, rather than
making it opt-in. The counting itself stays: it still drives `min_visits`
and the regulars table, just never gets whispered back to the guest.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from datetime import datetime
from datetime import time as dtime
from typing import TYPE_CHECKING, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import db

from highrise import User
from highrise.models import AnchorPosition, Position

from .base import Priority

if TYPE_CHECKING:
    from .emcee import EmceeBot

log = logging.getLogger("catalog.greeter")

MAX_MESSAGE_CHARS = 300  # matches emote.py's conservative, unverified whisper-length guess
DEFAULT_WELCOME_TEMPLATE = "Welcome to {room_name}, {username}!"
DEFAULT_VIP_TEMPLATE = "Welcome back, {username} — always great to see you!"
DEFAULT_FAREWELL_TEMPLATE = "Thanks for stopping by, {username}!"
_TEMPLATE_VARS = ("username", "room_name")


def _render(template: str, **values: Any) -> str:
    """Literal `{token}` substitution against a fixed whitelist — not
    `str.format`, which would let an owner-authored template dereference
    attributes on whatever object we pass it (a real format-string gadget
    class, not just theoretical, even though the "attacker" here is the
    room owner rather than a stranger). Unknown `{...}` sequences are left
    untouched rather than raising, so a typo'd token doesn't crash the
    greeting instead of just looking a little odd.
    """
    for key in _TEMPLATE_VARS:
        if key in values:
            template = template.replace("{" + key + "}", str(values[key]))
    return template[:MAX_MESSAGE_CHARS]


def _parse_hhmm(text: str) -> dtime:
    hour, _, minute = text.partition(":")
    return dtime(hour=int(hour), minute=int(minute))


class GreeterEngine:
    def __init__(self, bot: "EmceeBot") -> None:
        self.bot = bot
        self._visits: dict[str, int] = {}  # user_id -> latest known visit count, this session's cache
        self._last_greeted_at: dict[str, float] = {}
        self._recent_joins: deque[float] = deque()
        self._template_cursor: int = 0

    async def on_user_join(self, user: User, position: Position | AnchorPosition) -> None:
        self._recent_joins.append(time.monotonic())
        await self._record_visit(user)  # still drives min_visits + the regulars table, just not the greeting text

        if self._is_vip(user.username):
            await self._greet_vip(user)
        else:
            await self._maybe_greet_welcome(user)

    async def _record_visit(self, user: User) -> int:
        pool, instance_id = self.bot.db_pool, self.bot.bot_instance_id
        if pool is not None and instance_id is not None:
            try:
                count = await db.record_visit(pool, instance_id, user.id, user.username)
            except Exception:
                # A DB hiccup degrades the greeting (uncounted, but still
                # sent) rather than silencing it — see module docstring.
                log.warning("greeter: visit persistence failed for %s, falling back to session cache", user.username)
                count = self._visits.get(user.id, 0) + 1
        else:
            count = self._visits.get(user.id, 0) + 1
        self._visits[user.id] = count
        return count

    async def on_user_leave(self, user: User) -> None:
        await self._maybe_farewell(user)

    # --- welcome -------------------------------------------------------

    async def _maybe_greet_welcome(self, user: User) -> None:
        cfg = self.bot.config.get("welcome", {})
        if not cfg.get("enabled", True):
            return
        if not self._cooldown_ok(user.id, cfg.get("cooldown_h", 6) * 3600):
            return
        if self._is_busy(cfg):
            return
        if self._in_quiet_hours(cfg):
            return

        templates = cfg.get("templates") or [DEFAULT_WELCOME_TEMPLATE]
        template = templates[self._template_cursor % len(templates)]
        self._template_cursor += 1

        text = _render(template, username=user.username, room_name=self.bot._room_name)
        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.send_whisper(user.id, text)

    def _cooldown_ok(self, user_id: str, cooldown_s: float) -> bool:
        now = time.monotonic()
        last = self._last_greeted_at.get(user_id)
        if last is not None and now - last < cooldown_s:
            return False
        self._last_greeted_at[user_id] = now
        return True

    def _is_busy(self, cfg: dict[str, Any]) -> bool:
        if not cfg.get("busy_mode_enabled", True):
            return False
        cutoff = time.monotonic() - 60
        while self._recent_joins and self._recent_joins[0] < cutoff:
            self._recent_joins.popleft()
        return len(self._recent_joins) > cfg.get("busy_mode_joins_per_min", 15)

    def _in_quiet_hours(self, cfg: dict[str, Any]) -> bool:
        if not cfg.get("quiet_hours_enabled", False):
            return False
        try:
            tz = ZoneInfo(cfg.get("quiet_hours_tz", "UTC"))
        except ZoneInfoNotFoundError:
            tz = ZoneInfo("UTC")
        now = datetime.now(tz).time()
        start = _parse_hhmm(cfg.get("quiet_hours_start", "22:00"))
        end = _parse_hhmm(cfg.get("quiet_hours_end", "08:00"))
        if start <= end:
            return start <= now < end
        return now >= start or now < end  # window wraps midnight

    # --- VIP -------------------------------------------------------

    def _is_vip(self, username: str) -> bool:
        target = username.lower()
        return any(u.lower() == target for u in self.bot.config.get("vip", {}).get("users", []))

    async def _greet_vip(self, user: User) -> None:
        cfg = self.bot.config.get("vip", {})
        template = cfg.get("template") or DEFAULT_VIP_TEMPLATE
        text = _render(template, username=user.username, room_name=self.bot._room_name)

        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.send_whisper(user.id, text)

        if cfg.get("announce_to_room", False):
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.chat(f"{user.username} just walked in!")

        emote_id = cfg.get("emote_celebration_id")
        if cfg.get("emote_celebration_enabled", False) and emote_id:
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.send_emote(emote_id, user.id)

    # --- farewell -------------------------------------------------------

    async def _maybe_farewell(self, user: User) -> None:
        cfg = self.bot.config.get("farewell", {})
        if not cfg.get("log_enabled", True):
            return

        visit_count = self._visits.get(user.id, 0)
        if visit_count < cfg.get("min_visits", 3):
            return

        log.info("greeter: %s left after %d visit(s) this session", user.username, visit_count)

        if cfg.get("public_message", False):
            template = cfg.get("public_template") or DEFAULT_FAREWELL_TEMPLATE
            text = _render(template, username=user.username, room_name=self.bot._room_name)
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.chat(text)
