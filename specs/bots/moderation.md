# Bot feature — Warden (moderation & safety module)

> **STATUS: SHIPPED (trimmed v1), 2026-07-21; dashboard ban/unban added 2026-07-23.** A feature module of the one bot (**Emcee**), not a separate catalog product — see `docs/decisions.md`. Filter, anti-spam, strike ladder, action log, and in-chat mod commands are built. Raid guard, curated base blocklists, and caps/emoji-flood heuristics from the original draft below are **deferred, not built** — trimmed the same way Concierge's v1 dropped VIP tiers and presence/flair (`docs/decisions.md`, 2026-07-20).

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
- Every filter hit, strike, mute/kick/ban attempt (applied or denied), and external moderation event → `instance_events` (`kind: "moderation"`, `data.type` distinguishes the sub-kind) → the dashboard's Activity log (`apps/web/src/modules/instances/[id]/components/activity-log.tsx`), most recent 20. No filter-by-user/action UI and no explicit 90-day-retention enforcement beyond whatever applies to `instance_events` generally — the original draft's fuller ambition here, cut the same way raid guard was.

## Capabilities — deferred, not built

- **Raid guard** (join-rate "high alert" mitigation) — genuinely weaker without real join-gating even in the original draft's own words; candidate fast-follow.
- **Curated base blocklists** (harassment/links/solicitation, PT-BR) — needs real content sourcing/maintenance, a product decision, not just code. Custom-terms-only sidesteps it for now.
- **Caps-lock/emoji-flood heuristics** — the original draft already flagged these as false-positive prone and off-by-default; not worth building until there's a concrete need.

## Capabilities — built: dashboard-initiated ban/unban

**STATUS: SHIPPED, 2026-07-23.** Prompted by a customer-facing question: can the room owner configure bans, see/ban people from the dashboard's existing Regulars card, and ban someone without personally being in the Highrise room? Answer to all three is yes, with one real constraint below.

**Not a Warden config field.** `moderate_room` is a raw room capability available to any connected instance with the right room privilege — it isn't gated by `filter`/`anti_spam`/`ladder` being enabled. So this ships as an instance-level action (like the existing start/stop switch or token replace), not a new JSON Schema section, even though it reuses `WardenEngine`'s execution path and activity-log shape.

**The "without being in the room" split, precisely:** the *owner* never opens Highrise — a dashboard click is the whole interaction. The *bot* still has to be connected to that room, because `moderate_room` is a WebSocket-only call (`self.ws.send_str(...)` in the pinned SDK — there is no REST equivalent on `WebAPI`, which only exposes public read endpoints: `get_user(s)`, `get_room(s)`, `get_post(s)`, `get_item(s)`, `get_grab(s)`). If the instance is stopped, a ban request can't execute immediately — it queues and applies on next reconnect (see below), the same degrade-not-fail posture `config.updated`/`avatar_position.updated` already use.

**New fact, resolved while designing this:** `moderate_room`'s action literal is `"kick" | "ban" | "unban" | "mute"` (`highrise/__init__.py`) — **unban is a real SDK action**, not something this codebase has to fake via re-ban-with-zero-duration. This closes part of the "unban API" open question this doc and the `highrise` skill both used to carry. What's still unverified: whether unbanning a user we never banned errors cleanly, and whether `action_length` means anything for `unban` (almost certainly not — treated as always `None` for this action).

### Data model — new `moderation_requests` table

A work queue, not a log — `instance_events` is append-only and `warden_strikes` has decay-counter semantics that don't fit a one-off owner action. The data plane needs something it can claim and mark done:

```
moderation_requests
  id               bigint identity, PK
  bot_instance_id  uuid, FK -> bot_instances (cascade delete)
  target_user_id   text        -- Highrise user id, resolved before insert
  target_username  text        -- last-known username, for display/audit
  action           text        -- "ban" | "unban"
  duration_s       int | null  -- ban only; null/0 = permanent
  requested_by     text        -- our user id, for audit
  status           text        -- "pending" | "processing" | "applied" | "denied" | "failed"
  error            text | null
  created_at       timestamptz default now()
  resolved_at      timestamptz | null
  index (bot_instance_id, status)  -- for the data-plane pending sweep
```

### Control plane

