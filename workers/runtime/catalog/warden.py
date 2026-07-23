"""Warden module — one of the modules composed into EmceeBot (catalog/emcee.py,
docs/decisions.md 2026-07-20 "Emcee merge"). Spec: specs/bots/moderation.md.
Trimmed-v1 scope decided 2026-07-21: filter, anti-spam, strike ladder, action
log, and in-chat mod commands. Raid guard, curated base blocklists, and
caps/emoji-flood heuristics from the original draft are deferred, not built.

`WardenEngine` is a plain class, not a `CatalogBot` — same reasoning as
`EmoteEngine`/`GreeterEngine`: it reads and writes through the `EmceeBot`
instance passed to its constructor so multiple modules can share one
connection, one throttle, and one config object without knowing about each
other. Nothing here is an SDK handler in its own right; `EmceeBot`'s own
(shielded) handlers call into this engine's same-named methods.

SDK facts this module leans on, confirmed 2026-07-21 against the pinned SDK
source (highrise-bot-sdk 25.1.0), not just the docs — see docs/decisions.md:

- `moderate_room(user_id, action, action_length)` looks fire-and-forget but
  actually awaits the server's ack and raises `ResponseError` on failure
  (e.g. the bot lacks the privilege to ban in this room). Every call here is
  wrapped so a denial gets logged and (for a mod-command requester) whispered
  back, instead of crashing the handler.
- Ban supports a duration, same as mute — not permanent-only as the original
  draft spec assumed. `ban_duration_s: 0` means permanent.
- There's no "unmute" action and no "list currently muted/banned" read API —
  our own persisted strike state (`warden_strikes`, via `db.bump_strikes`) is
  the only source of truth for "who's under what."
- `on_moderate` fires for every moderation event in the room, ours or a human
  moderator's own in-client action. Distinguishing by `moderator_id ==
  self.bot.highrise.my_id` is what lets this module log external mod actions
  for the activity feed without also striking/escalating on top of them.

Filter matching normalizes with `emotes.py`'s `normalize()` (case + accent
fold — the same utility the Emote module uses for its own trigger matching,
a plain string helper with no emote-catalog dependency) plus a local
repeated-character squash, then requires a whole-word match. No leetspeak
substitution table in trimmed v1 — the draft spec's "leetspeak-lite" was
aspirational; word-boundary substring matching after squashing is the
simple version that's actually built.
"""

from __future__ import annotations

import logging
import re
import time
from collections import deque
from typing import TYPE_CHECKING, Any

import db

from highrise import Error, ResponseError, User

from .base import Priority
from .emotes import normalize

if TYPE_CHECKING:
    from .emcee import EmceeBot

log = logging.getLogger("catalog.warden")

MAX_WHISPER_CHARS = 300  # matches emote.py/greeter.py's conservative, unverified whisper-length guess
FILTER_WARN_MESSAGE = "Please keep the chat friendly — that's not allowed here."
_REPEAT_RUN = re.compile(r"(.)\1+")  # any run of 2+ of the same char


def _squash_repeats(text: str) -> str:
    # Collapses every repeated run to a single character (not just runs of
    # 3+) — "spammmmmm" and "spam" must squash to the same string. Both a
    # blocked term and the message it's checked against go through this
    # same transform (`_contains_term`), so squashing aggressively doesn't
    # cost precision on either side, only strengthens the match.
    return _REPEAT_RUN.sub(r"\1", text)


def _filter_normalize(text: str) -> str:
    return _squash_repeats(normalize(text))


def _contains_term(normalized_message: str, term: str) -> bool:
    term_norm = _filter_normalize(term)
    if not term_norm:
        return False
    return re.search(r"(?<!\w)" + re.escape(term_norm) + r"(?!\w)", normalized_message) is not None


