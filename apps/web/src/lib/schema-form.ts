/**
 * Derives a brand-new instance's initial config purely from the schema's own
 * declared `default`s — used once, at instance creation
 * (instances/new/actions.ts). Every catalog bot's config schema is exactly
 * two levels deep: a top-level object of named sections (e.g.
 * `emote_on_say`), each holding primitive leaves — this assumes that shape
 * rather than walking arbitrary JSON Schema recursively, extend when a bot
 * config actually needs deeper nesting, not before.
 *
 * The dashboard itself no longer auto-renders config forms from the schema —
 * every module now has its own hand-written card, one query/mutate action
 * pair and one `useActionState`-driven form each (docs/decisions.md,
 * 2026-07-24; specs/02-architecture.md). This file used to also hold
 * `sectionsFromSchema`/`parseConfigFormData`, the generic schema-to-form
 * machinery that rendering used to run on — deleted once Emote (the last
 * module) moved off it and they had zero remaining callers.
 */

interface JsonSchemaLeaf {
  default?: unknown;
}

interface JsonSchemaObject {
  properties?: Record<string, JsonSchemaLeaf | JsonSchemaObject>;
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
