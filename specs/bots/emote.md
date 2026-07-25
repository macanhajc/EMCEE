Wired 2026-07-20 (`workers/runtime/catalog/emote.py`'s `EmoteEngine`, `catalog/emotes.py` + `emotes.json`). Composed into the single `EmceeBot` (`catalog/emcee.py`) alongside the Concierge module the same day (docs/decisions.md, "Emcee merge") — `EmoteBot` as its own standalone `CatalogBot` no longer exists; the schema also moved, `packages/schemas/emote/v1.json` merged into `packages/schemas/emcee/v1.json`. See `docs/decisions.md` for what's verified vs. still open — no real Highrise token/room exists in this environment, so the catalog is a small, doc-verified starter set, and per-emote targetability is still unconfirmed exactly as the "Verification list" below already anticipated.

# Bot feature — Emotes · **v1 launch module**

**Pitch:** every emote in the game, for everyone in your room. Say the emote's name — your avatar does it, even if you don't own it. The room owner can make the whole room dance at once.

There is one bot (working name **Emcee**), sold as one subscription-per-instance; Emotes, Avatar, Concierge, Warden, and Music are feature modules of that *same* bot/instance/token, not separate catalog products (reframed 2026-07-20, see `docs/decisions.md`) — as of the 2026-07-20 "Emcee merge," this is now literally true in the runtime code too, not just the product framing: Emotes and Concierge run as two engines composed inside one `EmceeBot`, one schema, one `catalog_bots` row. Reworked 2026-07-19: v1 launched with this module alone; Concierge shipped as the first fast-follow the same day it was scoped (Warden deferred, Avatar/Music roadmap — see their specs under `bots/`).

## Core loop (the whole product in two lines)

1. A user says an emote name in chat → their avatar performs it.
2. The owner (or trusted user) triggers **emote all** → everyone in the room performs it, staggered like a wave.

## v1 capabilities

### Emote on say
- **Trigger:** bare emote name, alias, or **catalog position number** in chat (`macarena`, `hello`, `superpose`, or `12`) — no prefix, matching how popular community bots train users. Exact + alias + numeric-position match against our curated catalog; unknown text is ignored silently (no "command not found" noise in a busy room).
- **Aliases:** curated per emote (`macarena` → `dance-macarena`); PT-BR aliases included from day one (market fit).
- **Numbered trigger** (added 2026-07-23): a bare number resolves to that 1-based position in the `emotes` command's own list (`EmoteCatalog.by_position`/`.resolve`) — the list is numbered specifically so this is usable without memorizing ids. Same resolution path as names, so it's subject to the same disabled-emotes blocklist, cooldown, and (see below) default-loop behavior.
- **Loops by default** (moved out of deferred, 2026-07-23 — see "Loop / stop" below): a match starts the same repeating loop `loop <emote>` does, not a single emote — this module's `loop.enabled` toggle (on by default) is what a match actually does, not just an opt-in add-on anymore. Turning `loop.enabled` off reverts to the original single-emote-per-say behavior, with a `Doing "Macarena"!` whisper confirming what triggered (in case an alias or the numbered list wasn't obvious) and `emote_on_say.cooldown_s` (default 3s) governing repeat triggers.
- **Emote catalog is data, not code:** curated list of emote IDs + display names + aliases + `targetable` flag, shipped from the control plane, updatable without deploys (new game emotes → catalog update, all tenants get them).

### Emote list
- `emotes` (or `!emotes`) → whispered, paginated, **numbered** list of names (`1. Macarena, 2. Hello, ...`) — numbered so the position doubles as a trigger (see "Numbered trigger" above). Whisper-only — never floods public chat.

### Emote all (owner power move)
- Trigger: `all <emote>` by permitted users only. Permission levels configurable: owner only (default) / owner + designers / custom allowlist.
- Fan-out: staggered ~2–4 users/sec through the action throttle (a 30-person room becomes an ~10s wave — reads as a feature, not a limitation).
- Cooldown (default 60s) + abort word (`stopall`) mid-wave.
- New joiners during a wave are not included (snapshot at trigger).