- **Regulars table** (`regulars-table.tsx`): Ban/Unban action per row, using the `user_id` already stored on `greeter_visits` — no new lookup needed for known users.
- **Ban by username** (`ban-by-username.tsx`, new component near Regulars): resolves an arbitrary username to a `user_id` via a new `getUserByUsername()` in `lib/highrise-webapi.ts`. **Not** the SDK's own `webapi.get_users(username=...)` (`GET /users?username=...`, a collection/filter endpoint) — live-checked against the real webapi while building this and it 404s unconditionally on every query shape tried, so that method is dead against the current API despite being modeled in the SDK (worth flagging upstream at some point; not this codebase's bug to fix). What actually works, confirmed live: the *singular* resource endpoint the SDK calls `get_user(user_id)` (`GET /users/{id}`) accepts a plain username in the same path slot and resolves it case-insensitively (`/users/abc123`, `/users/ABC123`, `/users/Abc123` all return the same account; a nonexistent name 404s with `"User not found."`). `getUserByUsername()` calls that endpoint with a username instead of an id. This is what makes "ban someone who's never set foot in the room" possible: the public webapi doesn't require the target to share a room with the bot, only that they exist.
- **New server action**, `requestModeration(instanceId, formData)` in `instances/[id]/actions.ts`: known-user calls (Regulars' buttons) pass `target_user_id` + `target_username` as hidden fields; the manual form passes only `target_username`, which the action resolves server-side via `getUserByUsername()` before inserting. `requireOwnedInstance` → resolve if needed → insert a `moderation_requests` row (`status: "pending"`) → `publishModerationRequested(instanceId)` (new `notify.ts` export, identical best-effort `pg_notify` pattern to `publishConfigUpdated`) → redirect `?saved=1`. Deliberately does **not** write `instance_events` itself — the data plane owns that write once Highrise actually confirms the action, so the dashboard never shows a success toast ahead of reality.
- **Activity log**: no UI change — `instance_events` kind `"moderation"` already renders arbitrary `data.type`s. New sub-kinds `"dashboard_moderation_applied"`/`"dashboard_moderation_denied"` make owner-initiated actions visually distinct from the automated ladder (`moderation_applied`/`_denied`), in-chat mod commands, and external moderation (`external`).

### Data plane

- `supervisor.py`'s `_listen_config_updates` adds a third channel, `moderation.requested`, to the same `add_listener`/dispatch-by-channel-name loop already carrying `config.updated`/`avatar_position.updated`.
- On notify: if the instance isn't in `self.running`, no-op (covers "bot not connected" — the row stays `pending`). If it is running, claim pending rows for that instance (`UPDATE moderation_requests SET status='processing' WHERE bot_instance_id=$1 AND status='pending' RETURNING *`, atomic so a NOTIFY and the reconcile sweep below can't double-process the same row) and hand each to `WardenEngine`.
- **Reconciliation sweep, not just NOTIFY** — same "pub/sub for speed, poll for correctness" posture as everything else in this runtime: `reconcile()` also checks pending `moderation_requests` for every currently-running instance, so a dropped NOTIFY still applies next tick. **This sweep is also the entire answer to "the owner clicked Ban while the bot was stopped"** — the row just waits, and the moment the instance reconnects, the same pending-work check picks it up. No separate "apply on connect" path needed.
- `WardenEngine` gains `apply_dashboard_action(user_id, username, action, duration)`, thin wrapper around the existing `_apply_action` (same throttle acquire, same `ResponseError` handling) with a `dashboard_ban`/`dashboard_unban` log shape instead of the ladder's `auto`/mod-command shape. On completion, writes `moderation_requests.status` back (`applied`/`denied`/`failed`) so nothing lingers in `processing` silently, and inserts the `instance_events` row the dashboard's activity log renders.

### What this explicitly does not change

- Warden's automated strike ladder — untouched, still config-driven, still independent of this.
- The absence of an in-chat `!ban` command — still deliberate (this doc's existing rationale: an accidental permanent action typed in chat is a worse footgun than the ladder's explicit threshold path). This dashboard path is the confirmable alternative for a real ban, not a replacement for that reasoning.

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
- Actions: `moderate_room` (mute/kick/ban/unban), whispers. All via the `CatalogBot` throttle at `Priority.NORMAL` — no separate high-priority lane for moderation actions in trimmed v1 (the throttle doesn't currently have a priority above `NORMAL`; revisit if saturation telemetry shows moderation actions getting queued behind normal traffic in practice). Dashboard-initiated ban/unban (`WardenEngine.apply_dashboard_action`) shares this same throttle and `ResponseError` handling — supervisor.py's `moderation.requested` NOTIFY channel and its reconcile-loop pending-request sweep are what feed it, both documented above.

## Open questions

- Curated base lists: source/maintain ourselves? Multi-language (PT-BR essential given community)? Still open — trimmed v1 ships without them.
- Should strikes be sharable across a customer's rooms later (multi-room product question)? Still open.
- False-positive UX: an "undo + auto-exempt" one-click in the activity feed? Still open — not built.
- Duration units on `moderate_room`'s `action_length` — treated as seconds by convention, not empirically confirmed against a live room yet.
- **Dashboard ban/unban (shipped 2026-07-23):**
  - Resolved while building: `webapi.get_users(username=...)` (`GET /users?username=`) is dead against the real API (404s unconditionally); `getUserByUsername()` uses `GET /users/{username}` instead, confirmed live to resolve case-insensitively and 404 cleanly on a genuine miss.
  - A dashboard ban is always permanent (`duration_s` left `null`) — no duration selector built. Still open: should it expose one, mirroring Warden's own `ban_duration_s`?
  - No pre-check of the bot's room privilege before offering the button — failure surfaces after the fact via the existing `ResponseError` → `dashboard_moderation_denied` path, consistent with how this doc already resolved the analogous "can a designer-rights bot ban?" question (empirically, not statically).
  - `unban` on a user we never banned, and whether `action_length` is accepted/ignored for it — still unverified against a live room (no real bot token/room exists in this environment to check).
  - A request claimed (`status='processing'`) whose instance stops running before it's applied has no stuck-request sweep — it just sits `processing` forever. Not built; a fix would be reverting stale `processing` rows back to `pending` after some timeout.
