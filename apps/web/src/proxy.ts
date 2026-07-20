/**
 * Route gating (specs/06-auth.md gating map). Next.js's "Proxy" convention
 * (renamed from Middleware) always runs on the Node.js runtime, which is
 * what makes this legal at all — `auth()` here hits Postgres via the
 * Drizzle adapter to validate the database-backed session, and that can't
 * run on Edge.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { classifyRoute, requiresAgeAttestation } from "@/lib/route-access";

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const access = classifyRoute(pathname);
  if (access === "public") return NextResponse.next();

  const session = req.auth;
  if (!session?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (access === "admin" && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  if (requiresAgeAttestation(pathname) && !session.user.ageAttestedAt) {
    const url = new URL("/account/attest-age", req.nextUrl.origin);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets and the auth API itself (would deadlock the redirect).
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
