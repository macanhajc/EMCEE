"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { openBillingPortal } from "@/app/[locale]/checkout/actions";
import { deleteInstance } from "@/app/[locale]/instances/[id]/actions";
import { useBotDangerZone } from "../hooks/use-bot-danger-zone";

/**
 * Status → Danger zone card — the whole card, chrome included. Fully
 * self-contained: fetches its own current isSubscribed/bot name via
 * useBotDangerZone rather than being handed them down from the page's own
 * server-rendered props. Rendered directly in instance-config.tsx's Status
 * tab, same self-contained shape every module's cards already use
 * (docs/decisions.md, 2026-07-24).
 *
 * `deleteInstance`/`openBillingPortal` are imported directly here rather
 * than routed through a hook — both are real redirects (deleting succeeds by
 * navigating away, since the page itself stops existing; the billing portal
 * always redirects to Stripe), neither fits the inline `useActionState`
 * pattern every other dedicated card action uses (see `getBotDangerZoneInfo`'s
 * own comment, actions.ts). `deleteInstance` still needs `instanceId` bound
 * in — done here client-side instead of pre-bound as a prop from the page.
 */
export function BotDangerZone({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.dangerZone");
  const tDetail = useTranslations("instanceDetail");
  const { data } = useBotDangerZone();

  if (!data) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
        <h2 className="font-display text-base text-paper">{t("title")}</h2>
        <p className="mt-4 text-sm text-dust">{tDetail("loading")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm leading-relaxed text-dust">{t("body")}</p>

      {data.isSubscribed ? (
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
          <form action={deleteInstance.bind(null, instanceId)} className="mt-4 grid gap-3">
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
                {t("confirmLabel", { name: data.botName })}
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
