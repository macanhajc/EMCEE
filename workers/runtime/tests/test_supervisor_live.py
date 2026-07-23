"""Supervisor orchestration exercised through the real SDK's bot_runner()
against the fake Highrise server (tests/fake_highrise_server.py) — real
Postgres (including LISTEN/NOTIFY for config/avatar-position pub/sub, since
2026-07-22 — docs/cost-plan.md R6), real asyncio.Task lifecycle. Only the
WebSocket endpoint is fake, via HR_BOTAPI_URL.
"""

from __future__ import annotations

import asyncio
import contextlib
import os

import pytest
import pytest_asyncio

from conftest import fetch_events
from fake_highrise_server import FakeHighriseServer
from supervisor import Supervisor


@pytest_asyncio.fixture
async def fake_server():
    server = FakeHighriseServer()
    url = await server.start()
    old = os.environ.get("HR_BOTAPI_URL")
    os.environ["HR_BOTAPI_URL"] = url
    yield server
    if old is None:
        os.environ.pop("HR_BOTAPI_URL", None)
    else:
        os.environ["HR_BOTAPI_URL"] = old
    await server.stop()


@pytest.fixture
def supervisor(pool, listen_conn, token_box, fake_server):
    from highrise.__main__ import bot_runner as real_bot_runner

    return Supervisor(
        pool,
        listen_conn,
        token_box,
        supervisor_id="sup-test",
        capacity=10,
        bot_runner=real_bot_runner,
        initial_backoff_s=0.05,
        max_backoff_s=0.2,
        fast_failure_threshold_s=0.5,
        max_consecutive_failures=3,
    )


async def _wait_until(predicate, timeout=5.0, interval=0.02):
    async def _poll():
        while not await predicate():
            await asyncio.sleep(interval)

    await asyncio.wait_for(_poll(), timeout=timeout)


async def test_reconcile_claims_and_connects(pool, make_instance, fake_server, supervisor):
    token = "hr-ok-token"
    instance_id = await make_instance(desired_state="running", token=token)
    fake_server.set_behavior(token, "ok_hold")

    await supervisor.reconcile()
    assert instance_id in supervisor.running

    async def connected():
        row = await pool.fetchrow("SELECT status FROM bot_instances WHERE id = $1", instance_id)
        return row["status"] == "running"

    await _wait_until(connected)

    assert len(fake_server.connections_seen) == 1
    assert fake_server.connections_seen[0]["api_token"] == token

    await supervisor.shutdown()


async def test_stop_on_desired_state_flip(pool, make_instance, fake_server, supervisor):
    token = "hr-ok-token-2"
    instance_id = await make_instance(desired_state="running", token=token)
    fake_server.set_behavior(token, "ok_hold")

    await supervisor.reconcile()
    await _wait_until(lambda: _status_is(pool, instance_id, "running"))

    await pool.execute("UPDATE bot_instances SET desired_state = 'stopped' WHERE id = $1", instance_id)
    await supervisor.reconcile()  # renew_leases sees the flip -> stops it

    assert instance_id not in supervisor.running
    row = await pool.fetchrow("SELECT status, supervisor_id, lease_expires_at FROM bot_instances WHERE id = $1", instance_id)
    assert row["status"] == "stopped"
    assert row["supervisor_id"] is None
    assert row["lease_expires_at"] is None

    events = await fetch_events(pool, instance_id)
    assert any(e["kind"] == "stopped" for e in events)


async def test_fatal_error_escalates_to_degraded(pool, make_instance, fake_server, supervisor):
    token = "hr-fatal-token"
    instance_id = await make_instance(desired_state="running", token=token)
    fake_server.set_behavior(token, "fatal")

    await supervisor.reconcile()

    await _wait_until(lambda: _status_is(pool, instance_id, "degraded"), timeout=10.0)

    events = await fetch_events(pool, instance_id)
    kinds = [e["kind"] for e in events]
    assert kinds.count("degraded") >= 1
    # every attempt against a "fatal" token fails fast, so it should have
    # tried at least max_consecutive_failures times before giving up.
    assert len(fake_server.connections_seen) >= supervisor.max_consecutive_failures

    await supervisor.shutdown()


