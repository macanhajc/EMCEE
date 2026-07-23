# BotMarket

Hosted, configurable bots for [Highrise](https://highrise.game) rooms — monthly subscription, no code, two-minute setup. Bring your own bot token; we run it 24/7.

> Independent project. Not affiliated with Highrise or Pocket Worlds.

**Status:** core product built end-to-end — auth, Stripe checkout/billing, the schema-driven config dashboard, and the Python supervisor running one bot (**Emcee**) across four shipped feature modules (Emote, Concierge, Warden, Avatar) are all built and tested. UI and transactional email are localized in 5 languages. Not yet deployed anywhere; no real Highrise credentials, no live Stripe BR entity, and no GitHub remote exist in this environment (see `docs/decisions.md`).

## Development

```sh
pnpm install          # control plane (Next.js) + schemas workspace
docker compose up -d  # local Postgres 17 (no Redis — config pub/sub runs over Postgres LISTEN/NOTIFY)
cp apps/web/.env.example apps/web/.env
pnpm --filter web db:migrate && pnpm --filter web seed
pnpm dev              # run the web app

cd workers/runtime
uv sync                        # data plane: Python 3.11 venv + pinned highrise-bot-sdk
uv run python keygen.py        # token-sealing keypair — public half to apps/web, private half here
uv run python supervisor.py    # claims desired_state=running instances and connects them
```

Requires [pnpm](https://pnpm.io) and [uv](https://docs.astral.sh/uv/) (uv downloads its own Python 3.11 — the SDK's `pendulum` pin doesn't build on newer).

## Testing

```sh
pnpm test                            # web: vitest
cd workers/runtime && uv run pytest  # runtime: pytest against real Postgres (docker compose up -d)
./scripts/check-token-seal.sh        # cross-plane: TS seal / Python unseal contract check
```

## CI

`.github/workflows/ci.yml` runs on every push/PR: web (lint, vitest, `next build`), runtime (pytest against a real Postgres service container, not mocks), and a cross-plane job proving the TS/Python token-sealing contract hasn't drifted. Jobs are **path-filtered** (2026-07-22): only the planes a change actually touches run; shared inputs (lockfile, schemas, the workflow itself) trigger everything. No GitHub Secrets required — nothing in CI calls a real external API. Not yet live: this repo has no GitHub remote configured yet.

## Map

| Path | What |
|---|---|
| `apps/web/` | Next.js control plane: storefront, auth, billing, dashboard, admin — localized (next-intl, 5 locales) |
| `workers/runtime/` | Python data plane: supervisor + the Emcee bot on the official SDK |
| `packages/schemas/` | Versioned JSON Schema for Emcee's config — the contract between planes |
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
