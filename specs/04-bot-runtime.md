# 04 — Bot runtime (data plane)

Python workers running catalog bots on the official `highrise-bot-sdk`. This is the part of the system that is the revenue: if it flaps, we churn.

## Process model

- **Supervisor** process per shard (start with 1–2 shards). On boot: claim `BotInstance` rows for its shard from Postgres (`desired_state = running`), spawn each as an SDK bot. SDK supports multiple bots per process (≥23.1.0b11); each bot ↔ one room WebSocket, one asyncio task tree.
- **Isolation inside the process:** every handler invocation wrapped so one tenant's exception never escapes its instance. A crashing instance restarts with exponential backoff (cap ~5 min); after N consecutive failures → `degraded`, alert, and surface status to the customer dashboard.
- **Reconciliation loop:** supervisor periodically diffs actual vs. desired (Postgres) — picks up new instances, stops suspended ones, applies shard rebalances. Redis pub/sub (`config.updated`, `instance.desired_state`) makes it snappy; the loop makes it correct even if pub/sub drops.
- **Heartbeats:** per-instance state (connected/reconnecting/stopped, last event ts) → Redis; control plane renders it as the status page. Supervisor-level liveness → uptime monitor.

## Catalog bot structure

```
workers/runtime/
  supervisor.py          claim/spawn/reconcile/heartbeat
  catalog/
    base.py              CatalogBot(BaseBot): config load+validate, safe-dispatch,
                         action throttle, event logging, common helpers
    emote.py             EmoteBot(CatalogBot)        → specs/bots/emote.md (v1)
    # moderation.py / greeter.py — deferred, specs kept in specs/bots/
```

- Config arrives as JSONB + `schema_version`; runtime re-validates against the pinned schema in `packages/schemas/` before applying. Invalid config → keep last-good, emit event, flag dashboard.
- **Hot-apply:** on `config.updated`, swap the validated config object atomically between events. Fields marked `requires_reconnect` in schema metadata trigger a graceful reconnect instead.
- Catalog bots may only reach Highrise (SDK) and our own Postgres/Redis. No other outbound network. Not customer code today — but build the habit.

## Rate limiting (empirical — no published numbers)

Highrise documents only "respect rate limits or get banned." So:

- Central **outbound action throttle** in `CatalogBot` (token bucket per instance, conservative default like ~1 action/sec burst 3 — tune with data). All chat/whisper/emote actions go through it; handlers never call `self.highrise.*` send-methods directly.
- Priority classes from day one: **normal** (emote-on-say, whispers) vs. **background** (emote-all fan-out — staggered ~2–4 users/sec by design, see `bots/emote.md`). On server throttle/error signals: back off, shed background first.
- Log throttle saturation per instance → tells us real platform limits over time.

## Failure catalog (each needs a distinct customer-facing status + message)

| Failure | Detection | Behavior |
|---|---|---|
| Bad/revoked token | auth error on connect | `error: token` — dashboard prompts re-entry; no retry storm (retry hourly) |
| Bot lacks designer rights | join rejected | `error: permissions` — guided fix in dashboard |
| Room deleted/renamed | room lookup fails | `error: room` — prompt for new room ID |
| Network/server blip | WS drop | SDK auto-reconnect + our backoff; `degraded` if >2 min |
| Platform protocol change | connect errors fleet-wide | global alert; kill switch; ship SDK bump — the existential scenario, keep SDK pinned + a canary instance in our own test room |
| Instance crash-loop | N restarts | `degraded`, alert us, customer sees honest status |

## Upgrades

- SDK version pinned; bumps go through the **canary instance** (our own room) for 24h before fleet rollout.
- Catalog bot code deploys = rolling supervisor restart; bots reconnect (in-room blip of seconds). Announce in dashboard changelog, never in-room.

## Capacity assumptions (validate early)

Bots are I/O-bound WS clients; expect O(hundreds) instances per small VM. First load test: 50 synthetic instances against test rooms before public launch.

## Open questions

- Shard assignment: static column vs. lease-based claiming (leaning lease w/ TTL — survives supervisor death without ops).
- Measure real platform limits: connects/min per IP? actions/min per bot? multiple bots from one IP — any per-IP ceiling that forces IP diversity across shards?
- Event log volume: every `user_joined` in a busy room is a lot of rows — sample or aggregate `InstanceEvent` beyond moderation actions?
- Is `on_moderate` sufficient to detect our own bot being kicked/banned from a room (owner removed bot) → auto-stop instance vs. reconnect loop?
