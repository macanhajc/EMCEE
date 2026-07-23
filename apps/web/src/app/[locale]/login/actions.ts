"use server";

import { cookies, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { signIn } from "@/auth";
import { redirect } from "@/i18n/redirect";
import { magicLinkEmailLimiter, magicLinkIpLimiter } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { PENDING_EMAIL_COOKIE } from "@/modules/login/constants";

export async function sendMagicLink(formData: FormData): Promise<void> {
  // signIn's own redirectTo is already same-origin-restricted by Auth.js's
  // default redirect callback, but sanitizing at the point we read
  // client input is the right layer to own this, not a library default.
  const next = safeRedirectPath(formData.get("next")?.toString()); // bare, locale-free — see proxy.ts
  const backToLogin = async (error: string) => {
    const url = new URL("/login", "http://placeholder"); // origin unused, path+query only
    url.searchParams.set("next", next);
    url.searchParams.set("error", error);
    await redirect(url.pathname + url.search);
  };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) await backToLogin("missing_email");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!magicLinkEmailLimiter.attempt(email) || !magicLinkIpLimiter.attempt(ip)) {
    await backToLogin("rate_limited");
  }

  // Auth.js's redirect to the verify-request page only carries its own
  // `provider`/`type` query params, so `next` would otherwise be lost
  // between here and that screen — stash both alongside it.
  (await cookies()).set(PENDING_EMAIL_COOKIE, JSON.stringify({ email, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/login",
    maxAge: 15 * 60, // matches the magic link's own expiry
  });

  // Auth.js's redirectTo goes straight to the browser, bypassing next-intl's
  // Link/redirect helpers — so unlike every other redirect in this app, the
  // locale has to be added by hand here.
  const locale = await getLocale();
  await signIn("nodemailer", { email, redirectTo: `/${locale}${next}` });
}
