/**
 * The dashboard's "config auto-renders from JSON Schema" mechanism
 * (specs/02-architecture.md — the core product-leverage claim). Every
 * catalog bot's config schema is exactly two levels deep: a top-level
 * object of named sections (e.g. `emote_on_say`), each holding primitive
 * leaves (boolean / integer / enum string / string array). These helpers
 * assume that shape rather than walking arbitrary JSON Schema recursively —
 * extend when a bot config actually needs deeper nesting, not before.
 */

interface JsonSchemaLeaf {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  enum?: string[];
  /** Sibling boolean field key this one is only meaningful next to (e.g.
   * `quiet_hours_start` depends on `quiet_hours_enabled`) — the dashboard
   * hides the field while that sibling is unchecked. */
  "x-enabled-by"?: string;
}

interface JsonSchemaObject {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaLeaf | JsonSchemaObject>;
  "x-module"?: string;
}

interface FieldSpecBase {
  key: string;
  title: string;
  description?: string;
  /** Sibling boolean field key that gates this field's visibility in the
   * dashboard form, from the schema's `x-enabled-by` (see JsonSchemaLeaf). */
  enabledBy?: string;
}

export type FieldSpec =
  | (FieldSpecBase & { kind: "boolean" })
  | (FieldSpecBase & { kind: "integer"; minimum?: number; maximum?: number })
  | (FieldSpecBase & { kind: "enum"; options: string[] })
  | (FieldSpecBase & { kind: "string-array"; maxItems?: number })
  | (FieldSpecBase & { kind: "string"; maxLength?: number });

export interface SectionSpec {
  key: string;
  title: string;
  description?: string;
  /** From the schema section's "x-module" — groups sections into dashboard
   * tabs (e.g. "emote" vs. "concierge"). Undefined for a section that
   * doesn't tag one. */
  module?: string;
  fields: FieldSpec[];
}

function fieldSpecFor(key: string, leaf: JsonSchemaLeaf): FieldSpec | null {
  const base = {
    key,
    title: leaf.title ?? key,
    description: leaf.description,
    enabledBy: leaf["x-enabled-by"],
  };
  if (leaf.enum) return { kind: "enum", ...base, options: leaf.enum };
  if (leaf.type === "boolean") return { kind: "boolean", ...base };
  if (leaf.type === "integer" || leaf.type === "number") {
    return { kind: "integer", ...base, minimum: leaf.minimum, maximum: leaf.maximum };
  }
  if (leaf.type === "array") return { kind: "string-array", ...base, maxItems: leaf.maxItems };
  if (leaf.type === "string") return { kind: "string", ...base, maxLength: leaf.maxLength };
  return null; // unhandled leaf shape — extend when a bot needs one.
}

export function sectionsFromSchema(schema: JsonSchemaObject): SectionSpec[] {
  return Object.entries(schema.properties ?? {}).map(([sectionKey, section]) => {
    const sectionObj = section as JsonSchemaObject;
    const fields = Object.entries(sectionObj.properties ?? {})
      .map(([fieldKey, leaf]) => fieldSpecFor(fieldKey, leaf as JsonSchemaLeaf))
      .filter((f): f is FieldSpec => f !== null);
    return {
      key: sectionKey,
      title: sectionObj.title ?? sectionKey,
      description: sectionObj.description,
      module: sectionObj["x-module"],
      fields,
    };
  });
}

/** Config object built entirely from each leaf's schema `default`. */
export function defaultsFromSchema(schema: JsonSchemaObject): Record<string, Record<string, unknown>> {
  const defaults: Record<string, Record<string, unknown>> = {};
  for (const [sectionKey, section] of Object.entries(schema.properties ?? {})) {
    const values: Record<string, unknown> = {};
    for (const [fieldKey, leaf] of Object.entries((section as JsonSchemaObject).properties ?? {})) {
      values[fieldKey] = (leaf as JsonSchemaLeaf).default;
    }
    defaults[sectionKey] = values;
  }
  return defaults;
}

/**
 * Reconstructs the nested config object from a submitted form, given field
 * names of the form `${section}.${field}` (see the form markup in
 * app/instances/[id]/page.tsx). An empty number input becomes `undefined`
 * (dropped on JSON serialization) rather than NaN/0 — "left blank" should
 * mean "no opinion," not "set to zero."
 */
export function parseConfigFormData(
  sections: SectionSpec[],
  formData: FormData,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const section of sections) {
    const values: Record<string, unknown> = {};
    for (const field of section.fields) {
      const name = `${section.key}.${field.key}`;
      const raw = formData.get(name);
      switch (field.kind) {
        case "boolean":
          values[field.key] = raw === "on";
          break;
        case "integer":
          values[field.key] = raw === null || raw === "" ? undefined : Number(raw);
          break;
        case "enum":
        case "string":
          values[field.key] = raw === null ? undefined : String(raw);
          break;
        case "string-array":
          values[field.key] = String(raw ?? "")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          break;
      }
    }
    result[section.key] = values;
  }
  return result;
}