### Loop / stop (moved out of deferred 2026-07-20; **on by default**, no concurrent-looper cap, since 2026-07-23)
- Trigger: a bare emote word/number **or** `loop <emote>` explicitly — both repeat that emote for the *speaker* on an interval until they say `stop` or leave the room, and both land on the exact same mechanism (`EmoteEngine._start_or_switch_loop`), sharing one cooldown/task-state so alternating between the two can't be used to dodge `loop.cooldown_s`. The `loop <emote>` prefix is kept mainly so existing muscle memory/copy still works; it's no longer the only way in.
- **On by default** (flipped 2026-07-23 — was off by default at launch, deliberately, as the heaviest sustained-load trigger; see "Rate-limit profile" below for what changed). Turning `loop.enabled` off makes emote-on-say one-shot again, exactly like before this date; the explicit `loop <emote>` command also no-ops while it's off (same `cfg.get("enabled", True)` gate either way in).
- **Default interval dropped to 5s** (was 8s, still the schema's stated minimum) — the new steady-state default, not just an option.
- On a successful start, whispers the speaker what will happen: the interval, that `stop` ends it anytime, and the `max_duration_s` auto-stop — loop is the one trigger that doesn't resolve in a single action, and a forced timeout already got an explanatory whisper, so a silent successful start was the missing case.
- Saying another emote (word, number, or `loop <emote>`) while already looping switches to the new emote instead of stacking a second loop.
- ~~`max_concurrent_loopers`~~ **removed 2026-07-23** — with Loop now the default behavior of every emote-on-say trigger, a per-room cap meant whoever was past it got nothing at all rather than falling back to a single emote, which stopped reading as a limit on a power feature and started reading as the bot randomly ignoring people. No cap on how many users in a room can loop at once now; revisit if real usage data (once a canary exists) shows the sustained-load picture below actually needs one.
- `max_duration_s` (default 1800 = 30 min) is a safety auto-stop for a forgotten loop (e.g. a disconnect that never fires a clean leave) — whispers the user why when it fires, so their avatar doesn't just stop for no reason they said. With no concurrent-looper cap, this is now the *only* thing bounding how long a room can have every active chatter simultaneously looping.
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
  enabled: bool (default true — see "Loop / stop" above; off reverts emote-on-say to one-shot)
  interval_s: int 5..60 (default 5) — how often the looped emote re-triggers
  max_duration_s: int 60..7200 (default 1800)
  cooldown_s: int 0..120 (default 10) — per-user cooldown on starting/switching a loop
```

All fields hot-apply.

## SDK mapping

- Events: `on_chat` (trigger parsing), `on_user_leave` (cancel the leaver's own loop; not currently used for emote-all's roster, which snapshots fresh via `get_room_users()` at trigger time instead of maintaining one).
- Actions: `send_emote(emote_id, target_user_id)` — confirmed to support directing emotes at players (EmoteRequest endpoint); `send_whisper` (list, error nudges, loop-cap/timeout notices); `get_room_users` (fan-out snapshot); `get_room_privilege` (found by reading the SDK source — confirmed it's exactly what `owner_designers` permission needs, no separate designer-list API required).
- All sends through the `CatalogBot` throttle. Priority classes: single emote-on-say = normal; emote-all fan-out and loop repeats = background (yield to everything else under pressure — once the throttle actually differentiates priorities, which it doesn't yet, see `specs/04-bot-runtime.md`).
- Every whisper here (one-shot confirmation, loop-start, loop-timeout, the `emotes` list header) renders through `catalog/strings.py`'s `t(bot.bot_language, ...)` (added 2026-07-24, `general.bot_language` — `specs/04-bot-runtime.md`), not a fixed English literal. Emote *names* themselves stay untranslated (catalog data, not sentences).

## Rate-limit profile (drives `04-bot-runtime.md` assumptions)

- **Steady state is now sustained and uncapped, not cheap** (changed 2026-07-23 — this section's previous "one action per trigger, cooldown-capped" framing no longer holds). Loop defaulting to on means the *typical* emote-on-say trigger starts a repeating task, not a single action: at the 5s default interval, each active looper is a low, steady trickle of its own that runs for up to `max_duration_s` (30 min default) rather than resolving in one send. Unlike the initial 2026-07-20 build, there's no `max_concurrent_loopers` cap anymore (removed the same day Loop went default-on — see "Loop / stop" above) — every chatter in a room can be looping at once, so total sustained load per room now scales with room population, not a fixed ceiling. `max_duration_s` is the only remaining bound, and only on how long any one looper runs, not how many run concurrently. Turning `loop.enabled` off returns a room to the old cheap, one-shot-per-trigger profile. Real headroom here is unverified — see "Known gaps"-style caution throughout this spec: nothing here has been checked against actual platform throughput.
- Bursts: emote-all. Stagger built into the feature; worst case = room capacity × 1 action spread over tens of seconds. Unaffected by the loop-default change — emote-all stays one-shot regardless of `loop.enabled`.

## Explicitly deferred (post-v1 candidates, in rough order of demand)

- ~~Numbered emote menu (`say 1-100`)~~ → built 2026-07-23: a bare number is a first-class trigger, resolving against the `emotes` command's own (now-numbered) list. See "Emote on say" above.
- Copy mode (bot mirrors user emotes via `on_emote`).
- Emote roulette, scheduled room-wide emote moments.

## Verification list (build time, before sales copy)

- Which emote IDs are **targetable at users** and whether any require the *target* to own them (curate the catalog empirically; the "use emotes you don't own" pitch depends on it). Still open — `emotes.json`'s `targetable: true` is limited to the 5 doc-verified starter entries (an assumption inherited from the docs' general "can be directed toward a player" language, not per-emote confirmed); all 227 other entries default `targetable: false` since we have no basis at all, verified or assumed, for those.
- ~~Emote ID source of truth: `self.webapi` vs. maintained static list~~ → resolved 2026-07-20: confirmed by reading `highrise/webapi.py` directly — there is no emotes endpoint at all (only user/room/post/item/grab lookups), so it **must** be a maintained static list; no live source ever existed to check against.
- ~~Growing the 5-entry starter catalog~~ → done 2026-07-20, twice: first grown to 65 (5 doc-verified + 60 cross-referenced from community bot repos on GitHub), then replaced with a 232-entry list supplied directly as the current real catalog — every id from the 60-entry GitHub batch was already in it, and ~20 of that batch's guessed display names turned out wrong once checked against the real names (e.g. `dance-tiktok8` is actually "Savage Dance," not "TikTok Dance 8"). Four ids in the new list share a display name with a different id (Relaxed, Sleepy, Shy, Laugh) — both kept, disambiguated with a parenthetical qualifier that's our own invention, not the platform's naming. Still not an officially-published catalog — Highrise publishes none, anywhere — so treat as best-effort, not a platform fact, though this source is higher-confidence than the GitHub cross-reference it replaced. See `docs/decisions.md`.
- Behavior when target is mid-emote / moving / in voice — dropped or queued? Still open.
- Actual burst tolerance for fan-out (tune stagger rate on the canary room). Still open — and now additionally: the fan-out's actual pacing today is bottlenecked by the shared per-instance throttle's conservative default (~1/sec), well under this section's "~2-4 users/sec" target. See `specs/04-bot-runtime.md`.

## Open questions

- Bare-trigger collision with normal chat is a materially bigger risk since 2026-07-23 than when this was first written: back then a collision (someone says "hello" conversationally, or types a room-code-looking number) meant one unwanted wave; now, with loop on by default, the same accidental trigger parks that person's avatar in a repeating emote for up to `max_duration_s` (30 min default) until they notice and say `stop`. Numbers compound this — "5" is a far more common thing to type in ordinary chat than most emote names/aliases are. Still leaning charming/ship-as-is per the original call, but this is the one place that call deserves a second look given the stakes changed, not just re-affirming it by default. A per-room prefix-mode toggle (`!hello`, `!5`) remains the fallback if complaints show up.
- Should `emote all` have a room-size ceiling in v1 (e.g. skip rooms >60 users) until burst tolerance is measured?
- Free tier of the catalog (say, 20 emotes) as a marketing hook vs. all-in from day one?
- `stopall` currently requires the same permission tier as triggering the wave (a judgment call made during implementation — the spec doesn't say). Should *anyone* be able to abort as a safety valve instead, independent of who started it?
