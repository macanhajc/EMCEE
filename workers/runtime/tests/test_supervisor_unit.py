"""Supervisor edge cases that don't need real WebSocket traffic — a trivial
fake bot_runner is enough. See test_supervisor_live.py for the full-stack
proof through the real SDK against the fake Highrise server.
"""

from __future__ import annotations

import asyncio
import contextlib

import pytest

from conftest import fetch_events
from fake_highrise_client import FakeHighrise
from highrise import ResponseError
from supervisor import Supervisor


async def hold_forever(bot, room_id, token):
    await asyncio.Event().wait()  # never returns until cancelled


@pytest.fixture
def supervisor(pool, listen_conn, token_box):
    return Supervisor(
        pool,
        listen_conn,
        token_box,
        supervisor_id="sup-unit-test",
        capacity=10,
        bot_runner=hold_forever,
    )


@pytest.fixture
def timeout_supervisor(pool, listen_conn, token_box):
    """Tiny connect-confirm timeout + backoff so the regression test below
    doesn't have to wait out real-world durations."""
    return Supervisor(
        pool,
        listen_conn,
        token_box,
        supervisor_id="sup-unit-test-timeout",
        capacity=10,
        bot_runner=hold_forever,  # never calls on_start, so never confirms — the hang case
        initial_backoff_s=0.01,
        max_backoff_s=0.05,
        fast_failure_threshold_s=0.2,
        max_consecutive_failures=2,
        connect_confirm_timeout_s=0.05,
    )


async def test_stuck_connect_attempt_times_out_instead_of_hanging_forever(
    pool, make_instance, timeout_supervisor
):
    """Regression test for the bug where a bot_runner that never confirms a
    connection (the SDK hanging on Highrise's first reply — no room join, no
    error either) left `status` stuck at "running" forever with nothing in
    the event log, because the old escalation logic only ran after
    bot_runner() returned. Now a stuck attempt must time out, get logged, and
    escalate to `degraded` like any other repeated failure."""
    instance_id = await make_instance(desired_state="running")

    await timeout_supervisor.reconcile()
    assert instance_id in timeout_supervisor.running

    async def is_degraded():
        row = await pool.fetchrow("SELECT status FROM bot_instances WHERE id = $1", instance_id)
        return row is not None and row["status"] == "degraded"

    async def _poll():
        while not await is_degraded():
            await asyncio.sleep(0.02)

    await asyncio.wait_for(_poll(), timeout=5.0)

    events = await fetch_events(pool, instance_id)
    kinds = [e["kind"] for e in events]
    assert "connect_timed_out" in kinds
    assert "degraded" in kinds

    await timeout_supervisor.shutdown()


async def test_unknown_catalog_slug_releases_lease_without_spawning(pool, make_instance, supervisor):
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
        await pool.execute("UPDATE bot_instances SET catalog_bot_slug = 'emcee' WHERE id = $1", instance_id)
        await pool.execute("DELETE FROM catalog_bots WHERE slug = 'ghost'")


async def test_run_writes_heartbeat_every_tick(pool, listen_conn, token_box):
    """The dead-man's-switch (docs/decisions.md, 2026-07-23): run()'s loop
    must write a heartbeat unconditionally, not just when reconcile() has
    instances to claim/renew — an idle supervisor is still an alive one."""
    sup = Supervisor(
        pool,
        listen_conn,
        token_box,
        supervisor_id="sup-heartbeat-unit-test",
        capacity=5,
        bot_runner=hold_forever,
        reconcile_interval_s=0.02,
    )
    run_task = asyncio.create_task(sup.run())
    try:
        async def has_heartbeat():
            row = await pool.fetchrow(
                "SELECT capacity, running_count FROM supervisor_heartbeats WHERE supervisor_id = $1",
                "sup-heartbeat-unit-test",
            )
            return row

        async def _poll():
            row = None
            while row is None:
                row = await has_heartbeat()
                if row is None:
                    await asyncio.sleep(0.01)
            return row

        row = await asyncio.wait_for(_poll(), timeout=2.0)
        assert row["capacity"] == 5
        assert row["running_count"] == 0
    finally:
        run_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await run_task
        await sup.shutdown()


