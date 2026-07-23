---
name: highrise
description: Highrise platform + bot SDK reference for BotMarket. Use BEFORE writing or reviewing any Python bot/runtime code, discussing bot capabilities, the highrise-bot-sdk, the WebSocket protocol, platform rules/ToS constraints, or drafting customer-facing copy about what bots can do.
---

# Highrise platform & bot SDK reference

Working knowledge for building against Highrise (Pocket Worlds' avatar social game). Facts current as of 2026-07; verify anything load-bearing against the sources at the bottom.

## Platform model

- A bot = separate account identity created at create.highrise.game → Dashboard → *Bots & API Keys* → issues an **API token**. Bot API access is **gated** by Trust & Safety score (customer-side prerequisite — our BYOT model depends on customers having this).
- One bot connects to **one room** via WebSocket and needs **designer rights** there. Room ID comes from the room's share link.
- Protocol is JSON over WS, language-agnostic; subscribe to event subsets via `?events=chat,user_joined,...`.

## SDK — `highrise-bot-sdk` (official, Python)

**Always use this SDK for data-plane code. Never the community JS SDKs** (single-maintainer betas, stale — decision logged in `docs/decisions.md`).

- Pin the version; we run canary-then-fleet on bumps (see `specs/04-bot-runtime.md`). Reference version: 25.1.0 (2026-04).
- Structure: subclass `BaseBot`; run via `highrise module:Class <roomID> <token>` or programmatically (multiple bots per process supported ≥23.1.0b11 — our supervisor relies on this).
- Handlers (override as needed): `before_start`, `on_connect`, `on_chat`, `on_whisper`, `on_message` (DMs), `on_user_join`, `on_user_leave`, `on_user_move`, `on_reaction`, `on_tip`, `on_voice_change`, `on_moderate`.
- Actions: `self.highrise.*` — chat/whisper, emote, reaction, teleport/walk, moderate_room (mute/kick/ban/unban), inventory, wallet + purchases, room boost, voice time, DM conversations. Public game data: `self.webapi` — public read endpoints only (users, rooms, posts, items, grabs), no moderation surface; moderation is WebSocket-only.
- Auto-reconnect built in since 25.1.0; our runtime still wraps with its own backoff + degraded-state reporting.

## Project rules when touching this surface

1. **All outbound actions go through the `CatalogBot` throttle** — never call `self.highrise` send-methods directly from handlers. Rate limits are unpublished; we run conservative token buckets and measure (see `specs/04-bot-runtime.md`).
2. **Handler bodies are wrapped** — an exception in one tenant's handler must never escape its instance.
3. **Tokens:** never logged, never in error messages, never returned by APIs; decrypt only at spawn (see `specs/05-security.md`).
4. **No Gold, ever.** Don't build features that accept/route/pay out Gold or items even if the SDK exposes wallet APIs. Tip *reading* (leaderboards) is fine; tip *routing* is not. ToS basis in `docs/research.md`.
5. Customer-visible strings from config (greetings, warn templates) are sanitized + length-capped before the bot speaks them.
6. In-room silence about our internals: bots never announce billing, deploys, or errors in a customer's room.

## Known unknowns (verify before relying)

- Exact rate-limit numbers (empirical only).
- `moderate_room`'s duration units (treated as seconds by convention, not empirically confirmed) — `specs/bots/moderation.md`.
- `unban` (real SDK action, `Literal["kick", "ban", "unban", "mute"]`) against a user we never banned — does it error or no-op? Unverified live.
- DM-initiation consent rules (can a bot DM a user who never DM'd it first?).
- Valid emote ID list source (webapi vs. static list).
- Per-IP connection ceilings when many bots share a host.

**Resolved, not unknowns anymore** (`specs/bots/moderation.md`, 2026-07-21 spike): designer-rights bots *can* ban — `moderate_room` doesn't need to know in advance, it awaits the server ack and raises `ResponseError` on denial, so the code just needs to catch failure rather than check privilege upfront. Ban supports a duration (`0` = permanent), same shape as mute — not permanent-only. There's still no "list currently muted/banned" read API; a customer's own persisted state (`warden_strikes`, or the new `moderation_requests` queue) is the only source of truth for "who's under what."

**`webapi.get_users(username=...)` is dead** (live-checked 2026-07-23 building the dashboard ban/unban feature, `specs/bots/moderation.md`): `GET /users?username=...` — the SDK-modeled collection/filter endpoint — 404s unconditionally against the real API, every query shape tried (empty, `username=`, `usernames=`, `starts_after`/`limit` alone). The *singular* resource endpoint the SDK calls `get_user(user_id)` (`GET /users/{id}`) works fine and, useful discovery, accepts a plain username in the same path slot — resolves case-insensitively, 404s cleanly with `"User not found."` on a genuine miss. Use that one for username → id resolution, not `get_users`.

## Sources

- SDK: https://github.com/pocketzworld/python-bot-sdk · https://pypi.org/project/highrise-bot-sdk/
- Docs: https://create.highrise.game/learn/bots/overview · /learn/bots/guides/creating-a-bot
- Eligibility: https://support.highrise.game/en/articles/8380206
- ToS: https://support.highrise.game/articles/10542745-terms-of-service
- Community forum (SDK release notes, protocol changes): https://createforum.highrise.game
