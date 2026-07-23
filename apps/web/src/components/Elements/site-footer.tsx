import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer className="border-t border-paper/10">
      <div className="flex flex-col px-4 py-12 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-sm text-paper"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-spotlight" />
            {t("common.brand")}
          </Link>

          <div className="flex flex-wrap gap-6 font-marquee-body text-sm text-dust">
            <Link href="/#the-act" className="transition-colors hover:text-paper">
              {t("nav.theBot")}
            </Link>
            <Link href="/#how-it-works" className="transition-colors hover:text-paper">
              {t("nav.howItWorks")}
            </Link>
            <Link href="/#pricing" className="transition-colors hover:text-paper">
              {t("nav.pricing")}
            </Link>
            <Link href="/login" className="transition-colors hover:text-paper">
              {t("common.loginLink")}
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-paper">
              {t("footer.privacy")}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-paper">
              {t("footer.terms")}
            </Link>
          </div>
        </div>

        <p className="mt-8 font-ui-mono text-xs text-dust">{t("footer.disclaimer")}</p>
      </div>
    </footer>
  );
}
