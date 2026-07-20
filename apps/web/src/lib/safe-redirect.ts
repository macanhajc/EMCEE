/**
 * Guards against open redirects on client-supplied `next` params. Next.js's
 * own `redirect()` (unlike Auth.js's `signIn(..., { redirectTo })`, which
 * already restricts targets to same-origin — see @auth/core's default
 * `redirect` callback) will happily send a browser anywhere it's given.
 *
 * Only same-origin relative paths pass. Rejects absolute URLs and the
 * classic bypasses: protocol-relative ("//evil.com" — browsers resolve a
 * leading "//" against the current scheme) and backslash variants some
 * browsers normalize to forward slashes before navigating.
 */
export function safeRedirectPath(input: string | null | undefined, fallback = "/dashboard"): string {
  if (!input) return fallback;
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  return input;
}
