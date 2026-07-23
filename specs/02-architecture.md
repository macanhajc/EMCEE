# 02 — Architecture

## Shape: control plane / data plane split

```
┌────────────────────────────── Control plane (TypeScript) ─────────────────────────────┐
│  Next.js app: storefront · auth · checkout · config dashboard · admin · status        │
│  API routes: internal API for workers (mTLS/private net) · Stripe webhooks            │
└──────────────┬────────────────────────────────────────────────────────────────────────┘
               │ Postgres (source of truth + config pub/sub via LISTEN/NOTIFY)
┌──────────────┴────────────────────────────────────────────────────────────────────────┐
│  Data plane (Python): supervisor per shard → N bot instances per process              │
│  official highrise-bot-sdk · one asyncio task per bot ↔ room WebSocket                │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**Rule of thumb:** the control plane never touches a Highrise WebSocket; the data plane never talks to Stripe. They meet only at Postgres and the internal API. No Redis anywhere in the stack (removed 2026-07-22 — `docs/cost-plan.md`, R6): config pub/sub runs over Postgres LISTEN/NOTIFY on the same database, one fewer service to run and pay for.

## Control plane (Next.js + TypeScript)

- App Router, server components by default; Postgres via **Drizzle** (decided 2026-07-19 — schema in `apps/web/src/db/schema.ts`, SQL migrations in `apps/web/drizzle/`).
- Source layout inside `apps/web/src/` (decided 2026-07-21): `app/` is routing-only — each route has just `page.tsx` (+ `actions.ts` where it needs server actions), plus Next.js specials (`layout.tsx`, `route.ts`). `modules/<route>/` mirrors that same route tree: `index.tsx` is the page's template, `components/` under it holds components used by that one page only. `components/UI` and `components/Elements` hold what's actually reused across 2+ pages — dumb presentational primitives vs. logic-bearing ones (data-fetching, state, mutations), respectively. `page.tsx` owns all data-fetching and server-action wiring and passes data + bound actions down as props; templates and their local components stay presentation-only.
- Auth: Google OAuth + email magic link via Auth.js, no passwords; auth required for checkout, instance creation, and dashboard. Highrise has no public OAuth — the pasted bot token is the Highrise credential. Full spec: `06-auth.md`.
- i18n: next-intl, locale-prefixed routes (`app/[locale]/...`, `localePrefix: "always"`), 5 locales (en/es/de/pt/ru), copy in `apps/web/messages/*.json`. Transactional email shares the same translation files but can't always read the request-scoped locale (crash alerts fire from a cron sweep, payment-failed from a Stripe webhook — neither has a next-intl request context), so `users.locale` is captured opportunistically by `proxy.ts` on every authenticated request and read by `resolveEmailLocale()`, falling back to `en`.
- Config dashboard renders forms **generated from each bot's JSON Schema** (see below). Saving config = validate → write Postgres → publish `config.updated` via Postgres `NOTIFY` (`src/lib/notify.ts`; LISTEN/NOTIFY replaced Redis pub/sub 2026-07-22, `docs/cost-plan.md` R6).
- Admin surface: tenant list, instance health, kill switch per instance, catalog rollout controls.

## Data plane (Python + official SDK)

Detailed in `04-bot-runtime.md`. Summary: a **supervisor** process per shard claims instances from Postgres, spawns one SDK bot per subscription instance (many per process — supported since SDK 23.1.0b11), listens for config updates via Postgres LISTEN/NOTIFY, and reports connection state back through Postgres `status`. No Redis anywhere in this plane (heartbeats removed 2026-07-22 — nothing ever read them; pub/sub moved off Redis onto Postgres the same day — `docs/cost-plan.md` R2/R6). `status` has been connect-confirmed, not optimistic, since 2026-07-21. Each catalog bot is a `BaseBot` subclass (currently just `EmceeBot`) composing its feature modules as plain engine classes underneath, parameterized entirely by validated config — **no tenant code, ever**.

## The contract between planes: JSON Schema per bot

Each catalog bot ships a versioned JSON Schema in `packages/schemas/`. In v1 there is exactly one catalog bot row (`emcee`, `packages/schemas/emcee/v1.json`) and its schema grows by adding a new top-level section per feature module as each ships — additive, no version bump, each section tagged `x-module` (`emote`/`concierge`/`warden`/`avatar`) for dashboard tab grouping only — rather than a new schema per bot (`01-product.md`).

- **Dashboard** auto-renders the config form from it (labels/help text/constraints in the schema).
- **Control plane** validates on save.
- **Runtime** validates again on load (defense in depth; schema version pinned per instance).
- Adding a config option = one schema change + runtime handling; no bespoke UI work.

This is the core product leverage: catalog growth is bounded by bot logic, not UI construction.

## Key entities (first cut)

- `User` — account, auth identities.
- `Subscription` — Stripe state mirror; status drives entitlement.
- `BotInstance` — the sellable unit: user + catalog bot + room_id + encrypted token ref + config (JSONB) + schema_version + desired_state (running/stopped) + user_enabled (customer's own start/stop switch, 2026-07-21) + shard assignment.
- `CatalogBot` — slug, name, schema version(s), pricing id, lifecycle (beta/GA/retired).
- `InstanceEvent` — append-only: connects, disconnects, errors, moderation actions taken (feeds the dashboard activity log).

Wired 2026-07-20: `apps/web/src/app/instances/` (create + config), `apps/web/src/lib/schema-form.ts` (schema→form), `apps/web/src/lib/schema-validate.ts` (ajv). See `docs/decisions.md`.

## Instance lifecycle

```
created → provisioning → running ↔ degraded (reconnecting) → stopped
                             │
                             └→ suspended (billing) → resumed | reaped (30d, config retained)
```

Desired state lives in Postgres; supervisors reconcile actual → desired (small k8s-style loop). `desired_state` is `entitled && user_enabled` (see `specs/03-billing.md`) — billing webhooks and the customer's own dashboard start/stop action are the only two writers, and neither can run the bot alone.

## Deployment (v1, boring on purpose)

- One region. Control plane on Vercel or a VPS; data plane = 1–2 supervisor VMs (Fly.io/Hetzner/Railway) — bots are I/O-bound, hundreds of instances fit on small machines.
- Managed Postgres. No Redis (removed 2026-07-22 — `docs/cost-plan.md`, R6).
- Crash-loop alert sweep: Vercel Cron hitting `/api/cron/degraded-alerts` every 5 min (`apps/web/vercel.json`) — needs a Pro-plan project, since Hobby caps crons at once/day. On a VPS, an equivalent crontab entry works identically: `*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/degraded-alerts`.
- Data-retention sweep (2026-07-22, `docs/cost-plan.md` R3): `/api/cron/retention` daily (also in `vercel.json`; crontab equivalent `47 4 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/retention`) — rolls up + prunes `instance_events` past 90 days, strips old `webhook_events` payloads, sweeps expired sessions/verification tokens.
- Cost posture: see `docs/cost-plan.md` — the recommended v1 deployment is a single VPS running both planes + Postgres, no Redis (the "Vercel or a VPS" duality above still holds; the cost plan just picks the cheap side until scale argues otherwise).
- Observability: structured logs (tokens scrubbed — see `05-security.md`), Sentry both planes (React error boundaries + `before_send` field-name scrubber on the control plane), PostHog product analytics on the control plane (session recording off, `person_profiles: identified_only`), uptime checks on supervisors, per-instance connect-state metrics.

## Open questions

- Internal API transport: REST over private network vs. everything-through-Postgres (no direct API)? Leaning: no direct API in v1 — DB + LISTEN/NOTIFY is enough and one less surface.
- Single VPS vs. Fly machines for supervisors. (~~Drizzle vs. Prisma~~ → Drizzle, 2026-07-19 — `docs/decisions.md`.)
- Config live-apply semantics per bot: which options can hot-apply vs. require bot reconnect? (Mark per-field in schema metadata.)
- Do we need per-tenant outbound action queues from day one to enforce rate limits, or is per-bot throttling in-process enough at v1 scale?
