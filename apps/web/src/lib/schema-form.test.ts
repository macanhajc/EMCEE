import { describe, expect, it } from "vitest";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { defaultsFromSchema, parseConfigFormData, sectionsFromSchema } from "./schema-form";

describe("sectionsFromSchema (against the real emcee/v1 schema)", () => {
  const sections = sectionsFromSchema(emceeSchemaV1);

  it("finds all top-level sections across all modules", () => {
    expect(sections.map((s) => s.key)).toEqual([
      "emote_on_say",
      "emote_all",
      "list_command",
      "loop",
      "welcome",
      "vip",
      "farewell",
      "filter",
      "anti_spam",
      "ladder",
      "exemptions",
      "commands",
      "position",
      "idle_emote",
      "reaction_back",
      "default_outfit",
      "outfit_presets",
      "outfit_clone",
    ]);
  });

  it("tags each section with its x-module for dashboard tab grouping", () => {
    const byKey = Object.fromEntries(sections.map((s) => [s.key, s.module]));
    expect(byKey).toEqual({
      emote_on_say: "emote",
      emote_all: "emote",
      list_command: "emote",
      loop: "emote",
      welcome: "concierge",
      vip: "concierge",
      farewell: "concierge",
      filter: "warden",
      anti_spam: "warden",
      ladder: "warden",
      exemptions: "warden",
      commands: "warden",
      position: "avatar",
      idle_emote: "avatar",
      reaction_back: "avatar",
      default_outfit: "avatar",
      outfit_presets: "avatar",
      outfit_clone: "avatar",
    });
  });

  it("classifies each leaf shape correctly, including bare string fields", () => {
    const emoteOnSay = sections.find((s) => s.key === "emote_on_say")!;
    expect(emoteOnSay.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "enabled", kind: "boolean" }),
        expect.objectContaining({ key: "cooldown_s", kind: "integer", minimum: 0, maximum: 60 }),
        expect.objectContaining({ key: "disabled_emotes", kind: "string-array", maxItems: 100 }),
      ]),
    );

    const emoteAll = sections.find((s) => s.key === "emote_all")!;
    expect(emoteAll.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "permission",
          kind: "enum",
          options: ["owner", "owner_designers", "allowlist"],
        }),
      ]),
    );

    // vip.template is a bare `type: "string"` leaf — the shape Concierge's
    // schema introduced and fieldSpecFor previously returned null for.
    const vip = sections.find((s) => s.key === "vip")!;
    expect(vip.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "template", kind: "string", maxLength: 200 }),
        expect.objectContaining({ key: "users", kind: "string-array", maxItems: 200 }),
      ]),
    );
  });

  it("carries titles through for form labels", () => {
    const emoteOnSay = sections.find((s) => s.key === "emote_on_say")!;
    expect(emoteOnSay.title).toBe("Emote on say");
  });

  it("carries x-enabled-by through as enabledBy, for fields gated on a sibling toggle", () => {
    const welcome = sections.find((s) => s.key === "welcome")!;
    expect(welcome.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "busy_mode_joins_per_min", enabledBy: "busy_mode_enabled" }),
        expect.objectContaining({ key: "quiet_hours_start", enabledBy: "quiet_hours_enabled" }),
        expect.objectContaining({ key: "quiet_hours_end", enabledBy: "quiet_hours_enabled" }),
        expect.objectContaining({ key: "quiet_hours_tz", enabledBy: "quiet_hours_enabled" }),
        expect.objectContaining({ key: "busy_mode_enabled", enabledBy: undefined }),
      ]),
    );

    const vip = sections.find((s) => s.key === "vip")!;
    expect(vip.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "emote_celebration_id", enabledBy: "emote_celebration_enabled" }),
      ]),
    );

    const farewell = sections.find((s) => s.key === "farewell")!;
    expect(farewell.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "public_template", enabledBy: "public_message" }),
      ]),
    );

    const ladder = sections.find((s) => s.key === "ladder")!;
    expect(ladder.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "ban_at_strikes", enabledBy: "ban_enabled" }),
        expect.objectContaining({ key: "ban_duration_s", enabledBy: "ban_enabled" }),
        expect.objectContaining({ key: "ban_enabled", enabledBy: undefined }),
      ]),
    );
  });

  it("carries each leaf's schema default through as field.default", () => {
    // Regression: a stored config missing this key entirely (an instance
    // saved before `position` existed, or before any save touched it) must
    // be able to fall back to this true default in the dashboard, not to
    // `false` — see instance-config.tsx's `resolvedBoolean`.
    const position = sections.find((s) => s.key === "position")!;
    expect(position.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "enabled", default: true })]),
    );

    // Loop defaults to enabled since 2026-07-23 (specs/bots/emote.md) —
    // was false when this test was first written.
    const loop = sections.find((s) => s.key === "loop")!;
    expect(loop.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "enabled", default: true })]),
    );
  });

  it("classifies the avatar module's presets/clone leaves correctly", () => {
    const presets = sections.find((s) => s.key === "outfit_presets")!;
    expect(presets.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "permission", kind: "enum", options: ["owner", "owner_designers", "allowlist"] }),
        expect.objectContaining({ key: "presets", kind: "string-array", maxItems: 20 }),
      ]),
    );

    const clone = sections.find((s) => s.key === "outfit_clone")!;
    expect(clone.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "min_match", kind: "integer", minimum: 1, maximum: 20 })]),
    );
  });
});

