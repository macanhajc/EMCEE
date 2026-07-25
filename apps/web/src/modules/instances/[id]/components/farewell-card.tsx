"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useFarewell } from "../hooks/use-farewell";
import { fieldControlClass } from "./field-control-class";

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

// Matches packages/schemas/emcee/v1.json's farewell.min_visits bounds — this
// card no longer goes through sectionsFromSchema, so this is hand-kept in
// sync rather than derived, same tradeoff the other extracted cards already
// made for their own schema-derived bounds/enums.
const MIN_VISITS_MIN = 1;
const MIN_VISITS_MAX = 100;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const FAREWELL_FORM_ID = "greeter-farewell-form";

/**
 * Greeter → Farewell card — the whole card, chrome included. Fully
 * self-contained: fetches its own current settings via useFarewell and owns
 * its own save action, rather than being handed `config.farewell` down from
 * the page's own server fetch. Rendered directly in instance-config.tsx
 * rather than driven through `sections`/`SectionCard` — same move as the
 * Avatar and Moderation modules' cards (docs/decisions.md, 2026-07-24).
 *
 * `log_enabled` isn't literally named `enabled` (the only section like this
 * across Greeter/Moderation), but it functions identically — treated the
 * same way as every other section's own on/off switch (auto-save on toggle,
 * content hidden while off), since `min_visits`/`public_message`/
 * `public_template` are all meaningless while farewell logging itself is
 * off. `public_message` is a second, nested gate — not a toggle of its own,
 * it just shows/hides `public_template` (the schema's `x-enabled-by`) and
 * submits with everything else on this card's one Save button, same idea as
 * WelcomeCard's `busy_mode_enabled`/`quiet_hours_enabled`.
 */
export function FarewellCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useFarewell(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  const [logEnabled, setLogEnabled] = useState(false);
  const [minVisits, setMinVisits] = useState<number | "">("");
  const [publicMessage, setPublicMessage] = useState(false);
  const [publicTemplate, setPublicTemplate] = useState("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setLogEnabled(data.log_enabled);
    setMinVisits(data.min_visits);
    setPublicMessage(data.public_message);
    setPublicTemplate(data.public_template);
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

  function handleToggle(checked: boolean) {
    setLogEnabled(checked);
    // Radix's Checkbox mirrors `checked` onto its hidden native input via a
    // passive effect (after paint — not synchronously, not within a
    // microtask), so requestSubmit() called right after setLogEnabled would
    // read that hidden input's *stale*, pre-toggle value. Building FormData
    // ourselves and forcing `log_enabled` from the value we just set (not
    // whatever the DOM says yet) sidesteps that race entirely — the rest of
    // the fields still come from the form's current state.
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    if (checked) {
      formData.set("log_enabled", "on");
    } else {
      formData.delete("log_enabled");
    }
    // useActionState's dispatch expects to run inside a transition when
    // called directly like this (not via a <form>/formAction prop) — skip
    // it and React warns "called outside of a transition" and isPending
    // won't track correctly.
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h3 className="font-display text-base text-paper">{t("farewell.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("farewell.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="farewell-log-enabled"
              form={FAREWELL_FORM_ID}
              name="log_enabled"
              checked={logEnabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <Label htmlFor="farewell-log-enabled" className="font-normal leading-5 text-paper">
              {t("farewell.logEnabledLabel")}
            </Label>
          </div>

          <div className={`grid gap-5 border-t border-paper/10 pt-5 ${logEnabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="farewell-min-visits" className="text-dust">
                {t("farewell.minVisitsLabel")}
              </Label>
              <Input
                id="farewell-min-visits"
                form={FAREWELL_FORM_ID}
                name="min_visits"
                type="number"
                min={MIN_VISITS_MIN}
                max={MIN_VISITS_MAX}
                value={minVisits}
                onChange={(e) => setMinVisits(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
            </div>

            <div className="grid gap-5 border-t border-paper/10 pt-5">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="farewell-public-message"
                  form={FAREWELL_FORM_ID}
                  name="public_message"
                  checked={publicMessage}
                  onCheckedChange={(checked) => setPublicMessage(checked === true)}
                  className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
                />
                <div>
                  <Label htmlFor="farewell-public-message" className="font-normal leading-5 text-paper">
                    {t("farewell.publicMessageLabel")}
                  </Label>
                  <p className="mt-1 text-xs text-dust">{t("farewell.publicMessageDescription")}</p>
                </div>
              </div>

              <div className={`grid gap-2 ${publicMessage ? "" : "hidden"}`}>
                <Label htmlFor="farewell-public-template" className="text-dust">
                  {t("farewell.publicTemplateLabel")}
                </Label>
                <Input
                  id="farewell-public-template"
                  form={FAREWELL_FORM_ID}
                  name="public_template"
                  type="text"
                  maxLength={200}
                  value={publicTemplate}
                  onChange={(e) => setPublicTemplate(e.target.value)}
                  className={`h-10 ${fieldControlClass}`}
                />
              </div>
            </div>

            <Button
              type="submit"
              form={FAREWELL_FORM_ID}
              variant="outline"
              className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("farewell.save")}
            </Button>
          </div>
        </div>
      )}

      {portalTarget &&
        createPortal(<form id={FAREWELL_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
