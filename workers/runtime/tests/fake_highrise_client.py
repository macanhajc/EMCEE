"""A fake `self.highrise` (the SDK's `Highrise` action-object, not the WS
connection — see fake_highrise_server.py for that layer) for testing
catalog bot business logic without any network at all. Records every call
so tests can assert on exactly what a bot tried to do.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from highrise import Error, ResponseError, RoomPermissions, User
from highrise.models import (
    GetInventoryRequest,
    GetRoomUsersRequest,
    GetUserOutfitRequest,
    Item,
    Position,
    Reaction,
)


class FakeHighrise:
    def __init__(self) -> None:
        self.my_id = "bot-1"
        self.sent_emotes: list[tuple[str, str | None]] = []
        self.whispers: list[tuple[str, str]] = []
        self.chats: list[str] = []
        self.room_users: list[tuple[User, Position]] = []
        self.designers: set[str] = set()
        self.get_room_users_error: Error | None = None
        self.moderate_room_calls: list[tuple[str, str, int | None]] = []
        self.moderate_room_error: ResponseError | None = None

        # Outfit/inventory (Avatar module, specs/bots/avatar.md).
        self.inventory: list[Item] = []
        self.outfits: dict[str, list[Item]] = {}  # user_id -> currently-worn items, keyed incl. self.my_id
        self.set_outfit_calls: list[list[Item]] = []
        self.set_outfit_error: Error | None = None
        self.get_user_outfit_error: Error | None = None

        # Position/reaction (Avatar module).
        self.teleport_calls: list[tuple[str, Position]] = []
        self.react_calls: list[tuple[Reaction, str]] = []

        # Lets a test hold `get_my_outfit` open mid-call to force two
        # concurrent outfit commands to interleave at a known point
        # (AvatarEngine's `_outfit_lock` race coverage).
        self.get_my_outfit_gate: asyncio.Event | None = None

    async def send_emote(self, emote_id: str, target_user_id: str | None = None) -> None:
        self.sent_emotes.append((emote_id, target_user_id))

    async def send_whisper(self, user_id: str, message: str) -> None:
        self.whispers.append((user_id, message))

    async def chat(self, message: str) -> None:
        self.chats.append(message)

    async def get_room_users(self) -> GetRoomUsersRequest.GetRoomUsersResponse | Error:
        if self.get_room_users_error is not None:
            return self.get_room_users_error
        return GetRoomUsersRequest.GetRoomUsersResponse(content=list(self.room_users), rid="fake-rid")

    async def get_room_privilege(self, user_id: str) -> RoomPermissions | Error:
        return RoomPermissions(designer=user_id in self.designers)

    async def moderate_room(self, user_id: str, action: str, action_length: int | None = None) -> None:
        self.moderate_room_calls.append((user_id, action, action_length))
        if self.moderate_room_error is not None:
            raise self.moderate_room_error

    async def get_my_outfit(self) -> GetUserOutfitRequest.GetUserOutfitResponse | Error:
        if self.get_my_outfit_gate is not None:
            await self.get_my_outfit_gate.wait()
        return await self.get_user_outfit(self.my_id)

    async def get_user_outfit(self, user_id: str) -> GetUserOutfitRequest.GetUserOutfitResponse | Error:
        if self.get_user_outfit_error is not None:
            return self.get_user_outfit_error
        return GetUserOutfitRequest.GetUserOutfitResponse(outfit=list(self.outfits.get(user_id, [])))

    async def get_inventory(self) -> GetInventoryRequest.GetInventoryResponse | Error:
        return GetInventoryRequest.GetInventoryResponse(items=list(self.inventory))

    async def set_outfit(self, outfit: list[Item]) -> None | Error:
        self.set_outfit_calls.append(outfit)
        if self.set_outfit_error is not None:
            return self.set_outfit_error
        self.outfits[self.my_id] = list(outfit)
        return None

    async def teleport(self, user_id: str, dest: Position) -> None:
        self.teleport_calls.append((user_id, dest))

    async def react(self, reaction: Reaction, target_user_id: str) -> None:
        self.react_calls.append((reaction, target_user_id))


class FakeWebAPI:
    """A fake `self.webapi` (the SDK's HTTP-based public-data client) — just
    enough for `AvatarEngine._merge_by_category`, which only ever reads
    `get_item(id).item.category`. Duck-typed rather than built from the real
    (attrs-based, many-required-field) webapi response classes, since
    nothing else about a real item is read here.
    """

    def __init__(self) -> None:
        self.categories: dict[str, str] = {}  # item_id -> category; unset ids get a unique pseudo-category
        self.failing_ids: set[str] = set()  # ids that raise ResponseError instead of resolving

    async def get_item(self, item_id: str):
        if item_id in self.failing_ids:
            raise ResponseError("item not found")
        category = self.categories.get(item_id, item_id)
        return SimpleNamespace(item=SimpleNamespace(category=category))
