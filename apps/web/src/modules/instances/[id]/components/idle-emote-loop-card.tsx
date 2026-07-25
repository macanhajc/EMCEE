"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useIdleEmoteLoop } from "../hooks/use-idle-emote-loop";
import { EmoteSelect } from "./emote-select";
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

// Matches packages/schemas/emcee/v1.json's idle_emote.interval_s bounds —
// this card no longer goes through sectionsFromSchema, so these are
// hand-kept in sync rather than derived, same tradeoff the other extracted
// cards already made for their own schema-derived bounds/enums.
const INTERVAL_MIN = 30;
const INTERVAL_MAX = 600;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const IDLE_EMOTE_FORM_ID = "avatar-idle-emote-form";

/**
 * Avatar → Idle emote loop card — the whole card, chrome included. Fully
 * self-contained: fetches its own current enabled/emote/interval via
 * useIdleEmoteLoop and owns its own save action, rather than being handed
 * `config.idle_emote` down from the page's server fetch. Rendered directly
 * in instance-config.tsx rather than driven through `sections`/`SectionCard`
 * — same move as AnchorSpotCard (docs/decisions.md, 2026-07-23): its own
 * title/description are hand-written here instead of schema-derived, since
 * there's nothing left for SectionCard to add. Unlike Anchor spot's two
 * sub-cards, this is a single function — `enabled` moves with it here
 * rather than staying on the generic form.
 */
export function IdleEmoteLoopCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useIdleEmoteLoop(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  // Local, editable copy of the fetched values — seeded from `data` during
  // render (not an effect) so a fresh fetch (first load, or the refetch
  // after a successful save) updates it without fighting an in-progress
  // edit. See anchor-spot-card.tsx for the same pattern on `enabled`.
  // Controlled rather than defaultValue for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves,
  // which would snap emote_id/interval_s back to their pre-save value the
  // instant a save completes (this hook's own refetch hasn't necessarily
  // landed yet at that exact point).
  const [enabled, setEnabled] = useState(false);
  const [emoteId, setEmoteId] = useState("");
  const [intervalS, setIntervalS] = useState<number | "">("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data.enabled);
    setEmoteId(data.emote_id);
    setIntervalS(data.interval_s);
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
      <h3 className="font-display text-base text-paper">{t("idleEmote.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("idleEmote.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="idle-emote-enabled"
              form={IDLE_EMOTE_FORM_ID}
              name="enabled"
              checked={enabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <div>
              <Label htmlFor="idle-emote-enabled" className="font-normal leading-5 text-paper">
                {t("idleEmote.enabledLabel")}
              </Label>
              <p className="mt-1 text-xs text-dust">{t("idleEmote.enabledDescription")}</p>
            </div>
          </div>

          <div className={`grid gap-5 border-t border-paper/10 pt-5 ${enabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="idle-emote-id" className="text-dust">
                {t("idleEmote.emoteLabel")}
              </Label>
              <EmoteSelect
                id="idle-emote-id"
                form={IDLE_EMOTE_FORM_ID}
                name="emote_id"
                value={emoteId}
                onChange={setEmoteId}
              />
              <p className="text-xs text-dust">{t("idleEmote.emoteDescription")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="idle-emote-interval" className="text-dust">
                {t("idleEmote.intervalLabel")}
              </Label>
              <Input
                id="idle-emote-interval"
                form={IDLE_EMOTE_FORM_ID}
                name="interval_s"
                type="number"
                min={INTERVAL_MIN}
                max={INTERVAL_MAX}
                value={intervalS}
                onChange={(e) => setIntervalS(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
            </div>

            <Button
              type="submit"
              form={IDLE_EMOTE_FORM_ID}
              variant="outline"
              className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("idleEmote.save")}
            </Button>
          </div>
        </div>
      )}

      {portalTarget &&
        createPortal(<form id={IDLE_EMOTE_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