async def test_config_hot_apply_via_postgres_notify(pool, make_instance, fake_server, supervisor):
    token = "hr-ok-token-3"
    instance_id = await make_instance(
        desired_state="running", token=token, config={"emote_on_say": {"cooldown_s": 3}}
    )
    fake_server.set_behavior(token, "ok_hold")

    await supervisor.reconcile()
    await _wait_until(lambda: _status_is(pool, instance_id, "running"))

    await pool.execute(
        "UPDATE bot_instances SET config = $2 WHERE id = $1",
        instance_id,
        {"emote_on_say": {"cooldown_s": 9}},
    )
    listener_started = asyncio.create_task(supervisor._listen_config_updates())
    await asyncio.sleep(0.1)  # let add_listener's LISTEN register before notifying
    await pool.execute("SELECT pg_notify('config.updated', $1)", f'{{"instanceId": "{instance_id}"}}')

    async def applied():
        return supervisor.running[instance_id].bot.config["emote_on_say"]["cooldown_s"] == 9

    await _wait_until(applied)

    listener_started.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener_started
    events = await fetch_events(pool, instance_id)
    assert any(e["kind"] == "config_applied" for e in events)

    await supervisor.shutdown()


async def test_config_rejection_keeps_last_good(pool, make_instance, fake_server, supervisor):
    token = "hr-ok-token-4"
    instance_id = await make_instance(
        desired_state="running", token=token, config={"emote_on_say": {"cooldown_s": 3}}
    )
    fake_server.set_behavior(token, "ok_hold")

    await supervisor.reconcile()
    await _wait_until(lambda: _status_is(pool, instance_id, "running"))

    await pool.execute(
        "UPDATE bot_instances SET config = $2 WHERE id = $1",
        instance_id,
        {"emote_on_say": {"cooldown_s": 999}},  # out of schema range (max 60)
    )
    listener_started = asyncio.create_task(supervisor._listen_config_updates())
    await asyncio.sleep(0.1)
    await pool.execute("SELECT pg_notify('config.updated', $1)", f'{{"instanceId": "{instance_id}"}}')

    async def rejected():
        events = await fetch_events(pool, instance_id)
        return any(e["kind"] == "config_rejected" for e in events)

    await _wait_until(rejected)

    # last-good config preserved on the live bot object
    assert supervisor.running[instance_id].bot.config["emote_on_say"]["cooldown_s"] == 3

    listener_started.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener_started
    await supervisor.shutdown()


async def test_avatar_position_update_via_postgres_notify(pool, make_instance, fake_server, supervisor):
    """Same real-NOTIFY proof as test_config_hot_apply_via_postgres_notify,
    but for the avatar_position.updated channel — this is what actually
    proves the listener's channel-name dispatch in
    Supervisor._listen_config_updates works against real Postgres, not just
    each handler in isolation (test_avatar_position_update_reaches_running_instance
    in test_supervisor_unit.py calls the handler directly, bypassing LISTEN
    entirely)."""
    token = "hr-ok-token-5"
    instance_id = await make_instance(desired_state="running", token=token)
    fake_server.set_behavior(token, "ok_hold")

    await supervisor.reconcile()
    await _wait_until(lambda: _status_is(pool, instance_id, "running"))

    listener_started = asyncio.create_task(supervisor._listen_config_updates())
    await asyncio.sleep(0.1)
    await pool.execute("SELECT pg_notify('avatar_position.updated', $1)", f'{{"instanceId": "{instance_id}"}}')

    async def applied():
        events = await fetch_events(pool, instance_id)
        return any(e["kind"] == "avatar_position_applied" for e in events)

    await _wait_until(applied)

    listener_started.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener_started
    await supervisor.shutdown()


async def _status_is(pool, instance_id: str, status: str) -> bool:
    row = await pool.fetchrow("SELECT status FROM bot_instances WHERE id = $1", instance_id)
    return row is not None and row["status"] == status
