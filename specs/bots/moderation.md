# Bot feature — Warden (moderation & safety module)

> **STATUS: SHIPPED (trimmed v1), 2026-07-21.** A feature module of the one bot (**Emcee**), not a separate catalog product — see `docs/decisions.md`. Filter, anti-spam, strike ladder, action log, and in-chat mod commands are built. Raid guard, curated base blocklists, and caps/emoji-flood heuristics from the original draft below are **deferred, not built** — trimmed the same way Concierge's v1 dropped VIP tiers and presence/flair (`docs/decisions.md`, 2026-07-20).

**Pitch:** 24/7 mod coverage for your room. A word filter, anti-spam, a strike escalation ladder, and an action log — configured in forms, not code.

## SDK primitives — confirmed 2026-07-21 against the pinned SDK source

Resolved by reading `highrise-bot-sdk` 25.1.0 directly (`workers/runtime/.venv/lib/python3.11/site-packages/highrise/`), not just the docs — see `docs/decisions.md` for the full spike writeup:

- `moderate_room(user_id, action: "kick"|"ban"|"unban"|"mute", action_length: int | None)` looks fire-and-forget but actually **awaits the server's ack and raises `ResponseError` on failure** (e.g. the bot lacks the privilege to ban in this room) — this resolves the old "can a designer-rights bot ban?" question empirically rather than statically: the code doesn't need to know in advance, it just needs to catch the failure. `WardenEngine._apply_action` (`workers/runtime/catalog/warden.py`) does exactly that.
- **Ban supports a duration, same as mute** — not permanent-only as originally assumed here. `ban_duration_s: 0` means permanent.
- There's **no "unmute" action** and **no "list currently muted/banned" read API** — Warden's own persisted strike state (`warden_strikes` table, `db.bump_strikes`) is the only source of truth for "who's under what."
- `on_moderate(moderator_id, target_user_id, moderation_type, duration)` fires for **every** moderation event in the room, ours or a human moderator's own in-client action. Comparing `moderator_id` against `self.bot.highrise.my_id` is what lets Warden log external mod actions for the activity feed without also striking/escalating on top of them.
- Duration units are still unconfirmed (no unit on the type) — treated as seconds by convention, matching every other `_s`-suffixed field in this codebase.

## Capabilities — built (trimmed v1)

