"""Postgres access for the supervisor — plain asyncpg, no ORM.

Table/column names match the Drizzle schema in apps/web/src/db/schema.ts
exactly (snake_case) — this is the data plane's own read/write view of
tables the control plane owns (specs/02-architecture.md).
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg


async def _init_connection(conn: asyncpg.Connection) -> None:
    # Round-trip jsonb as plain dicts instead of raw strings.
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text"
    )


async def create_pool(dsn: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn=dsn, min_size=2, max_size=10, init=_init_connection)


_CLAIM_SQL = """
WITH claimed AS (
    UPDATE bot_instances
    SET supervisor_id = $1, lease_expires_at = now() + ($2 * interval '1 second')
    WHERE id IN (
        SELECT id FROM bot_instances
        WHERE desired_state = 'running'
          AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY id
        LIMIT $3
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *
)
SELECT * FROM claimed;
"""


async def claim_instances(
    pool: asyncpg.Pool, supervisor_id: str, capacity: int, lease_ttl_s: float
) -> list[asyncpg.Record]:
    """Atomically claims up to `capacity` unclaimed-or-expired running instances.

    FOR UPDATE SKIP LOCKED makes this safe with multiple concurrent
    supervisors — each one just gets a different slice, never double-claims.
    """
    if capacity <= 0:
        return []
    async with pool.acquire() as conn:
        return await conn.fetch(_CLAIM_SQL, supervisor_id, lease_ttl_s, capacity)


async def renew_lease(pool: asyncpg.Pool, instance_id: str, supervisor_id: str, lease_ttl_s: float) -> bool:
    """Extends the lease iff we still own it and desired_state is still
    'running'. False means stop running this instance — either
    desired_state flipped (the common case: billing turned it off) or we
    somehow lost the lease."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE bot_instances
            SET lease_expires_at = now() + ($3 * interval '1 second')
            WHERE id = $1 AND supervisor_id = $2 AND desired_state = 'running'
            RETURNING id
            """,
            instance_id,
            supervisor_id,
            lease_ttl_s,
        )
        return row is not None


async def release_lease(pool: asyncpg.Pool, instance_id: str, supervisor_id: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE bot_instances SET supervisor_id = NULL, lease_expires_at = NULL "
            "WHERE id = $1 AND supervisor_id = $2",
            instance_id,
            supervisor_id,
        )


async def get_instance(pool: asyncpg.Pool, instance_id: str) -> asyncpg.Record | None:
    async with pool.acquire() as conn:
        return await conn.fetchrow("SELECT * FROM bot_instances WHERE id = $1", instance_id)


async def set_status(pool: asyncpg.Pool, instance_id: str, status: str, error_kind: str | None = None) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE bot_instances SET status = $2, error_kind = $3 WHERE id = $1",
            instance_id,
            status,
            error_kind,
        )


async def insert_event(pool: asyncpg.Pool, instance_id: str, kind: str, data: dict[str, Any]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO instance_events (bot_instance_id, kind, data) VALUES ($1, $2, $3)",
            instance_id,
            kind,
            data,
        )
