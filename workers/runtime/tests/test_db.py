from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import db


async def test_claim_instances_only_claims_running_unleased(pool, make_instance):
    running_id = await make_instance(desired_state="running")
    stopped_id = await make_instance(desired_state="stopped")

    claimed = await db.claim_instances(pool, "sup-a", capacity=10, lease_ttl_s=60)
    claimed_ids = {str(r["id"]) for r in claimed}

    assert running_id in claimed_ids
    assert stopped_id not in claimed_ids


async def test_claim_instances_respects_capacity(pool, make_instance):
    for _ in range(3):
        await make_instance(desired_state="running")

    claimed = await db.claim_instances(pool, "sup-a", capacity=2, lease_ttl_s=60)
    assert len(claimed) == 2


async def test_claim_instances_does_not_reclaim_active_lease(pool, make_instance):
    future = datetime.now(timezone.utc) + timedelta(seconds=60)
    instance_id = await make_instance(desired_state="running", supervisor_id="sup-a", lease_expires_at=future)

    claimed = await db.claim_instances(pool, "sup-b", capacity=10, lease_ttl_s=60)
    assert instance_id not in {str(r["id"]) for r in claimed}


async def test_claim_instances_reclaims_expired_lease(pool, make_instance):
    past = datetime.now(timezone.utc) - timedelta(seconds=5)
    instance_id = await make_instance(desired_state="running", supervisor_id="sup-a", lease_expires_at=past)

    claimed = await db.claim_instances(pool, "sup-b", capacity=10, lease_ttl_s=60)
    assert instance_id in {str(r["id"]) for r in claimed}


async def test_renew_lease_true_while_owned_and_running(pool, make_instance):
    instance_id = await make_instance(desired_state="running")
    claimed = await db.claim_instances(pool, "sup-a", capacity=10, lease_ttl_s=60)
    assert instance_id in {str(r["id"]) for r in claimed}

    assert await db.renew_lease(pool, instance_id, "sup-a", lease_ttl_s=60) is True


async def test_renew_lease_false_when_desired_state_flips(pool, pool2, make_instance):
    instance_id = await make_instance(desired_state="running")
    await db.claim_instances(pool, "sup-a", capacity=10, lease_ttl_s=60)

    async with pool.acquire() as conn:
        await conn.execute("UPDATE bot_instances SET desired_state = 'stopped' WHERE id = $1", instance_id)

    assert await db.renew_lease(pool, instance_id, "sup-a", lease_ttl_s=60) is False


async def test_renew_lease_false_for_wrong_owner(pool, make_instance):
    instance_id = await make_instance(desired_state="running")
    await db.claim_instances(pool, "sup-a", capacity=10, lease_ttl_s=60)

    assert await db.renew_lease(pool, instance_id, "sup-b", lease_ttl_s=60) is False


async def test_release_lease_clears_columns(pool, make_instance):
    instance_id = await make_instance(desired_state="running")
    await db.claim_instances(pool, "sup-a", capacity=10, lease_ttl_s=60)

    await db.release_lease(pool, instance_id, "sup-a")

    row = await db.get_instance(pool, instance_id)
    assert row["supervisor_id"] is None
    assert row["lease_expires_at"] is None


async def test_set_status_and_error_kind(pool, make_instance):
    instance_id = await make_instance()
    await db.set_status(pool, instance_id, "degraded", error_kind="token")

    row = await db.get_instance(pool, instance_id)
    assert row["status"] == "degraded"
    assert row["error_kind"] == "token"


async def test_insert_event_round_trips_jsonb(pool, make_instance):
    instance_id = await make_instance()
    await db.insert_event(pool, instance_id, "disconnected", {"elapsed_s": 3.5})

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT kind, data FROM instance_events WHERE bot_instance_id = $1", instance_id
        )
    assert row["kind"] == "disconnected"
    assert row["data"] == {"elapsed_s": 3.5}


async def test_get_instance_none_for_missing_id(pool):
    assert await db.get_instance(pool, "00000000-0000-0000-0000-000000000000") is None


async def test_claim_is_concurrency_safe_across_supervisors(pool, pool2, make_instance):
    """The FOR UPDATE SKIP LOCKED claim must never let two supervisors claim
    the same instance — this is the whole point of lease-based claiming
    surviving without ops (specs/04-bot-runtime.md)."""
    ids = [await make_instance(desired_state="running") for _ in range(6)]

    claimed_a, claimed_b = await asyncio.gather(
        db.claim_instances(pool, "sup-a", capacity=6, lease_ttl_s=60),
        db.claim_instances(pool2, "sup-b", capacity=6, lease_ttl_s=60),
    )

    ids_a = {str(r["id"]) for r in claimed_a}
    ids_b = {str(r["id"]) for r in claimed_b}
    assert ids_a.isdisjoint(ids_b)
    assert ids_a | ids_b == set(ids)
