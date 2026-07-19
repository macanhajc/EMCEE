# Catalog bot — Emote ("Emcee", working name) · **v1 flagship**

**Pitch:** every emote in the game, for everyone in your room. Say the emote's name — your avatar does it, even if you don't own it. The room owner can make the whole room dance at once.

Reworked 2026-07-19: v1 catalog focuses on this bot alone (Moderation & Greeter deferred — see their specs).

## Core loop (the whole product in two lines)

1. A user says an emote name in chat → their avatar performs it.
2. The owner (or trusted user) triggers **emote all** → everyone in the room performs it, staggered like a wave.

## v1 capabilities

### Emote on say
- **Trigger:** bare emote name or alias in chat (`macarena`, `hello`, `superpose`) — no prefix, matching how popular community bots train users. Exact + alias match against our curated catalog; unknown text is ignored silently (no "command not found" noise in a busy room).
- **Aliases:** curated per emote (`macarena` → `dance-macarena`); PT-BR aliases included from day one (market fit).
- **Per-user cooldown** (default 3s) so one user can't machine-gun emotes.
- **Emote catalog is data, not code:** curated list of emote IDs + display names + aliases + `targetable` flag, shipped from the control plane, updatable without deploys (new game emotes → catalog update, all tenants get them).

### Emote list
- `emotes` (or `!emotes`) → whispered, paginated list of names. Whisper-only — never floods public chat.

### Emote all (owner power move)
- Trigger: `all <emote>` by permitted users only. Permission levels configurable: owner only (default) / owner + designers / custom allowlist.
- Fan-out: staggered ~2–4 users/sec through the action throttle (a 30-person room becomes an ~10s wave — reads as a feature, not a limitation).
- Cooldown (default 60s) + abort word (`stopall`) mid-wave.
- New joiners during a wave are not included (snapshot at trigger).

### Config (sketch → `packages/schemas/emote/v1.json`)

```yaml
emote_on_say:
  enabled: bool (default true)
  cooldown_s: int 0..60 (default 3)
  disabled_emotes: string[] (owner can blocklist specific emotes, max 100)
emote_all:
  enabled: bool (default true)
  permission: enum (owner | owner_designers | allowlist) (default owner)
  allowlist: string[] (usernames, max 50)
  cooldown_s: int 10..600 (default 60)
list_command:
  enabled: bool (default true)
```

All fields hot-apply.

## SDK mapping

- Events: `on_chat` (trigger parsing), `on_user_join`/`on_user_leave` (room roster for emote-all).
- Actions: `send_emote(emote_id, target_user_id)` — confirmed to support directing emotes at players (EmoteRequest endpoint); `send_whisper` (list, error nudges); `get_room_users` (fan-out snapshot).
- All sends through the `CatalogBot` throttle. Priority classes: single emote-on-say = normal; emote-all fan-out = background (yields to everything else).

## Rate-limit profile (drives `04-bot-runtime.md` assumptions)

- Steady state: cheap — one action per user trigger, cooldown-capped.
- Bursts: emote-all only. Stagger built into the feature; worst case = room capacity × 1 action spread over tens of seconds.
- This bot is the fleet's action-volume king even without loops — its telemetry is how we learn real platform limits.

## Explicitly deferred (post-v1 candidates, in rough order of demand)

- **Loop/stop** (`loop macarena` until `stop`/leave) — the club AFK-dance feature; biggest sustained throttle load, needs concurrent-looper caps. Likely first fast-follow.
- Copy mode (bot mirrors user emotes via `on_emote`).
- Numbered emote menu (`say 1-100`), emote roulette, scheduled room-wide emote moments.

## Verification list (build time, before sales copy)

- Which emote IDs are **targetable at users** and whether any require the *target* to own them (curate the catalog empirically; the "use emotes you don't own" pitch depends on it).
- Emote ID source of truth: `self.webapi` vs. maintained static list; how fast new game emotes appear.
- Behavior when target is mid-emote / moving / in voice — dropped or queued?
- Actual burst tolerance for fan-out (tune stagger rate on the canary room).

## Open questions

- Bare-name triggers can collide with normal chat (someone says "hello" conversationally → avatar waves). Acceptable/charming, or do we need a per-room toggle for prefix mode (`!hello`)? Leaning: charming, ship bare + offer prefix toggle in config later if complaints.
- Should `emote all` have a room-size ceiling in v1 (e.g. skip rooms >60 users) until burst tolerance is measured?
- Free tier of the catalog (say, 20 emotes) as a marketing hook vs. all-in from day one?