class WardenEngine:
    def __init__(self, bot: "EmceeBot") -> None:
        self.bot = bot
        self._message_times: dict[str, deque[float]] = {}
        self._last_message: dict[str, str] = {}
        self._duplicate_streak: dict[str, int] = {}
        # Session-cache fallback for strike counts, same degrade-not-silence
        # pattern as GreeterEngine._visits — used when db_pool is None
        # (standalone/unit-test construction) or a write fails.
        self._strikes_fallback: dict[str, int] = {}
        self._last_strike_fallback_at: dict[str, float] = {}

    async def on_chat(self, user: User, message: str) -> None:
        if await self._is_exempt(user):
            await self._maybe_command(user, message)
            return

        if await self._check_filter(user, message):
            return
        await self._check_anti_spam(user, message)

    async def on_user_leave(self, user: User) -> None:
        self._message_times.pop(user.id, None)
        self._last_message.pop(user.id, None)
        self._duplicate_streak.pop(user.id, None)

    async def on_moderate(
        self, moderator_id: str, target_user_id: str, moderation_type: str, duration: int | None
    ) -> None:
        if moderator_id == self.bot.highrise.my_id:
            return  # our own action — already logged at the call site in _apply_action
        await self._insert_event(
            {
                "type": "external",
                "moderator_id": moderator_id,
                "target_user_id": target_user_id,
                "action": moderation_type,
                "duration": duration,
            }
        )

    # --- exemptions ----------------------------------------------------

    async def _is_exempt(self, user: User) -> bool:
        if user.id == self.bot._room_owner_id:
            return True
        cfg = self.bot.config.get("exemptions", {})
        exempt_names = {normalize(name) for name in cfg.get("users", [])}
        if normalize(user.username) in exempt_names:
            return True
        if cfg.get("designers_exempt", True):
            privilege = await self.bot.highrise.get_room_privilege(user.id)
            return not isinstance(privilege, Error) and bool(privilege.designer)
        return False

    # --- mod commands ----------------------------------------------------

    async def _maybe_command(self, user: User, message: str) -> None:
        cfg = self.bot.config.get("commands", {})
        if not cfg.get("enabled", True):
            return
        prefix = cfg.get("prefix") or "!"
        text = message.strip()
        if not text.startswith(prefix):
            return

        parts = text[len(prefix) :].split()
        if len(parts) < 2:
            return
        verb, target_raw = parts[0].lower(), parts[1].lstrip("@")
        if verb not in ("warn", "mute", "kick"):
            return

        target = await self._resolve_username(target_raw)
        if target is None:
            await self._whisper(user.id, f"Couldn't find {target_raw} in the room.")
            return

        if verb == "warn":
            await self._strike(target, reason="mod_command")
        elif verb == "mute":
            duration = self.bot.config.get("ladder", {}).get("mute_duration_s", 300)
            await self._apply_action(target, "mute", duration, requester=user)
        elif verb == "kick":
            await self._apply_action(target, "kick", None, requester=user)

    async def _resolve_username(self, username: str) -> User | None:
        response = await self.bot.highrise.get_room_users()
        if isinstance(response, Error):
            return None
        target_norm = normalize(username)
        for room_user, _position in response.content:
            if normalize(room_user.username) == target_norm:
                return room_user
        return None

    # --- filter ----------------------------------------------------

    async def _check_filter(self, user: User, message: str) -> bool:
        cfg = self.bot.config.get("filter", {})
        if not cfg.get("enabled", True):
            return False

        normalized_message = _filter_normalize(message)
        matched = next(
            (term for term in cfg.get("custom_terms", []) if _contains_term(normalized_message, term)), None
        )
        if matched is None:
            return False

        await self._whisper(user.id, FILTER_WARN_MESSAGE)
        await self._log_event(user, "filter_hit", matched_term=matched)
        await self._strike(user, reason="filter")
        return True

    # --- anti-spam ----------------------------------------------------

    async def _check_anti_spam(self, user: User, message: str) -> None:
        cfg = self.bot.config.get("anti_spam", {})
        if not cfg.get("enabled", True):
            return

        now = time.monotonic()
        window_s = cfg.get("message_rate_window_s", 10)
        times = self._message_times.setdefault(user.id, deque())
        times.append(now)
        while times and now - times[0] > window_s:
            times.popleft()
        if len(times) > cfg.get("message_rate_count", 5):
            times.clear()
            await self._strike(user, reason="rate")
            return

        normalized = normalize(message)
        if normalized and normalized == self._last_message.get(user.id):
            self._duplicate_streak[user.id] = self._duplicate_streak.get(user.id, 1) + 1
        else:
            self._last_message[user.id] = normalized
            self._duplicate_streak[user.id] = 1
        if self._duplicate_streak[user.id] >= cfg.get("duplicate_count", 3):
            self._duplicate_streak[user.id] = 0
            await self._strike(user, reason="duplicate")

    # --- strike ladder ----------------------------------------------------

    async def _strike(self, user: User, reason: str) -> None:
        cfg = self.bot.config.get("ladder", {})
        count = await self._bump_strikes(user, cfg.get("strike_decay_h", 24))
        await self._log_event(user, "strike", reason=reason, count=count)

        # Highest rung reached wins — checked in descending severity, not
        # ascending threshold order, so it's correct regardless of how a
        # customer orders their own thresholds.
        if cfg.get("ban_enabled", False) and count >= cfg.get("ban_at_strikes", 5):
            await self._apply_action(user, "ban", cfg.get("ban_duration_s", 0) or None, requester=None)
        elif count >= cfg.get("kick_at_strikes", 3):
            await self._apply_action(user, "kick", None, requester=None)
        elif count >= cfg.get("mute_at_strikes", 2):
            await self._apply_action(user, "mute", cfg.get("mute_duration_s", 300), requester=None)

    async def _bump_strikes(self, user: User, decay_h: float) -> int:
        pool, instance_id = self.bot.db_pool, self.bot.bot_instance_id
        if pool is not None and instance_id is not None:
            try:
                return await db.bump_strikes(pool, instance_id, user.id, user.username, decay_h)
            except Exception:
                log.warning("warden: strike persistence failed for %s, falling back to session cache", user.username)
        return self._bump_strikes_fallback(user.id, decay_h)

    def _bump_strikes_fallback(self, user_id: str, decay_h: float) -> int:
        now = time.monotonic()
        last = self._last_strike_fallback_at.get(user_id)
        count = 1 if last is None or now - last > decay_h * 3600 else self._strikes_fallback.get(user_id, 0) + 1
        self._strikes_fallback[user_id] = count
        self._last_strike_fallback_at[user_id] = now
        return count

    # --- moderation actions ----------------------------------------------------

    async def _apply_action(self, user: User, action: str, duration: int | None, requester: User | None) -> None:
        await self.bot.throttle.acquire(Priority.NORMAL)
        try:
            await self.bot.highrise.moderate_room(user.id, action, duration)
        except ResponseError as exc:
            await self._log_event(user, "moderation_denied", action=action, error=str(exc))
            if requester is not None:
                await self._whisper(requester.id, f"Couldn't {action} {user.username} here — missing permission?")
            return
        await self._log_event(
            user,
            "moderation_applied",
            action=action,
            duration=duration,
            requester=requester.username if requester is not None else "auto",
        )

    # --- dashboard-initiated ban/unban ----------------------------------------------------
    # specs/bots/moderation.md's "proposed, not built" section, 2026-07-23 —
    # the owner's Regulars-table buttons and "ban by username" form both
    # resolve to one `moderation_requests` row apiece; supervisor.py claims
    # pending rows for this instance and calls this method for each one. Not
    # built via _apply_action above: that method's `requester` is a Highrise
    # `User` from the room (an in-chat mod command's caller), which doesn't
    # exist here — the dashboard's own account isn't a room participant, and
    # the target may never have visited at all (the "ban by username" path).
    # Same throttle-acquire + ResponseError handling either way; only the
    # logged event shape (`dashboard_moderation_applied`/`_denied`, distinct
    # from the ladder/mod-command's `moderation_applied`/`_denied`) differs,
    # so the activity feed can tell "the owner clicked this" apart from "the
    # automated ladder did this".

    async def apply_dashboard_action(
        self, user_id: str, username: str, action: str, duration: int | None
    ) -> tuple[str, str | None]:
        """Returns (status, error) — "applied" or "denied" — for the caller
        (supervisor.py) to persist back onto the `moderation_requests` row."""
        await self.bot.throttle.acquire(Priority.NORMAL)
        try:
            await self.bot.highrise.moderate_room(user_id, action, duration)
        except ResponseError as exc:
            await self._insert_event(
                {
                    "type": "dashboard_moderation_denied",
                    "user_id": user_id,
                    "username": username,
                    "action": action,
                    "error": str(exc),
                }
            )
            return "denied", str(exc)
        await self._insert_event(
            {
                "type": "dashboard_moderation_applied",
                "user_id": user_id,
                "username": username,
                "action": action,
                "duration": duration,
            }
        )
        return "applied", None

    # --- shared helpers ----------------------------------------------------

    async def _whisper(self, user_id: str, text: str) -> None:
        await self.bot.throttle.acquire(Priority.NORMAL)
        await self.bot.highrise.send_whisper(user_id, text[:MAX_WHISPER_CHARS])

    async def _log_event(self, user: User, event_type: str, **extra: Any) -> None:
        await self._insert_event({"type": event_type, "user_id": user.id, "username": user.username, **extra})

    async def _insert_event(self, payload: dict[str, Any]) -> None:
        pool, instance_id = self.bot.db_pool, self.bot.bot_instance_id
        if pool is None or instance_id is None:
            log.info("warden: %s", payload)
            return
        try:
            await db.insert_event(pool, instance_id, "moderation", payload)
        except Exception:
            log.warning("warden: failed to persist %s event", payload.get("type"))
