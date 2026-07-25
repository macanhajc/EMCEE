"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Label } from "@/components/UI/label";
import { useExemptions } from "../hooks/use-exemptions";
import { TagListInput } from "./tag-list-input";

// Same SSR-safe portal-target technique as anchor-spot-card.tsx — see its
// comment for why useSyncExternalStore rather than a useEffect+useState pair.
function subscribeNever() {
  return () => {};
}
function getBodySnapshot(): Element | null {
  return document.body;
}
function getServerBodySnapshot(): Element | null {
  return null;
}

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const EXEMPTIONS_FORM_ID = "moderation-exemptions-form";

/**
 * Moderation → Exemptions card — the whole card, chrome included. Fully
 * self-contained: fetches its own current designers_exempt/users via
 * useExemptions and owns its own save action, rather than being handed
 * `config.exemptions` down from the page's own server fetch. Rendered
 * directly in instance-config.tsx rather than driven through
 * `sections`/`SectionCard` — same move as the Avatar module's cards
 * (docs/decisions.md, 2026-07-24).
 *
 * No `enabled` toggle of its own (packages/schemas/emcee/v1.json) — every
 * field is always shown, a single Save button covers both, same shape
 * anchor-from-dashboard-card.tsx uses for the same reason.
 */
export function ExemptionsCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useExemptions(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);

  // Controlled rather than defaultChecked for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves.
  const [designersExempt, setDesignersExempt] = useState(true);
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setDesignersExempt(data.designers_exempt);
  }

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(tInstance("savedMessage"));
    } else {
      toast.error(tInstance.has(`errors.${state.error}`) ? tInstance(`errors.${state.error}`) : state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h3 className="font-display text-base text-paper">{t("exemptions.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("exemptions.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="exemptions-designers-exempt"
              form={EXEMPTIONS_FORM_ID}
              name="designers_exempt"
              checked={designersExempt}
              onCheckedChange={(checked) => setDesignersExempt(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <Label htmlFor="exemptions-designers-exempt" className="font-normal leading-5 text-paper">
              {t("exemptions.designersExemptLabel")}
            </Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="exemptions-users" className="text-dust">
              {t("exemptions.usersLabel")}
            </Label>
            <TagListInput
              id="exemptions-users"
              name="users"
              form={EXEMPTIONS_FORM_ID}
              defaultValue={data.users}
              placeholder={t("tagListPlaceholder")}
            />
          </div>

          <Button
            type="submit"
            form={EXEMPTIONS_FORM_ID}
            variant="outline"
            className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
          >
            {t("exemptions.save")}
          </Button>
        </div>
      )}

      {portalTarget && createPortal(<form id={EXEMPTIONS_FORM_ID} action={formAction} />, portalTarget)}
    </div>
  );
}
