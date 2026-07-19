# Highrise platform research (2026-07-19)

Findings that shaped the product decisions. Verify against current docs before relying on details — the platform moves.

## The game

Highrise is a mobile-first avatar social world by **Pocket Worlds**. Users build/own rooms, socialize, trade virtual items, and spend **Gold** (premium currency). Room owners are the customer: they want traffic, engagement, and 24/7 moderation they can't do by hand.

## How bots work

- A bot is a **separate account identity** created at create.highrise.game → Dashboard → *Bots & API Keys*, which issues an **API token**.
- **Eligibility is gated**: requires a positive Trust & Safety score, assessed over time, "no specific timeline." Many users can't get access — this is why an informal rental market exists.
- Runtime model: WebSocket connection, one bot ↔ one room (bot needs designer rights in the room). JSON protocol is language-agnostic; events can be filtered via `?events=chat,user_joined,...`.
- Event types: chat, emote, reaction, user_joined, user_left, user_moved, tip_reaction, voice, channel, DMs, moderation.

### Official Python SDK — `highrise-bot-sdk` (PyPI)

- Vendor-maintained by Pocket Worlds. Latest: **25.1.0 (2026-04-02)** — added media upload, hardened auto-reconnect.
- Subclass `BaseBot`; handlers: `before_start`, `on_connect`, `on_chat`, `on_whisper`, `on_message` (DMs), `on_user_join/leave/move`, `on_reaction`, `on_tip`, `on_voice_change`, `on_moderate`.
- Actions via `self.highrise`: chat/whisper, emotes, reactions, teleport/walk users, inventory, wallet + item purchases, room boost, voice time, moderation, DM conversations. `self.webapi` for public game data.
- **Multiple bots per process** supported since 23.1.0b11 → many tenants per worker, good unit economics.
- Run: `highrise mybot:Bot <roomID> <token>`.

### Community JS SDKs — rejected

`highrise-js-sdk` (and successors `highrise.sdk`, `highrise.sdk.dev`): single community maintainer (iHsein/sphinix), self-declared beta, last release ~1 year stale, minimal adoption (1★). The SDKs are thin wrappers over the WS protocol — what matters is who keeps the wrapper in sync when the protocol changes, and for JS that's nobody accountable.

## Rate limits

Officially: "respect Highrise's rate limits to avoid getting your bot banned" — **no published numbers**. Treat as an empirical engineering task: throttle outbound actions per bot, back off on errors, measure. Open question tracked in `specs/04-bot-runtime.md`.

## Existing market (competition)

- **In-game rent-a-bot scene**, priced in Gold: observed ~500g/day, ~5k/month, ~10k "permanent." Informal, no dashboards, no SLA — and Gold-denominated, which violates ToS (see below).
- **DIY**: official docs point hobbyists at Replit (~$7/mo Always-On) + free GitHub bot templates. Real friction: setup, uptime, config editing in code.
- Nobody observed offering a polished configurable hosted product. That's the gap.

## ToS constraints (drive the business model)

From the Highrise Terms of Service:

- Gold "has no real-world currency value," is non-transferable; users get only a revocable license to it.
- **"Pocket Worlds does not recognize or take responsibility for third-party services that allow Users to sell, transfer, or otherwise use Highrise Gold. Any such use by a User violates the Highrise Terms."** → we never touch Gold.
- Users may not "lease, lend, sell, redistribute or sublicense any part of the Services" → we sell *our* software + hosting (Discord-bot-hosting model), never Highrise access; BYOT keeps each customer's bot under their own account and responsibility.
- Third-Party Services disclaimer: Pocket Worlds doesn't control or take responsibility for them — we operate in that lane and should say so in our own terms.
- Creator program rev-share exists (platform 30% / creator 30–40% / item creator 10%) — context if we ever explore official partnership.

## Sources

- https://create.highrise.game/learn/bots/overview
- https://create.highrise.game/learn/bots/guides/creating-a-bot
- https://create.highrise.game/learn/bots/guides/cloud/replit
- https://github.com/pocketzworld/python-bot-sdk
- https://pypi.org/project/highrise-bot-sdk/
- https://support.highrise.game/en/articles/8380206-what-s-a-highrise-bot-and-how-do-i-get-one
- https://support.highrise.game/articles/10542745-terms-of-service
- https://github.com/sphinixFTW/highrise-js-sdk
- https://socket.dev/npm/package/highrise.sdk