async def test_run_survives_a_failing_tick(pool, listen_conn, token_box):
    """One tick raising (a transient DB error, a schema not applied yet,
    ...) must not permanently kill the loop — a real incident: the very
    first tick after a fresh deploy hit `bot_instances` before migrations
    had run, the unhandled exception silently ended run()'s task, and the
    container sat "Up" and healthy in Docker forever afterward doing
    nothing, with no customer's bot ever reclaimed. run() must catch, log,
    and retry on the next tick instead."""
    sup = Supervisor(
        pool,
        listen_conn,
        token_box,
        supervisor_id="sup-flaky-tick-unit-test",
        capacity=5,
        bot_runner=hold_forever,
        reconcile_interval_s=0.02,
    )
    # No transaction-per-test isolation in this suite (CI gets a fresh
    # throwaway Postgres each run) — clean up a leftover row from a prior
    # local run so a stale heartbeat can't be mistaken for one this test
    # tick actually wrote.
    await pool.execute("DELETE FROM supervisor_heartbeats WHERE supervisor_id = $1", "sup-flaky-tick-unit-test")
    real_reconcile = sup.reconcile
    calls = {"n": 0}

    async def flaky_reconcile():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("simulated transient failure")
        await real_reconcile()

    sup.reconcile = flaky_reconcile

    run_task = asyncio.create_task(sup.run())
    try:
        async def has_heartbeat():
            return await pool.fetchrow(
                "SELECT 1 FROM supervisor_heartbeats WHERE supervisor_id = $1",
                "sup-flaky-tick-unit-test",
            )

        async def _poll():
            row = None
            while row is None:
                row = await has_heartbeat()
                if row is None:
                    await asyncio.sleep(0.01)
            return row

        # A heartbeat only gets written *after* reconcile() succeeds for a
        # tick — seeing one here proves the loop survived the first,
        # failing tick and reached a later, successful one.
        await asyncio.wait_for(_poll(), timeout=2.0)
        assert calls["n"] >= 2
        assert not run_task.done()  # still looping, not dead
    finally:
        run_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await run_task
        await sup.shutdown()


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


async def test_shutdown_stops_all_running_instances(pool, make_instance, supervisor):
    ids = [await make_instance(desired_state="running") for _ in range(3)]
    await supervisor.reconcile()
    assert len(supervisor.running) == 3

    await supervisor.shutdown()

    assert supervisor.running == {}
    for instance_id in ids:
        row = await pool.fetchrow("SELECT status, supervisor_id FROM bot_instances WHERE id = $1", instance_id)
        assert row["status"] == "stopped"
        assert row["supervisor_id"] is None


async def test_config_update_for_unrelated_instance_is_ignored(pool, make_instance, supervisor):
    """A supervisor should ignore config.updated for instances it isn't
    running — e.g. another supervisor's instance in a multi-supervisor
    fleet — rather than erroring."""
    other_instance_id = "00000000-0000-0000-0000-000000000000"
    await supervisor._handle_config_update(f'{{"instanceId": "{other_instance_id}"}}')  # must not raise


async def test_malformed_config_update_payload_is_ignored(supervisor):
    await supervisor._handle_config_update("not json")  # must not raise
    await supervisor._handle_config_update("{}")  # missing instanceId — must not raise


async def test_avatar_position_update_for_unrelated_instance_is_ignored(supervisor):
    """Same "not ours" guard as config.updated, mirrored for the dashboard
    anchor-spot channel (specs/bots/avatar.md)."""
    other_instance_id = "00000000-0000-0000-0000-000000000000"
    await supervisor._handle_avatar_position_update(f'{{"instanceId": "{other_instance_id}"}}')  # must not raise


async def test_malformed_avatar_position_update_payload_is_ignored(supervisor):
    await supervisor._handle_avatar_position_update("not json")  # must not raise
    await supervisor._handle_avatar_position_update("{}")  # missing instanceId — must not raise


async def test_avatar_position_update_reaches_running_instance(pool, make_instance, supervisor):
    """No `avatar_positions` row exists for this instance, so `restore_position`
    (called via `EmceeBot.apply_avatar_position`) returns before touching
    `bot.highrise` — unset under the `hold_forever` bot_runner fixture here.
    This proves the supervisor-to-bot wiring itself; the actual teleport call
    once a position is saved is covered at the bot level in test_avatar_bot.py."""
    instance_id = await make_instance(desired_state="running")
    await supervisor.reconcile()
    assert instance_id in supervisor.running

    await supervisor._handle_avatar_position_update(f'{{"instanceId": "{instance_id}"}}')

    events = await fetch_events(pool, instance_id)
    assert any(e["kind"] == "avatar_position_applied" for e in events)

    await supervisor.shutdown()


