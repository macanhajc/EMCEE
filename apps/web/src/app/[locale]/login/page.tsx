import { getLocale } from "next-intl/server";
import { signIn } from "@/auth";
import { LoginTemplate } from "@/modules/login";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeRedirectPath(rawNext); // bare, locale-free — see proxy.ts

  async function signInWithGoogle() {
    "use server";
    // Auth.js's redirectTo bypasses next-intl's redirect helper, so the
    // locale has to be added by hand — see the matching comment in
    // login/actions.ts's sendMagicLink.
    const locale = await getLocale();
    await signIn("google", { redirectTo: `/${locale}${next}` });
  }

  return (
    <LoginTemplate
      next={next}
      error={error}
      signInWithGoogle={signInWithGoogle}
      sendMagicLink={sendMagicLink}
    />
  );
}
