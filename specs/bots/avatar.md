# Bot feature — Avatar (working name)

> **STATUS: BUILT & MERGED (2026-07-21).** `workers/runtime/catalog/avatar.py`'s `AvatarEngine` is composed into the single `EmceeBot` (`catalog/emcee.py`) alongside Emote, Concierge, and Warden — no separate `AvatarBot`/`avatar` catalog slug exists. Schema merged into `packages/schemas/emcee/v1.json` (sections tagged `x-module: "avatar"`). Built from the brainstorm below after reading the pinned SDK source directly (`highrise-bot-sdk` 25.1.0's `models.py`/`webapi.py`/`models_webapi.py`), which resolved this spec's one load-bearing unknown — see "SDK mapping" and `docs/decisions.md`.

**Pitch:** the bot looks the part and holds the room. Owner dresses it in a chosen outfit, or has it copy a room member's look; the bot has a physical presence — a spot it stands, a little life when idle — instead of just floating wherever it spawned.

## Capabilities (v1)

### Anchor spot
- Owner (or anyone the `position` permission tier allows) says **"anchor"** while standing on the floor (not seated) — the bot teleports to their current position and remembers it (`avatar_positions`, one row per instance), walking back there on every reconnect.
- Not driven by dragging the bot's own avatar around — see "SDK mapping" for why that path doesn't exist. The mechanism instead tracks the *speaker's* last-known floor position (from `on_user_join`/`on_user_move`, both real handlers) and teleports the bot there on command.
- Saying "anchor" while seated (no floor position cached) gets a whisper asking them to stand first, rather than silently no-op'ing.
- **Also settable from the dashboard** (2026-07-21 fast-follow): the same `avatar_positions` row can be edited directly as raw x/y/z/facing on the instance page's "Anchor spot" card, for an owner who already knows the coordinates rather than standing in the room. Still not part of the JSON config (see "Config schema shape" below) — the dashboard write goes straight to `avatar_positions`, then a dedicated `avatar_position.updated` Postgres NOTIFY (separate from `config.updated`; Redis message before 2026-07-22, `docs/cost-plan.md` R6) tells the supervisor to re-apply the saved position on the running bot live, no reconnect required (`EmceeBot.apply_avatar_position` → `AvatarEngine.restore_position`).
- The `position.permission`/`allowlist` tier gates only the in-game "anchor" command — the dashboard editor has no separate tier, since it's already behind the owner's own BotMaker login. The instance page's card labels the two groups ("In-game" vs. "From the dashboard") separately so this distinction is visible, not just documented here.

### Idle emote loop
- A configured emote repeats solo (`send_emote(emote_id)`, no target) on an interval, whenever `idle_emote.enabled` is on. **Off by default** — same sustained-background-load caution as Emote's `loop` feature.
- Re-reads config every tick: turning it off takes effect within one interval without a reconnect; turning it back on needs one (nothing outside `on_start` currently restarts the loop task).

### Reaction back
- Someone reacts *at* the bot (`ReactionEvent.receiver.id == my_id`) → the bot reacts back the same way. On by default, one config toggle.

### Outfit
Three independently toggleable pieces, all built on `set_outfit`'s real constraint (below):