async def test_avatar_position_update_crash_does_not_kill_listener(pool, make_instance, supervisor):
    """Regression: found live (2026-07-24) when a real supervisor process
    crashed instead of shutting down cleanly. Sequence: an instance is
    running but stuck mid-connect (missing designer rights, in this bug's
    case — anything that leaves bot_runner() never confirming works), so
    `bot.highrise` is never set (only assigned once the SDK gets a real
    session — highrise/__main__.py). If a saved anchor position exists,
    `avatar.restore_position()` doesn't early-return like it does with no
    saved row (see test_avatar_position_update_reaches_running_instance
    above) — it reaches `self.bot.highrise.teleport(...)` and raises
    AttributeError. That propagated out of _handle_avatar_position_update
    with nothing catching it, killing the *listener task* for config/avatar-
    position/moderation NOTIFYs for every instance this supervisor runs —
    and since Supervisor.run()'s `finally` block awaits that same task on
    shutdown, the stored exception re-raised there too, crashing the whole
    process the next time anyone tried to stop it cleanly. One instance
    stuck in a connect-failure loop must never be able to do that."""
    instance_id = await make_instance(desired_state="running")
    await supervisor.reconcile()
    assert instance_id in supervisor.running
    assert not hasattr(supervisor.running[instance_id].bot, "highrise")

    await pool.execute(
        "INSERT INTO avatar_positions (bot_instance_id, x, y, z, facing) VALUES ($1, 1, 2, 3, 'RightFace')",
        instance_id,
    )

    listener_task = asyncio.create_task(supervisor._listen_config_updates())
    await asyncio.sleep(0.1)  # let add_listener's LISTEN register before notifying
    await pool.execute("SELECT pg_notify('avatar_position.updated', $1)", f'{{"instanceId": "{instance_id}"}}')
    await asyncio.sleep(0.2)  # let the (now-caught) crash happen

    assert not listener_task.done()  # must survive the crash, not die silently

    # And it must still be doing its job afterward, not just technically alive.
    await _insert_moderation_request(pool, instance_id, action="ban")
    supervisor.running[instance_id].bot.highrise = FakeHighrise()
    await pool.execute("SELECT pg_notify('moderation.requested', $1)", f'{{"instanceId": "{instance_id}"}}')

    async def is_applied():
        row = await pool.fetchrow("SELECT status FROM moderation_requests WHERE bot_instance_id = $1", instance_id)
        return row is not None and row["status"] == "applied"

    async def _poll():
        while not await is_applied():
            await asyncio.sleep(0.02)

    await asyncio.wait_for(_poll(), timeout=5.0)

    listener_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener_task
    await supervisor.shutdown()


# --- dashboard-initiated ban/unban (specs/bots/moderation.md's "proposed" section) --------


async def _insert_moderation_request(pool, instance_id: str, action: str = "ban") -> None:
    await pool.execute(
        """
        INSERT INTO moderation_requests (bot_instance_id, target_user_id, target_username, action, requested_by)
        VALUES ($1, 'u1', 'troublemaker', $2, (SELECT user_id FROM bot_instances WHERE id = $1))
        """,
        instance_id,
        action,
    )


async def test_moderation_requested_for_unrelated_instance_is_ignored(supervisor):
    other_instance_id = "00000000-0000-0000-0000-000000000000"
    await supervisor._handle_moderation_requested(f'{{"instanceId": "{other_instance_id}"}}')  # must not raise


async def test_malformed_moderation_requested_payload_is_ignored(supervisor):
    await supervisor._handle_moderation_requested("not json")  # must not raise
    await supervisor._handle_moderation_requested("{}")  # missing instanceId — must not raise


async def test_moderation_request_for_stopped_instance_stays_pending(pool, make_instance, supervisor):
    """The instance is never claimed/running here — same "bot not connected"
    case specs/bots/moderation.md calls out: a request made (or still queued)
    while the instance is stopped must not be lost, just left pending until
    it's running again."""
    instance_id = await make_instance(desired_state="stopped")
    await _insert_moderation_request(pool, instance_id)

    await supervisor._handle_moderation_requested(f'{{"instanceId": "{instance_id}"}}')

    row = await pool.fetchrow("SELECT status FROM moderation_requests WHERE bot_instance_id = $1", instance_id)
    assert row["status"] == "pending"


