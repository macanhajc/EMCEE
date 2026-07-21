import Link from "next/link";
import { cookies } from "next/headers";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { PENDING_EMAIL_COOKIE } from "../constants";

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

  return (
    <AuthShell
      eyebrow="Account access"
      title="Check your email"
      subtitle={
        email
          ? `We sent a sign-in link to ${email}. It expires in 15 minutes and works once.`
          : "We sent a sign-in link to your email address. It expires in 15 minutes and works once."
      }
    >
      <p className="font-marquee-body text-sm leading-relaxed text-dust">
        Didn&apos;t get it? Check spam, or give it a minute — delivery can lag.
      </p>

      <Button asChild variant="outline" className="mt-6 h-11 w-full border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper">
        <Link href={`/login?next=${encodeURIComponent(next)}`}>Use a different email</Link>
      </Button>
    </AuthShell>
  );
}
