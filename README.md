# BotMarket

Hosted, configurable bots for [Highrise](https://highrise.game) rooms — monthly subscription, no code, two-minute setup. Bring your own bot token; we run it 24/7.

> Independent project. Not affiliated with Highrise or Pocket Worlds.

**Status:** core product built end-to-end — auth, Stripe checkout/billing, the schema-driven config dashboard, and the Python supervisor running one bot (**Emcee**) across four shipped feature modules (Emote, Concierge, Warden, Avatar) are all built and tested. UI and transactional email are localized in 5 languages. Production Docker images and a single-box deploy path are wired (`docker-compose.prod.yml` + Caddy + crontab, see [Deploy](#deploy) below) but not yet run against a real VPS: no real Highrise credentials, no live Stripe BR entity, and no GitHub remote exist in this environment (see `docs/decisions.md`).

## Requirements

- [pnpm](https://pnpm.io) (version pinned in root `package.json`'s `packageManager`)
- [uv](https://docs.astral.sh/uv/) — downloads its own Python 3.11; the SDK's `pendulum` pin doesn't build on newer
- [Docker](https://docs.docker.com/get-docker/) + Compose — local Postgres in dev, the whole stack in prod

## Development

```sh
pnpm install          # control plane (Next.js) + schemas workspace
docker compose up -d  # local Postgres 17 (no Redis — config pub/sub runs over Postgres LISTEN/NOTIFY)
cp apps/web/.env.example apps/web/.env
pnpm --filter web db:migrate && pnpm --filter web seed
pnpm dev              # run the web app

cd workers/runtime
cp .env.example .env
uv sync                        # data plane: Python 3.11 venv + pinned highrise-bot-sdk
uv run python keygen.py        # token-sealing keypair — public half to apps/web/.env, private half to workers/runtime/.env
uv run python supervisor.py    # claims desired_state=running instances and connects them
```

`apps/web/.env.example` and `workers/runtime/.env.example` document every variable (Auth.js, Stripe, Resend, Sentry, PostHog, the token-sealing keypair) and where to get real values for it.

## Testing

```sh
pnpm test                            # web: vitest
cd workers/runtime && uv run pytest  # runtime: pytest against real Postgres (docker compose up -d)
./scripts/check-token-seal.sh        # cross-plane: TS seal / Python unseal contract check
```

## CI

`.github/workflows/ci.yml` runs on every push/PR: web (lint, vitest, `next build`), runtime (pytest against a real Postgres service container, not mocks), and a cross-plane job proving the TS/Python token-sealing contract hasn't drifted. Jobs are **path-filtered** (2026-07-22): only the planes a change actually touches run; shared inputs (lockfile, schemas, the workflow itself) trigger everything. No GitHub Secrets required — nothing in CI calls a real external API. Not yet live: this repo has no GitHub remote configured yet.

## Deploy

Recommended path is a single small VPS running everything via Docker Compose (`docker-compose.prod.yml`) — see `docs/cost-plan.md` for why this beats a managed-everything stack (~US$5–10/mo vs. ~US$40–50/mo, same features). No Redis anywhere: config pub/sub runs over Postgres `LISTEN`/`NOTIFY`.

1. **Provision a VPS** (Hetzner-class, 2 vCPU / 4 GB is plenty at launch scale) and point DNS at it.
2. **Clone the repo** on the box (crontab below assumes `/opt/botmarket`; set `REPO_DIR` in `deploy/crontab` if it lives elsewhere).
3. **Configure secrets:**
   ```sh
   cp .env.prod.example .env.prod   # fill in real values — DOMAIN, Postgres creds, Auth/Stripe/Resend/Sentry/PostHog keys
   ```
   Never commit `.env.prod` — `.gitignore` only carves out `.env.prod.example`.
4. **Build and start the stack** — always pass an explicit project name; this directory also has a dev `docker-compose.yml`, and without `-p` they'd fight over the same Postgres volume:
   ```sh
   docker compose -p botmarket-prod -f docker-compose.prod.yml --env-file .env.prod up -d --build
   ```
   This brings up `postgres`, `web` (Next.js standalone image, behind Caddy), `runtime` (the supervisor), and `caddy` (automatic Let's Encrypt TLS for `DOMAIN`, reverse-proxying to `web:3000`).
5. **Run migrations** (and again after any deploy that changes `apps/web/drizzle`):
   ```sh
   docker compose -p botmarket-prod -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate
   ```
6. **Install cron routes + nightly backups** — `deploy/crontab` wires up the degraded-alerts sweep, the retention sweep, and a `pg_dump` → Backblaze B2/Cloudflare R2 backup (via `rclone`, configured separately with `rclone config`):
   ```sh
   crontab deploy/crontab   # check `crontab -l` first if the box already has other cron entries
   ```

Redeploying after a code change is the same `up -d --build` command in step 4 (Compose only rebuilds/recreates what changed); re-run step 5 if the change touched the DB schema.

## Map

| Path | What |
|---|---|
| `apps/web/` | Next.js control plane: storefront, auth, billing, dashboard, admin — localized (next-intl, 5 locales) |
| `apps/web/Dockerfile` | Prod image for the control plane — multi-stage, ships the traced `.next/standalone` output |
| `workers/runtime/` | Python data plane: supervisor + the Emcee bot on the official SDK |
| `workers/runtime/Dockerfile` | Prod image for the supervisor — `uv`-managed, built from the repo root |
| `packages/schemas/` | Versioned JSON Schema for Emcee's config — the contract between planes |
| `docker-compose.yml` | Local dev: Postgres only |
| `docker-compose.prod.yml` | Single-box prod stack: Postgres + web + runtime + Caddy, plus a one-off `migrate` service |
| `Caddyfile` | Reverse proxy + automatic TLS for `DOMAIN` |
| `.env.prod.example` | Template for prod secrets (`.env.prod`, never committed) |
| `deploy/crontab` | Cron routes (alerts, retention) + nightly backup schedule for the VPS |
| `deploy/backup.sh` | Nightly `pg_dump` → gzip → `rclone` upload, with local retention pruning |
| `deploy/cron-hit.sh` | Hits an `apps/web` `/api/cron/*` route with the bearer auth it expects |
| `scripts/check-token-seal.sh` | Cross-plane TS seal / Python unseal contract check |
| `CLAUDE.md` | Working agreement: constraints, stack, conventions |
| `docs/research.md` | Platform research + sources (SDK, ToS, market) |
| `docs/decisions.md` | Dated decision log — the most current account of what's actually built |
| `docs/cost-plan.md` | Cost model + deployment recommendation; tracks the cheap-to-run refactors |
| `specs/01-product.md` | Vision, pricing draft, v1 scope |
| `specs/02-architecture.md` | Control plane / data plane split |
| `specs/03-billing.md` | Stripe + Pix, entitlement lifecycle |
| `specs/04-bot-runtime.md` | Python supervisor, throttling, failure modes |
| `specs/05-security.md` | Token handling, threat model |
| `specs/06-auth.md` | Sign-in methods, gating, sessions, age policy |
| `specs/bots/` | Emcee's four shipped feature modules: Emote, Concierge (greeter/VIP), Warden (moderation), Avatar. Music is a roadmap name only, unscoped. |
| `.claude/skills/highrise/` | Highrise SDK/platform reference skill |
