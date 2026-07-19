# Catalog bot — Greeter & VIP ("Concierge", working name)

> **STATUS: DEFERRED (2026-07-19).** v1 catalog reworked to focus on the Emote bot (`emote.md`). This spec is kept as the post-v1 candidate it was drafted as — do not build against it without a new decision.

**Pitch:** every guest greeted, every regular remembered, every VIP treated like one. The room feels alive even when the owner sleeps.

## Capabilities (v1)

### Welcome messages
- On `user_joined`: templated greeting with variables — `{username}`, `{room_name}`, `{visit_count}` ("welcome back, 5th visit!").
- Channels: public chat, whisper, or DM (configurable; default whisper to avoid chat noise in busy rooms).
- **Anti-noise controls (the hard part done right):** per-user cooldown (default: don't re-greet within 6h), busy-mode (>N joins/min → greet silently/whisper-only), quiet hours.
- Rotating templates (up to 10) so the room doesn't feel canned.

### VIP recognition
- VIP list by username (+ optional tiers: VIP / MVP, different templates).
- VIP join: distinct greeting + optional emote celebration + optional announce-to-room toggle.
- Optional auto-add rule: user visited ≥N times → auto-VIP (delight regulars without manual curation).

### Presence & flair
- Bot avatar stands at a configured spot (owner teleports bot once; bot remembers position across reconnects).
- Idle emote loop (configurable emote + interval, throttle-aware, low priority).
- Reaction-back: user reacts to bot → bot reacts in kind (toggle).

### Farewell (small, optional)
- On `user_left` after visits ≥N: whisper-next-visit note is impossible (they're gone) → instead log it; farewell public message off by default (noise).

### Visit stats
- Per-user visit counts + first/last seen per instance → powers `{visit_count}`, auto-VIP, and a dashboard "regulars" table (top visitors, 30d) — this table is sneaky retention gold for the owner.

## Config schema sketch (`packages/schemas/greeter/v1.json`)

```yaml
welcome:
  enabled: bool (default true)
  templates: string[] (1..10, each ≤ 200 chars, sanitized)
  channel: enum (chat | whisper | dm) (default whisper)
  cooldown_h: int 0..168 (default 6)
  busy_mode: {joins_per_min: int 5..60, behavior: enum(whisper|skip)}
  quiet_hours: {enabled: bool, start: time, end: time, tz: string}
vip:
  users: [{username: string, tier: enum(vip|mvp)}] (max 200)
  templates: {vip: string, mvp: string}
  announce_to_room: bool (default false)
  emote_celebration: {enabled: bool, emote_id: string}
  auto_vip: {enabled: bool, min_visits: int 3..100}
presence:
  position: {x: float, y: float, z: float, facing: enum} (set via "use bot's current spot" button)
  idle_emote: {enabled: bool, emote_id: string, interval_s: int 30..600}
  reaction_back: bool (default true)
```

All hot-apply except `presence.position` (applies next reposition tick).

## SDK mapping

- Events: `on_user_join`, `on_user_left`, `on_reaction`, `on_connect` (walk to position).
- Actions: chat / whisper / DM (`send_message`), emote, reaction, `teleport`/`walk_to` (self-position). All **low priority** in the shared throttle — greeter yields to moderation when bundled in one room. Note: two instances (Warden + Concierge) in one room are two separate bot accounts/tokens in v1; bundle pricing ≠ merged runtime.
- Emote picker in dashboard needs the valid emote list — `self.webapi` or a maintained static list (verify at build time).

## Open questions

- DM greeting: does messaging a user require them to have DM'd the bot first (platform consent rules)? Verify — determines whether `dm` channel ships in v1.
- Visit counts: reset on our instance re-provision? (Store per instance in Postgres → survives restarts; document that history starts at subscription start.)
- `{visit_count}` privacy: any user creeped out by "your 47th visit"? Default template without count, offer variable as opt-in.
- Bundle UX: one config page per bot vs. a unified "room staff" page when both bots active?
