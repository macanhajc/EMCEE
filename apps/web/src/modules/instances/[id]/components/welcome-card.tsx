"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useWelcome } from "../hooks/use-welcome";
import { fieldControlClass } from "./field-control-class";
import { TemplateListInput } from "./template-list-input";

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

// Matches packages/schemas/emcee/v1.json's welcome bounds — this card no
// longer goes through sectionsFromSchema, so these are hand-kept in sync
// rather than derived, same tradeoff the other extracted cards already made
// for their own schema-derived bounds/enums.
const TEMPLATES_MAX_ITEMS = 10;
const COOLDOWN_H_MIN = 0;
const COOLDOWN_H_MAX = 168;
const BUSY_MODE_JOINS_MIN = 5;
const BUSY_MODE_JOINS_MAX = 60;
const QUIET_HOURS_TZ_MAX_LENGTH = 64;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const WELCOME_FORM_ID = "greeter-welcome-form";

/**
 * Greeter → Welcome messages card — the whole card, chrome included. Fully
 * self-contained: fetches its own current settings via useWelcome and owns
 * its own save action, rather than being handed `config.welcome` down from
 * the page's own server fetch. Rendered directly in instance-config.tsx
 * rather than driven through `sections`/`SectionCard` — same move as the
 * Avatar and Moderation modules' cards (docs/decisions.md, 2026-07-24).
 *
 * Two local, client-side-only gates nested inside the `enabled`-gated
 * content, same idea as `StrikeEscalationCard`'s `ban_enabled`: neither
 * `busy_mode_enabled` nor `quiet_hours_enabled` is a section-level toggle in
 * its own right, they just show/hide their own dependent fields (the
 * schema's `x-enabled-by`) and submit with everything else on this card's
 * one Save button.
 */
