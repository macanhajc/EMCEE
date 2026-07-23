# 03 — Billing

Reviewed & decided 2026-07-19: **single rail — Stripe Brazil.** Cards + Pix (with Pix Automático for recurring). PayPal dropped for v1.

Wired 2026-07-20 against a real Stripe sandbox (`apps/web/src/app/checkout/`, `apps/web/src/app/api/webhooks/stripe/`). See `docs/decisions.md` for what's verified vs. still open (webhook endpoint registration, Pix eligibility, tax).

## Principles

1. **Real currency only.** Never Gold, never in-game items — ToS line, not a preference (see `docs/research.md`).
2. **Billing state drives entitlement, never the reverse.** The data plane reads `desired_state`; billing (webhooks) and the customer's own dashboard start/stop switch are the only writers (2026-07-21). Billing decides whether the bot is *allowed* to run; it never decides that the bot *should* run right now — a fresh or reactivated subscription only entitles, it doesn't auto-start. See "Subscription → instance state machine" below.
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

- **No bundle SKU at launch** (deselected in review — a multi-*instance* discount, i.e. running the same bot in several rooms, is the post-launch experiment to revisit with real basket data; written when the product was still framed as multiple separate bot products, see `docs/decisions.md` 2026-07-20).
- **No prepaid blocks** — Pix Automático makes recurring work without them (rejected 2026-07-19).
- Annual refund exposure mitigations: 7-day money-back window applies to annual too; after that, cancel stops renewal but no pro-rata refund (exception: if *we* discontinue the product, unused months are refunded — say so in ToS, it's cheap trust).

## Trial

~~7 days, payment method required~~ → **removed 2026-07-23**: no free trial. Every subscription is charged immediately at checkout (see `docs/decisions.md`). The 7-day money-back window (below) is the funnel's honesty mechanism now, not a trial.

## Subscription → instance state machine

```
active ─→ past_due (day 0–3, bot keeps running, emails) ─→ suspended (bot stopped, config kept)
   │                                                            │
   └─ cancel ─────────────────────────→ canceled (end of period) ─────────→ reaped after 30d (config export offered)
```

`trialing` is no longer a state this app puts a subscription into — `mapSubscriptionStatus` (`lib/billing-state.ts`) still recognizes it defensively (maps to entitlement "running", same as `active`) in case Stripe ever reports it through a mechanism outside this app's control (e.g. a trial granted by hand in the Stripe Dashboard), but nothing in the checkout flow requests one anymore.

- **Entitlement vs. running (2026-07-21):** every state above is *entitlement*, not "the bot is live." A new instance is created stopped by default; checkout completing doesn't start it either — the customer presses **Start** on the dashboard, both right after checkout and any time they've stopped it themselves. "Bot keeps running" during `past_due` and "bot stopped" at `suspended` describe what billing *allows*; if the customer never started it, it stays stopped through all of that. Resuming from `suspended` still requires the customer to press Start again — payment alone doesn't restart it.
- Webhooks we act on: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`, and **mandate events** (Pix mandate revoked ≈ card removed → prompt for new payment method, then past_due flow). Idempotent handlers; raw events archived — payloads stripped after 90 days by the daily retention sweep, but the rows themselves are kept forever since the event-id PK is the idempotency check (2026-07-22, `docs/cost-plan.md` R3).
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

- Verify: Smart Retries on Pix; Stripe BR presentment currencies for international cards. (The sandbox account used to build this has Pix disabled by default — `payment_method_options.pix: null` on the real test subscription created 2026-07-20 — expected for a non-BR test account; must reverify once the real BR entity/account exists.)
- NFS-e automation provider choice.
- Annual plan dunning: if the yearly Pix/card charge fails, is 3-day grace too short? (Leaning: 7 days for annual.)
- Do we email a pre-renewal notice for monthly too (good faith, tiny churn cost) or annual-only?
- No live webhook endpoint registered yet (needs a public URL — deploy or tunnel); today's verification replayed real Stripe events with a locally-chosen signing secret rather than exercising Stripe's actual delivery/retry path. Register a real endpoint + secret once there's a reachable environment.
