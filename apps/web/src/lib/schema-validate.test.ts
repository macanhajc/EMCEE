import { describe, expect, it } from "vitest";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { defaultsFromSchema } from "./schema-form";
import { validateConfig } from "./schema-validate";

describe("validateConfig (against the real emcee/v1 schema)", () => {
  it("accepts the schema's own defaults", () => {
    const result = validateConfig(emceeSchemaV1, defaultsFromSchema(emceeSchemaV1));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects a cooldown outside its declared range", () => {
    const config = defaultsFromSchema(emceeSchemaV1);
    config.emote_on_say.cooldown_s = 999;
    const result = validateConfig(emceeSchemaV1, config);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/cooldown_s/);
  });

  it("rejects an unknown top-level section (additionalProperties: false)", () => {
    const config = { ...defaultsFromSchema(emceeSchemaV1), bogus_section: {} };
    expect(validateConfig(emceeSchemaV1, config).valid).toBe(false);
  });

  it("rejects an enum value outside the declared set", () => {
    const config = defaultsFromSchema(emceeSchemaV1);
    config.emote_all.permission = "everyone";
    expect(validateConfig(emceeSchemaV1, config).valid).toBe(false);
  });

  it("accepts a config with optional integer fields omitted", () => {
    const config = defaultsFromSchema(emceeSchemaV1);
    delete config.emote_on_say.cooldown_s;
    expect(validateConfig(emceeSchemaV1, config).valid).toBe(true);
  });
});
