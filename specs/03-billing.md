# 03 — Billing

Reviewed & decided 2026-07-19: **single rail — Stripe Brazil.** Cards + Pix (with Pix Automático for recurring). PayPal dropped for v1.

## Principles

1. **Real currency only.** Never Gold, never in-game items — ToS line, not a preference (see `docs/research.md`).
2. **Billing state drives entitlement, never the reverse.** The data plane reads `desired_state`; only webhook-driven billing logic writes it.
3. **Grace before cut-off.** Payment failure feels like a nudge, not an outage.
4. **One rail.** Every payment method must live inside Stripe Billing's subscription machinery — no parallel billing systems.

## Why Stripe Brazil (decision context)

Entity will be Brazil-based, which is the only path to Pix: Stripe supports **Pix Automático recurring mandates for subscriptions** (shipped Apr 2026) — customer authorizes once in their bank app, auto-charged each cycle. PayPal-via-Stripe turned out to be a dead end regardless (EU/UK-account-only, and unsupported in Checkout subscription mode), and a direct PayPal integration would mean a second webhook system and state machine — rejected for v1. This trades away PayPal reach outside Brazil; card-paying international customers are still covered.

## Rails & currency

- **Cards** (domestic + international) and **Pix** through Stripe Checkout + Billing; self-serve changes via Customer Portal.
- Settlement in **BRL**. Pricing anchored in BRL with USD reference shown for international buyers (draft: **R$39/mo ≈ $7** per instance — final numbers in `01-product.md`). Verify at build: Stripe BR presentment-currency options for international cards (fallback: charge BRL, issuer converts — acceptable).
- Pix silver lining: no card-style chargebacks (disputes go through the rare MED fraud mechanism) → lower dispute exposure on the Brazilian segment.

## Plans (launch)

| SKU | Price (draft) | Notes |
|---|---|---|
| Monthly, per instance | R$39/mo (~$7) | Core offer |
| Annual, per instance | R$390/yr (10× monthly, ~2 months free) | Renewal reminder email 7 days before charge |

- **No bundle SKU at launch** (deselected in review — multi-bot discount revisited post-launch with real basket data).
- **No prepaid blocks** — Pix Automático makes recurring work without them (rejected 2026-07-19).
- Annual refund exposure mitigations: 7-day money-back window applies to annual too; after that, cancel stops renewal but no pro-rata refund (exception: if *we* discontinue the product, unused months are refunded — say so in ToS, it's cheap trust).

## Trial

**7 days, payment method required** (card or Pix Automático mandate authorized at checkout). Rationale: hard brake on trial farming (pairs with room-ID + token-fingerprint dedupe from `06-auth.md`), honest conversion data.

- Cancel during trial → no charge, instance stops at trial end.
- **Verify at build:** Pix Automático mandate setup with `trial_period_days` (mandate authorized now, first charge at day 7). If unsupported, fallback: Pix customers skip trial and rely on the 7-day money-back window — functionally identical to the customer.

## Subscription → instance state machine

```
trialing(7d) ─→ active ─→ past_due (day 0–3, bot keeps running, emails) ─→ suspended (bot stopped, config kept)
   │               │                                                          │
   └─ cancel ──────┴─────→ canceled (end of period) ─────────────────────────┴→ reaped after 30d (config export offered)
```

- Webhooks we act on: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`, and **mandate events** (Pix mandate revoked ≈ card removed → prompt for new payment method, then past_due flow). Idempotent handlers; raw events archived.
- `past_due` grace: 3 days, Stripe Smart Retries on (verify retry behavior for Pix charges specifically).
- Bots never mention billing in-room. All billing comms via email + dashboard banner.
- Resume from `suspended` = pay → restart with retained config. Win-back email day 7 and day 25.

## Refunds & consumer law

- **7-day money-back on first purchase, no questions** — this also satisfies Brazil's CDC Art. 49 withdrawal right for online purchases, so policy floor = legal floor. One policy, no regional branching.
- Chargeback playbook (cards): instance suspended immediately; evidence pack from `InstanceEvent` log (bot was live and doing its job).

## Tax & entity (launch blockers, need a contador)

- CNPJ required for Stripe BR. Open with a Brazilian accountant before any integration work: entity type + Simples Nacional classification for SaaS, **NFS-e invoice issuance** (automatable via API — e.g. Focus NFe/eNotas), and treatment of exported services (international card sales) which carry different PIS/COFINS treatment.
- Stripe Tax: confirm what it does/doesn't handle for BR-domestic vs. export sales; assume the contador owns the answer.

## Open questions

- Verify: Pix Automático + trial periods; Smart Retries on Pix; Stripe BR presentment currencies for international cards.
- NFS-e automation provider choice.
- Annual plan dunning: if the yearly Pix/card charge fails, is 3-day grace too short? (Leaning: 7 days for annual.)
- Do we email a pre-renewal notice for monthly too (good faith, tiny churn cost) or annual-only?
