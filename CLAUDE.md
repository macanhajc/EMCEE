# BotMarket — Highrise Bot Marketplace

Hosted, configurable Highrise bots sold as a monthly USD subscription. Customers bring their own Highrise bot token (BYOT), pick a bot from our first-party catalog, configure it in a dashboard, and we run it 24/7.

**Current stage:** spec/brainstorm. No application code yet. Specs live in `specs/`, decisions in `docs/decisions.md`, platform research in `docs/research.md`.

## Non-negotiable constraints

These come from Highrise's Terms of Service and platform rules — see `docs/research.md` for sources. Do not write code or copy that violates them:

1. **Never accept, hold, or transfer Highrise Gold.** All pricing is real currency (BRL-settled, USD reference). The ToS explicitly names third-party services that let users "sell, transfer, or otherwise use" Gold as a violation.
2. **BYOT only.** The customer owns the bot account and API token. We are a software + hosting vendor, not a reseller of Highrise access.
3. **Bot tokens are crown jewels.** Encrypted at rest, write-only from the UI, never logged, never returned by any API. See `specs/05-security.md`.
4. **Catalog bots are first-party code.** Customers configure; they never upload code. No arbitrary code execution in the data plane.
5. **Respect platform rate limits and moderation norms.** A banned customer bot is churn; a spammy catalog is an existential risk.

## Stack (decided 2026-07-19)

- **Control plane:** Next.js + TypeScript — storefront, auth, billing, config dashboard, admin.
- **Data plane:** Python workers on the **official** `highrise-bot-sdk` (Pocket Worlds). Never the community JS SDKs.
- **Shared state:** Postgres (source of truth), Redis (config pub/sub, worker heartbeats).
- **Payments:** single rail — **Stripe Brazil**: cards + Pix, with Pix Automático mandates for recurring. PayPal dropped for v1. BRL settlement, USD reference pricing. See `specs/03-billing.md`.
- Bot config is defined as **JSON Schema**, shared by both planes: the dashboard renders forms from it, the Python runtime validates against it.

## Planned repo layout (when code starts)

```
apps/web/        Next.js control plane
workers/runtime/ Python bot supervisor + catalog bots
packages/schemas/ JSON Schema for bot configs + internal API contracts
specs/           product & engineering specs (numbered)
docs/            research, decision log
```

## Conventions

- Specs are numbered (`01-product.md`, …) and each ends with an **Open questions** section — resolve questions by editing the spec and logging the decision in `docs/decisions.md`, dated.
- When writing anything that touches the Highrise SDK, platform rules, or bot capabilities, load the `highrise` skill first (`.claude/skills/highrise/`).
- Python: official SDK idioms (`BaseBot` subclass per catalog bot). TypeScript: app router, server components by default.