### Word filter
- Custom blocklist terms only (`filter.custom_terms`) — no curated base lists (harassment/links/solicitation) in this pass, see Deferred below.
- Matching: case + accent-fold normalization plus a repeated-character squash (`workers/runtime/catalog/warden.py`'s `_filter_normalize`), whole-word match. No leetspeak substitution table — the original draft's "leetspeak-lite" language was aspirational; this is the simpler version that's actually built.
- On match: always a whisper-only warning (never public — don't shame guests), then a strike.

### Anti-spam
- Message-rate rule (`anti_spam.message_rate_count`/`message_rate_window_s`) and duplicate-message rule (`anti_spam.duplicate_count`). Each independently adds a strike on trip.
- No caps-lock/emoji-flood heuristics — deferred, see below.

### Strike escalation ladder
Flat, gate-based config (not the dynamic per-rung array the original draft sketched — see Schema note below): `ladder.mute_at_strikes` / `kick_at_strikes` / `ban_at_strikes` (ban itself gated behind `ban_enabled`, off by default). A strike checks the highest rung reached, in descending severity, so only one action fires per strike even if multiple thresholds are crossed at once.
- Strikes decay (`ladder.strike_decay_h`, default 24h) — computed at write time in `db.bump_strikes` (a stale last-strike timestamp resets the count instead of incrementing it), no cron job needed.
- Safety floors from `05-security.md`, enforced in the JSON Schema itself (`ban_at_strikes minimum: 2`, `mute_duration_s maximum: 86400`) — not just app-level checks. The original draft's "unless user is on the room's explicit banlist import" exception doesn't exist in trimmed v1 (no banlist import feature).

### Roles & exemptions
- Room owner always exempt; Designers exempt by default (`exemptions.designers_exempt`, toggleable); explicit username list (`exemptions.users`).
- In-chat mod commands for exempt users: `!warn @user`, `!mute @user`, `!kick @user` (prefix configurable, `commands.prefix`). No `!strikes @user` / `!clear @user` (view/reset) and no explicit duration argument (`!mute @user 10m`) — mute duration always comes from `ladder.mute_duration_s`. **Ban is deliberately not a chat command** — an accidental permanent action typed in chat is a worse footgun than the ladder's explicit strike-threshold path; may reconsider later.

### Action log
- Every filter hit, strike, mute/kick/ban attempt (applied or denied), and external moderation event → `instance_events` (`kind: "moderation"`, `data.type` distinguishes the sub-kind) → the dashboard's Activity log (`apps/web/src/components/dashboard/activity-log.tsx`), most recent 20. No filter-by-user/action UI and no explicit 90-day-retention enforcement beyond whatever applies to `instance_events` generally — the original draft's fuller ambition here, cut the same way raid guard was.

## Capabilities — deferred, not built

- **Raid guard** (join-rate "high alert" mitigation) — genuinely weaker without real join-gating even in the original draft's own words; candidate fast-follow.
- **Curated base blocklists** (harassment/links/solicitation, PT-BR) — needs real content sourcing/maintenance, a product decision, not just code. Custom-terms-only sidesteps it for now.
- **Caps-lock/emoji-flood heuristics** — the original draft already flagged these as false-positive prone and off-by-default; not worth building until there's a concrete need.

## Config schema — as built (`packages/schemas/emcee/v1.json`, sections tagged `x-module: "warden"`)

The original draft sketched `ladder.rungs` as an array of `{strikes, action, duration_m}` objects. That doesn't fit the dashboard's schema-form generator (`apps/web/src/lib/schema-form.ts`), which only understands a flat two-level shape (object of primitive-leaf sections) — the same constraint Concierge hit and resolved by flattening VIP to one tier. Warden's ladder resolves it the same way: fixed named fields (`mute_at_strikes`, `kick_at_strikes`, `ban_enabled`/`ban_at_strikes`/`ban_duration_s`) instead of a dynamic array, using the schema's existing `x-enabled-by` gate (already built for Concierge's quiet-hours fields) for the ban rung's off-by-default gating. Zero changes needed to the schema-form generator or the dashboard's config renderer.

```yaml
filter:
  enabled: bool (default true)
  custom_terms: string[] (maxItems 300, each ≤ 64 chars)
anti_spam:
  enabled: bool (default true)
  message_rate_count: int 3..20 (default 5)
  message_rate_window_s: int 5..60 (default 10)
  duplicate_count: int 2..10 (default 3)
ladder:
  strike_decay_h: int 1..168 (default 24)
  mute_at_strikes: int ≥1 (default 2)
  mute_duration_s: int 10..86400 (default 300)       # floor: max mute 24h
  kick_at_strikes: int ≥1 (default 3)
  ban_enabled: bool (default false)
  ban_at_strikes: int ≥2 (x-enabled-by ban_enabled, default 5)   # floor: ban always ≥2 strikes
  ban_duration_s: int 0..2592000 (x-enabled-by ban_enabled, default 0)  # 0 = permanent
exemptions:
  designers_exempt: bool (default true)
  users: string[] (usernames, maxItems 100)
commands:
  enabled: bool (default true)
  prefix: string (1 char, default "!")
```

All fields hot-apply (no reconnect needed) — same as every other Emcee module.

## SDK mapping

- Events: `on_chat` (filter, anti-spam, mod commands), `on_moderate` (observe external mod actions, avoid double-punishing). `on_user_join` raid-guard bookkeeping is not wired — not needed without raid guard built.
- Actions: `moderate_room` (mute/kick/ban), whispers. All via the `CatalogBot` throttle at `Priority.NORMAL` — no separate high-priority lane for moderation actions in trimmed v1 (the throttle doesn't currently have a priority above `NORMAL`; revisit if saturation telemetry shows moderation actions getting queued behind normal traffic in practice).

## Open questions

- Curated base lists: source/maintain ourselves? Multi-language (PT-BR essential given community)? Still open — trimmed v1 ships without them.
- Should strikes be sharable across a customer's rooms later (multi-room product question)? Still open.
- False-positive UX: an "undo + auto-exempt" one-click in the activity feed? Still open — not built.
- Duration units on `moderate_room`'s `action_length` — treated as seconds by convention, not empirically confirmed against a live room yet.
