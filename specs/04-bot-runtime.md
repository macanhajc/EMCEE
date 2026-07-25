# 04 — Bot runtime (data plane)

Python workers running catalog bots on the official `highrise-bot-sdk`. This is the part of the system that is the revenue: if it flaps, we churn.

Wired 2026-07-20 (`workers/runtime/supervisor.py`, `db.py`). See `docs/decisions.md` for what's verified vs. still open — no real Highrise credentials exist in this environment, so verification used a fake WebSocket server speaking the real wire protocol against the real SDK's `bot_runner()`, not the live platform.

## Process model

- **Supervisor** process per shard (start with 1–2 shards). On boot: claim `BotInstance` rows for its shard from Postgres (`desired_state = running`), spawn each as an SDK bot. SDK supports multiple bots per process (≥23.1.0b11); each bot ↔ one room WebSocket, one asyncio task tree.
- **Isolation inside the process:** every handler invocation wrapped so one tenant's exception never escapes its instance. A crashing instance restarts with exponential backoff (cap ~5 min); after N consecutive failures → `degraded`, alert, and surface status to the customer dashboard.
- **Reconciliation loop:** supervisor periodically diffs actual vs. desired (Postgres) — picks up new instances, stops suspended ones, applies shard rebalances. Lease renewal is **one batched UPDATE per tick** for everything the supervisor runs, not a round trip per instance (2026-07-22, `docs/cost-plan.md` R4) — steady-state DB load stays flat as instance count grows. Postgres `LISTEN`/`NOTIFY` (`config.updated`, `avatar_position.updated` — Redis pub/sub before 2026-07-22, `docs/cost-plan.md` R6) makes it snappy; the loop makes it correct even if a notification is dropped.
- **Connection state for the dashboard is Postgres `status`, nothing else.** Redis heartbeats existed here until 2026-07-22 and were removed (`docs/cost-plan.md` R2): no control-plane code ever read them, and they were already broken as a liveness signal (45s TTL, only refreshed on state *changes*, so a healthy long-running bot's key expired anyway). `status` has been connect-confirmed (not optimistic) since 2026-07-21, which is what the heartbeats were originally imagined to provide. Supervisor-level liveness → uptime monitor on the process, still an open deployment item.
- **No Redis anywhere in this plane.** The supervisor holds one dedicated (non-pooled) `asyncpg` connection for `LISTEN` (`db.connect_for_listen` — a pool connection can't hold a `LISTEN` registration across acquire/release cycles) alongside its normal pool for everything else; the control plane sends `NOTIFY` over its regular pooled connection via `pg_notify()` (`src/lib/notify.ts`). One fewer service to run, deploy, and pay for (`docs/cost-plan.md`, R6).

## Catalog bot structure

```
workers/runtime/
  supervisor.py          claim/spawn/reconcile/stop
  catalog/
    base.py              CatalogBot(BaseBot): config load+validate, safe-dispatch,
                         action throttle, event logging, common helpers
    emcee.py             EmceeBot(CatalogBot) — the one registered catalog slug ("emcee").
                         Composes module engines behind one connection/throttle/config:
    emote.py               EmoteEngine     → specs/bots/emote.md (v1)
    greeter.py              GreeterEngine   → specs/bots/greeter.md (first post-v1 module)
    # moderation.py — deferred, spec kept in specs/bots/
```

Module engines (`EmoteEngine`, `GreeterEngine`) are plain classes, not `CatalogBot` subclasses — they read/write through the owning `EmceeBot` (`self.bot.highrise`/`.throttle`/`.config`). Only `EmceeBot` itself is an SDK handler target, so it's the only thing `CatalogBot.__init_subclass__`'s shielding wraps; each of its handlers just dispatches into the relevant engine(s) (`docs/decisions.md`, 2026-07-20 "Emcee merge"). This replaced an earlier shape where `EmoteBot`/`GreeterBot` were each their own `CatalogBot` subclass with their own catalog slug — correct data-plane code, but it meant Concierge and Emote would have been two separately-purchasable products (two tokens, two rooms) once wired into the control plane, contradicting every spec's "one bot, one instance" framing. Composing modules into one bot class is the pattern going forward as more modules ship.

- Config arrives as JSONB + `schema_version`; runtime re-validates against the pinned schema in `packages/schemas/` before applying. Invalid config → keep last-good, emit event, flag dashboard.
- **Hot-apply:** on `config.updated`, swap the validated config object atomically between events. Fields marked `requires_reconnect` in schema metadata trigger a graceful reconnect instead.
- Catalog bots may only reach Highrise (SDK) and our own Postgres. No other outbound network. Not customer code today — but build the habit.
- **Bot language** (added 2026-07-24): `general.bot_language` — one schema section not owned by any single module, for settings that apply across all of them. Drives `catalog/strings.py`'s `t(locale, key, **kwargs)` lookup table, which every module's *built-in* (non-owner-authored) player-facing strings render through — emote confirmations, loop messages, moderation warnings, mod-command replies, VIP's room-announce line. Owner-authored templates (Concierge's Welcome/VIP/Farewell/Activation message, `_render`'s literal-token substitution) are untouched by this — they stay in whatever language the owner wrote them, independent of `bot_language`.

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
| Instance crash-loop | N restarts | `degraded`, customer emailed (cron-polled sweep, deduped with a cooldown — see `docs/decisions.md`), honest dashboard status |
| Supervisor process down/hung/never started | heartbeat sweep, no bot_instances/instance_events row involved | ops-only email (not customer-facing — ops needs to fix it, not tell every tenant), deduped with a cooldown + a one-time recovery notice — see `docs/decisions.md`, 2026-07-23 |

## Upgrades

- SDK version pinned; bumps go through the **canary instance** (our own room) for 24h before fleet rollout.
- Catalog bot code deploys = rolling supervisor restart; bots reconnect (in-room blip of seconds). Announce in dashboard changelog, never in-room.

## Capacity assumptions (validate early)

Bots are I/O-bound WS clients; expect O(hundreds) instances per small VM. First load test: 50 synthetic instances against test rooms before public launch.

## Open questions

- ~~Shard assignment: static column vs. lease-based claiming~~ → resolved 2026-07-20: lease-based (`bot_instances.supervisor_id` + `lease_expires_at`, `FOR UPDATE SKIP LOCKED` claim). `shard` column kept but unused — reserved for a future coarse partition (e.g. IP-pool grouping) if per-IP ceilings turn out to require it.
- Precise `error_kind` classification (token/permissions/room) isn't achievable yet: the SDK's `bot_runner()` doesn't surface *why* it returned, only stdout prints. The supervisor currently detects "fails fast repeatedly" generically → `degraded`, with `error_kind` unset except for the one failure mode we can classify ourselves (token unseal failure). A stuck-forever connect attempt is now at least distinguishable in the status log (`connect_timed_out` vs. generic `disconnected`, 2026-07-21), but that's a symptom, not a root cause — still can't tell "bad room" from "no designer rights" from "Highrise just never replied this time." Refine once a canary instance gives us real failure signatures to key off (matches "measure real platform limits" below — same empirical posture).
- Measure real platform limits: connects/min per IP? actions/min per bot? multiple bots from one IP — any per-IP ceiling that forces IP diversity across shards?
- Event log volume: every `user_joined` in a busy room is a lot of rows — sample or aggregate `InstanceEvent` beyond moderation actions? *(Partially addressed 2026-07-22: rows older than 90 days are rolled up into `instance_event_rollups` and deleted by the daily retention sweep, so growth is bounded to ~90 days of raw events. Whether high-volume kinds need sampling inside that window is still open.)*
- Is `on_moderate` sufficient to detect our own bot being kicked/banned from a room (owner removed bot) → auto-stop instance vs. reconnect loop?
- ~~`status`/heartbeat are written optimistically when a (re)connect attempt starts, not confirmed after a successful handshake~~ → resolved 2026-07-21: turned out not fine in practice — a room the bot can never join can leave `bot_runner()` hanging on Highrise's first reply forever (no timeout in the SDK, no typed error either), which left `status` stuck at `running` and the event log empty indefinitely. Now: status goes to `provisioning` first; `CatalogBot._confirm_connected()` (called from `on_start`) is the real "connected" signal, raced against a `connect_confirm_timeout_s` (default 20s) in the supervisor. A stuck attempt times out, logs `connect_timed_out`, and counts toward the same consecutive-failures → `degraded` escalation as any other failure.
- `highrise-bot-sdk==25.1.0`'s `__main__.py` imports the deprecated `pkg_resources`, "slated for removal as early as 2025-11-30" per its own deprecation warning — already past that date. Pinned `setuptools<81` as a stopgap (`workers/runtime/pyproject.toml`); this may force an SDK bump sooner than otherwise planned if that pin becomes unsatisfiable.
- Crash-loop email alert's cooldown resets from last-alert-sent, not from outage onset — a recovery-then-re-crash inside the 30-minute cooldown window defers the reminder rather than re-alerting instantly. A true "new incident" detector would need episode/gap-grouping over the event history; more machinery than a v1 crash alert needs (`apps/web/src/lib/degraded-alerts.ts`).
- Nothing monitors the alerting pipeline itself — a broken Resend account, or a cron job that silently stops firing, degrades to silence with no meta-alert. Partially narrower now (2026-07-23): the supervisor-heartbeat sweep at least catches "the runtime process itself is dead," which used to be the deepest version of this gap (nothing anywhere would have noticed). It still can't catch "Resend is broken" or "the VPS crontab itself stopped firing" — both would degrade to the same silence this bullet already named.
- The supervisor-heartbeat health check (`db/supervisor-health.ts`) takes `MAX(last_seen_at)` across every row in `supervisor_heartbeats`, correct for today's single-process deploy but not precise enough to catch one shard dying while others keep writing heartbeats, if this ever becomes multi-shard.
- ~~The alert sweep (`apps/web/src/db/instance-alerts.ts`) scans `instance_events` by `kind` with no supporting index~~ → resolved 2026-07-22: `instance_events_kind_time_idx` (`(kind, created_at desc)`, migration `0009_add_retention`) landed with the retention work; it serves both the alert sweep and the retention cutoff scan.
