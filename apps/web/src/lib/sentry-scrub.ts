/**
 * Sentry `beforeSend` scrubber (specs/05-security.md: "Sentry before_send
 * scrubber both planes"). Bot tokens are the crown jewel this app protects —
 * write-only, never logged (see token-seal.ts) — so nothing shaped like a
 * credential may leave the process via an error report either.
 *
 * This is a structural (field-name) scrub, not a content regex: Highrise
 * doesn't document a fixed token format to pattern-match against, and the
 * app already never interpolates raw token values into thrown errors
 * (token-seal.ts). Redacting by key catches the realistic leak vectors —
 * request bodies, cookies, headers, breadcrumb data, extra context — without
 * guessing at a string shape that could change under us.
 */
import type { ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_KEY = /token|secret|password|authorization|cookie/i;
const REDACTED = "[Filtered]";

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : scrub(val),
      ]),
    );
  }
  return value;
}

export function scrubSensitiveData(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (typeof event.request.data === "string") {
      event.request.data = REDACTED;
    } else if (event.request.data && typeof event.request.data === "object") {
      event.request.data = scrub(event.request.data) as typeof event.request.data;
    }
    if (event.request.cookies) event.request.cookies = { cookies: REDACTED };
    if (event.request.headers) {
      event.request.headers = scrub(event.request.headers) as typeof event.request.headers;
    }
  }

  if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;

  if (event.contexts) {
    event.contexts = Object.fromEntries(
      Object.entries(event.contexts).map(([key, val]) => [key, scrub(val)]),
    ) as typeof event.contexts;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) =>
      crumb.data ? { ...crumb, data: scrub(crumb.data) as typeof crumb.data } : crumb,
    );
  }

  return event;
}