- **Default outfit** — a fixed, owner-supplied item id list applied on `on_start`. Must already be a *complete* valid Highrise outfit (every required slot present) — ids the bot doesn't currently own are filtered out before the call, which can turn an otherwise-complete list incomplete and get the whole thing rejected by Highrise. That's a config mistake for the owner to fix, not something this module tries to paper over.
- **Named presets** — `"look <name>"` switches to a saved outfit. Presets are stored as `"name: id1, id2, ..."` lines (one `string[]` field, `outfit_presets.presets`) rather than an array of `{name, item_ids}` objects — deliberately, to fit the dashboard's existing two-level schema-form generator (`apps/web/src/lib/schema-form.ts`) with zero changes to it, same reasoning Concierge's spec gave for dropping VIP tiers. Same completeness caveat as default outfit.
- **Clone a look** — `"copy <username>"` makes the bot wear as much of that person's *current* outfit as it actually owns. Unlike the two above, this can't assume completeness: a stranger's outfit intersected with the bot's own inventory is rarely a complete set on its own (most of what a real player wears, the bot won't own). So clone **merges matched items onto the bot's current outfit by category** rather than replacing wholesale — see "SDK mapping" for the mechanism — guaranteeing the result is never less complete than what the bot already had. `min_match` (default 2) skips the whole thing with a whisper if too little matched, rather than applying a near-empty swap that reads as broken.
- **No auto-buying, ever.** `buy_item()`/`tip_user()` spend the bot's own Highrise wallet — Gold-adjacent enough (`CLAUDE.md`: "never accept, hold, or transfer Highrise Gold") that it's out of scope entirely, not a judgment call folded into the code silently.

## Config schema shape

Six sections, all `x-module: "avatar"`, same flat two-level shape as every other module (`packages/schemas/emcee/v1.json`):

```yaml
position:
  enabled: bool (default true)
  permission: enum [owner, owner_designers, allowlist] (default owner)
  allowlist: string[] (usernames, max 50)
idle_emote:
  enabled: bool (default false)
  emote_id: string
  interval_s: int 30..600 (default 60)
reaction_back:
  enabled: bool (default true)
default_outfit:
  enabled: bool (default true)
  item_ids: string[] (max 40)
outfit_presets:
  enabled: bool (default true)
  permission: enum [owner, owner_designers, allowlist] (default owner)
  allowlist: string[] (usernames, max 50)
  presets: string[] (max 20) — "name: id1, id2, ..." lines
outfit_clone:
  enabled: bool (default true)
  permission: enum [owner, owner_designers, allowlist] (default owner)
  allowlist: string[] (usernames, max 50)
  min_match: int 1..20 (default 2)
```

No coordinates ever live in config — the anchor spot is captured either at command time (the speaker's position, in-game) or typed directly into the dashboard's "Anchor spot" card, but either way it's persisted to `avatar_positions`, never to this JSON blob. All fields hot-apply except that idle-loop re-enable needs a reconnect (see above); the dashboard-set position also hot-applies, over its own Postgres NOTIFY channel rather than `config.updated` (see "Anchor spot" above).

## SDK mapping — verified 2026-07-21 against the pinned SDK source (`highrise-bot-sdk` 25.1.0), not just the docs

- **Outfit — the whole module's load-bearing unknown, now resolved**: `self.highrise.set_outfit(outfit: list[Item])`, `get_my_outfit()`, `get_user_outfit(user_id)` (works for any user currently in the room), `get_inventory()` all exist and do exactly what the draft hoped, confirmed by reading `models.py` (`Item`, `SetOutfitRequest`, `GetUserOutfitRequest`, `GetInventoryRequest`) and `__init__.py` directly. So: outfit changes *are* runtime-configurable (not bot-creation-only), and a live read of *another* user's outfit *does* exist — both of the draft's biggest open questions resolve to "yes."
- **The real constraint that replaced them**: `set_outfit` *replaces* the whole outfit, and Highrise's own server enforces required-slot completeness (confirmed via `create.highrise.game/learn/guides/bots/change-bot-appearance`: one item each from body/eye/eyebrow/nose/mouth plus a lower-body combo — shirt+pants, shirt+skirt, dress, or fullsuit) — an incomplete list is rejected outright, not partially applied. This module never reimplements that rule; Highrise's own `Error` return is authoritative, and a rejection just keeps the bot's previous outfit (same "keep last-good" posture as `CatalogBot.apply_config`).
- **Item categories aren't on the outfit/inventory `Item` model** (`type`/`amount`/`id`/`account_bound`/`active_palette` only) — only the fuller webapi `Item` (`models_webapi.py`) carries `category`/`rarity`. `self.webapi.get_item(item_id)` is what `_merge_by_category` calls to learn each candidate item's category before clone decides what to override; `self.webapi` is confirmed to exist on `BaseBot` (`bot_runner` sets it after connecting, `highrise/__main__.py`).
- **`rarity`'s free tier is `Rarity.NONE = "none_"`** (the trailing underscore is the platform's own value, not a typo introduced here) — noted but not used in v1: this module only equips ids the bot's `get_inventory()` already lists as owned, not free-but-unowned items, to avoid a second webapi round trip per candidate id on top of the category lookup clone already does.
- **No confirmed event for "this bot's own avatar was moved by someone else."** `on_user_move(user, destination)` dispatches unconditionally for whatever the wire sends (`highrise/__main__.py`'s `case UserMovedEvent(...)`), but whether Highrise's client even lets an owner drag another avatar (vs. only their own) — and whether the bot's own `walk_to`/`teleport` calls echo back as a `user_moved` event about itself — are both unconfirmed. Anchor sidesteps this entirely by tracking the *speaker's* position (confirmed: fires for every room user via `on_user_join`/`on_user_move`) and teleporting the bot there on command, rather than depending on either unknown.
- **`teleport(user_id, dest: Position)`** targets any user id, including the bot's own (`self.highrise.my_id`) — used both for the anchor command and for restoring the saved position on `on_start`. **`walk_to`** (self-only, `Position | AnchorPosition`) exists too but isn't used in v1 — teleport is instant and simpler for both call sites here.
- **`on_reaction(user, reaction, receiver)`** — `receiver` is the event's target. Reaction-back only fires when `receiver.id == my_id`; no extra re-entrancy guard needed because the bot's own `react()` call, if it echoes back at all, would carry the *original human* as `receiver`, not the bot — so it can't re-trigger itself by construction.
- `buy_item`/`tip_user` both exist and both spend the bot's own Highrise wallet (`tip_user`'s literal `gold_bar_*` amounts confirm the wallet is Gold-denominated) — out of scope per the no-auto-buy stance above, not because the SDK lacks the call.
- Both whisper-only nudges in this module (anchor-not-standing, clone-insufficient-match) render through `catalog/strings.py`'s `t(bot.bot_language, ...)` (added 2026-07-24, `general.bot_language` — `specs/04-bot-runtime.md`) rather than a fixed English literal.

## Known gaps

- Nothing here has touched the real platform — required-slot completeness rules, whether `set_outfit` on an incomplete list rejects the *whole* request vs. partially applying, exact `Error` shapes, and real reaction/emote timing are all confirmed only against docs + a duck-typed `FakeHighrise`/`FakeWebAPI` test double, not a canary instance. Same posture as every other module before its own canary pass (`specs/04-bot-runtime.md`).
- Clone's `_merge_by_category` calls `self.webapi.get_item()` once per candidate item (both the bot's current outfit and the matched target items) — real HTTP round trips (`aiohttp.ClientSession` per call, per `webapi.py`), fine for an occasional explicit `"copy"` command, would need batching if this ever became a hot path.
- Idle-loop re-enable needing a reconnect (see above) is a real, if minor, UX gap — flagged rather than building a config-change watcher speculatively.
- Free (`rarity: none_`) items the bot doesn't already own aren't equippable in v1 (see SDK mapping) — only inventory-owned ids. Revisit if this turns out to meaningfully limit default-outfit/clone usefulness in practice.

