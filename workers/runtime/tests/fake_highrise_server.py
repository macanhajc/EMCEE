"""A minimal fake Highrise bot-API WebSocket server, speaking just enough of
the real wire protocol (see highrise.__main__, highrise.models, highrise._unions)
to exercise the actual SDK's `bot_runner()` against something other than
production Highrise.

Why this exists: there's no way to provision real Highrise bot credentials
or a room in this environment — bot API access is Trust & Safety gated on a
real account with play history, unlike e.g. Stripe's zero-registration
sandbox bootstrap. `highrise.__main__` reads `HR_BOTAPI_URL` from the
environment, which is the seam this exploits: point the real SDK at this
fake server instead of Highrise's, and the supervisor code under test never
knows the difference.

Behavior per api-token is controlled by a directive registered before the
client connects — see `set_behavior`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aiohttp import WSMsgType, web


@dataclass
class FakeHighriseServer:
    behaviors: dict[str, str] = field(default_factory=dict)
    connections_seen: list[dict] = field(default_factory=list)
    port: int = 0
    _runner: web.AppRunner | None = None

    def set_behavior(self, api_token: str, behavior: str) -> None:
        """behavior: "ok_hold" (default) connects successfully and holds
        forever; "fatal" sends a do_not_reconnect Error immediately,
        matching how bot_runner() reacts to a rejected token/room."""
        self.behaviors[api_token] = behavior

    async def start(self) -> str:
        app = web.Application()
        app.router.add_get("/", self._handle)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, "127.0.0.1", 0)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        return f"ws://127.0.0.1:{self.port}"

    async def stop(self) -> None:
        if self._runner:
            await self._runner.cleanup()

    async def _handle(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        room_id = request.headers.get("room-id", "")
        api_token = request.headers.get("api-token", "")
        self.connections_seen.append({"room_id": room_id, "api_token": api_token})
        behavior = self.behaviors.get(api_token, "ok_hold")

        if behavior == "fatal":
            await ws.send_json({"_type": "Error", "message": "invalid token (fake)", "do_not_reconnect": True})
            await ws.close()
            return ws

        await ws.send_json(
            {
                "_type": "SessionMetadata",
                "user_id": "fake-bot-user-id",
                "room_info": {"owner_id": "fake-owner-id", "room_name": room_id},
                "rate_limits": {},
                "connection_id": "fake-connection-id",
                "sdk_version": None,
            }
        )
        # Hold the connection open — ignore whatever the client sends
        # (keepalive pings, mostly) until it disconnects us or errors out.
        async for msg in ws:
            if msg.type == WSMsgType.ERROR:
                break
        return ws
