/**
 * Config validation on save — "Control plane validates on save" before the
 * runtime revalidates again on load (specs/02-architecture.md, defense in
 * depth). Server-only: ajv is sizeable and never needs to reach a client
 * bundle.
 */
import "server-only";
import Ajv2020 from "ajv/dist/2020";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfig(schema: object, data: unknown): ValidationResult {
  const ajv = new Ajv2020({ allErrors: true });
  // "x-module" and "x-enabled-by" (packages/schemas/emcee/v1.json) are vendor
  // extensions the dashboard reads for tab grouping and conditional field
  // visibility (schema-form.ts) — valid, ignored JSON Schema per spec, but
  // ajv's strict mode rejects unrecognized keywords by default. Registering
  // them (not `strict: false`, which would also relax real correctness
  // checks elsewhere) tells ajv it's deliberate.
  ajv.addVocabulary(["x-module", "x-enabled-by"]);
  const validate = ajv.compile(schema);
  if (validate(data)) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || "config"} ${e.message}`.trim());
  return { valid: false, errors };
}
