# Catalog bot — Moderation & Safety ("Warden", working name)

> **STATUS: DEFERRED (2026-07-19).** v1 catalog reworked to focus on the Emote bot (`emote.md`). This spec is kept as the post-v1 candidate it was drafted as — do not build against it without a new decision.

**Pitch:** 24/7 mod coverage for your room. Filters, anti-spam, strike escalation, and a full action log — configured in forms, not code.

## Capabilities (v1)

### Word & content filter
- Blocklist terms (custom list + optional curated base lists: slurs/harassment, links, solicitation). Matching: normalized (case, leetspeak-lite, repeated-char squash).
- On match → configurable response ladder: delete-equivalent isn't possible (bots can't delete chat) → so: **warn (whisper) → strike → escalate**.
- Optional public warning template vs. whisper-only (default whisper — don't shame guests).

### Anti-spam
- Rate rule: >N messages in M seconds → strike. Duplicate-message rule: same message ×N → strike.
- Caps-lock and emoji-flood heuristics (toggleable, off by default — false-positive prone).

### Strike escalation ladder
Configurable thresholds mapping strikes → action:
`1: warn · 2: mute 5m · 3: kick · 5: ban` (defaults; each rung editable, ladder length 1–6).
- Strikes decay (default 24h). Per-user strike state persisted per instance.
- Safety floors from `05-security.md`: ban always requires ≥2 strikes unless user is on the room's explicit banlist import; max mute 24h.

### Roles & exemptions
- Exempt lists: room owner always; designers optional; custom VIP/mod list by username.
- Mod commands in-chat for exempt users: `!warn @user`, `!mute @user 10m`, `!kick @user`, `!strikes @user`, `!clear @user` (prefix configurable).

### Raid guard (simple v1)
- Trigger: >N joins in M seconds → temporary "high alert": tightened spam thresholds + optional join announcements muted. Auto-relaxes after cooldown. (True join-gating isn't in the bot API; this is mitigation, not prevention.)

### Action log
- Every action (filter hit, strike, mute, kick, ban, mod command) → `InstanceEvent` → dashboard activity feed, filterable by user/action, 90-day retention.

## Config schema sketch (JSON Schema in `packages/schemas/moderation/v1.json`)

```yaml
filter:
  enabled: bool (default true)
  base_lists: enum[] (harassment, links, solicitation)
  custom_terms: string[] (max 500 terms, each ≤ 64 chars)
  response_mode: enum (whisper | public)     # public template sanitized/length-capped
anti_spam:
  message_rate: {count: int 3..20, window_s: int 5..60}
  duplicate: {count: int 2..10}
  caps_heuristic: bool (default false)
ladder:
  rungs: [{strikes: int, action: enum(warn|mute|kick|ban), duration_m?: int ≤1440}]
  strike_decay_h: int 1..168 (default 24)
exemptions:
  designers_exempt: bool
  users: string[] (usernames, max 100)
raid_guard:
  enabled: bool (default false)
  join_rate: {count: int, window_s: int}
commands:
  prefix: string (1 char, default "!")
  enabled: bool
```

All fields hot-apply (no reconnect needed).

## SDK mapping

- Events: `on_chat`, `on_user_join` (raid guard), `on_moderate` (observe external mod actions, avoid double-punishing).
- Actions: `moderate_room` (mute/kick/ban), whispers, chat. All via the `CatalogBot` throttle; moderation actions are **high priority** in the throttle queue.

## Open questions

- Verify exact moderation primitives in current SDK: mute duration support? unban? Can a designer-rights bot ban, or only owner-level? (Determines honest capability copy.)
- Curated base lists: source/maintain ourselves? Multi-language (PT-BR essential given community)?
- Should strikes be sharable across a customer's rooms later (multi-room product question)?
- False-positive UX: an "undo + auto-exempt" one-click in the activity feed?
