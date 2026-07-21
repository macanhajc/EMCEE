# 01 — Product

## One-liner

**Rent a professional Highrise bot for your room in two minutes.** Pick a bot, paste your token, configure it in a dashboard — we keep it online 24/7.

## Who it's for

Highrise **room owners** who:
- have earned bot API access (BYOT prerequisite — Trust & Safety gated),
- want moderation coverage and engagement they can't do by hand,
- don't want to write Python, babysit a Replit, or trust an in-game stranger renting bots for Gold.

Secondary persona (later): small bot devs who want distribution — deferred until a third-party submission phase.

## What we sell

A **subscription per bot instance** (one bot — BYOT, one token — connected to one room). The product is:

1. **The bot** — a single first-party Highrise bot (working name **Emcee**) that grows by feature module, not by SKU. v1 launched with the **Emotes** module (`bots/emote.md`) — say an emote's name, your avatar performs it; owner can trigger room-wide emote waves. **Concierge** (`bots/greeter.md`) shipped the same day as the first post-v1 module — every guest greeted, regulars recognized by name. **Warden** (`bots/moderation.md`) shipped 2026-07-21 as a trimmed v1 — word filter, anti-spam, strike ladder, action log, in-chat mod commands; raid guard and curated blocklists deferred. **Avatar** (`bots/avatar.md`) and **Music** (unscoped — see Open questions) remain feature roadmap. All are modules of the *same* bot/instance/token, not separate catalog products — reframed 2026-07-20 from an earlier multi-bot-catalog framing, and as of Concierge's build that same day this is enforced in the runtime code too (one `CatalogBot` composing module engines), not just product framing (see `docs/decisions.md`).
2. **The dashboard** — no-code config with live-apply (no restarts), status/uptime, activity log.
3. **The runtime** — managed 24/7 hosting, auto-reconnect, monitoring, upgrades.

## Why we win

| Alternative | Their weakness | Our answer |
|---|---|---|
| In-game Gold rentals | ToS-violating, no dashboard, no SLA, trust a stranger | Legit USD billing, self-serve config, uptime page |
| DIY (Replit + template) | Setup pain, config-in-code, downtime, no support | 2-minute onboarding, forms not code, we carry ops |
| Doing nothing | Unmoderated room, dead-feeling room | Cheap enough to be an obvious yes |

## Pricing (DRAFT — validate before launch)

Anchors: DIY floor is ~$7/mo (Replit); in-game rentals run ~5k Gold/mo (tens of dollars of street value).

- **Monthly:** R$39/mo (~$7 USD reference) per instance.
- **Annual:** R$390/yr per instance (10× monthly — ~2 months free).
- **Trial:** 7 days, payment method required (card or Pix mandate — cuts abuse, keeps funnel honest).
- **No bundle SKU at launch** (decided 2026-07-19); a multi-*instance* discount (same bot, several rooms — see the 2026-07-20 reframing note above) is a post-launch experiment once basket data exists.

Keep pricing per-instance simple in v1; usage tiers only if the runtime cost data demands it. Rails & mechanics: `03-billing.md`.

## Onboarding flow (the 2 minutes)

1. Sign up (Google or magic link, 18+ attestation — `06-auth.md`) → 2. pick bot → 3. checkout (trial) → 4. paste bot token + room ID, guided: where to find both, reminder to grant the bot designer rights in the room → 5. bot connects, dashboard shows **live** → 6. tweak config, changes apply within seconds.

Failure UX matters most at step 5: bad token, missing designer rights, room not found — each needs a specific, human error message.

## v1 scope cut

**In:** the Emotes module (including loop/stop, shipped 2026-07-20), subscription billing, config dashboard, status page per instance, email notifications (bot down, payment failed).
**Out (explicitly), at v1 launch:** Avatar, Concierge, Warden, and Music feature modules (roadmap drafts — `bots/`), third-party bot submissions, managed bot accounts, Gold anything, custom code hooks, multi-room single-subscription, affiliate program, mobile app. **Concierge shipped as the first post-v1 fast-follow, same day; Warden shipped (trimmed) the day after** — both still out of "v1" as originally scoped and shipped, but no longer out of the product; Avatar and Music remain actual roadmap.

## Success signals

- Time-to-live-bot < 5 min for a new customer.
- Trial → paid conversion (target: >25% once funnel is honest).
- Churn reason tracking from day one — especially "bot got banned/platform change" vs. "didn't see value."

## Open questions

- Real conversion of the eligibility-gated market: how many room owners actually hold bot API access? (No public numbers — probe Discord/forum community sizes.)
- Naming/brand ("BotMarket" is a working title; avoid implying official Highrise affiliation — ToS/trademark). "Emcee" as the *bot's* name (not just its Emotes module) reads fine unverified — master-of-ceremonies fits a bot that also greets, hosts, and keeps order — but isn't a confirmed decision, just the working assumption used across `bots/`.
- **Music module:** only a single reference link so far (docsbot.ai Highrise music bot spec, via `HOW_SHOULD_WORK.md`) — no capability check done. The official SDK's action list (`highrise` skill) has no obvious audio/playback primitive; needs a real look at the SDK before this becomes more than a name on the roadmap.
- ~~Trial mechanics~~ → resolved 2026-07-19: 7-day trial, payment method required (`03-billing.md`).
- ~~Bundle vs. à-la-carte~~ → resolved 2026-07-19: à-la-carte only at launch; bundle deferred. *(Note: with the 2026-07-20 single-bot reframing, "bundle" no longer applies the same way — there's one bot, and feature modules simply turn on within an instance's config; à-la-carte/bundle language was written for the old multi-bot-catalog model.)*