export function WelcomeCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useWelcome(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  // Local, editable copy of the fetched values — seeded from `data` during
  // render (not an effect) so a fresh fetch (first load, or the refetch
  // after a successful save) updates it without fighting an in-progress
  // edit. Controlled rather than defaultValue for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves.
  const [enabled, setEnabled] = useState(false);
  const [cooldownH, setCooldownH] = useState<number | "">("");
  const [busyModeEnabled, setBusyModeEnabled] = useState(false);
  const [busyModeJoinsPerMin, setBusyModeJoinsPerMin] = useState<number | "">("");
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("");
  const [quietHoursEnd, setQuietHoursEnd] = useState("");
  const [quietHoursTz, setQuietHoursTz] = useState("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data.enabled);
    setCooldownH(data.cooldown_h);
    setBusyModeEnabled(data.busy_mode_enabled);
    setBusyModeJoinsPerMin(data.busy_mode_joins_per_min);
    setQuietHoursEnabled(data.quiet_hours_enabled);
    setQuietHoursStart(data.quiet_hours_start);
    setQuietHoursEnd(data.quiet_hours_end);
    setQuietHoursTz(data.quiet_hours_tz);
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
    setEnabled(checked);
    // Radix's Checkbox mirrors `checked` onto its hidden native input via a
    // passive effect (after paint — not synchronously, not within a
    // microtask), so requestSubmit() called right after setEnabled would
    // read that hidden input's *stale*, pre-toggle value. Building FormData
    // ourselves and forcing `enabled` from the value we just set (not
    // whatever the DOM says yet) sidesteps that race entirely — the rest of
    // the fields still come from the form's current state.
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    if (checked) {
      formData.set("enabled", "on");
    } else {
      formData.delete("enabled");
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
      <h3 className="font-display text-base text-paper">{t("welcome.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("welcome.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="welcome-enabled"
              form={WELCOME_FORM_ID}
              name="enabled"
              checked={enabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <Label htmlFor="welcome-enabled" className="font-normal leading-5 text-paper">
              {t("welcome.enabledLabel")}
            </Label>
          </div>

          <div className={`grid gap-5 border-t border-paper/10 pt-5 ${enabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="welcome-templates" className="text-dust">
                {t("welcome.templatesLabel")}
              </Label>
              {/* t.raw(), not t() — these two strings document the literal
                  {username}/{room_name} template-variable syntax the runtime
                  substitutes into a saved greeting, not something next-intl
                  itself should interpolate. Same class of fix as
                  outfit-clone-card.tsx's description (docs/decisions.md,
                  2026-07-24), ICU's `{word}` syntax instead of `<tag>`. */}
              <TemplateListInput
                id="welcome-templates"
                name="templates"
                form={WELCOME_FORM_ID}
                defaultValue={data.templates}
                maxItems={TEMPLATES_MAX_ITEMS}
                placeholder={t.raw("welcome.templatePlaceholder")}
              />
              <p className="text-xs text-dust">{t.raw("welcome.templatesDescription")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="welcome-cooldown" className="text-dust">
                {t("welcome.cooldownLabel")}
              </Label>
              <Input
                id="welcome-cooldown"
                form={WELCOME_FORM_ID}
                name="cooldown_h"
                type="number"
                min={COOLDOWN_H_MIN}
                max={COOLDOWN_H_MAX}
                value={cooldownH}
                onChange={(e) => setCooldownH(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t("welcome.cooldownDescription")}</p>
            </div>

            <div className="grid gap-5 border-t border-paper/10 pt-5">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="welcome-busy-mode-enabled"
                  form={WELCOME_FORM_ID}
                  name="busy_mode_enabled"
                  checked={busyModeEnabled}
                  onCheckedChange={(checked) => setBusyModeEnabled(checked === true)}
                  className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
                />
                <div>
                  <Label htmlFor="welcome-busy-mode-enabled" className="font-normal leading-5 text-paper">
                    {t("welcome.busyModeEnabledLabel")}
                  </Label>
                  <p className="mt-1 text-xs text-dust">{t("welcome.busyModeEnabledDescription")}</p>
                </div>
              </div>

              <div className={`grid gap-2 ${busyModeEnabled ? "" : "hidden"}`}>
                <Label htmlFor="welcome-busy-mode-joins" className="text-dust">
                  {t("welcome.busyModeJoinsLabel")}
                </Label>
                <Input
                  id="welcome-busy-mode-joins"
                  form={WELCOME_FORM_ID}
                  name="busy_mode_joins_per_min"
                  type="number"
                  min={BUSY_MODE_JOINS_MIN}
                  max={BUSY_MODE_JOINS_MAX}
                  value={busyModeJoinsPerMin}
                  onChange={(e) => setBusyModeJoinsPerMin(e.target.value === "" ? "" : Number(e.target.value))}
                  className={`h-10 max-w-40 ${fieldControlClass}`}
                />
              </div>
            </div>

            <div className="grid gap-5 border-t border-paper/10 pt-5">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="welcome-quiet-hours-enabled"
                  form={WELCOME_FORM_ID}
                  name="quiet_hours_enabled"
                  checked={quietHoursEnabled}
                  onCheckedChange={(checked) => setQuietHoursEnabled(checked === true)}
                  className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
                />
                <div>
                  <Label htmlFor="welcome-quiet-hours-enabled" className="font-normal leading-5 text-paper">
                    {t("welcome.quietHoursEnabledLabel")}
                  </Label>
                  <p className="mt-1 text-xs text-dust">{t("welcome.quietHoursEnabledDescription")}</p>
                </div>
              </div>

              <div className={`grid gap-5 ${quietHoursEnabled ? "" : "hidden"}`}>
                <div className="flex gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="welcome-quiet-hours-start" className="text-dust">
                      {t("welcome.quietHoursStartLabel")}
                    </Label>
                    <Input
                      id="welcome-quiet-hours-start"
                      form={WELCOME_FORM_ID}
                      name="quiet_hours_start"
                      type="time"
                      value={quietHoursStart}
                      onChange={(e) => setQuietHoursStart(e.target.value)}
                      className={`h-10 ${fieldControlClass}`}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="welcome-quiet-hours-end" className="text-dust">
                      {t("welcome.quietHoursEndLabel")}
                    </Label>
                    <Input
                      id="welcome-quiet-hours-end"
                      form={WELCOME_FORM_ID}
                      name="quiet_hours_end"
                      type="time"
                      value={quietHoursEnd}
                      onChange={(e) => setQuietHoursEnd(e.target.value)}
                      className={`h-10 ${fieldControlClass}`}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="welcome-quiet-hours-tz" className="text-dust">
                    {t("welcome.quietHoursTzLabel")}
                  </Label>
                  <Input
                    id="welcome-quiet-hours-tz"
                    form={WELCOME_FORM_ID}
                    name="quiet_hours_tz"
                    type="text"
                    maxLength={QUIET_HOURS_TZ_MAX_LENGTH}
                    value={quietHoursTz}
                    onChange={(e) => setQuietHoursTz(e.target.value)}
                    className={`h-10 max-w-56 ${fieldControlClass}`}
                  />
                  <p className="text-xs text-dust">{t("welcome.quietHoursTzDescription")}</p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              form={WELCOME_FORM_ID}
              variant="outline"
              className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("welcome.save")}
            </Button>
          </div>
        </div>
      )}

      {portalTarget && createPortal(<form id={WELCOME_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
