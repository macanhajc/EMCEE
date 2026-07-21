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
    NORMAL = "normal"          # emote-on-say, whispers
    BACKGROUND = "background"  # emote-all fan-out; sheds first under pressure


class ActionThrottle:
    """Token bucket gating every outbound action for one instance.

    Platform rate limits are unpublished; defaults are conservative
    (~1 action/sec, burst 3) and tuned with saturation telemetry.
    """

    def __init__(self, rate: float = 1.0, burst: int = 3) -> None:
        self._rate = rate
        self._tokens = float(burst)
        self._burst = float(burst)
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, priority: Priority = Priority.NORMAL) -> None:
        # TODO(runtime): background class should also yield to queued normal
        # sends, not just pay the same token price. Revisit with telemetry.
        async with self._lock:
            while True:
                now = time.monotonic()
                self._tokens = min(self._burst, self._tokens + (now - self._updated) * self._rate)
                self._updated = now
                if self._tokens >= 1:
                    self._tokens -= 1
                    return
                await asyncio.sleep((1 - self._tokens) / self._rate)


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
    """Base class for catalog bots. Subclasses set SLUG + SCHEMA_VERSION."""

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
        # "catalog bots may only reach Highrise and our own Postgres/Redis"). None in
        # standalone/unit-test construction — modules that use this must handle that.
        self.db_pool: "asyncpg.Pool | None" = None
        self.bot_instance_id: str | None = None

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
