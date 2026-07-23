import { cookies } from "next/headers";
import { VerifyRequestTemplate } from "@/modules/login/verify-request";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { PENDING_EMAIL_COOKIE } from "@/modules/login/constants";

export default async function VerifyRequestPage() {
  const raw = (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
  let email: string | undefined;
  let next = "/dashboard";
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { email?: string; next?: string };
      email = parsed.email;
      next = safeRedirectPath(parsed.next);
    } catch {
      // Pre-this-change cookie shape (bare email string) or corrupt value —
      // fall back to generic copy rather than throwing on a login screen.
    }
  }

  return <VerifyRequestTemplate email={email} next={next} />;
}
