import { signIn } from "@/auth";
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
    <main style={{ maxWidth: 360, margin: "4rem auto", display: "grid", gap: 24 }}>
      <h1>Sign in</h1>
      {error && <p role="alert">{ERROR_MESSAGES[error] ?? "Something went wrong."}</p>}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: next });
        }}
      >
        <button type="submit">Continue with Google</button>
      </form>

      <p style={{ textAlign: "center", opacity: 0.6 }}>or</p>

      <form action={sendMagicLink} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required placeholder="you@example.com" />
        <button type="submit">Send magic link</button>
      </form>
    </main>
  );
}
