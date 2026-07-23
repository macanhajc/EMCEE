import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/Elements/auth-shell";
import { Button } from "@/components/UI/button";
import { Link } from "@/i18n/navigation";

export function VerifyRequestTemplate({ email, next }: { email?: string; next: string }) {
  const t = useTranslations("verifyRequest");

  return (
    <AuthShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={email ? t("subtitleWithEmail", { email }) : t("subtitleGeneric")}
    >
      <p className="font-marquee-body text-sm leading-relaxed text-dust">{t("body")}</p>

      <Button asChild variant="outline" className="mt-6 h-11 w-full border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper">
        <Link href={`/login?next=${encodeURIComponent(next)}`}>{t("useDifferentEmail")}</Link>
      </Button>
    </AuthShell>
  );
}
