"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { magicLinkEmailLimiter, magicLinkIpLimiter } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function sendMagicLink(formData: FormData): Promise<void> {
  // signIn's own redirectTo is already same-origin-restricted by Auth.js's
  // default redirect callback, but sanitizing at the point we read
  // client input is the right layer to own this, not a library default.
  const next = safeRedirectPath(formData.get("next")?.toString());
  const backToLogin = (error: string) => {
    const url = new URL("/login", "http://placeholder"); // origin unused, path+query only
    url.searchParams.set("next", next);
    url.searchParams.set("error", error);
    redirect(url.pathname + url.search);
  };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) backToLogin("missing_email");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!magicLinkEmailLimiter.attempt(email) || !magicLinkIpLimiter.attempt(ip)) {
    backToLogin("rate_limited");
  }

  await signIn("nodemailer", { email, redirectTo: next });
}
