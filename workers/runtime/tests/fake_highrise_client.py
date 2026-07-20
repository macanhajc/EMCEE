"""A fake `self.highrise` (the SDK's `Highrise` action-object, not the WS
connection — see fake_highrise_server.py for that layer) for testing
catalog bot business logic without any network at all. Records every call
so tests can assert on exactly what a bot tried to do.
"""

from __future__ import annotations

from highrise import Error, RoomPermissions, User
from highrise.models import GetRoomUsersRequest, Position


class FakeHighrise:
    def __init__(self) -> None:
        self.sent_emotes: list[tuple[str, str | None]] = []
        self.whispers: list[tuple[str, str]] = []
        self.room_users: list[tuple[User, Position]] = []
        self.designers: set[str] = set()
        self.get_room_users_error: Error | None = None

    async def send_emote(self, emote_id: str, target_user_id: str | None = None) -> None:
        self.sent_emotes.append((emote_id, target_user_id))

    async def send_whisper(self, user_id: str, message: str) -> None:
        self.whispers.append((user_id, message))

    async def get_room_users(self) -> GetRoomUsersRequest.GetRoomUsersResponse | Error:
        if self.get_room_users_error is not None:
            return self.get_room_users_error
        return GetRoomUsersRequest.GetRoomUsersResponse(content=list(self.room_users), rid="fake-rid")

    async def get_room_privilege(self, user_id: str) -> RoomPermissions | Error:
        return RoomPermissions(designer=user_id in self.designers)
