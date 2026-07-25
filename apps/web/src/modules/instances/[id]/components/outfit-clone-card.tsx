"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useOutfitClone } from "../hooks/use-outfit-clone";
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

// Matches packages/schemas/emcee/v1.json's outfit_clone.min_match bounds —
// this card no longer goes through sectionsFromSchema, so these are
// hand-kept in sync rather than derived, same tradeoff the other extracted
// cards already made for their own schema-derived bounds/enums.
const MIN_MATCH_MIN = 1;
const MIN_MATCH_MAX = 20;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const OUTFIT_CLONE_FORM_ID = "avatar-outfit-clone-form";

/**
 * Avatar → Copy a look card — the whole card, chrome included. Fully
 * self-contained: fetches its own current enabled/min_match via
 * useOutfitClone and owns its own save action, rather than being handed
 * `config.outfit_clone` down from the page's server fetch. Rendered directly
 * in instance-config.tsx rather than driven through `sections`/`SectionCard`
 * — same move as the other Avatar cards (docs/decisions.md, 2026-07-24) —
 * the last Avatar-module section to get this treatment.
 *
 * "Who can trigger it" (`permission`/`allowlist`) was removed 2026-07-24 —
 * only the bot owner can use "copy <username>" now, no dashboard control
 * needed; `updateOutfitCloneConfig` pins those to owner-only on every save
 * regardless of what's submitted.
 */
export function OutfitCloneCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useOutfitClone(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  // Local, editable copy of the fetched values — seeded from `data` during
  // render (not an effect) so a fresh fetch (first load, or the refetch
  // after a successful save) updates it without fighting an in-progress
  // edit. See anchor-spot-card.tsx for the same pattern on `enabled`.
  // Controlled rather than defaultValue for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves,
  // which would snap min_match back to its pre-save value the instant a
  // save completes (this hook's own refetch hasn't necessarily landed yet
  // at that exact point).
  const [enabled, setEnabled] = useState(false);
  const [minMatch, setMinMatch] = useState<number | "">("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data.enabled);
    setMinMatch(data.min_match);
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
      <h3 className="font-display text-base text-paper">{t("outfitClone.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t.raw("outfitClone.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="outfit-clone-enabled"
              form={OUTFIT_CLONE_FORM_ID}
              name="enabled"
              checked={enabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <Label htmlFor="outfit-clone-enabled" className="font-normal leading-5 text-paper">
              {t("outfitClone.enabledLabel")}
            </Label>
          </div>

          <div className={`grid gap-5 border-t border-paper/10 pt-5 ${enabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="outfit-clone-min-match" className="text-dust">
                {t("outfitClone.minMatchLabel")}
              </Label>
              <Input
                id="outfit-clone-min-match"
                form={OUTFIT_CLONE_FORM_ID}
                name="min_match"
                type="number"
                min={MIN_MATCH_MIN}
                max={MIN_MATCH_MAX}
                value={minMatch}
                onChange={(e) => setMinMatch(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t("outfitClone.minMatchDescription")}</p>
            </div>

            <Button
              type="submit"
              form={OUTFIT_CLONE_FORM_ID}
              variant="outline"
              className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("outfitClone.save")}
            </Button>
          </div>
        </div>
      )}

      {portalTarget &&
        createPortal(<form id={OUTFIT_CLONE_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
