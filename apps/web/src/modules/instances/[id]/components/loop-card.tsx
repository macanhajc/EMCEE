"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useLoop } from "../hooks/use-loop";
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

// Matches packages/schemas/emcee/v1.json's loop bounds — this card no
// longer goes through sectionsFromSchema, so these are hand-kept in sync
// rather than derived, same tradeoff the other extracted cards already made
// for their own schema-derived bounds/enums.
const INTERVAL_S_MIN = 5;
const INTERVAL_S_MAX = 60;
const MAX_DURATION_S_MIN = 60;
const MAX_DURATION_S_MAX = 7200;
const COOLDOWN_S_MIN = 0;
const COOLDOWN_S_MAX = 120;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const LOOP_FORM_ID = "emotes-loop-form";

/**
 * Emotes → Loop card — the whole card, chrome included. Fully
 * self-contained: fetches its own current settings via useLoop and owns its
 * own save action, rather than being handed `config.loop` down from the
 * page's own server fetch. Rendered directly in instance-config.tsx rather
 * than driven through `sections`/`SectionCard` — same move as the
 * Avatar/Moderation/Greeter modules' cards (docs/decisions.md, 2026-07-24) —
 * the last module to get this treatment.
 */
export function LoopCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useLoop(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  const [enabled, setEnabled] = useState(false);
  const [intervalS, setIntervalS] = useState<number | "">("");
  const [maxDurationS, setMaxDurationS] = useState<number | "">("");
  const [cooldownS, setCooldownS] = useState<number | "">("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data.enabled);
    setIntervalS(data.interval_s);
    setMaxDurationS(data.max_duration_s);
    setCooldownS(data.cooldown_s);
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
      <h3 className="font-display text-base text-paper">{t("loop.title")}</h3>
      {/* t.raw(), not t() — quotes the literal "loop <emote>" command
          syntax, not something next-intl itself should interpolate. Same
          class of fix as outfit-clone-card.tsx's description
          (docs/decisions.md, 2026-07-24). */}
      <p className="mt-1 text-sm text-dust">{t.raw("loop.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="loop-enabled"
              form={LOOP_FORM_ID}
              name="enabled"
              checked={enabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <div>
              <Label htmlFor="loop-enabled" className="font-normal leading-5 text-paper">
                {t("loop.enabledLabel")}
              </Label>
              {/* t.raw() — same "loop <emote>" literal-syntax reason as
                  loop.description above. */}
              <p className="mt-1 text-xs text-dust">{t.raw("loop.enabledDescription")}</p>
            </div>
          </div>

          <div className={`grid gap-5 border-t border-paper/10 pt-5 ${enabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="loop-interval" className="text-dust">
                {t("loop.intervalLabel")}
              </Label>
              <Input
                id="loop-interval"
                form={LOOP_FORM_ID}
                name="interval_s"
                type="number"
                min={INTERVAL_S_MIN}
                max={INTERVAL_S_MAX}
                value={intervalS}
                onChange={(e) => setIntervalS(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="loop-max-duration" className="text-dust">
                {t("loop.maxDurationLabel")}
              </Label>
              <Input
                id="loop-max-duration"
                form={LOOP_FORM_ID}
                name="max_duration_s"
                type="number"
                min={MAX_DURATION_S_MIN}
                max={MAX_DURATION_S_MAX}
                value={maxDurationS}
                onChange={(e) => setMaxDurationS(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t("loop.maxDurationDescription")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="loop-cooldown" className="text-dust">
                {t("loop.cooldownLabel")}
              </Label>
              <Input
                id="loop-cooldown"
                form={LOOP_FORM_ID}
                name="cooldown_s"
                type="number"
                min={COOLDOWN_S_MIN}
                max={COOLDOWN_S_MAX}
                value={cooldownS}
                onChange={(e) => setCooldownS(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t("loop.cooldownDescription")}</p>
            </div>

            <Button
              type="submit"
              form={LOOP_FORM_ID}
              variant="outline"
              className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("loop.save")}
            </Button>
          </div>
        </div>
      )}

      {portalTarget && createPortal(<form id={LOOP_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
