"""Helpers shared by more than one catalog module — the owner/
owner_designers/allowlist permission tier and the per-key cooldown gate.
Split out once Avatar needed byte-for-byte the same permission logic
`EmoteEngine._can_trigger_all` already had (specs/bots/avatar.md's SDK
mapping notes this explicitly) — one implementation instead of drifting
copies.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

from highrise import Error, User

from .emotes import normalize

if TYPE_CHECKING:
    from highrise import Highrise


async def check_tiered_permission(
    user: User, cfg: dict[str, Any], room_owner_id: str | None, highrise: "Highrise"
) -> bool:
    """Owner/owner_designers/allowlist tier used by every module that gates
    a room-visible action behind this shape (Emote's `emote_all`; Avatar's
    `position`/`outfit_presets`/`outfit_clone`). The room owner always
    passes regardless of the configured tier."""
    if user.id == room_owner_id:
        return True

    permission = cfg.get("permission", "owner")
    if permission == "owner":
        return False
    if permission == "owner_designers":
        privilege = await highrise.get_room_privilege(user.id)
        return not isinstance(privilege, Error) and bool(privilege.designer)
    if permission == "allowlist":
        allowlist = {normalize(name) for name in cfg.get("allowlist", [])}
        return normalize(user.username) in allowlist
    return False


def check_cooldown(store: dict[str, float], key: str, cooldown_s: float) -> bool:
    """True and records `key` iff the cooldown has elapsed; false (no side effect) otherwise."""
    now = time.monotonic()
    last = store.get(key)
    if last is not None and now - last < cooldown_s:
        return False
    store[key] = now
    return True
