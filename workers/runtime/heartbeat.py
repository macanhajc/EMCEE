"""Redis heartbeats — per-instance connection state for the dashboard status
page (specs/04-bot-runtime.md). TTL'd so a crashed supervisor's heartbeats
expire on their own instead of lying about liveness forever; the control
plane should treat a missing key as "not actually running" even if Postgres
hasn't caught up yet.
"""

from __future__ import annotations

import time

import redis.asyncio as redis

HEARTBEAT_TTL_S = 45  # a couple of reconcile intervals' worth of slack


async def write_heartbeat(client: redis.Redis, instance_id: str, state: str) -> None:
    key = f"heartbeat:{instance_id}"
    await client.hset(key, mapping={"state": state, "updated_at": time.time()})
    await client.expire(key, HEARTBEAT_TTL_S)


async def clear_heartbeat(client: redis.Redis, instance_id: str) -> None:
    await client.delete(f"heartbeat:{instance_id}")
