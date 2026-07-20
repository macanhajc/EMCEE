import { describe, expect, it } from "vitest";
import emoteSchemaV1 from "@botmarket/schemas/emote/v1";
import { defaultsFromSchema, parseConfigFormData, sectionsFromSchema } from "./schema-form";

describe("sectionsFromSchema (against the real emote/v1 schema)", () => {
  const sections = sectionsFromSchema(emoteSchemaV1);

  it("finds all three top-level sections", () => {
    expect(sections.map((s) => s.key)).toEqual(["emote_on_say", "emote_all", "list_command"]);
  });

  it("classifies each leaf shape correctly", () => {
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
  });

  it("carries titles through for form labels", () => {
    const emoteOnSay = sections.find((s) => s.key === "emote_on_say")!;
    expect(emoteOnSay.title).toBe("Emote on say");
  });
});

describe("defaultsFromSchema (against the real emote/v1 schema)", () => {
  it("matches the schema's declared defaults", () => {
    const defaults = defaultsFromSchema(emoteSchemaV1);
    expect(defaults).toEqual({
      emote_on_say: { enabled: true, cooldown_s: 3, disabled_emotes: [] },
      emote_all: { enabled: true, permission: "owner", allowlist: [], cooldown_s: 60 },
      list_command: { enabled: true },
    });
  });
});

describe("parseConfigFormData", () => {
  const sections = sectionsFromSchema(emoteSchemaV1);

  it("round-trips a fully filled form", () => {
    const fd = new FormData();
    fd.set("emote_on_say.enabled", "on");
    fd.set("emote_on_say.cooldown_s", "5");
    fd.set("emote_on_say.disabled_emotes", "wave\nmacarena");
    fd.set("emote_all.enabled", "on");
    fd.set("emote_all.permission", "allowlist");
    fd.set("emote_all.allowlist", "alice\nbob");
    fd.set("emote_all.cooldown_s", "90");
    fd.set("list_command.enabled", "on");

    expect(parseConfigFormData(sections, fd)).toEqual({
      emote_on_say: { enabled: true, cooldown_s: 5, disabled_emotes: ["wave", "macarena"] },
      emote_all: { enabled: true, permission: "allowlist", allowlist: ["alice", "bob"], cooldown_s: 90 },
      list_command: { enabled: true },
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
});