async def test_reconcile_sweep_applies_pending_moderation_request_without_notify(
    pool, make_instance, supervisor
):
    """Proves the "poll for correctness" half independently of pub/sub —
    reconcile() must pick up a pending row for an already-running instance
    even with no moderation.requested NOTIFY at all (a dropped notification
    must not mean a dropped ban)."""
    instance_id = await make_instance(desired_state="running")
    await supervisor.reconcile()
    assert instance_id in supervisor.running
    supervisor.running[instance_id].bot.highrise = FakeHighrise()

    await _insert_moderation_request(pool, instance_id, action="ban")

    await supervisor.reconcile()  # no NOTIFY fired — only the sweep runs

    row = await pool.fetchrow("SELECT status FROM moderation_requests WHERE bot_instance_id = $1", instance_id)
    assert row["status"] == "applied"
    assert supervisor.running[instance_id].bot.highrise.moderate_room_calls == [("u1", "ban", None)]

    events = await fetch_events(pool, instance_id)
    assert any(e["kind"] == "moderation" and e["data"].get("type") == "dashboard_moderation_applied" for e in events)

    await supervisor.shutdown()


async def test_moderation_requested_denied_marks_request_denied(pool, make_instance, supervisor):
    instance_id = await make_instance(desired_state="running")
    await supervisor.reconcile()
    fake = FakeHighrise()
    fake.moderate_room_error = ResponseError("insufficient privilege")
    supervisor.running[instance_id].bot.highrise = fake

    await _insert_moderation_request(pool, instance_id, action="ban")
    await supervisor._apply_pending_moderation_requests([instance_id])

    row = await pool.fetchrow(
        "SELECT status, error FROM moderation_requests WHERE bot_instance_id = $1", instance_id
    )
    assert row["status"] == "denied"
    assert row["error"] == "insufficient privilege"

    await supervisor.shutdown()


async def test_pending_moderation_requests_apply_in_creation_order(pool, make_instance, supervisor):
    """Regression test for a live bug: a ban followed by several unbans for
    the same user, all queued while the instance was stopped, came back from
    `claim_pending_moderation_requests` in an order that didn't match
    creation order — `UPDATE ... RETURNING` doesn't preserve the driving
    subquery's `ORDER BY id`, only lock-acquisition order does — so the
    *oldest* request (the ban) got applied *last* once the instance
    reconnected, silently re-banning a user the owner had since unbanned
    three times. Encodes each row's position via a distinct `duration_s`
    marker (unband/ban duration is otherwise unused here) so this fails
    loudly if claiming ever goes back to being unordered."""
    instance_id = await make_instance(desired_state="stopped")
    for marker in (1, 2, 3, 4):
        await pool.execute(
            """
            INSERT INTO moderation_requests
                (bot_instance_id, target_user_id, target_username, action, duration_s, requested_by)
            VALUES ($1, 'u1', 'troublemaker', 'unban', $2, (SELECT user_id FROM bot_instances WHERE id = $1))
            """,
            instance_id,
            marker,
        )

    await pool.execute("UPDATE bot_instances SET desired_state = 'running' WHERE id = $1", instance_id)
    await supervisor.reconcile()
    assert instance_id in supervisor.running
    supervisor.running[instance_id].bot.highrise = FakeHighrise()

    await supervisor._apply_pending_moderation_requests([instance_id])

    assert supervisor.running[instance_id].bot.highrise.moderate_room_calls == [
        ("u1", "unban", 1),
        ("u1", "unban", 2),
        ("u1", "unban", 3),
        ("u1", "unban", 4),
    ]

    await supervisor.shutdown()


async def test_moderation_requested_via_postgres_notify(pool, make_instance, supervisor):
    """Real Postgres LISTEN/NOTIFY, same proof shape as
    test_supervisor_live.py's test_avatar_position_update_via_postgres_notify
    — confirms Supervisor._listen_config_updates' channel-name dispatch
    actually reaches _handle_moderation_requested, not just that the handler
    works in isolation."""
    instance_id = await make_instance(desired_state="running")
    await supervisor.reconcile()
    assert instance_id in supervisor.running
    supervisor.running[instance_id].bot.highrise = FakeHighrise()

    await _insert_moderation_request(pool, instance_id, action="ban")

    listener_task = asyncio.create_task(supervisor._listen_config_updates())
    await asyncio.sleep(0.1)  # let add_listener's LISTEN register before notifying
    await pool.execute("SELECT pg_notify('moderation.requested', $1)", f'{{"instanceId": "{instance_id}"}}')

    async def is_applied():
        row = await pool.fetchrow("SELECT status FROM moderation_requests WHERE bot_instance_id = $1", instance_id)
        return row is not None and row["status"] == "applied"

    async def _poll():
        while not await is_applied():
            await asyncio.sleep(0.02)

    await asyncio.wait_for(_poll(), timeout=5.0)

    assert supervisor.running[instance_id].bot.highrise.moderate_room_calls == [("u1", "ban", None)]

    listener_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener_task
    await supervisor.shutdown()
