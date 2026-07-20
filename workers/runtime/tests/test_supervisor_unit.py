"""Supervisor edge cases that don't need real WebSocket traffic — a trivial
fake bot_runner is enough. See test_supervisor_live.py for the full-stack
proof through the real SDK against the fake Highrise server.
"""

from __future__ import annotations

import asyncio

import pytest

from conftest import fetch_events
from supervisor import Supervisor


async def hold_forever(bot, room_id, token):
    await asyncio.Event().wait()  # never returns until cancelled


@pytest.fixture
def supervisor(pool, redis_client, token_box):
    return Supervisor(
        pool,
        redis_client,
        token_box,
        supervisor_id="sup-unit-test",
        capacity=10,
        bot_runner=hold_forever,
    )


async def test_unknown_catalog_slug_releases_lease_without_spawning(pool, make_instance, supervisor, redis_client):
    instance_id = await make_instance(desired_state="running")
    # Bypass the FK to simulate a genuinely unknown/retired slug reaching
    # the supervisor — direct SQL since bot_instances.catalog_bot_slug has
    # an FK to catalog_bots that would reject an actually-invented slug.
    await pool.execute(
        "INSERT INTO catalog_bots (slug, name, schema_version) VALUES ('ghost', 'Ghost', 1) "
        "ON CONFLICT (slug) DO NOTHING"
    )
    await pool.execute("UPDATE bot_instances SET catalog_bot_slug = 'ghost' WHERE id = $1", instance_id)

    try:
        await supervisor.reconcile()

        assert instance_id not in supervisor.running
        row = await pool.fetchrow("SELECT supervisor_id FROM bot_instances WHERE id = $1", instance_id)
        assert row["supervisor_id"] is None  # released, not left claimed forever
    finally:
        # Must restore the FK-valid slug before the make_instance fixture's
        # own teardown deletes this row, and clean up the throwaway catalog
        # row so it doesn't linger in the shared dev database.
        await pool.execute("UPDATE bot_instances SET catalog_bot_slug = 'emote' WHERE id = $1", instance_id)
        await pool.execute("DELETE FROM catalog_bots WHERE slug = 'ghost'")


async def test_reconcile_keeps_healthy_instance_running_across_ticks(pool, make_instance, supervisor):
    instance_id = await make_instance(desired_state="running")

    await supervisor.reconcile()
    assert instance_id in supervisor.running
    task_after_first_tick = supervisor.running[instance_id].task

    await supervisor.reconcile()
    assert instance_id in supervisor.running
    # same task — reconcile renewed the lease, it did not restart the bot
    assert supervisor.running[instance_id].task is task_after_first_tick

    await supervisor.shutdown()


async def test_shutdown_stops_all_running_instances(pool, redis_client, make_instance, supervisor):
    ids = [await make_instance(desired_state="running") for _ in range(3)]
    await supervisor.reconcile()
    assert len(supervisor.running) == 3

    await supervisor.shutdown()

    assert supervisor.running == {}
    for instance_id in ids:
        row = await pool.fetchrow("SELECT status, supervisor_id FROM bot_instances WHERE id = $1", instance_id)
        assert row["status"] == "stopped"
        assert row["supervisor_id"] is None
        assert await redis_client.exists(f"heartbeat:{instance_id}") == 0


async def test_config_update_for_unrelated_instance_is_ignored(pool, redis_client, make_instance, supervisor):
    """A supervisor should ignore config.updated for instances it isn't
    running — e.g. another supervisor's instance in a multi-supervisor
    fleet — rather than erroring."""
    other_instance_id = "00000000-0000-0000-0000-000000000000"
    await supervisor._handle_config_update(f'{{"instanceId": "{other_instance_id}"}}')  # must not raise


async def test_malformed_config_update_payload_is_ignored(supervisor):
    await supervisor._handle_config_update("not json")  # must not raise
    await supervisor._handle_config_update("{}")  # missing instanceId — must not raise