describe("defaultsFromSchema (against the real emcee/v1 schema)", () => {
  it("matches the schema's declared defaults across both modules", () => {
    const defaults = defaultsFromSchema(emceeSchemaV1);
    expect(defaults).toEqual({
      emote_on_say: { enabled: true, cooldown_s: 3, disabled_emotes: [] },
      emote_all: { enabled: true, permission: "owner", allowlist: [], cooldown_s: 60 },
      list_command: { enabled: true },
      loop: { enabled: true, interval_s: 5, max_duration_s: 1800, cooldown_s: 10 },
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

describe("parseConfigFormData", () => {
  const sections = sectionsFromSchema(emceeSchemaV1);

  it("round-trips a fully filled form across both modules", () => {
    const fd = new FormData();
    fd.set("emote_on_say.enabled", "on");
    fd.set("emote_on_say.cooldown_s", "5");
    fd.set("emote_on_say.disabled_emotes", "wave\nmacarena");
    fd.set("emote_all.enabled", "on");
    fd.set("emote_all.permission", "allowlist");
    fd.set("emote_all.allowlist", "alice\nbob");
    fd.set("emote_all.cooldown_s", "90");
    fd.set("list_command.enabled", "on");
    fd.set("loop.enabled", "on");
    fd.set("loop.interval_s", "12");
    fd.set("loop.max_duration_s", "600");
    fd.set("loop.cooldown_s", "15");
    fd.set("welcome.enabled", "on");
    fd.set("welcome.templates", "Hey {username}!");
    fd.set("welcome.cooldown_h", "12");
    fd.set("welcome.busy_mode_enabled", "on");
    fd.set("welcome.busy_mode_joins_per_min", "20");
    fd.set("welcome.quiet_hours_enabled", "on");
    fd.set("welcome.quiet_hours_start", "23:00");
    fd.set("welcome.quiet_hours_end", "07:00");
    fd.set("welcome.quiet_hours_tz", "America/Sao_Paulo");
    fd.set("vip.users", "regular1\nregular2");
    fd.set("vip.template", "Hey {username}, welcome back!");
    fd.set("vip.announce_to_room", "on");
    fd.set("vip.emote_celebration_enabled", "on");
    fd.set("vip.emote_celebration_id", "dance-macarena");
    fd.set("farewell.log_enabled", "on");
    fd.set("farewell.min_visits", "2");
    fd.set("farewell.public_message", "on");
    fd.set("farewell.public_template", "Bye {username}!");
    fd.set("filter.enabled", "on");
    fd.set("filter.custom_terms", "badword\nspam");
    fd.set("anti_spam.enabled", "on");
    fd.set("anti_spam.message_rate_count", "8");
    fd.set("anti_spam.message_rate_window_s", "15");
    fd.set("anti_spam.duplicate_count", "4");
    fd.set("ladder.strike_decay_h", "12");
    fd.set("ladder.mute_at_strikes", "2");
    fd.set("ladder.mute_duration_s", "600");
    fd.set("ladder.kick_at_strikes", "4");
    fd.set("ladder.ban_enabled", "on");
    fd.set("ladder.ban_at_strikes", "6");
    fd.set("ladder.ban_duration_s", "3600");
    fd.set("exemptions.designers_exempt", "on");
    fd.set("exemptions.users", "mod1\nmod2");
    fd.set("commands.enabled", "on");
    fd.set("commands.prefix", "?");
    fd.set("position.enabled", "on");
    fd.set("position.permission", "allowlist");
    fd.set("position.allowlist", "mod1\nmod2");
    fd.set("idle_emote.enabled", "on");
    fd.set("idle_emote.emote_id", "dance-macarena");
    fd.set("idle_emote.interval_s", "90");
    fd.set("reaction_back.enabled", "on");
    fd.set("default_outfit.enabled", "on");
    fd.set("default_outfit.item_ids", "shirt-1\npants-1");
    fd.set("outfit_presets.enabled", "on");
    fd.set("outfit_presets.permission", "owner_designers");
    fd.set("outfit_presets.allowlist", "mod1");
    fd.set("outfit_presets.presets", "casual: shirt-1, pants-1");
    fd.set("outfit_clone.enabled", "on");
    fd.set("outfit_clone.permission", "owner");
    fd.set("outfit_clone.allowlist", "");
    fd.set("outfit_clone.min_match", "3");

    expect(parseConfigFormData(sections, fd)).toEqual({
      emote_on_say: { enabled: true, cooldown_s: 5, disabled_emotes: ["wave", "macarena"] },
      emote_all: { enabled: true, permission: "allowlist", allowlist: ["alice", "bob"], cooldown_s: 90 },
      list_command: { enabled: true },
      loop: { enabled: true, interval_s: 12, max_duration_s: 600, cooldown_s: 15 },
      welcome: {
        enabled: true,
        templates: ["Hey {username}!"],
        cooldown_h: 12,
        busy_mode_enabled: true,
        busy_mode_joins_per_min: 20,
        quiet_hours_enabled: true,
        quiet_hours_start: "23:00",
        quiet_hours_end: "07:00",
        quiet_hours_tz: "America/Sao_Paulo",
      },
      vip: {
        users: ["regular1", "regular2"],
        template: "Hey {username}, welcome back!",
        announce_to_room: true,
        emote_celebration_enabled: true,
        emote_celebration_id: "dance-macarena",
      },
      farewell: { log_enabled: true, min_visits: 2, public_message: true, public_template: "Bye {username}!" },
      filter: { enabled: true, custom_terms: ["badword", "spam"] },
      anti_spam: { enabled: true, message_rate_count: 8, message_rate_window_s: 15, duplicate_count: 4 },
      ladder: {
        strike_decay_h: 12,
        mute_at_strikes: 2,
        mute_duration_s: 600,
        kick_at_strikes: 4,
        ban_enabled: true,
        ban_at_strikes: 6,
        ban_duration_s: 3600,
      },
      exemptions: { designers_exempt: true, users: ["mod1", "mod2"] },
      commands: { enabled: true, prefix: "?" },
      position: { enabled: true, permission: "allowlist", allowlist: ["mod1", "mod2"] },
      idle_emote: { enabled: true, emote_id: "dance-macarena", interval_s: 90 },
      reaction_back: { enabled: true },
      default_outfit: { enabled: true, item_ids: ["shirt-1", "pants-1"] },
      outfit_presets: {
        enabled: true,
        permission: "owner_designers",
        allowlist: ["mod1"],
        presets: ["casual: shirt-1, pants-1"],
      },
      outfit_clone: { enabled: true, permission: "owner", allowlist: [], min_match: 3 },
    });
  });

  it("treats an absent checkbox as false, not missing", () => {
    const fd = new FormData();
    fd.set("emote_on_say.cooldown_s", "3");
    const result = parseConfigFormData(sections, fd);
    expect(result.emote_on_say.enabled).toBe(false);
  });

  it("treats a blank number field as undefined, not zero", () => {
    const fd = new FormData();
    fd.set("emote_on_say.cooldown_s", "");
    const result = parseConfigFormData(sections, fd);
    expect(result.emote_on_say.cooldown_s).toBeUndefined();
  });

  it("drops blank lines from string-array fields", () => {
    const fd = new FormData();
    fd.set("emote_on_say.disabled_emotes", "wave\n\n\nmacarena\n");
    const result = parseConfigFormData(sections, fd);
    expect(result.emote_on_say.disabled_emotes).toEqual(["wave", "macarena"]);
  });

  it("treats an absent bare-string field as undefined, not missing entirely", () => {
    const fd = new FormData();
    fd.set("vip.users", "someone");
    const result = parseConfigFormData(sections, fd);
    expect(result.vip.template).toBeUndefined();
    expect("template" in result.vip).toBe(true); // present with undefined, not dropped
  });
});
