"""Emote bot ("Emcee") — v1 flagship. Spec: specs/bots/emote.md.

Say an emote's name in chat → your avatar performs it. Permitted users can
trigger "all <emote>" — a staggered room-wide wave through the BACKGROUND
throttle class.
"""

from __future__ import annotations

from highrise import User

from .base import CatalogBot, Priority


class EmoteBot(CatalogBot):
    SLUG = "emote"
    SCHEMA_VERSION = 1

    async def on_chat(self, user: User, message: str) -> None:
        text = message.strip().lower()

        if text in ("emotes", "!emotes"):
            # TODO(emote): whispered, paginated emote list (never public chat).
            return

        if text.startswith("all "):
            # TODO(emote): permission check (owner/owner_designers/allowlist),
            # room cooldown, snapshot roster via get_room_users, staggered
            # fan-out at ~2-4 users/sec through Priority.BACKGROUND,
            # "stopall" abort word.
            return

        # Emote on say: exact/alias match against the curated catalog;
        # unknown text is ignored silently (no "command not found" noise).
        # TODO(emote): catalog is data shipped from the control plane, not
        # code — resolve alias → emote_id, per-user cooldown, then:
        #   await self.throttle.acquire(Priority.NORMAL)
        #   await self.highrise.send_emote(emote_id, user.id)
