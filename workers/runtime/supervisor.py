"""Bot supervisor — one process per shard. Spec: specs/04-bot-runtime.md.

Reconciliation loop, k8s-style: claim instances whose desired_state is
"running" and aren't already claimed (lease-based — specs/04-bot-runtime.md's
stated lean: "survives supervisor death without ops"), renew leases on ones
we're running, stop ones whose desired_state flipped away. Redis pub/sub
(config.updated) makes config changes snappy; the reconcile loop is what
makes everything eventually correct even if a pub/sub message is dropped.

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
import redis.asyncio as redis

import db
import heartbeat
from catalog.base import CatalogBot
from catalog.emote import EmoteBot
from tokenbox import TokenBox

log = logging.getLogger("supervisor")

CATALOG: dict[str, type[CatalogBot]] = {"emote": EmoteBot}

RECONCILE_INTERVAL_S = 10
LEASE_TTL_S = 60
DEFAULT_CAPACITY = 200

INITIAL_BACKOFF_S = 5.0
MAX_BACKOFF_S = 300.0  # spec: "restarts with exponential backoff (cap ~5 min)"
FAST_FAILURE_THRESHOLD_S = 15.0  # a reconnect faster than this doesn't count as "ran fine for a while"
MAX_CONSECUTIVE_FAILURES = 5  # spec: "after N consecutive failures -> degraded, alert"

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
        redis_client: redis.Redis,
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
    ) -> None:
        self.pool = pool
        self.redis = redis_client
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
        for instance_id in list(self.running):
            still_wanted = await db.renew_lease(self.pool, instance_id, self.supervisor_id, self.lease_ttl_s)
            if not still_wanted:
                await self._stop_instance(instance_id, reason="desired_state_stopped")

        free_capacity = self.capacity - len(self.running)
        if free_capacity <= 0:
            return
        claimed = await db.claim_instances(self.pool, self.supervisor_id, free_capacity, self.lease_ttl_s)
        for row in claimed:
            await self._spawn_instance(row)

    async def _spawn_instance(self, row: asyncpg.Record) -> None:
        # asyncpg returns uuid columns as uuid.UUID, but everything else
        # (Redis pub/sub payloads from the control plane, test/CLI callers)
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
                await heartbeat.write_heartbeat(self.redis, instance_id, "error")
                token = None

            if token is not None:
                # Optimistic: written before the WS handshake actually
                # completes, not after. bot_runner() is a long-running call
                # with no "connected" callback to await instead — it either
                # settles into its internal loop (the common case, usually
                # within milliseconds) or returns fast on a fatal error, and
                # the fast-failure/degraded escalation below catches the
                # latter within a few attempts either way.
                await db.set_status(self.pool, instance_id, "running")
                await heartbeat.write_heartbeat(self.redis, instance_id, "connected")
                start = time.monotonic()
                try:
                    await self.bot_runner(bot, room_id, token)
                finally:
                    token = None  # don't let plaintext linger in this frame longer than needed
                elapsed = time.monotonic() - start

                if elapsed < self.fast_failure_threshold_s:
                    consecutive_fast_failures += 1
                else:
                    consecutive_fast_failures = 0
                    backoff = self.initial_backoff_s

                await heartbeat.write_heartbeat(self.redis, instance_id, "reconnecting")
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
                else:
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
        await heartbeat.clear_heartbeat(self.redis, instance_id)
        await db.set_status(self.pool, instance_id, "stopped")
        await db.insert_event(self.pool, instance_id, "stopped", {"reason": reason})

    async def _listen_config_updates(self) -> None:
        pubsub = self.redis.pubsub()
        await pubsub.subscribe("config.updated")
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            await self._handle_config_update(message["data"])

    async def _handle_config_update(self, raw: str | bytes) -> None:
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


async def main(supervisor_id: str, capacity: int) -> None:
    database_url = os.environ["DATABASE_URL"]
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")

    pool = await db.create_pool(database_url)
    redis_client = redis.from_url(redis_url, decode_responses=True)
    token_box = TokenBox()

    supervisor = Supervisor(pool, redis_client, token_box, supervisor_id, capacity)
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
    await redis_client.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BotMarket bot supervisor")
    parser.add_argument("--supervisor-id", default=f"sup-{uuid.uuid4().hex[:12]}")
    parser.add_argument("--capacity", type=int, default=DEFAULT_CAPACITY)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main(args.supervisor_id, args.capacity))
