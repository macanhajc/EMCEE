import { useTranslations } from "next-intl";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";

export function BotDangerZone({
  isSubscribed,
  openBillingPortal,
  deleteInstance,
  name,
}: {
  isSubscribed: boolean;
  openBillingPortal: () => void;
  deleteInstance: (formData: FormData) => Promise<void>;
  name: string;
}) {
  const t = useTranslations("instanceDetail.dangerZone");
  const tDetail = useTranslations("instanceDetail");

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm leading-relaxed text-dust">{t("body")}</p>

      {isSubscribed ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-dust">{t("activeSubNote")}</p>
          <form action={openBillingPortal}>
            <Button
              type="submit"
              variant="outline"
              className="shrink-0 border-paper/15 bg-transparent cursor-pointer text-paper hover:bg-paper/10 hover:text-paper"
            >
              {tDetail("manageBilling")}
            </Button>
          </form>
        </div>
      ) : (
        <details className="mt-4 group/details">
          <summary className="cursor-pointer font-ui-mono text-[11px] tracking-widest text-red-400 uppercase select-none">
            {t("deleteSummary")}
          </summary>
          <form action={deleteInstance} className="mt-4 grid gap-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="confirm-delete"
                name="confirm"
                className="mt-0.5 border-paper/30 data-checked:border-red-500 data-checked:bg-red-500 data-checked:text-ink"
              />
              <label
                htmlFor="confirm-delete"
                className="text-sm leading-relaxed font-normal text-paper"
              >
                {t("confirmLabel", { name })}
              </label>
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="mt-1 justify-self-start cursor-pointer"
            >
              {t("deleteSubmit")}
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
