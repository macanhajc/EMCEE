# BotMarket

Hosted, configurable bots for [Highrise](https://highrise.game) rooms — monthly subscription, no code, two-minute setup. Bring your own bot token; we run it 24/7.

> Independent project. Not affiliated with Highrise or Pocket Worlds.

**Status:** core spine wired end-to-end — auth, instance creation, Stripe checkout, and the Python supervisor + first catalog bot (Emote) are all built and tested. Not yet deployed anywhere; no real Highrise credentials exist in this environment (see `docs/decisions.md`).

## Development

```sh
pnpm install          # control plane (Next.js) + schemas workspace
docker compose up -d  # local Postgres 17 + Redis 8
cp apps/web/.env.example apps/web/.env
pnpm --filter web db:migrate && pnpm --filter web seed
pnpm dev              # run the web app

cd workers/runtime
uv sync                        # data plane: Python 3.11 venv + pinned highrise-bot-sdk
uv run python keygen.py        # token-sealing keypair — public half to apps/web, private half here
uv run python supervisor.py    # claims desired_state=running instances and connects them
```

Requires [pnpm](https://pnpm.io) and [uv](https://docs.astral.sh/uv/) (uv downloads its own Python 3.11 — the SDK's `pendulum` pin doesn't build on newer).

## CI

`.github/workflows/ci.yml` runs on every push/PR: web (lint, vitest, `next build`), runtime (pytest against real Postgres + Redis service containers, not mocks), and a cross-plane job proving the TS/Python token-sealing contract hasn't drifted. No GitHub Secrets required — nothing in CI calls a real external API. Not yet live: this repo has no GitHub remote configured yet.

## Map

| Path | What |
|---|---|
| `apps/web/` | Next.js control plane: storefront, auth, billing, dashboard |
| `workers/runtime/` | Python data plane: supervisor + catalog bots on the official SDK |
| `packages/schemas/` | Versioned JSON Schema per bot config — the contract between planes |
| `CLAUDE.md` | Working agreement: constraints, stack, conventions |
| `docs/research.md` | Platform research + sources (SDK, ToS, market) |
| `docs/decisions.md` | Dated decision log |
| `specs/01-product.md` | Vision, pricing draft, v1 scope |
| `specs/02-architecture.md` | Control plane / data plane split |
| `specs/03-billing.md` | Stripe + Pix/PayPal, entitlement lifecycle |
| `specs/04-bot-runtime.md` | Python supervisor, throttling, failure modes |
| `specs/05-security.md` | Token handling, threat model |
| `specs/06-auth.md` | Sign-in methods, gating, sessions, age policy |
| `specs/bots/` | v1 flagship: Emote ("Emcee") · deferred drafts: Moderation, Greeter |
| `.claude/skills/highrise/` | Highrise SDK/platform reference skill |
