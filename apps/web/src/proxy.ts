/**
 * Route gating (specs/06-auth.md gating map). Next.js's "Proxy" convention
 * (renamed from Middleware) always runs on the Node.js runtime, which is
 * what makes this legal at all — `auth()` here hits Postgres via the
 * Drizzle adapter to validate the database-backed session, and that can't
 * run on Edge.
 *
 * Locale handling (next-intl, localePrefix "always") is layered in here
 * rather than as a separate middleware: every real path is prefixed
 * (/en/dashboard), so gating has to strip that prefix before consulting
 * route-access.ts, and any auth redirect this emits has to re-add the
 * caller's locale so a Portuguese-speaking visitor doesn't land on an
 * English /login.
 *
 * Also opportunistically captures the signed-in user's current locale onto
 * users.locale (src/db/users.ts) — the only signal async transactional
 * email (crash alerts, payment-failed) has for which language to send in,
 * since those fire from a cron sweep / webhook with no request of their
 * own. Scheduled via the middleware's own `event.waitUntil` (the same
 * primitive Vercel/Cloudflare give edge functions for background work,
 * still available here despite the Node.js runtime) rather than awaited
 * inline, so it never adds latency to the actual page response; the
 * update's own WHERE clause makes it a true no-op write on every request
 * but the customer's first or a locale switch.
 */
import type { NextFetchEvent } from "next/server";
import { NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import type { NextAuthRequest } from "next-auth";
import { auth } from "@/auth";
import { routing } from "@/i18n/routing";
import { classifyRoute, requiresAgeAttestation } from "@/lib/route-access";
import { updateUserLocale } from "@/db/users";

const intlMiddleware = createIntlMiddleware(routing);

function splitLocale(pathname: string): { locale: string; bare: string; prefixed: boolean } {
  const [, maybeLocale, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale, bare: `/${rest.join("/")}`, prefixed: true };
  }
  return { locale: routing.defaultLocale, bare: pathname, prefixed: false };
}

export default auth((req: NextAuthRequest, event: NextFetchEvent) => {
  const { pathname, search } = req.nextUrl;
  const { locale, bare, prefixed } = splitLocale(pathname);

  // No (recognized) locale segment yet — let next-intl redirect to a
  // locale-prefixed URL first. Auth gating runs on the follow-up request.
  if (!prefixed) return intlMiddleware(req);

  const access = classifyRoute(bare);
  if (access === "public") return intlMiddleware(req);

  const session = req.auth;
  if (!session?.user) {
    const url = new URL(`/${locale}/login`, req.nextUrl.origin);
    // Bare (locale-free) by convention — every consumer of `next` re-adds
    // the current locale itself rather than assuming this one.
    url.searchParams.set("next", bare + search);
    return NextResponse.redirect(url);
  }

  event.waitUntil(updateUserLocale(session.user.id, locale));

  if (access === "admin" && session.user.role !== "admin") {
    return NextResponse.redirect(new URL(`/${locale}`, req.nextUrl.origin));
  }

  if (requiresAgeAttestation(bare) && !session.user.ageAttestedAt) {
    const url = new URL(`/${locale}/account/attest-age`, req.nextUrl.origin);
    url.searchParams.set("next", bare + search);
    return NextResponse.redirect(url);
  }

  return intlMiddleware(req);
});

export const config = {
  // Skip static assets and all API routes. Previously this only excluded
  // api/auth (would deadlock the sign-in redirect) and let every other
  // /api/* route fall through to classifyRoute's "public" catch-all, a
  // harmless no-op under the old gating-only logic. Now that this also
  // runs the locale redirect unconditionally for any unprefixed path,
  // that same fallthrough would 307 Stripe's webhook and the cron job to
  // a /en/api/... URL that doesn't exist — so /api has to be excluded
  // outright, not rely on classifyRoute again.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
