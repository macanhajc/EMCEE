// Feature-module roadmap for the one bot (Emcee) — see docs/decisions.md,
// 2026-07-20, and specs/bots/. Shared between the landing page and
// /instances/new so the two "coming soon" lists can't drift apart.
//
// Concierge shipped 2026-07-20 (docs/decisions.md "Emcee merge"), Warden
// shipped 2026-07-21 (trimmed v1), and Avatar shipped 2026-07-21 (full v1 —
// anchor spot, idle emote, reaction-back, outfit) — all three have a real
// schema section (x-module) and a live dashboard tab now, so they're off
// this "coming soon" list; see instance-config.tsx.
export const BOT_ROADMAP = [
  {
    name: "Music",
    role: "Room soundtrack",
    body: "Still an early idea, not yet scoped — more soon.",
  },
];

// What Emcee already does, one entry per live module (see LIVE_MODULES in
// instance-config.tsx and each module's "Pitch" line in specs/bots/) —
// shown on /instances/new so a new owner knows what they're getting before
// the config dashboard exists for them.
export const BOT_FEATURES = [
  {
    name: "Emotes",
    body: "Say an emote's name in chat and your avatar performs it — even ones you don't own. The owner can call one out for the whole room at once.",
  },
  {
    name: "Concierge",
    body: "Whispers a greeting to every guest, remembers regulars across visits, and gives VIPs on your list a distinct welcome.",
  },
  {
    name: "Warden",
    body: "Word filter, anti-spam, and a strike ladder with an action log — 24/7 moderation coverage, configured in forms.",
  },
  {
    name: "Avatar",
    body: "Dress it in a chosen outfit, give it a spot to stand, and a little idle animation — a bot with presence, not just floating in place.",
  },
];
