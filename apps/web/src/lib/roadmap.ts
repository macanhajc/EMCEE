// Feature-module roadmap for the one bot (Emcee) — see docs/decisions.md,
// 2026-07-20, and specs/bots/. Shared between the landing page and
// /instances/new so the two "coming soon" lists can't drift apart.
//
// Concierge shipped 2026-07-20 (docs/decisions.md "Emcee merge"), Warden
// shipped 2026-07-21 (trimmed v1), and Avatar shipped 2026-07-21 (full v1 —
// anchor spot, idle emote, reaction-back, outfit) — all three have a real
// schema section (x-module) and a live dashboard tab now, so they're off
// this "coming soon" list; see instance-config.tsx.
//
// Only stable keys live here — the actual copy is translated, under the
// `bot.roadmap`/`bot.features` namespaces in /messages (see BotShowcase,
// NewInstanceTemplate, and InstanceConfig, the three consumers of these
// two lists).
export const BOT_ROADMAP = [{ key: "music" }] as const;

// What Emcee already does, one entry per live module (see LIVE_MODULES in
// instance-config.tsx) — shown on /instances/new so a new owner knows what
// they're getting before the config dashboard exists for them.
export const BOT_FEATURES = [
  { key: "emote" },
  { key: "concierge" },
  { key: "warden" },
  { key: "avatar" },
] as const;
