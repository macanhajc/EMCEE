Wired 2026-07-20 (`workers/runtime/catalog/emote.py`'s `EmoteEngine`, `catalog/emotes.py` + `emotes.json`). Composed into the single `EmceeBot` (`catalog/emcee.py`) alongside the Concierge module the same day (docs/decisions.md, "Emcee merge") — `EmoteBot` as its own standalone `CatalogBot` no longer exists; the schema also moved, `packages/schemas/emote/v1.json` merged into `packages/schemas/emcee/v1.json`. See `docs/decisions.md` for what's verified vs. still open — no real Highrise token/room exists in this environment, so the catalog is a small, doc-verified starter set, and per-emote targetability is still unconfirmed exactly as the "Verification list" below already anticipated.

# Bot feature — Emotes · **v1 launch module**

**Pitch:** every emote in the game, for everyone in your room. Say the emote's name — your avatar does it, even if you don't own it. The room owner can make the whole room dance at once.

There is one bot (working name **Emcee**), sold as one subscription-per-instance; Emotes, Avatar, Concierge, Warden, and Music are feature modules of that *same* bot/instance/token, not separate catalog products (reframed 2026-07-20, see `docs/decisions.md`) — as of the 2026-07-20 "Emcee merge," this is now literally true in the runtime code too, not just the product framing: Emotes and Concierge run as two engines composed inside one `EmceeBot`, one schema, one `catalog_bots` row. Reworked 2026-07-19: v1 launched with this module alone; Concierge shipped as the first fast-follow the same day it was scoped (Warden deferred, Avatar/Music roadmap — see their specs under `bots/`).

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

### Loop / stop (moved out of deferred, built 2026-07-20)
- Trigger: `loop <emote>` repeats that emote for the *speaker* on an interval until they say `stop` or leave the room. **Off by default** — deliberately not enabled-by-default like the other three, since this is explicitly the heaviest sustained-load feature and isn't tuned against real platform limits yet (see rate-limit profile below).
- Saying `loop <other emote>` while already looping switches to the new emote instead of stacking a second loop — doesn't count against the concurrent-looper cap, since it's not adding a new looper.
- `max_concurrent_loopers` (default 3) caps how many users can loop at once in a room; a blocked attempt gets a quiet whisper explaining why, not silence — this is a recognized command being capped, not gibberish being ignored.
- `max_duration_s` (default 1800 = 30 min) is a safety auto-stop for a forgotten loop (e.g. a disconnect that never fires a clean leave) — whispers the user why when it fires, so their avatar doesn't just stop for no reason they said.
- Leaving the room (`on_user_leave`) cancels the leaver's own loop.
- `stop` (distinct word from emote-all's `stopall`, no collision) only ever stops the caller's *own* loop — inherently self-service, no permission check needed.

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
loop:
  enabled: bool (default false — see "Loop / stop" above for why)
  interval_s: int 5..60 (default 8) — how often the looped emote re-triggers
  max_concurrent_loopers: int 1..10 (default 3)
  max_duration_s: int 60..7200 (default 1800)
  cooldown_s: int 0..120 (default 10) — per-user cooldown on starting/switching a loop
```

All fields hot-apply.

## SDK mapping

- Events: `on_chat` (trigger parsing), `on_user_leave` (cancel the leaver's own loop; not currently used for emote-all's roster, which snapshots fresh via `get_room_users()` at trigger time instead of maintaining one).
- Actions: `send_emote(emote_id, target_user_id)` — confirmed to support directing emotes at players (EmoteRequest endpoint); `send_whisper` (list, error nudges, loop-cap/timeout notices); `get_room_users` (fan-out snapshot); `get_room_privilege` (found by reading the SDK source — confirmed it's exactly what `owner_designers` permission needs, no separate designer-list API required).
- All sends through the `CatalogBot` throttle. Priority classes: single emote-on-say = normal; emote-all fan-out and loop repeats = background (yield to everything else under pressure — once the throttle actually differentiates priorities, which it doesn't yet, see `specs/04-bot-runtime.md`).

## Rate-limit profile (drives `04-bot-runtime.md` assumptions)

- Steady state: cheap — one action per user trigger, cooldown-capped.
- Bursts: emote-all. Stagger built into the feature; worst case = room capacity × 1 action spread over tens of seconds.
- Sustained: loop, now built. This is genuinely the fleet's action-volume king — a single looper at the default 8s interval is a low, steady trickle, but it never stops on its own (until `stop`/leave/timeout), unlike every other trigger here which is one-shot. `max_concurrent_loopers` is the only thing bounding total sustained load per room today.

## Explicitly deferred (post-v1 candidates, in rough order of demand)

- Copy mode (bot mirrors user emotes via `on_emote`).
- Numbered emote menu (`say 1-100`), emote roulette, scheduled room-wide emote moments.

## Verification list (build time, before sales copy)

- Which emote IDs are **targetable at users** and whether any require the *target* to own them (curate the catalog empirically; the "use emotes you don't own" pitch depends on it). Still open — `emotes.json`'s `targetable: true` is limited to the 5 doc-verified starter entries (an assumption inherited from the docs' general "can be directed toward a player" language, not per-emote confirmed); all 227 other entries default `targetable: false` since we have no basis at all, verified or assumed, for those.
- ~~Emote ID source of truth: `self.webapi` vs. maintained static list~~ → resolved 2026-07-20: confirmed by reading `highrise/webapi.py` directly — there is no emotes endpoint at all (only user/room/post/item/grab lookups), so it **must** be a maintained static list; no live source ever existed to check against.
- ~~Growing the 5-entry starter catalog~~ → done 2026-07-20, twice: first grown to 65 (5 doc-verified + 60 cross-referenced from community bot repos on GitHub), then replaced with a 232-entry list supplied directly as the current real catalog — every id from the 60-entry GitHub batch was already in it, and ~20 of that batch's guessed display names turned out wrong once checked against the real names (e.g. `dance-tiktok8` is actually "Savage Dance," not "TikTok Dance 8"). Four ids in the new list share a display name with a different id (Relaxed, Sleepy, Shy, Laugh) — both kept, disambiguated with a parenthetical qualifier that's our own invention, not the platform's naming. Still not an officially-published catalog — Highrise publishes none, anywhere — so treat as best-effort, not a platform fact, though this source is higher-confidence than the GitHub cross-reference it replaced. See `docs/decisions.md`.
- Behavior when target is mid-emote / moving / in voice — dropped or queued? Still open.
- Actual burst tolerance for fan-out (tune stagger rate on the canary room). Still open — and now additionally: the fan-out's actual pacing today is bottlenecked by the shared per-instance throttle's conservative default (~1/sec), well under this section's "~2-4 users/sec" target. See `specs/04-bot-runtime.md`.

## Open questions

- Bare-name triggers can collide with normal chat (someone says "hello" conversationally → avatar waves). Acceptable/charming, or do we need a per-room toggle for prefix mode (`!hello`)? Leaning: charming, ship bare + offer prefix toggle in config later if complaints.
- Should `emote all` have a room-size ceiling in v1 (e.g. skip rooms >60 users) until burst tolerance is measured?
- Free tier of the catalog (say, 20 emotes) as a marketing hook vs. all-in from day one?
- `stopall` currently requires the same permission tier as triggering the wave (a judgment call made during implementation — the spec doesn't say). Should *anyone* be able to abort as a safety valve instead, independent of who started it?
