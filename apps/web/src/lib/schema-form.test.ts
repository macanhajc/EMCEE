import { describe, expect, it } from "vitest";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { defaultsFromSchema } from "./schema-form";

describe("defaultsFromSchema (against the real emcee/v1 schema)", () => {
  it("matches the schema's declared defaults across both modules", () => {
    const defaults = defaultsFromSchema(emceeSchemaV1);
    expect(defaults).toEqual({
      general: { bot_language: "en" },
      emote_on_say: { enabled: true, cooldown_s: 3, disabled_emotes: [] },
      emote_all: { enabled: true, permission: "owner", allowlist: [], cooldown_s: 60 },
      list_command: { enabled: true },
      loop: { enabled: true, interval_s: 5, max_duration_s: 1800, cooldown_s: 10 },
      activation_message: {
        enabled: false,
        template: "I'm online and ready to help in {room_name}!",
        cooldown_m: 10,
      },
      welcome: {
        enabled: true,
        templates: [
          "Welcome to {room_name}, {username}!",
          "Hey {username}, great to see you!",
          "{username} just walked in — welcome!",
        ],
        cooldown_h: 6,
        busy_mode_enabled: true,
        busy_mode_joins_per_min: 15,
        quiet_hours_enabled: false,
        quiet_hours_start: "22:00",
        quiet_hours_end: "08:00",
        quiet_hours_tz: "UTC",
      },
      vip: {
        users: [],
        template: "Welcome back, {username} — always great to see you!",
        announce_to_room: false,
        emote_celebration_enabled: false,
        emote_celebration_id: "",
      },
      farewell: {
        log_enabled: true,
        min_visits: 3,
        public_message: false,
        public_template: "Thanks for stopping by, {username}!",
      },
      filter: { enabled: true, custom_terms: [] },
      anti_spam: { enabled: true, message_rate_count: 5, message_rate_window_s: 10, duplicate_count: 3 },
      ladder: {
        strike_decay_h: 24,
        mute_at_strikes: 2,
        mute_duration_s: 300,
        kick_at_strikes: 3,
        ban_enabled: false,
        ban_at_strikes: 5,
        ban_duration_s: 0,
      },
      exemptions: { designers_exempt: true, users: [] },
      commands: { enabled: true, prefix: "!" },
      position: { enabled: true, permission: "owner", allowlist: [] },
      idle_emote: { enabled: false, emote_id: "", interval_s: 60 },
      reaction_back: { enabled: true, cooldown_s: 2 },
      default_outfit: { enabled: true, item_ids: [] },
      outfit_presets: { enabled: true, permission: "owner", allowlist: [], presets: [] },
      outfit_clone: { enabled: true, permission: "owner", allowlist: [], min_match: 2 },
    });
  });
});
