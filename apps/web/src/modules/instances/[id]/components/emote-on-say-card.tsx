"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useEmoteOnSay } from "../hooks/use-emote-on-say";
import { EmotePicker } from "./emote-picker";
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

// Matches packages/schemas/emcee/v1.json's emote_on_say.cooldown_s bounds —
// this card no longer goes through sectionsFromSchema, so this is
// hand-kept in sync rather than derived, same tradeoff the other extracted
// cards already made for their own schema-derived bounds/enums.
const COOLDOWN_S_MIN = 0;
const COOLDOWN_S_MAX = 60;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const EMOTE_ON_SAY_FORM_ID = "emotes-emote-on-say-form";

/**
 * Emotes → Emote on say card — the whole card, chrome included. Fully
 * self-contained: fetches its own current settings via useEmoteOnSay and
 * owns its own save action, rather than being handed `config.emote_on_say`
 * down from the page's own server fetch. Rendered directly in
 * instance-config.tsx rather than driven through `sections`/`SectionCard` —
 * same move as the Avatar/Moderation/Greeter modules' cards
 * (docs/decisions.md, 2026-07-24) — the last module to get this treatment.
 */
export function EmoteOnSayCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useEmoteOnSay(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  // Local, editable copy of the fetched values — seeded from `data` during
  // render (not an effect) so a fresh fetch (first load, or the refetch
  // after a successful save) updates it without fighting an in-progress
  // edit. Controlled rather than defaultValue for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves.
  const [enabled, setEnabled] = useState(false);
  const [cooldownS, setCooldownS] = useState<number | "">("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data.enabled);
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
      <h3 className="font-display text-base text-paper">{t("emoteOnSay.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("emoteOnSay.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="emote-on-say-enabled"
              form={EMOTE_ON_SAY_FORM_ID}
              name="enabled"
              checked={enabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <Label htmlFor="emote-on-say-enabled" className="font-normal leading-5 text-paper">
              {t("emoteOnSay.enabledLabel")}
            </Label>
          </div>

          <div className={`grid gap-5 border-t border-paper/10 pt-5 ${enabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="emote-on-say-cooldown" className="text-dust">
                {t("emoteOnSay.cooldownLabel")}
              </Label>
              <Input
                id="emote-on-say-cooldown"
                form={EMOTE_ON_SAY_FORM_ID}
                name="cooldown_s"
                type="number"
                min={COOLDOWN_S_MIN}
                max={COOLDOWN_S_MAX}
                value={cooldownS}
                onChange={(e) => setCooldownS(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="emote-on-say-disabled-emotes" className="text-dust">
                {t("emoteOnSay.disabledEmotesLabel")}
              </Label>
              <EmotePicker
                id="emote-on-say-disabled-emotes"
                name="disabled_emotes"
                form={EMOTE_ON_SAY_FORM_ID}
                defaultValue={data.disabled_emotes}
              />
              {/* t.raw(), not t() — this description quotes the literal
                  "all <emote>"/"loop <emote>" command syntax, not something
                  next-intl itself should interpolate. Same class of fix as
                  outfit-clone-card.tsx's description (docs/decisions.md,
                  2026-07-24). */}
              <p className="text-xs text-dust">{t.raw("emoteOnSay.disabledEmotesDescription")}</p>
            </div>

            <Button
              type="submit"
              form={EMOTE_ON_SAY_FORM_ID}
              variant="outline"
              className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("emoteOnSay.save")}
            </Button>
          </div>
        </div>
      )}

      {portalTarget &&
        createPortal(<form id={EMOTE_ON_SAY_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
