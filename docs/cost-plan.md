# Cost plan — running BotMaker as cheaply as possible

Written 2026-07-22 after a full read of both planes. Goal: minimum monthly cost **without cutting any feature**. All third-party prices are ballpark as of 2026-07 — verify before committing to any of them.

## TL;DR

The only thing this product truly needs to pay for is **one small always-on VM**: the data plane holds a live WebSocket per bot 24/7 — that *is* the product, and it can never scale to zero. Everything else (control plane, Postgres, cron, email, error tracking, analytics) fits on that same VM plus free tiers at launch volume. There is no Redis in this stack at all (removed 2026-07-22, R6) — one fewer service to run anywhere this app is deployed.

| Path | Stack | ~Monthly (launch scale) |
|---|---|---|
| **Recommended** | One Hetzner-class VPS (2 vCPU/4 GB) running web + supervisor + Postgres via Docker Compose; Caddy for TLS; crontab for cron routes; free tiers for Resend/Sentry/PostHog; Cloudflare free DNS | **~US$5–10 all-in** |
| Managed-everything | Vercel Pro ($20 — Hobby bans commercial use and caps crons at 1/day) + managed Postgres ($15–25) + worker VM ($4–6) | ~US$40–50 |

Same features either way. At R$39/instance (~US$7), the VPS path breaks even at **2 customers**; the marginal infra cost of each additional bot is ~zero until a second VM is warranted (hundreds of bots — they're I/O-bound; supervisor capacity is 200/process).

## What drives cost in this app

- **Data plane:** must be always-on (one WS per bot). CPU/RAM-light, I/O-bound. The floor cost.
- **Control plane:** `proxy.ts` runs on the Node runtime and validates a **database session against Postgres on every matched request** (plus the opportunistic `users.locale` write). Sub-millisecond and free with Postgres on localhost; a function invocation + remote DB round trip per page view on serverless. This app is architecturally cheaper on a persistent server.
- **Cron:** the 5-min degraded-alerts sweep already auths on `Authorization: Bearer $CRON_SECRET` and is documented as crontab-compatible — no Vercel Pro needed for it.
- **Supervisor ↔ Postgres:** the reconcile loop polls every 10 s forever. Harmless on local PG; on serverless-billed managed PG (e.g. Neon) it keeps compute awake 24/7 and burns the free tier. Another reason to colocate.
- **No other per-use billing exists:** no LLM calls, no object storage, no image optimization; `highrise-webapi` is Highrise's free public API.

## Free-tier posture (launch volume)

| Service | Free tier | Trigger to pay |
|---|---|---|
| Resend | 3k emails/mo, **100/day** | Sustained >100/day → SES (~$0.10/1k) behind the existing mailer modules, or Resend Pro $20 |
| Sentry | 5k errors/mo (config is already errors-only: no tracing, no replay) | Fix the bugs first; else Team ~$26 |
| PostHog | 1M events/mo (already `identified_only`, session recording off) | Far away |
| GitHub Actions | 2k min/mo (private repo) | Path filters keep this comfortable (R5) |
| Cloudflare | Free DNS/TLS/proxy | — |
| Backups | pg_dump nightly → Backblaze B2/Cloudflare R2 free tier; Hetzner snapshots ~+20% of VM (~€1) | — |

Truly-$0 option: Oracle Cloud Always Free ARM (4 cores/24 GB) runs this whole stack — real caveats (capacity scarcity, account/reclaim quirks); treat as an experiment, not the plan.

## Per-customer marginal cost (the % of revenue)

Stripe is the only real one. Two levers already in the product:

- **Pix**: materially cheaper than cards in BR and no card-style chargebacks — verify exact current rates once the BR entity/account exists.
- **Annual plan**: one fixed per-transaction fee instead of twelve, and 12× fewer invoices — which also matters later because **NFS-e issuance (Focus NFe/eNotas) is per-invoice**.

Make Pix and annual visually prominent at checkout.

## Code findings with cost/complexity implications

1. **Redis heartbeats were dead weight** — written by the supervisor, read by nothing (grepped the whole web app; status renders from Postgres `status`), and already broken as liveness (45 s TTL, nothing refreshed it between state changes). → removed, R2.
2. **Redis's only remaining live job was pub/sub** (`config.updated`, `avatar_position.updated`), which just shaves ≤10 s off the reconcile poll — the loop is what makes it correct regardless. That's a service Postgres can carry itself via `LISTEN`/`NOTIFY` with no new infrastructure. → removed entirely, R6: the app now has no Redis dependency on either plane, in dev, CI, or any deployment path.
3. **Lease renewal was one UPDATE per running instance every 10 s** — fine on localhost, ugly if PG ever moves off-box. → batched into one query, R4.
4. **Unbounded table growth, no pruning existed** — `instance_events` (spec promises 90-day retention), `webhook_events` (full Stripe payloads forever), expired `sessions`/`verification_tokens`. Plus the spec-flagged missing `(kind, created_at)` index on `instance_events`. → retention cron, R3. `greeter_visits`/`warden_strikes` are deliberately untouched — rows are bounded per instance×user and deleting them would reset features (visit counts, strike decay).
5. **CI ran all three jobs (each with Postgres+Redis service containers) on every push** regardless of what changed. → path filters, R5; the Redis service containers themselves were later dropped too under R6, since nothing in CI needs them anymore.

## Do not cut

- The 24/7 supervisor — no scale-to-zero anything on the data plane; it's the product.
- The 5-min alert cadence — free via crontab.
- Sentry/PostHog — free at this volume; the only eyes pre-launch.
- The localized emails (no cost).

## Scale triggers

| Signal | Action | ~Cost |
|---|---|---|
| >100 emails/day sustained | SES behind existing mailers (R7) | ~$0.10/1k |
| ~300–500 active bots, or CPU saturation | Second VPS for a second supervisor shard | +€4–8 |
| Per-IP connection ceiling discovered (known unknown) | Extra IPs/VMs; the unused `shard` column was reserved for this | +€ small |
| Revenue + uptime anxiety | Managed PG (~$15–19), maybe web on Vercel Pro ($20) | ~$40/mo class |
| Postgres leaves localhost | R4 (batched leases) already done; also revisit reconcile cadence. Each supervisor now also holds one dedicated `LISTEN` connection (R6) — negligible at 1–2 supervisor processes, worth counting against the connection budget on a managed-PG plan with a low connection cap | — |
