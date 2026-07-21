"""Emcee — the one bot, sold as one subscription-per-instance. Composes the
Emote, Concierge, and Warden modules (`emote.py`'s `EmoteEngine`,
`greeter.py`'s `GreeterEngine`, `warden.py`'s `WardenEngine`) behind a single
connection, one shared action throttle, and one shared config object —
matching every catalog spec's stated model ("feature modules of that same
bot/instance/token, not separate catalog products") rather than the two
separate `CatalogBot` subclasses this shipped as before the 2026-07-20 merge
(docs/decisions.md).

`EmceeBot` itself owns only what's genuinely shared: the SDK handler
dispatch (so `CatalogBot.__init_subclass__`'s shielding applies — it only
wraps methods defined directly on this class, not on the composed engines,
which is exactly why the delegation happens here and not via mixin
inheritance) and the one `on_start`-captured room identity (`_room_owner_id`,
`_room_name`) all three engines read. Everything module-specific — cooldown
stores, active loops, VIP visit counts, strike state — stays inside its own
engine.

`on_chat` runs Warden before Emote: a filter hit or anti-spam trip should
still whisper a warning and count toward a strike even though the message
also happened to be (or contain) an emote trigger — letting Emote fire first
would have no effect on that ordering either way (Warden never suppresses
delivery to Emote), but Warden-first keeps the moderation path the
first thing evaluated on every message, matching its role as a safety net.

`on_user_leave` is the handler all four modules care about (Emote cancels
the leaver's loop; Concierge logs a farewell; Warden clears the leaver's
rate/duplicate tracking; Avatar drops its cached last-known position).
`on_moderate` is Warden-only (specs/bots/moderation.md — observing external
mod actions to avoid double-punishing). `on_user_move` and `on_reaction`
are Avatar-only (`specs/bots/avatar.md` — anchor-spot position tracking and
reaction-back), added 2026-07-21 alongside that module; no other engine
reads either event.
"""

from __future__ import annotations

from typing import Any

from highrise import SessionMetadata, User
from highrise.models import AnchorPosition, Position, Reaction

from .avatar import AvatarEngine
from .base import CatalogBot
from .emote import EmoteEngine
from .greeter import GreeterEngine
from .warden import WardenEngine


class EmceeBot(CatalogBot):
    SLUG = "emcee"
    SCHEMA_VERSION = 1

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self._room_owner_id: str | None = None
        self._room_name: str = ""
        self._emote = EmoteEngine(self)
        self._greeter = GreeterEngine(self)
        self._warden = WardenEngine(self)
        self._avatar = AvatarEngine(self)

    async def on_start(self, session_metadata: SessionMetadata) -> None:
        self._room_owner_id = session_metadata.room_info.owner_id
        self._room_name = session_metadata.room_info.room_name
        await self._avatar.on_start()

    async def apply_avatar_position(self) -> None:
        """Supervisor's entry point for a dashboard-set anchor spot
        (specs/bots/avatar.md) — invoked live off the `avatar_position.
        updated` Redis message, not just on connect."""
        await self._avatar.restore_position()

    async def on_chat(self, user: User, message: str) -> None:
        await self._warden.on_chat(user, message)
        await self._emote.on_chat(user, message)
        await self._avatar.on_chat(user, message)

    async def on_user_join(self, user: User, position: Position | AnchorPosition) -> None:
        await self._greeter.on_user_join(user, position)
        await self._avatar.on_user_join(user, position)

    async def on_user_move(self, user: User, destination: Position | AnchorPosition) -> None:
        await self._avatar.on_user_move(user, destination)

    async def on_user_leave(self, user: User) -> None:
        await self._emote.on_user_leave(user)
        await self._greeter.on_user_leave(user)
        await self._warden.on_user_leave(user)
        await self._avatar.on_user_leave(user)

    async def on_reaction(self, user: User, reaction: Reaction, receiver: User) -> None:
        await self._avatar.on_reaction(user, reaction, receiver)

    async def on_moderate(
        self, moderator_id: str, target_user_id: str, moderation_type: str, duration: int | None
    ) -> None:
        await self._warden.on_moderate(moderator_id, target_user_id, moderation_type, duration)
