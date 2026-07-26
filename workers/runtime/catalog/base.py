"""Shared base for all catalog bots.

Enforces the runtime non-negotiables from specs/04-bot-runtime.md:

- Every outbound Highrise action goes through the per-instance token-bucket
  throttle. Handlers never call ``self.highrise.*`` send-methods directly.
- Every handler invocation is shielded: one tenant's exception never escapes
  its instance (applied automatically to subclasses).
- Config is revalidated against the pinned JSON Schema in ``packages/schemas``
  before it is applied; invalid config keeps the last-good version.
- Bot tokens are never logged, never put in error messages.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import time
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

import jsonschema
from highrise import BaseBot

if TYPE_CHECKING:
    import asyncpg

log = logging.getLogger("catalog")

SCHEMAS_DIR = Path(__file__).resolve().parents[3] / "packages" / "schemas"

# SDK handlers that must be shielded (see .claude/skills/highrise).
_HANDLERS = (
    "on_start",
    "on_connect",
    "on_chat",
    "on_whisper",
    "on_message",
    "on_user_join",
    "on_user_leave",
    "on_user_move",
    "on_reaction",
    "on_tip",
    "on_voice_change",
    "on_moderate",
)


class Priority(Enum):
    """Ranked low-to-high urgency. ``ActionThrottle.acquire`` only spends a
    token for a lower-priority request when no higher-priority request is
    currently waiting, so a burst of low-priority sends (e.g. a long,
    multi-chunk whisper) can never make a higher-priority one queue up
    behind it (docs/decisions.md, 2026-07-26)."""

    NORMAL = "normal"          # a real, single-user visible action (emote, reply)
    BACKGROUND = "background"  # bulk/looping visible actions: emote-all fan-out, loop repeats
    INFO = "info"              # purely informational whispers (list, confirmations) — never delays a real action


_PRIORITY_RANK: dict[Priority, int] = {Priority.NORMAL: 0, Priority.BACKGROUND: 1, Priority.INFO: 2}


class ActionThrottle:
    """Token bucket gating every outbound action for one instance.

    Platform rate limits are unpublished; defaults are conservative
    (~1 action/sec, burst 3) and tuned with saturation telemetry.

    Priority-ordered: a request spends a token only once no higher-priority
    request is waiting (see ``Priority``) *or* it's been waiting longer than
    ``_MAX_DEFER_S``, whichever comes first. The lock only ever wraps the
    token check itself, not the backoff sleep — holding it across the sleep
    (the pre-2026-07-26 shape) serialized every waiter regardless of
    priority, since whoever was sleeping held the lock the whole time.

    Pure "always defer to higher priority" starves a lower tier outright
    when higher-priority demand is sustained rather than bursty — found live
    by a test with 10 concurrent loopers: at the default rate, 10 loops
    re-acquiring BACKGROUND every ``interval_s`` need ~2 tokens/sec, more
    than the bucket supplies, so ``waiting[BACKGROUND]`` never hit zero and
    every INFO whisper (loop-start confirmations for users still queued
    behind them) waited forever, hanging the caller. The age cap bounds
    that: it fixes the reported bug (a burst of INFO chunks/confirmations
    no longer blocks a real action for as long as the burst lasts) without
    creating a new failure mode (indefinite starvation) when priority
    demand is sustained instead of bursty.
    """

    _POLL_S = 0.05  # recheck interval when tokens exist but a higher-priority request is waiting
    _MAX_DEFER_S = 2.0  # a lower-priority request is let through anyway after waiting this long

    def __init__(self, rate: float = 1.0, burst: int = 3) -> None:
        self._rate = rate
        self._tokens = float(burst)
        self._burst = float(burst)
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()
        self._waiting: dict[Priority, int] = {p: 0 for p in Priority}

    async def acquire(self, priority: Priority = Priority.NORMAL) -> None:
        my_rank = _PRIORITY_RANK[priority]
        enqueued_at = time.monotonic()
        self._waiting[priority] += 1
        try:
            while True:
                async with self._lock:
                    now = time.monotonic()
                    self._tokens = min(self._burst, self._tokens + (now - self._updated) * self._rate)
                    self._updated = now
                    aged_out = now - enqueued_at >= self._MAX_DEFER_S
                    blocked_by_higher_priority = not aged_out and any(
                        count > 0 for p, count in self._waiting.items() if _PRIORITY_RANK[p] < my_rank
                    )
                    if self._tokens >= 1 and not blocked_by_higher_priority:
                        self._tokens -= 1
                        return
                    wait_s = (1 - self._tokens) / self._rate if self._tokens < 1 else self._POLL_S
                await asyncio.sleep(wait_s)
        finally:
            self._waiting[priority] -= 1


def _shielded(fn):
    @functools.wraps(fn)
    async def wrapper(self: CatalogBot, *args: Any, **kwargs: Any) -> None:
        try:
            await fn(self, *args, **kwargs)
        except Exception:
            # Never re-raise: a tenant-config-triggered bug must not take the
            # instance down, let alone the process. Tokens never appear in
            # handler args, so logging the exception is safe.
            log.exception("%s.%s failed", type(self).__name__, fn.__name__)

    return wrapper


class CatalogBot(BaseBot):
    """Base class for catalog bots. Subclasses set SLUG + SCHEMA_VERSION, and
    must call ``self._confirm_connected()`` as the first line of their
    ``on_start`` override — that's the supervisor's only real signal that a
    (re)connect attempt actually reached Highrise, as opposed to still being
    stuck waiting on the SDK (see ``_confirm_connected`` below)."""

    SLUG: ClassVar[str]
    SCHEMA_VERSION: ClassVar[int]

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        for name in _HANDLERS:
            if name in cls.__dict__:
                setattr(cls, name, _shielded(cls.__dict__[name]))

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__()
        self.throttle = ActionThrottle()
        self._validator = jsonschema.Draft202012Validator(self._load_schema())
        self.config: dict[str, Any] = {}
        self.apply_config(config or {})
        # Optional, set by the supervisor after construction (specs/04-bot-runtime.md:
        # "catalog bots may only reach Highrise and our own Postgres"). None in
        # standalone/unit-test construction — modules that use this must handle that.
        self.db_pool: "asyncpg.Pool | None" = None
        self.bot_instance_id: str | None = None
        # Set by the supervisor fresh before each (re)connect attempt
        # (workers/runtime/supervisor.py's _run_instance_loop); None outside
        # that context (standalone/unit-test construction).
        self._connected_event: asyncio.Event | None = None

    @property
    def bot_language(self) -> str:
        """`general.bot_language` (added 2026-07-24) — the locale the bot's
        own built-in responses render in (`catalog/strings.py`'s `t()`).
        Distinct from the dashboard viewer's own locale: a per-instance
        config field, so a bot running in a non-English room can reply in
        that room's language regardless of what language its owner's
        dashboard happens to be in. Falls back to English for a config row
        saved before this field existed."""
        return self.config.get("general", {}).get("bot_language", "en")

    def _confirm_connected(self) -> None:
        """Signals the supervisor that this connect attempt is real: the SDK
        actually got a session from Highrise, not just a WebSocket that's
        still hanging waiting for one. The SDK's own `bot_runner()` offers no
        "connected" callback and no timeout waiting for that first server
        reply, so without this signal a room the bot can never actually join
        (bad room id, missing designer rights — see the highrise skill's
        "known unknowns") can leave the supervisor's status stuck at
        "running" forever with nothing in the event log. See docs/decisions.md,
        2026-07-21."""
        if self._connected_event is not None:
            self._connected_event.set()

    @classmethod
    def _load_schema(cls) -> dict[str, Any]:
        path = SCHEMAS_DIR / cls.SLUG / f"v{cls.SCHEMA_VERSION}.json"
        return json.loads(path.read_text())

    def apply_config(self, config: dict[str, Any]) -> bool:
        """Atomically swap in new config; keep last-good if it fails validation."""
        errors = list(self._validator.iter_errors(config))
        if errors:
            # TODO(runtime): emit InstanceEvent so the dashboard can flag it.
            log.warning("%s: rejected config (%d schema errors), keeping last-good", self.SLUG, len(errors))
            return False
        self.config = config
        return True
