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


async def test_renew_leases_renews_owned_running_and_extends_lease(pool, make_instance):
    instance_id = await make_instance(desired_state="running")
    claimed = await db.claim_instances(pool, "sup-a", capacity=10, lease_ttl_s=60)
    assert instance_id in {str(r["id"]) for r in claimed}

    renewed = await db.renew_leases(pool, [instance_id], "sup-a", lease_ttl_s=300)
    assert renewed == {instance_id}

    # The lease actually moved forward, not just "a row came back": renewing
    # with a 300s TTL must land well past the original 60s claim.
    row = await db.get_instance(pool, instance_id)
    remaining = row["lease_expires_at"] - datetime.now(timezone.utc)
    assert remaining > timedelta(seconds=120)


async def test_renew_leases_excludes_flipped_and_foreign_in_one_batch(pool, make_instance):
    """One batched UPDATE per reconcile tick (docs/cost-plan.md, R4): the
    returned set must be exactly the owned-and-still-running slice, so a
    flipped desired_state and a lease owned by another supervisor both fall
    out of the same single round trip."""
    healthy_id = await make_instance(desired_state="running")
    flipped_id = await make_instance(desired_state="running")
    stolen_id = await make_instance(desired_state="running")
    await db.claim_instances(pool, "sup-a", capacity=10, lease_ttl_s=60)

    async with pool.acquire() as conn:
        await conn.execute("UPDATE bot_instances SET desired_state = 'stopped' WHERE id = $1", flipped_id)
        await conn.execute("UPDATE bot_instances SET supervisor_id = 'sup-b' WHERE id = $1", stolen_id)

    renewed = await db.renew_leases(pool, [healthy_id, flipped_id, stolen_id], "sup-a", lease_ttl_s=60)
    assert renewed == {healthy_id}


async def test_renew_leases_empty_input_returns_empty_without_querying(pool):
    assert await db.renew_leases(pool, [], "sup-a", lease_ttl_s=60) == set()


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


async def test_record_visit_starts_at_one_and_increments(pool, make_instance):
    instance_id = await make_instance()

    first = await db.record_visit(pool, instance_id, "hr-user-1", "alice")
    second = await db.record_visit(pool, instance_id, "hr-user-1", "alice")

    assert first == 1
    assert second == 2


async def test_record_visit_is_per_instance_and_per_user(pool, make_instance):
    instance_a = await make_instance()
    instance_b = await make_instance()

    await db.record_visit(pool, instance_a, "hr-user-1", "alice")
    # Same Highrise user id, different instance — independent counters.
    assert await db.record_visit(pool, instance_b, "hr-user-1", "alice") == 1
    # Different user, same instance — also independent.
    assert await db.record_visit(pool, instance_a, "hr-user-2", "bob") == 1
    # Original counter unaffected by either of the above.
    assert await db.record_visit(pool, instance_a, "hr-user-1", "alice") == 2


async def test_record_visit_updates_username_on_revisit(pool, make_instance):
    instance_id = await make_instance()
    await db.record_visit(pool, instance_id, "hr-user-1", "oldname")
    await db.record_visit(pool, instance_id, "hr-user-1", "newname")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT username FROM greeter_visits WHERE bot_instance_id = $1 AND user_id = $2",
            instance_id,
            "hr-user-1",
        )
    assert row["username"] == "newname"


async def test_bump_strikes_starts_at_one_and_increments(pool, make_instance):
    instance_id = await make_instance()

    first = await db.bump_strikes(pool, instance_id, "hr-user-1", "alice", decay_h=24)
    second = await db.bump_strikes(pool, instance_id, "hr-user-1", "alice", decay_h=24)

    assert first == 1
    assert second == 2


async def test_bump_strikes_is_per_instance_and_per_user(pool, make_instance):
    instance_a = await make_instance()
    instance_b = await make_instance()

    await db.bump_strikes(pool, instance_a, "hr-user-1", "alice", decay_h=24)
    # Same Highrise user id, different instance — independent counters.
    assert await db.bump_strikes(pool, instance_b, "hr-user-1", "alice", decay_h=24) == 1
    # Different user, same instance — also independent.
    assert await db.bump_strikes(pool, instance_a, "hr-user-2", "bob", decay_h=24) == 1
    # Original counter unaffected by either of the above.
    assert await db.bump_strikes(pool, instance_a, "hr-user-1", "alice", decay_h=24) == 2


async def test_bump_strikes_resets_after_decay_window(pool, make_instance):
    instance_id = await make_instance()
    await db.bump_strikes(pool, instance_id, "hr-user-1", "alice", decay_h=24)

    stale = datetime.now(timezone.utc) - timedelta(hours=25)
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE warden_strikes SET last_strike_at = $2 WHERE bot_instance_id = $1 AND user_id = 'hr-user-1'",
            instance_id,
            stale,
        )

    assert await db.bump_strikes(pool, instance_id, "hr-user-1", "alice", decay_h=24) == 1


async def test_bump_strikes_does_not_reset_within_decay_window(pool, make_instance):
    instance_id = await make_instance()
    await db.bump_strikes(pool, instance_id, "hr-user-1", "alice", decay_h=24)

    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE warden_strikes SET last_strike_at = $2 WHERE bot_instance_id = $1 AND user_id = 'hr-user-1'",
            instance_id,
            recent,
        )

    assert await db.bump_strikes(pool, instance_id, "hr-user-1", "alice", decay_h=24) == 2


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