## Open questions

- ~~Is changing the bot's own outfit even exposed by the SDK, or only settable at bot-account creation?~~ → resolved 2026-07-21: runtime-configurable, confirmed against SDK source. See SDK mapping.
- ~~Does a live-outfit-read API for another user exist, to support "clone"?~~ → resolved 2026-07-21: yes, `get_user_outfit(user_id)`, confirmed against SDK source.
- ~~If outfit changes cost Gold or require owned items, that's a hard no per the platform's Gold constraint~~ → resolved 2026-07-21: *equipping* costs nothing (ownership or free-tier only); *buying* (`buy_item`) does spend the bot's own Gold-denominated wallet and is excluded from this module entirely, not silently allowed.
- ~~Schema layout: standalone `avatar/v1.json` vs. a section on the shared schema?~~ → resolved 2026-07-21: sections on `packages/schemas/emcee/v1.json`, tagged `x-module: "avatar"` — same merged-schema shape every other module already uses, never built standalone.
- ~~Should outfit and presence/flair ship together, or could presence/flair go first as a fast-follow?~~ → resolved 2026-07-21: shipped together, once the outfit unknown resolved cleanly in the SDK-reading pass — no reason left to sequence them separately.
- Presets as `"name: ids"` lines instead of an array of `{name, item_ids}` objects is a deliberate v1 simplification (see "Config schema shape") — revisit (extend `schema-form.ts` with an object-array leaf kind + a dashboard repeating-fieldset UI) only if a real owner need for a richer preset editor surfaces, not speculatively.
- Whether Highrise's client even supports one user (owner/designer) repositioning *another* avatar at all, and whether the bot's own movement calls echo back as `on_user_move` about itself — both unconfirmed, and both irrelevant to the shipped anchor design (see SDK mapping), but worth knowing for real once a canary instance exists in case a future feature wants to depend on either.
