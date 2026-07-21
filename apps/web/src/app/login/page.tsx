import { signIn } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { sendMagicLink } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  missing_email: "Enter an email address.",
  rate_limited: "Too many attempts — try again in a few minutes.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeRedirectPath(rawNext);

  return (
    <AuthShell
      eyebrow="Account access"
      title="Sign in"
      subtitle="One account for your dashboard, your bots, and your billing."
    >
      {error && (
        <Alert className="mb-5 border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {ERROR_MESSAGES[error] ?? "Something went wrong."}
          </AlertDescription>
        </Alert>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: next });
        }}
      >
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full gap-2.5 border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
        >
          <GoogleIcon className="size-4" />
          Continue with Google
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-paper/10" />
        <span className="font-ui-mono text-[11px] text-dust uppercase">or</span>
        <span aria-hidden className="h-px flex-1 bg-paper/10" />
      </div>

      <form action={sendMagicLink} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-1.5">
          <Label htmlFor="email" className="text-dust">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="h-11 border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30"
          />
        </div>
        <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
          Send magic link
        </Button>
      </form>
    </AuthShell>
  );
}
