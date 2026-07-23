# 05 — Security

## Threat model in one paragraph

The crown jewels are **customer bot tokens**: a leaked token = attacker controls the customer's bot identity (chat as it, spend its wallet, grief its room) and the blast radius is our entire reputation in a small community. Secondary assets: customer PII/billing (mostly outsourced to Stripe), room event data, and our own platform credibility (a compromised fleet spamming rooms would end the business).

## Token handling (BYOT)

**Write-only lifecycle:**

1. Customer pastes token in dashboard → TLS → control plane encrypts immediately — envelope encryption (per-token data key, AES-256-GCM; master key in KMS or, v1-simple, libsodium sealed box with the private key living **only** on data-plane hosts).
2. Postgres stores ciphertext + key ref + last4 for display ("token ending …a9f2"). Plaintext exists only in memory during encrypt.
3. **No API ever returns a token.** Dashboard shows last4 + "replace" action only.
4. Data plane decrypts at instance spawn; plaintext lives only in supervisor process memory.
5. Replace = new ciphertext + reconnect. Delete instance = ciphertext destroyed. Customer offboarding guidance: regenerate the token in Highrise settings (revokes anything we ever held).

**Logging discipline:** structured logging with a scrub layer (token pattern + known ciphertext/plaintext fields) at the logger, not at call sites; Sentry `before_send` scrubber both planes; SDK/network debug logging disabled in production (connect frames can contain the token).

## Control plane

- Auth.js sessions per `06-auth.md`: Google OAuth + magic link, zero passwords stored, single-use rate-limited links.
- All state-changing routes: CSRF-protected, tenant-scoped queries (every query filtered by `user_id` — no "find by instance id" without owner check).
- Admin surface behind separate role + 2FA; admin actions audit-logged.
- Stripe webhooks: signature-verified, idempotency keys, raw payload archive.
- Rate limit auth + token-entry endpoints (token entry is a credential-stuffing target).

## Data plane

- Supervisor hosts: private network only (no inbound from internet), outbound allowlist ≈ Highrise endpoints + Postgres + Sentry. No Redis in the stack as of 2026-07-22 (`docs/cost-plan.md`, R6) — config pub/sub runs over Postgres LISTEN/NOTIFY on the same database.
- No tenant code execution (first-party catalog only — decision logged 2026-07-19). Config is data, validated against JSON Schema; string config fields that get echoed in-room (welcome messages, filter responses) are length-capped and content-sanitized — a customer must not be able to make *our* bot spam or slur (that's their room, but our fleet pattern and their ban risk).
- Postgres credentials per-plane (control plane creds ≠ data plane creds); data plane gets least privilege (e.g. no access to billing tables).

## Abuse & platform safety

- Moderation-bot config caps: no "ban everyone who speaks" configs — floors/ceilings in schema (e.g. max mute duration, kick requires ≥N strikes unless explicit allowlist).
- Per-instance action throttle (see `04-bot-runtime.md`) doubles as anti-spam.
- Kill switch per instance + global, reachable from admin in <1 min.
- Terms of use for *our* customers: you own your bot account, you're responsible for your room's compliance with Highrise ToS; we suspend instances used for harassment/spam.

## Compliance posture (v1, lightweight)

- PII minimized: email + billing via Stripe; room event logs keyed by Highrise user IDs, retained 90 days then aggregated *(implemented 2026-07-22: daily `/api/cron/retention` rolls `instance_events` >90d up into per-day counts and deletes the raw rows — `docs/cost-plan.md` R3)*.
- Privacy policy + ToS pages required before charging money; note the audience skews young — no dark patterns, honest cancel flow (also just good churn hygiene) *(implemented 2026-07-23: `/privacy`, `/terms`, all 5 locales — first draft grounded in this spec, not yet lawyer-reviewed; legal entity name/CNPJ still pending incorporation — `docs/decisions.md`)*.
- Independent operator stance: clear "not affiliated with Highrise/Pocket Worlds" branding.

## Open questions

- ~~KMS (AWS/GCP) vs. libsodium-on-host for v1~~ → resolved 2026-07-19: libsodium sealed box; control plane holds public key only (`apps/web/src/lib/token-seal.ts` seals, `workers/runtime/tokenbox.py` unseals, key ref column enables rotation). KMS revisited only if hosting/scale demands it.
- Do we need per-shard IP reputation isolation (one abusive-looking tenant getting an IP flagged affects shard-mates)?
- Data-plane compromise drill: what's the actual runbook — mass-notify customers to regenerate tokens? Draft it before launch, not after.
- ~~Age handling~~ → resolved 2026-07-19: 18+ self-attestation at signup, minor-discovered runbook = refund + suspend (`06-auth.md`).
