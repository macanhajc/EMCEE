/**
 * Route gating rules — the "Gating map" table in specs/06-auth.md, as a pure
 * function so middleware.ts and tests share one source of truth.
 *
 * | Surface                                        | Auth        |
 * |-------------------------------------------------|-------------|
 * | Storefront, catalog, pricing, docs, status page | public      |
 * | Checkout                                         | required    |
 * | Create/manage instance, paste token, edit config | required    |
 * | Dashboard, activity log, billing portal          | required    |
 * | Admin surface                                    | admin role  |
 *
 * Age attestation (18+) gates purchase and instance creation specifically,
 * not the whole dashboard (spec: "Purchase requires 18+ self-attestation").
 */

export type RouteAccess = "public" | "auth" | "admin";

const ADMIN_PREFIX = "/admin";
const AUTH_PREFIXES = ["/dashboard", "/checkout", "/instances", "/account"];
const AGE_GATED_PREFIXES = ["/checkout", "/instances/new"];

// Always public even though they share a prefix with a gated route.
const PUBLIC_EXCEPTIONS = ["/account/attest-age"];

export function classifyRoute(pathname: string): RouteAccess {
  if (pathname.startsWith(ADMIN_PREFIX)) return "admin";
  if (PUBLIC_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "auth"; // signed-in, but not additionally age-gated
  }
  if (AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "auth";
  return "public";
}

export function requiresAgeAttestation(pathname: string): boolean {
  return AGE_GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
