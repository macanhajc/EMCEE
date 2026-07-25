# Bot feature — Concierge (greeter & VIP module, working name)

> **STATUS: BUILT & MERGED (2026-07-20).** `workers/runtime/catalog/greeter.py`'s `GreeterEngine` is composed into the single `EmceeBot` (`catalog/emcee.py`) alongside the Emote module — no separate `GreeterBot`/`greeter` catalog slug exists anymore. Schema merged into `packages/schemas/emcee/v1.json` (sections tagged `x-module: "concierge"`); `catalog_bots` has one row, `emcee`. First post-v1 module — scope locked earlier the same day after a brainstorm, then built, then merged into the one-bot model the same day again once the control-plane wiring surfaced that "Concierge" and "Emote" as separate catalog rows would have meant separate tokens/rooms, contradicting every spec's "one bot, one instance" framing. See `docs/decisions.md` for the full sequence and what's verified vs. still a known gap. Presence & flair (bot position, idle emote, reaction-back) moved to `avatar.md` — Concierge's job is greeting and remembering, not occupying the room.

**Pitch:** every guest greeted, every regular remembered, every VIP treated like one.

## Capabilities (v1)

### Activation message
- On `on_start` (every connect, including reconnects — not just the first ever): an optional templated line posted to the room's **public chat**, not a whisper — there's no specific user to whisper to at connect time, so this is the one Concierge message that's public by shape rather than an opt-in extra layered on a whisper (contrast VIP's `announce_to_room`, Farewell's `public_message`).
- Off by default. A flat re-announce cooldown (minutes, default 10) guards against the supervisor's reconnect-with-backoff loop spamming the room during a flapping connection — the same bot object (and `GreeterEngine`) survives every reconnect attempt within one process lifetime, so cooldown state is a simple in-memory timestamp, no Postgres involved.
- Template variable: `{room_name}` only — no `{username}`, there's no user to attach one to.

