"""Bot supervisor — one process per shard. Spec: specs/04-bot-runtime.md.

Responsibilities (reconciliation-loop shaped, k8s-style):
  claim   BotInstance rows for this shard from Postgres (desired_state=running)
  spawn   one SDK bot per instance (multi-bot per process, SDK >= 23.1.0b11)
  watch   Redis pub/sub (config.updated, instance.desired_state) for snappiness;
          the periodic diff loop stays the source of correctness
  report  per-instance heartbeats (connected/reconnecting/stopped) to Redis

Tokens are decrypted only here, at spawn, and never logged (specs/05-security.md).
"""

from __future__ import annotations

import argparse
import asyncio
import logging

log = logging.getLogger("supervisor")

RECONCILE_INTERVAL_S = 30


async def reconcile() -> None:
    # TODO(supervisor): diff actual bots vs. desired_state in Postgres —
    # spawn new instances, stop suspended ones, apply shard rebalances,
    # restart crashed instances with exponential backoff (cap ~5 min,
    # N consecutive failures → degraded + alert).
    log.debug("reconcile tick (skeleton)")


async def main(shard: str) -> None:
    log.info("supervisor starting for shard %s (skeleton — no Postgres/Redis yet)", shard)
    while True:
        await reconcile()
        await asyncio.sleep(RECONCILE_INTERVAL_S)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BotMarket bot supervisor")
    parser.add_argument("--shard", default="shard-0")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main(args.shard))
