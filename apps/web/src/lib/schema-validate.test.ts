import { describe, expect, it } from "vitest";
import emoteSchemaV1 from "@botmarket/schemas/emote/v1";
import { defaultsFromSchema } from "./schema-form";
import { validateConfig } from "./schema-validate";

describe("validateConfig (against the real emote/v1 schema)", () => {
  it("accepts the schema's own defaults", () => {
    const result = validateConfig(emoteSchemaV1, defaultsFromSchema(emoteSchemaV1));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects a cooldown outside its declared range", () => {
    const config = defaultsFromSchema(emoteSchemaV1);
    config.emote_on_say.cooldown_s = 999;
    const result = validateConfig(emoteSchemaV1, config);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/cooldown_s/);
  });

  it("rejects an unknown top-level section (additionalProperties: false)", () => {
    const config = { ...defaultsFromSchema(emoteSchemaV1), bogus_section: {} };
    expect(validateConfig(emoteSchemaV1, config).valid).toBe(false);
  });

  it("rejects an enum value outside the declared set", () => {
    const config = defaultsFromSchema(emoteSchemaV1);
    config.emote_all.permission = "everyone";
    expect(validateConfig(emoteSchemaV1, config).valid).toBe(false);
  });

  it("accepts a config with optional integer fields omitted", () => {
    const config = defaultsFromSchema(emoteSchemaV1);
    delete config.emote_on_say.cooldown_s;
    expect(validateConfig(emoteSchemaV1, config).valid).toBe(true);
  });
});