### Welcome messages
- On `user_joined`: templated greeting with variables — `{username}`, `{room_name}`.
- Channel: **whisper only in v1** (avoids chat noise in busy rooms; also sidesteps DM's unverified consent rules — see SDK mapping). Public chat and DM are explicitly deferred, not a v1 toggle.
- **Anti-noise controls (the hard part done right):** per-user cooldown (default: don't re-greet within 6h), busy-mode (>N joins/min → greet silently/whisper-only), quiet hours.
- Rotating templates (up to 10) so the room doesn't feel canned.

### VIP recognition
- VIP list by username. **Manual curation only in v1** — owner adds/removes usernames by hand.
- VIP join: distinct greeting (bypasses welcome's cooldown/busy-mode/quiet-hours entirely — a VIP is always worth interrupting for) + optional emote celebration (one-shot, not a loop) + optional announce-to-room toggle.
- **Auto-VIP (visited ≥N times → auto-promoted) dropped entirely** (2026-07-21) — deferred at build time (2026-07-20) pending real visit stats, then dropped for good once that landed rather than picked back up; manual curation stays the only way onto the VIP list.
- **Tiers (VIP/MVP with separate templates) dropped entirely** (2026-07-21) — one flat tier, one template, permanently, not just a v1 trim. See "Config schema shape" below for why it was never a small lift.

### Farewell (small, optional)
- On `user_left` after visits ≥N: whisper-next-visit note is impossible (they're gone) → instead log it; farewell public message off by default (noise).

### Visit stats
- Per-user visit counts, Postgres-backed (see "Known gaps" below) → powers farewell's `min_visits` and the dashboard regulars table. Not exposed as a template variable — see the SDK mapping section.

## Config schema shape (built 2026-07-20 as standalone `greeter/v1.json`; merged into `packages/schemas/emcee/v1.json` the same day — see "Known gaps" below)

Flat two-level shape throughout (section → primitive leaf or array-of-primitive) — deliberately, not a simplification of convenience: the dashboard's config-form generator (`apps/web/src/lib/schema-form.ts`) only walks that exact shape today (`docs/decisions.md`, 2026-07-20 instance-creation entry). A per-VIP tier would need an array of objects (`{username, tier}`), which that generator can't render yet; rather than extend it for one field, VIP tiers were dropped outright (2026-07-21) — one flat tier stays the permanent shape, not a placeholder pending generator work. `busy_mode` and `quiet_hours` are flattened to prefixed leaves for the same reason.

```yaml
activation_message:
  enabled: bool (default false)
  template: string (≤ 200 chars)
  cooldown_m: int 0..1440 (default 10)
welcome:
  enabled: bool (default true)
  templates: string[] (1..10, each ≤ 200 chars)
  cooldown_h: int 0..168 (default 6)
  busy_mode_enabled: bool (default true)
  busy_mode_joins_per_min: int 5..60 (default 15)
  quiet_hours_enabled: bool (default false)
  quiet_hours_start / quiet_hours_end: string "HH:MM" (24h)
  quiet_hours_tz: string (default "UTC")
vip:
  users: string[] (usernames, max 200) — single flat tier, see above
  template: string (≤ 200 chars)
  announce_to_room: bool (default false)
  emote_celebration_enabled: bool (default false)
  emote_celebration_id: string
farewell:
  log_enabled: bool (default true)
  min_visits: int 1..100 (default 3)
  public_message: bool (default false)
  public_template: string (≤ 200 chars)
```

All fields hot-apply. (`channel` dropped from `welcome` — whisper is the only v1 channel, not a config choice; re-add if/when chat or DM ship.)

## SDK mapping

- Events: `on_start` (captures `room_info.owner_id` / `room_info.room_name`, then — added 2026-07-24 — drives the activation-message chat post below that same capture), `on_user_join`, `on_user_leave` — all confirmed against the actual SDK source (`highrise/__init__.py`, `highrise/models.py`), not just the skill's summary.
- Actions: `send_whisper` (greetings, VIP messages), `chat` (activation message, VIP room announce, farewell send-off — `chat` was first needed for VIP/farewell; added to the shared `FakeHighrise` test double back then), `send_emote` (VIP celebration, one-shot). All through the shared `CatalogBot` throttle at `Priority.NORMAL` — Concierge yields to Warden when both modules are enabled on the same instance (queue-ordering priority, not cross-account coordination, since both run in-process behind one throttle per instance).
- `on_reaction`, `teleport`/`walk_to` — not used here; those back the presence/flair capabilities that moved to `avatar.md`.
- Emote picker in dashboard (for `emote_celebration`) needs the valid emote list — already solved by Emote's catalog (`workers/runtime/catalog/emotes.json`), reuse it rather than a second source of truth.
- Template rendering (`{username}`/`{room_name}`) uses literal-token substitution, deliberately **not** `str.format(**kwargs)` — an owner-authored template run through `.format()` can dereference attributes on whatever objects it's given (a real format-string gadget class), so the substitution only ever replaces the whitelisted tokens verbatim. `{visit_count}` was dropped from that whitelist (2026-07-21, see Known gaps and Open questions) — left literal like any other unrecognized token, never rendered as a number.
- VIP's `announce_to_room` line is the one hardcoded (non-owner-authored) string in this module — as of 2026-07-24 it renders through `catalog/strings.py`'s `t(bot.bot_language, ...)` (`general.bot_language` — `specs/04-bot-runtime.md`) instead of a fixed English literal, same mechanism as the built-in strings in `emote.py`/`warden.py`/`avatar.py`. Every owner-authored template (Welcome/VIP whisper/Farewell/Activation message) is untouched by `bot_language` — those stay exactly as the owner wrote them, regardless of this setting.

## Known gaps (surfaced during the build, not silently worked around)

- ~~Visit counts are in-memory only, per process~~ → resolved 2026-07-20: `greeter_visits` table (`bot_instance_id` + Highrise `user_id`, `visit_count`, `first_seen_at`/`last_seen_at`), `db.record_visit` (atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`), `CatalogBot.db_pool`/`.bot_instance_id` set generically by the supervisor after spawn. Farewell's `min_visits` now survives reconnects and redeploys. A DB failure degrades to the in-memory session cache (an uncounted-but-still-sent greeting) rather than silencing the greeting entirely — verified against real Postgres, including cross-instance-object persistence (a fresh `EmceeBot` backed by the same `bot_instance_id` picks up the count where a prior one left off) and the failure-fallback path.
- ~~Not wired into the control plane yet~~ → resolved 2026-07-20, same day: wiring it in as a second `catalog_bots` row surfaced that Concierge and Emote would then be two separately-purchasable products with two separate tokens/rooms, contradicting the "one bot" pitch. Fixed by merging instead of just wiring — see the STATUS banner and `docs/decisions.md`. Concierge is a live, real tab in the dashboard config UI today, sharing `catalog_bots.slug = "emcee"` and one `bot_instances` row with Emote.
- ~~The dashboard "regulars" table (top visitors, 30d) from the original pitch still doesn't exist~~ → resolved 2026-07-21: `apps/web/src/db/greeter-visits.ts`'s `getRegulars` (30-day window on `last_seen_at`, ordered by `visit_count` desc, capped at 10) rendered by `RegularsTable` on the instance page, right above Configuration. Empty state ("No regulars yet…") for rooms with no repeat visitors yet.

## Open questions

- ~~DM greeting channel~~ → resolved 2026-07-20: whisper-only in v1; chat and DM both deferred (DM blocked specifically on the unverified consent-rule unknown — see `highrise` skill's "known unknowns").
- ~~Presence & flair placement~~ → resolved 2026-07-20: moved to `avatar.md`; Concierge doesn't touch bot position/idle-emote/reaction-back.
- ~~Auto-VIP~~ → resolved 2026-07-20 as deferred past v1, sequenced after visit stats ran in production; visit stats did land, but resolved again 2026-07-21 as **dropped**, not picked up as the fast-follow that unblocked — manual VIP curation stays the only path, permanently.
- ~~Schema layout: standalone `greeter/v1.json` vs. a section on one shared schema~~ → resolved 2026-07-20, in two steps the same day: first built the same way `emote.py` was (own `SLUG`, own schema file, separate `CATALOG` entry) — then that choice's consequence (a second purchasable product, contradicting "one bot") surfaced during control-plane wiring, and got corrected by merging into `packages/schemas/emcee/v1.json` with `x-module` tags. The product-level and code-level framings now actually match, closing the tension this question used to flag as open.
- ~~Visit counts: reset on our instance re-provision?~~ → resolved 2026-07-20: no — Postgres-backed, per instance, survives re-provisioning by design (history genuinely starts at subscription/instance creation, per the original lean, not reset on every reconnect).
- ~~`{visit_count}` privacy: any user creeped out by "your 47th visit"?~~ → resolved 2026-07-21: removed from the whitelisted template tokens entirely, rather than shipping it as an opt-in. The count itself is still tracked (farewell's `min_visits`, the regulars table) — it's the whispered-back number specifically that's gone.
- ~~VIP tiers (VIP/MVP)~~ → resolved 2026-07-21: dropped, not a fast-follow. One flat tier stays the shape indefinitely; revisit only if a real customer need surfaces, not speculatively.
