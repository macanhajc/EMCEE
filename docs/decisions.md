# Decision log

ADR-lite. Newest first. One entry per decision that shapes the product or architecture; link the spec that carries the detail.

## 2026-07-19 — ORM: Drizzle; initial Postgres schema landed
Drizzle over Prisma: schema-as-TypeScript colocated with the control plane, plain-SQL migrations the Python plane can read, no codegen step, lighter runtime for App Router. Initial schema (`apps/web/src/db/schema.ts`, migration `0000_init`): Auth.js-compatible `users`/`accounts`/`sessions`/`verification_tokens`; `catalog_bots` (slug PK, seeded with `emote`); `bot_instances` (token ciphertext/key-ref/last4/peppered-fingerprint — write-only per `05-security.md`; billing-owned `desired_state` vs. supervisor-observed `status` + `error_kind`); `subscriptions` (Stripe mirror, ours + raw status); `webhook_events` (raw archive, Stripe event id PK = idempotency); `trial_registry` (room + fingerprint, **no user FK** so dedupe survives account deletion, no PII); `instance_events` (append-only). Local dev via root `docker-compose.yml` (Postgres 17 + Redis 8). → `specs/02-architecture.md`

## 2026-07-19 — Repo scaffold: pnpm workspace + uv-managed Python 3.11
Monorepo per the planned layout: pnpm workspace (`apps/web` Next.js 16 App Router + Tailwind, `packages/schemas` with `emote/v1.json`), `workers/runtime` managed by **uv** with a **Python 3.11 pin** — the SDK transitively pins `pendulum==2.1.2`, which needs `distutils` (removed in 3.12), and its old `typing-extensions` pin also forces `jsonschema<4.18` in the runtime. Runtime skeleton establishes the non-negotiable patterns: shielded handlers, per-instance action throttle with priority classes, schema revalidation with last-good-config fallback. ORM (Drizzle vs. Prisma) still open — decide when the DB layer starts. → `specs/02-architecture.md`, `specs/04-bot-runtime.md`

## 2026-07-19 — v1 catalog reworked: single flagship Emote bot; Moderation & Greeter deferred
Catalog review pivot: v1 focuses entirely on the **Emote bot** — user says an emote name in chat → their avatar performs it (even unowned emotes); owner/trusted users can trigger **emote all** (staggered fan-out wave, `send_emote` per room user — no native bulk call exists). Emote bots are the most-demanded bot category in Highrise, so lead with the best seller. Moderation ("Warden") and Greeter ("Concierge") specs kept as deferred drafts; emote loop/stop is the first fast-follow candidate. Supersedes the catalog half of the earlier "v1 catalog" entry below. → `specs/bots/emote.md`

## 2026-07-19 — Billing: Stripe Brazil single rail; PayPal dropped; 7-day trial; monthly + annual
Entity will be Brazil-based → Stripe BR unlocks cards + Pix, and Stripe shipped **Pix Automático recurring mandates for subscriptions** (Apr 2026), killing the prepaid-block workaround. PayPal dropped for v1: PayPal-via-Stripe is EU/UK-account-only and unsupported in Checkout subscription mode, so it would have meant a second billing system. Plans: monthly per instance (draft R$39) + annual (10× monthly); **no bundle SKU** at launch; trial = 7 days with payment method required. BRL settlement, USD reference pricing. Launch blockers: CNPJ + contador (Simples/NFS-e/export treatment). → `specs/03-billing.md`

## 2026-07-19 — Auth: Google OAuth + magic link, token-is-proof, 18+
Authentication required to create a bot instance and for checkout/dashboard; browsing is public. Sign-in via Google OAuth + email magic link only — no passwords stored (Discord OAuth deferred). No Highrise identity captured at signup: the pasted bot token + designer rights is the real Highrise credential; trial-abuse dedupe keys on room ID + token fingerprint. Purchase requires 18+ self-attestation. → `specs/06-auth.md`

## 2026-07-19 — v1 catalog: Moderation + Greeter, first-party only *(catalog choice superseded same day — Emote bot flagship, see entry above; the first-party-only principle stands)*
Two launch bots: **Moderation & safety** and **Greeter & VIP**. Catalog bots are our code, driven by customer config — customers never upload code. Removes sandboxing/arbitrary-execution risk from v1; third-party developer submissions deferred to a future phase. → `specs/bots/moderation.md`, `specs/bots/greeter.md`

## 2026-07-19 — Split stack: Next.js control plane + Python data plane
Control plane (storefront, auth, billing, config UI) in Next.js/TypeScript. Data plane (bot runtime) in Python on the **official** `highrise-bot-sdk`. The community JS SDKs were rejected: single-maintainer beta, last release ~a year old, fragmented across renames, while the official SDK is vendor-maintained and shipped 25.1.0 in April 2026 with multi-bot-per-process and hardened reconnect. → `specs/02-architecture.md`

## 2026-07-19 — Payments: Stripe + Pix/PayPal, USD-denominated, never Gold *(superseded same day: PayPal dropped, BRL settlement — see billing entry above)*
Monthly subscription in real currency via Stripe, with Pix/PayPal for card-poor markets (mechanism open — see billing spec). Accepting Highrise Gold rejected outright: ToS explicitly prohibits third-party services that let users sell/transfer/use Gold, exposing both us and customers to bans. → `specs/03-billing.md`

## 2026-07-19 — Bot ownership: BYOT (bring your own token)
Customers use their own Highrise bot account + API token; we host and configure. Chosen over managed bot-account pools: cleanest ToS position (we sell software + hosting, not Highrise access), and no shared-account ban blast radius. Cost: market limited to users who have earned bot API eligibility (Trust & Safety score gate). Managed tier may be revisited later as a separate, risk-priced offering. → `specs/01-product.md`
