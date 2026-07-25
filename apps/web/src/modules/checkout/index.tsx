import { ArrowLeft, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthShell } from "@/components/Elements/auth-shell";
import { Alert, AlertDescription } from "@/components/UI/alert";
import { Button } from "@/components/UI/button";
import type { EmceePrices } from "@/lib/pricing";
import { PlanOption } from "./components/plan-option";

export function CheckoutTemplate({
  botName,
  instanceId,
  roomId,
  error,
  prices,
  startCheckout,
}: {
  botName: string;
  instanceId: string;
  roomId: string;
  error?: string;
  prices: EmceePrices;
  startCheckout: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("checkout");

  return (
    <AuthShell eyebrow={t("eyebrow")} title={botName} subtitle={t("roomSubtitle", { roomId })} maxWidth="max-w-lg">
      <Link
        href={`/instances/${instanceId}`}
        className="mb-5 inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust hover:text-paper"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {t("back")}
      </Link>

      {error && (
        <Alert className="mb-5 border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
          </AlertDescription>
        </Alert>
      )}

      <form action={startCheckout} className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <PlanOption
            id="plan-monthly"
            value="monthly"
            defaultChecked
            label={t("plans.monthly.label")}
            price={prices.monthly.brl}
            period="/mo"
            reference={`${prices.monthly.usd} reference`}
          />
          <PlanOption
            id="plan-annual"
            value="annual"
            label={t("plans.annual.label")}
            price={prices.annual.brl}
            period="/yr"
            reference={`${prices.annual.usd} reference`}
            badge={t("plans.annual.badge")}
          />
        </div>

        <p className="font-marquee-body text-xs leading-relaxed text-dust">{t("billingNote")}</p>

        <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
          {t("continueToPayment")}
        </Button>

        <p className="flex items-center justify-center gap-1.5 font-ui-mono text-[11px] text-dust">
          <Lock aria-hidden className="size-3 text-marquee" />
          {t("stripeNote")}
        </p>
      </form>
    </AuthShell>
  );
}
