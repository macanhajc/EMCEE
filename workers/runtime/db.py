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


async def connect_for_listen(dsn: str) -> asyncpg.Connection:
    """Dedicated, non-pooled connection for Postgres LISTEN/NOTIFY
    (docs/cost-plan.md, R6 — replaces the Redis pub/sub channels for
    config.updated / avatar_position.updated). LISTEN registers interest for
    the life of a session; a pool connection can't be used for this because
    releasing it back to the pool resets its session state (asyncpg issues
    an implicit UNLISTEN on release), silently dropping the subscription."""
    return await asyncpg.connect(dsn=dsn)


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


async def renew_leases(
    pool: asyncpg.Pool, instance_ids: list[str], supervisor_id: str, lease_ttl_s: float
) -> set[str]:
    """Extends the lease on every listed instance we still own whose
    desired_state is still 'running' — one round trip for the whole
    reconcile tick, however many instances are running (docs/cost-plan.md,
    R4). Returns the renewed ids; an id missing from the result means stop
    running that instance — either desired_state flipped (the common case:
    billing or the customer turned it off) or we somehow lost the lease."""
    if not instance_ids:
        return set()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            UPDATE bot_instances
            SET lease_expires_at = now() + ($3 * interval '1 second')
            WHERE id = ANY($1::uuid[]) AND supervisor_id = $2 AND desired_state = 'running'
            RETURNING id
            """,
            instance_ids,
            supervisor_id,
            lease_ttl_s,
        )
        return {str(r["id"]) for r in rows}


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


async def record_visit(pool: asyncpg.Pool, instance_id: str, user_id: str, username: str) -> int:
    """Concierge module (specs/bots/greeter.md): atomically bumps this
    user's visit count for this instance and returns the new total —
    single round trip, no read-then-write race between concurrent joins.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO greeter_visits (bot_instance_id, user_id, username, visit_count, first_seen_at, last_seen_at)
            VALUES ($1, $2, $3, 1, now(), now())
            ON CONFLICT (bot_instance_id, user_id) DO UPDATE
            SET visit_count = greeter_visits.visit_count + 1, username = $3, last_seen_at = now()
            RETURNING visit_count
            """,
            instance_id,
            user_id,
            username,
        )
        return row["visit_count"]


async def get_avatar_position(pool: asyncpg.Pool, instance_id: str) -> asyncpg.Record | None:
    """Avatar module (specs/bots/avatar.md): the saved "anchor" spot, if the
    owner has ever set one for this instance."""
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            "SELECT x, y, z, facing FROM avatar_positions WHERE bot_instance_id = $1", instance_id
        )


async def set_avatar_position(
    pool: asyncpg.Pool, instance_id: str, x: float, y: float, z: float, facing: str
) -> None:
    """Upserts the single saved anchor spot for this instance — one row per
    instance, not one per user like `record_visit`/`bump_strikes`."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO avatar_positions (bot_instance_id, x, y, z, facing, updated_at)
            VALUES ($1, $2, $3, $4, $5, now())
            ON CONFLICT (bot_instance_id) DO UPDATE
            SET x = $2, y = $3, z = $4, facing = $5, updated_at = now()
            """,
            instance_id,
            x,
            y,
            z,
            facing,
        )


_CLAIM_MODERATION_SQL = """
WITH claimed AS (
    UPDATE moderation_requests
    SET status = 'processing'
    WHERE id IN (
        SELECT id FROM moderation_requests
        WHERE bot_instance_id = ANY($1::uuid[]) AND status = 'pending'
        ORDER BY id
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *
)
SELECT * FROM claimed;
"""


async def claim_pending_moderation_requests(pool: asyncpg.Pool, instance_ids: list[str]) -> list[asyncpg.Record]:
    """Dashboard-initiated ban/unban (specs/bots/moderation.md's "proposed"
    section): atomically claims (marks 'processing') any pending requests for
    the given instances — one batched round trip for the whole list, same
    posture as `renew_leases` (docs/cost-plan.md R4), not one query per
    instance. FOR UPDATE SKIP LOCKED so the moderation.requested NOTIFY
    handler and the reconcile-loop sweep can't double-claim the same row if
    both fire close together.
    """
    if not instance_ids:
        return []
    async with pool.acquire() as conn:
        return await conn.fetch(_CLAIM_MODERATION_SQL, instance_ids)


async def resolve_moderation_request(
    pool: asyncpg.Pool, request_id: int, status: str, error: str | None = None
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE moderation_requests SET status = $2, error = $3, resolved_at = now() WHERE id = $1",
            request_id,
            status,
            error,
        )


async def bump_strikes(
    pool: asyncpg.Pool, instance_id: str, user_id: str, username: str, decay_h: float
) -> int:
    """Warden module (specs/bots/moderation.md): atomically adds one strike
    for this user on this instance and returns the new total — single round
    trip, same shape as `record_visit`. Decay is computed at write time
    rather than by a separate cron job: if the last strike is older than
    `decay_h` hours, the count resets to 1 (this strike) instead of
    incrementing the stale one.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO warden_strikes (bot_instance_id, user_id, username, strikes, last_strike_at)
            VALUES ($1, $2, $3, 1, now())
            ON CONFLICT (bot_instance_id, user_id) DO UPDATE
            SET strikes = CASE
                    WHEN warden_strikes.last_strike_at < now() - ($4 * interval '1 hour')
                    THEN 1
                    ELSE warden_strikes.strikes + 1
                END,
                username = $3,
                last_strike_at = now()
            RETURNING strikes
            """,
            instance_id,
            user_id,
            username,
            decay_h,
        )
        return row["strikes"]
