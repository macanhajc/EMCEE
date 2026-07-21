"""Emote module — one of the modules composed into EmceeBot (catalog/emcee.py,
docs/decisions.md 2026-07-20 "Emcee merge"). Spec: specs/bots/emote.md.

Say an emote's name in chat → your avatar performs it. Permitted users can
trigger "all <emote>" — a staggered room-wide wave through the BACKGROUND
throttle class. "loop <emote>" repeats an emote for the speaker until they
say "stop" or leave — the AFK-dance feature, off by default (see `loop`
handlers below for why).

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
from .emotes import EmoteCatalog, normalize
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

        if not check_cooldown(self._last_say_at, user.id, cfg.get("cooldown_s", 3)):
            return

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
        if not cfg.get("enabled", False):
            return

        emote = self._catalog.resolve(emote_text)
        if emote is None:
            return

        if not check_cooldown(self._last_loop_start_at, user.id, cfg.get("cooldown_s", 10)):
            return

        existing = self._loops.get(user.id)
        if existing is not None and not existing.done():
            existing.cancel()  # switch to the new emote, not stacking loops
        elif len(self._active_loops()) >= cfg.get("max_concurrent_loopers", 3):
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.send_whisper(
                user.id, "Loop limit reached for this room right now — try again in a bit."
            )
            return

        self._loops[user.id] = asyncio.create_task(
            self._run_loop(user.id, emote.id, cfg.get("interval_s", 8), cfg.get("max_duration_s", 1800))
        )

    def _active_loops(self) -> list[asyncio.Task]:
        return [t for t in self._loops.values() if not t.done()]

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
                user_id, 'Your loop timed out after a while — say "loop <emote>" to start again.'
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
        names = [e.name for e in self._catalog.all()]
        text = "Emotes: " + ", ".join(names)
        for chunk in _chunk_text(text, MAX_WHISPER_CHARS):
            await self.bot.throttle.acquire(Priority.NORMAL)
            await self.bot.highrise.send_whisper(user.id, chunk)
