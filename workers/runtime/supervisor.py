"""Bot supervisor — one process per shard. Spec: specs/04-bot-runtime.md.

Reconciliation loop, k8s-style: claim instances whose desired_state is
"running" and aren't already claimed (lease-based — specs/04-bot-runtime.md's
stated lean: "survives supervisor death without ops"), renew leases on ones
we're running, stop ones whose desired_state flipped away. Postgres
LISTEN/NOTIFY (config.updated, avatar_position.updated — Redis pub/sub until
2026-07-22, docs/cost-plan.md R6; moderation.requested added 2026-07-23,
specs/bots/moderation.md) makes config, dashboard-set avatar-position, and
dashboard-initiated ban/unban changes snappy; the reconcile loop (which also
sweeps for pending moderation_requests every tick, not just config/lease
work) plus the per-reconnect config re-read are what make everything
eventually correct even if a notification is dropped — for moderation
requests specifically, that same sweep is also the entire answer to "the
owner clicked Ban while the instance was stopped": the row just waits and
gets claimed the moment the instance is running again, no separate
apply-on-connect path needed.

Tokens are decrypted fresh on every (re)connect attempt, not just once at
spawn — that's what makes "replace token" (specs/05-security.md) take
effect without a dedicated push signal: the next reconnect just picks up
whatever ciphertext is currently in Postgres.

This module never writes anything Stripe/billing-shaped — desired_state is
read-only from here, matching "billing events only ever flip desired_state"
(specs/02-architecture.md). It's the sole writer of `status`/`error_kind`,
the supervisor-observed half of that split.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
import os
import signal
import time
import uuid
from dataclasses import dataclass, field
from typing import Awaitable, Callable

import asyncpg

import db
from catalog.base import CatalogBot
from catalog.emcee import EmceeBot
from tokenbox import TokenBox

log = logging.getLogger("supervisor")

CATALOG: dict[str, type[CatalogBot]] = {"emcee": EmceeBot}

RECONCILE_INTERVAL_S = 10
LEASE_TTL_S = 60
DEFAULT_CAPACITY = 200

INITIAL_BACKOFF_S = 5.0
MAX_BACKOFF_S = 300.0  # spec: "restarts with exponential backoff (cap ~5 min)"
FAST_FAILURE_THRESHOLD_S = 15.0  # a reconnect faster than this doesn't count as "ran fine for a while"
MAX_CONSECUTIVE_FAILURES = 5  # spec: "after N consecutive failures -> degraded, alert"

# bot_runner() has no timeout waiting for Highrise's first reply after the WS
# handshake — a room the bot can never actually join (bad room id, missing
# designer rights) can leave it hanging forever instead of erroring. This
# bounds how long we'll call an attempt "still connecting" before treating it
# as a failure (docs/decisions.md, 2026-07-21).
CONNECT_CONFIRM_TIMEOUT_S = 20.0

# The programmatic multi-bot entrypoint highrise.__main__.main() itself uses
# (see its own bot_runner/control_runner). Runs forever, reconnecting on
# transient WS errors internally; returns on a fatal error or on our
# cancellation. Injectable so tests can supply a fake instead of touching
# the real Highrise network.
BotRunner = Callable[[CatalogBot, str, str], Awaitable[None]]


async def _default_bot_runner(bot: CatalogBot, room_id: str, api_token: str) -> None:
    from highrise.__main__ import bot_runner

    await bot_runner(bot, room_id, api_token)


@dataclass
class RunningInstance:
    instance_id: str
    bot: CatalogBot
    task: asyncio.Task = field(repr=False)


class Supervisor:
    def __init__(
        self,
        pool: asyncpg.Pool,
        listen_conn: asyncpg.Connection,
        token_box: TokenBox,
        supervisor_id: str,
        capacity: int = DEFAULT_CAPACITY,
        bot_runner: BotRunner = _default_bot_runner,
        reconcile_interval_s: float = RECONCILE_INTERVAL_S,
        lease_ttl_s: float = LEASE_TTL_S,
        initial_backoff_s: float = INITIAL_BACKOFF_S,
        max_backoff_s: float = MAX_BACKOFF_S,
        fast_failure_threshold_s: float = FAST_FAILURE_THRESHOLD_S,
        max_consecutive_failures: int = MAX_CONSECUTIVE_FAILURES,
        connect_confirm_timeout_s: float = CONNECT_CONFIRM_TIMEOUT_S,
    ) -> None:
        self.pool = pool
        # Dedicated connection for LISTEN/NOTIFY (db.connect_for_listen) —
        # never acquired from/released to `pool` (see that function's
        # docstring for why).
        self.listen_conn = listen_conn
        self.token_box = token_box
        self.supervisor_id = supervisor_id
        self.capacity = capacity
        self.bot_runner = bot_runner
        self.reconcile_interval_s = reconcile_interval_s
        self.lease_ttl_s = lease_ttl_s
        # Configurable (not just module constants) so tests can use tiny
        # values instead of waiting out a real 5-minute backoff cap.
        self.initial_backoff_s = initial_backoff_s
        self.max_backoff_s = max_backoff_s
        self.fast_failure_threshold_s = fast_failure_threshold_s
        self.max_consecutive_failures = max_consecutive_failures
        self.connect_confirm_timeout_s = connect_confirm_timeout_s
        self.running: dict[str, RunningInstance] = {}
        self._config_listener_task: asyncio.Task | None = None

    async def run(self) -> None:
        self._config_listener_task = asyncio.create_task(self._listen_config_updates())
        try:
            while True:
                await self.reconcile()
                await asyncio.sleep(self.reconcile_interval_s)
        finally:
            self._config_listener_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._config_listener_task

    async def shutdown(self) -> None:
        """Stops every running instance and releases its lease — lets
        another supervisor (or this one, restarting) pick instances back up
        immediately instead of waiting out the full lease TTL."""
        await asyncio.gather(*(self._stop_instance(iid, reason="shutdown") for iid in list(self.running)))

    async def reconcile(self) -> None:
        running_ids = list(self.running)
        if running_ids:
            # One batched UPDATE per tick, not one round trip per instance —
            # keeps steady-state DB load flat as the instance count grows and
            # stays cheap if Postgres ever moves off-box (docs/cost-plan.md, R4).
            still_wanted = await db.renew_leases(self.pool, running_ids, self.supervisor_id, self.lease_ttl_s)
            for instance_id in running_ids:
                if instance_id not in still_wanted:
                    await self._stop_instance(instance_id, reason="desired_state_stopped")

        if self.running:
            await self._apply_pending_moderation_requests(list(self.running))

        free_capacity = self.capacity - len(self.running)
        if free_capacity <= 0:
            return
        claimed = await db.claim_instances(self.pool, self.supervisor_id, free_capacity, self.lease_ttl_s)
        for row in claimed:
            await self._spawn_instance(row)

    async def _spawn_instance(self, row: asyncpg.Record) -> None:
        # asyncpg returns uuid columns as uuid.UUID, but everything else
        # (Postgres NOTIFY payloads from the control plane, test/CLI callers)
        # deals in plain strings — normalize once, here, so self.running's
        # keys always match what callers look up with.
        instance_id = str(row["id"])
        bot_cls = CATALOG.get(row["catalog_bot_slug"])
        if bot_cls is None:
            log.error("instance %s: unknown catalog bot slug %r", instance_id, row["catalog_bot_slug"])
            await db.release_lease(self.pool, instance_id, self.supervisor_id)
            return

        try:
            bot = bot_cls(row["config"])
        except Exception:
            # Control plane validates on save; this should be unreachable —
            # defense in depth, not a case we expect to hit in practice.
            log.exception("instance %s: config rejected at construction", instance_id)
            await db.release_lease(self.pool, instance_id, self.supervisor_id)
            await db.set_status(self.pool, instance_id, "degraded")
            return

        # Generic capability every catalog bot may use (specs/04-bot-runtime.md);
        # today only Concierge's visit-stats persistence does (catalog/greeter.py).
        bot.db_pool = self.pool
        bot.bot_instance_id = instance_id

        task = asyncio.create_task(self._run_instance_loop(instance_id, bot, row))
        self.running[instance_id] = RunningInstance(instance_id=instance_id, bot=bot, task=task)

    async def _run_instance_loop(self, instance_id: str, bot: CatalogBot, row: asyncpg.Record) -> None:
        room_id, ciphertext, key_ref = row["room_id"], row["token_ciphertext"], row["token_key_ref"]
        backoff = self.initial_backoff_s
        consecutive_fast_failures = 0

        while True:
            try:
                token: str | None = self.token_box.unseal(ciphertext, key_ref)
            except Exception:
                log.warning("instance %s: token unseal failed", instance_id)
                await db.set_status(self.pool, instance_id, "degraded", error_kind="token")
                await db.insert_event(self.pool, instance_id, "token_unseal_failed", {})
                token = None

            if token is not None:
                # "provisioning", not "running": this attempt hasn't been
                # confirmed yet. bot_runner() is a long-running call with no
                # "connected" callback to await instead, so we race it
                # against bot._connected_event — set from CatalogBot.on_start
                # (see catalog/base.py's _confirm_connected) the moment the
                # SDK actually gets a session back from Highrise, which is
                # the earliest genuine "this is real" signal available.
                await db.set_status(self.pool, instance_id, "provisioning")
                connected_event = asyncio.Event()
                bot._connected_event = connected_event

                start = time.monotonic()
                runner_task = asyncio.create_task(self.bot_runner(bot, room_id, token))
                token = None  # already captured by the task; don't let plaintext linger longer than needed
                confirm_wait = asyncio.create_task(connected_event.wait())

                try:
                    await asyncio.wait(
                        {runner_task, confirm_wait},
                        timeout=self.connect_confirm_timeout_s,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                except asyncio.CancelledError:
                    # This instance is being stopped (supervisor shutdown or
                    # desired_state flip) mid-attempt — clean up both tasks
                    # ourselves; asyncio.wait() doesn't cancel what it's
                    # waiting on when the waiter itself is cancelled, so
                    # leaving this alone would leak a live connect attempt.
                    runner_task.cancel()
                    confirm_wait.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await asyncio.gather(runner_task, confirm_wait, return_exceptions=True)
                    raise

                if not confirm_wait.done():
                    confirm_wait.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await confirm_wait

                timed_out = not connected_event.is_set() and not runner_task.done()
                if timed_out:
                    # Neither confirmed nor failed within the window — the
                    # SDK is likely hung waiting on a reply Highrise never
                    # sends for this room/token (see the highrise skill's
                    # "known unknowns"). Don't let the dashboard say "running"
                    # for an attempt that never actually confirmed; count it
                    # as a failed attempt like any other.
                    runner_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await runner_task
                    await db.insert_event(
                        self.pool, instance_id, "connect_timed_out", {"timeout_s": self.connect_confirm_timeout_s}
                    )
                else:
                    if connected_event.is_set():
                        await db.set_status(self.pool, instance_id, "running")
                    await runner_task  # already done if it failed before confirming; else runs until it exits
                elapsed = time.monotonic() - start

                # A stuck-then-timed-out attempt never got a real chance to
                # "run for a while", so it always counts toward escalation
                # regardless of how long the timeout window itself was.
                if timed_out or elapsed < self.fast_failure_threshold_s:
                    consecutive_fast_failures += 1
                else:
                    consecutive_fast_failures = 0
                    backoff = self.initial_backoff_s

                if consecutive_fast_failures >= self.max_consecutive_failures:
                    # SDK's bot_runner doesn't surface *why* it returned (see
                    # module docstring in the highrise skill's "known
                    # unknowns") — we can tell something's wrong repeatedly,
                    # not precisely what. error_kind stays unset here;
                    # refine once a canary instance gives us real failure
                    # signatures to key off.
                    await db.set_status(self.pool, instance_id, "degraded")
                    await db.insert_event(
                        self.pool, instance_id, "degraded", {"consecutive_failures": consecutive_fast_failures}
                    )
                elif not timed_out:
                    await db.insert_event(self.pool, instance_id, "disconnected", {"elapsed_s": round(elapsed, 1)})

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, self.max_backoff_s)

            row = await db.get_instance(self.pool, instance_id)
            if row is None:
                return  # instance was deleted out from under us
            room_id, ciphertext, key_ref = row["room_id"], row["token_ciphertext"], row["token_key_ref"]

    async def _stop_instance(self, instance_id: str, reason: str) -> None:
        running = self.running.pop(instance_id, None)
        if running is None:
            return
        running.task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await running.task
        await db.release_lease(self.pool, instance_id, self.supervisor_id)
        await db.set_status(self.pool, instance_id, "stopped")
        await db.insert_event(self.pool, instance_id, "stopped", {"reason": reason})

    async def _listen_config_updates(self) -> None:
        # Three channels, one listener task: config.updated (the JSON config
        # blob), avatar_position.updated (the dashboard-set anchor spot,
        # specs/bots/avatar.md — a row in `avatar_positions`, not part of
        # config, so it needs its own signal rather than piggybacking on the
        # config one), and moderation.requested (dashboard-initiated
        # ban/unban, specs/bots/moderation.md, added 2026-07-23 — a row in
        # `moderation_requests`, same reasoning as avatar_position.updated).
        # Postgres LISTEN/NOTIFY since 2026-07-22 (Redis pub/sub before that,
        # docs/cost-plan.md R6).
        #
        # asyncpg's add_listener callback must be a plain (non-async)
        # function; if it were a coroutine function, asyncpg would schedule
        # each notification as its own independent task, which could run two
        # config applies for the same instance concurrently and out of
        # order. Routing through a queue with a single consumer loop below
        # keeps handling strictly one-at-a-time, in arrival order — matching
        # the old `async for message in pubsub.listen()` semantics exactly.
        queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()

        def _on_notify(connection: object, pid: int, channel: str, payload: str) -> None:
            queue.put_nowait((channel, payload))

        await self.listen_conn.add_listener("config.updated", _on_notify)
        await self.listen_conn.add_listener("avatar_position.updated", _on_notify)
        await self.listen_conn.add_listener("moderation.requested", _on_notify)
        while True:
            channel, payload = await queue.get()
            if channel == "avatar_position.updated":
                await self._handle_avatar_position_update(payload)
            elif channel == "moderation.requested":
                await self._handle_moderation_requested(payload)
            else:
                await self._handle_config_update(payload)

    async def _handle_config_update(self, raw: str) -> None:
        try:
            payload = json.loads(raw)
            instance_id = payload["instanceId"]
        except (json.JSONDecodeError, KeyError, TypeError):
            log.warning("config.updated: malformed payload %r", raw)
            return

        running = self.running.get(instance_id)
        if running is None:
            return  # not ours (different supervisor, or not currently running)

        row = await db.get_instance(self.pool, instance_id)
        if row is None:
            return

        if running.bot.apply_config(row["config"]):
            await db.insert_event(self.pool, instance_id, "config_applied", {})
        else:
            # CatalogBot.apply_config already logs + keeps last-good; this is
            # what makes the rejection visible on the dashboard.
            await db.insert_event(self.pool, instance_id, "config_rejected", {})

    async def _handle_avatar_position_update(self, raw: str) -> None:
        try:
            payload = json.loads(raw)
            instance_id = payload["instanceId"]
        except (json.JSONDecodeError, KeyError, TypeError):
            log.warning("avatar_position.updated: malformed payload %r", raw)
            return

        running = self.running.get(instance_id)
        if running is None:
            return  # not ours (different supervisor, or not currently running)

        # Only EmceeBot (the one catalog bot with the avatar module) exposes
        # this; getattr rather than an isinstance import keeps this module
        # agnostic to which catalog bots compose avatar-like behavior.
        apply_position = getattr(running.bot, "apply_avatar_position", None)
        if apply_position is not None:
            await apply_position()
            await db.insert_event(self.pool, instance_id, "avatar_position_applied", {})

    async def _handle_moderation_requested(self, raw: str) -> None:
        try:
            payload = json.loads(raw)
            instance_id = payload["instanceId"]
        except (json.JSONDecodeError, KeyError, TypeError):
            log.warning("moderation.requested: malformed payload %r", raw)
            return

        if instance_id not in self.running:
            return  # not ours, or the instance isn't running — stays 'pending' until it is
        await self._apply_pending_moderation_requests([instance_id])

    async def _apply_pending_moderation_requests(self, instance_ids: list[str]) -> None:
        """Claims and applies pending `moderation_requests` for the given
        (currently running) instances — called both from the
        moderation.requested NOTIFY handler (fast path) and every
        reconcile() tick (the "poll for correctness" half of the same
        pattern config.updated/avatar_position.updated already use: a
        dropped NOTIFY, or a request made while the instance was stopped,
        still gets applied on the next tick/reconnect instead of never).
        One batched claim query for the whole list, not one round trip per
        instance (docs/cost-plan.md R4's "one batched round trip per tick"
        posture, same as renew_leases above).
        """
        if not instance_ids:
            return
        rows = await db.claim_pending_moderation_requests(self.pool, instance_ids)
        for row in rows:
            instance_id = str(row["bot_instance_id"])
            running = self.running.get(instance_id)
            warden = getattr(running.bot, "_warden", None) if running is not None else None
            if warden is None:
                # Claimed but no longer running here (stopped between the
                # batch query and now, or this catalog bot has no Warden
                # module) — left 'processing' rather than requeued; a
                # stuck-request sweep isn't built in this pass (see
                # specs/bots/moderation.md's open questions).
                continue
            try:
                status, error = await warden.apply_dashboard_action(
                    str(row["target_user_id"]), row["target_username"], row["action"], row["duration_s"]
                )
            except Exception:
                log.exception("moderation_requests row %s: apply failed", row["id"])
                await db.resolve_moderation_request(self.pool, row["id"], "failed", "internal error")
                continue
            await db.resolve_moderation_request(self.pool, row["id"], status, error)


async def main(supervisor_id: str, capacity: int) -> None:
    database_url = os.environ["DATABASE_URL"]

    pool = await db.create_pool(database_url)
    listen_conn = await db.connect_for_listen(database_url)
    token_box = TokenBox()

    supervisor = Supervisor(pool, listen_conn, token_box, supervisor_id, capacity)
    log.info("supervisor %s starting (capacity=%d)", supervisor_id, capacity)

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)

    run_task = asyncio.create_task(supervisor.run())
    await stop_event.wait()

    log.info("shutdown signal received, draining %d instance(s)...", len(supervisor.running))
    await supervisor.shutdown()
    run_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await run_task

    await pool.close()
    await listen_conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BotMarket bot supervisor")
    parser.add_argument("--supervisor-id", default=f"sup-{uuid.uuid4().hex[:12]}")
    parser.add_argument("--capacity", type=int, default=DEFAULT_CAPACITY)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main(args.supervisor_id, args.capacity))
