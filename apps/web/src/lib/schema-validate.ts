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
  const validate = ajv.compile(schema);
  if (validate(data)) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || "config"} ${e.message}`.trim());
  return { valid: false, errors };
}
