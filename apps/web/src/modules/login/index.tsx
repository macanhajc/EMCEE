import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/Elements/auth-shell";
import { Alert, AlertDescription } from "@/components/UI/alert";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { GoogleIcon } from "./components/google-icon";

export function LoginTemplate({
  next,
  error,
  signInWithGoogle,
  sendMagicLink,
}: {
  next: string;
  error?: string;
  signInWithGoogle: () => Promise<void>;
  sendMagicLink: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("login");

  return (
    <AuthShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {error && (
        <Alert className="mb-5 border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
          </AlertDescription>
        </Alert>
      )}

      {/* DISABLED for now */}
      {/* <form action={signInWithGoogle}>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full gap-2.5 border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
        >
          <GoogleIcon className="size-4" />
          {t("continueWithGoogle")}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-paper/10" />
        <span className="font-ui-mono text-[11px] text-dust uppercase">{t("or")}</span>
        <span aria-hidden className="h-px flex-1 bg-paper/10" />
      </div> */}

      <form action={sendMagicLink} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-1.5">
          <Label htmlFor="email" className="text-dust">
            {t("emailLabel")}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder={t("emailPlaceholder")}
            className="h-11 border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30"
          />
        </div>
        <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
          {t("sendMagicLink")}
        </Button>
      </form>
    </AuthShell>
  );
}
