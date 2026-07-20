# 02 — Architecture

## Shape: control plane / data plane split

```
┌────────────────────────────── Control plane (TypeScript) ─────────────────────────────┐
│  Next.js app: storefront · auth · checkout · config dashboard · admin · status        │
│  API routes: internal API for workers (mTLS/private net) · Stripe webhooks            │
└──────────────┬──────────────────────────────┬─────────────────────────────────────────┘
               │ Postgres (source of truth)   │ Redis (config pub/sub · heartbeats)
┌──────────────┴──────────────────────────────┴─────────────────────────────────────────┐
│  Data plane (Python): supervisor per shard → N bot instances per process              │
│  official highrise-bot-sdk · one asyncio task per bot ↔ room WebSocket                │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**Rule of thumb:** the control plane never touches a Highrise WebSocket; the data plane never talks to Stripe. They meet only at Postgres/Redis and the internal API.

## Control plane (Next.js + TypeScript)

- App Router, server components by default; Postgres via **Drizzle** (decided 2026-07-19 — schema in `apps/web/src/db/schema.ts`, SQL migrations in `apps/web/drizzle/`).
- Auth: Google OAuth + email magic link via Auth.js, no passwords; auth required for checkout, instance creation, and dashboard. Highrise has no public OAuth — the pasted bot token is the Highrise credential. Full spec: `06-auth.md`.
- Config dashboard renders forms **generated from each bot's JSON Schema** (see below). Saving config = validate → write Postgres → publish `config.updated` on Redis.
- Admin surface: tenant list, instance health, kill switch per instance, catalog rollout controls.

## Data plane (Python + official SDK)

Detailed in `04-bot-runtime.md`. Summary: a **supervisor** process per shard claims instances from Postgres, spawns one SDK bot per subscription instance (many per process — supported since SDK 23.1.0b11), subscribes to Redis for config updates, heartbeats back. Catalog bots are `BaseBot` subclasses parameterized entirely by validated config — **no tenant code, ever**.

## The contract between planes: JSON Schema per bot

Each catalog bot ships a versioned JSON Schema in `packages/schemas/`:

- **Dashboard** auto-renders the config form from it (labels/help text/constraints in the schema).
- **Control plane** validates on save.
- **Runtime** validates again on load (defense in depth; schema version pinned per instance).
- Adding a config option = one schema change + runtime handling; no bespoke UI work.

This is the core product leverage: catalog growth is bounded by bot logic, not UI construction.

## Key entities (first cut)

- `User` — account, auth identities.
- `Subscription` — Stripe/PayPal state mirror; status drives entitlement.
- `BotInstance` — the sellable unit: user + catalog bot + room_id + encrypted token ref + config (JSONB) + schema_version + desired_state (running/stopped) + shard assignment.
- `CatalogBot` — slug, name, schema version(s), pricing id, lifecycle (beta/GA/retired).
- `InstanceEvent` — append-only: connects, disconnects, errors, moderation actions taken (feeds the dashboard activity log).

Wired 2026-07-20: `apps/web/src/app/instances/` (create + config), `apps/web/src/lib/schema-form.ts` (schema→form), `apps/web/src/lib/schema-validate.ts` (ajv). See `docs/decisions.md`.

## Instance lifecycle

```
created → provisioning → running ↔ degraded (reconnecting) → stopped
                             │
                             └→ suspended (billing) → resumed | reaped (30d, config retained)
```

Desired state lives in Postgres; supervisors reconcile actual → desired (small k8s-style loop). Billing events only ever flip `desired_state`.

## Deployment (v1, boring on purpose)

- One region. Control plane on Vercel or a VPS; data plane = 1–2 supervisor VMs (Fly.io/Hetzner/Railway) — bots are I/O-bound, hundreds of instances fit on small machines.
- Managed Postgres + Redis.
- Observability: structured logs (tokens scrubbed — see `05-security.md`), Sentry both planes, uptime checks on supervisors, per-instance connect-state metrics.

## Open questions

- Internal API transport: REST over private network vs. everything-through-Postgres/Redis (no direct API)? Leaning: no direct API in v1 — DB + pub/sub is enough and one less surface.
- Single VPS vs. Fly machines for supervisors. (~~Drizzle vs. Prisma~~ → Drizzle, 2026-07-19 — `docs/decisions.md`.)
- Config live-apply semantics per bot: which options can hot-apply vs. require bot reconnect? (Mark per-field in schema metadata.)
- Do we need per-tenant outbound action queues from day one to enforce rate limits, or is per-bot throttling in-process enough at v1 scale?
