# 06 — Authentication & accounts

Decided 2026-07-19, wired 2026-07-20 (`apps/web/src/auth.ts`, `apps/web/src/proxy.ts` — see `docs/decisions.md`). Core requirement: **users must be authenticated to create a bot instance** — and for anything that touches money, tokens, or config.

## Gating map

| Surface | Auth |
|---|---|
| Storefront, catalog, pricing, docs, status page | Public |
| "Get this bot" → checkout | **Required** (funnel forces sign-in here) |
| Create/manage bot instance, paste token, edit config | **Required** |
| Dashboard, activity log, billing portal | **Required** |
| Admin surface | Admin role + mandatory 2FA (see `05-security.md`) |

Browsing stays frictionless; the first wall is at intent-to-buy.

## Sign-in methods (v1)

1. **Google OAuth** — primary. Verified email from provider.
2. **Email magic link** — fallback; the link round-trip *is* email verification.

**No passwords, ever, for customers.** No hashes stored, no reset flow, no credential-stuffing surface. (Rejected: Discord OAuth for v1 — the bot-dev community lives there, but two providers + magic link already covers everyone; revisit if support load suggests it.)

## Account model

- `User` (id, email, created_at, age_attested_at, role: customer|admin)
- `AuthIdentity` (user_id, provider: google|email, provider_account_id) — one user, N identities.
- **Linking rule:** identities with the same *verified* email resolve to the same `User`. Google emails are provider-verified; magic-link emails are verified by the click. No unverified-email path exists, so no account-takeover-via-claimed-email risk.
- Email change: only via magic-link confirmation to the *new* address + notification to the old one.

## Highrise identity: none at signup

There is no Highrise OAuth. The real Highrise credential is **possession of a working bot token + designer rights in a room**, proven at instance creation — so signup asks for nothing Highrise-related. Consequences:

- Support asks for the customer's dashboard email, not a Highrise username.
- ~~Trial-abuse dedupe keys on room ID + bot token fingerprint~~ → **removed 2026-07-23**: no trial exists to abuse anymore (`docs/decisions.md`); `bot_instances.token_fingerprint` and `trial_registry` are gone (migration `0010_remove_trial`).
- If we ever need verified room ownership (disputes), the bot can whisper a challenge code in-room — deferred, not in v1.

## Age policy: 18+ self-attestation

- Signup includes an explicit "I am 18 or older (or the age of majority where I live)" attestation; timestamp stored (`age_attested_at`).
- ToS states 18+ requirement for purchase. Buyer is the room owner with a payment method — distinct from Highrise's young player base, and we keep minors' consent/billing problems out of scope.
- If we learn a customer is a minor: refund current period, suspend account (documented in support runbook).

## Sessions

- Auth.js with database-backed sessions, 30-day rolling expiry, cookie `SameSite=Lax; Secure; HttpOnly`.
- Sign-out invalidates server-side; "sign out everywhere" available in account settings.
- Session identity is the sole tenant key: every query scoped by `user_id` (reaffirmed from `05-security.md`).

## Abuse controls on the auth surface

- Magic-link endpoint: rate-limited per email + per IP; links single-use, 15-min expiry.
- Turnstile/hCaptcha on magic-link request if abuse appears (feature-flagged, off by default).
- New-account velocity per IP monitored (still a useful signal for fake-account/chargeback-fraud patterns even without a trial to farm).

## Account deletion

- Self-serve: cancels subscriptions, stops instances, destroys token ciphertexts immediately, deletes PII within 30 days (Stripe records retained per their legal requirements).
- Reminder shown: "regenerate your bot token in Highrise settings" — belt-and-suspenders even though ciphertext is destroyed.

## Open questions

- Add Discord OAuth later if support interactions show heavy Discord overlap?
- Do we need org/team accounts (multiple staff managing one room's bots) — or is shared login acceptable at this scale? Leaning: defer, single-owner accounts in v1.
- ~~Magic-link deliverability: dedicated transactional email provider~~ → resolved 2026-07-20: Resend (`src/lib/mailer.ts`). `RESEND_API_KEY` unset means dev logs the link to console; unset in production throws rather than silently dropping mail.
- In-memory rate limiter on magic-link requests (`src/lib/rate-limit.ts`) needs to move to shared state (Postgres — no Redis in this stack as of 2026-07-22, `docs/cost-plan.md` R6) before the control plane runs more than one instance.
- Admin surface has role gating (`src/proxy.ts`) but not yet the mandatory 2FA `05-security.md` calls for — needed before admin handles anything sensitive.
