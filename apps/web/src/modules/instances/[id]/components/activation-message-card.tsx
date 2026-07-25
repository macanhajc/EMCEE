"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useActivationMessage } from "../hooks/use-activation-message";
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

// Matches packages/schemas/emcee/v1.json's activation_message bounds — this
// card no longer goes through sectionsFromSchema, so these are hand-kept in
// sync rather than derived, same tradeoff the other extracted cards already
// made for their own schema-derived bounds/enums.
const TEMPLATE_MAX_LENGTH = 200;
const COOLDOWN_M_MIN = 0;
const COOLDOWN_M_MAX = 1440;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const ACTIVATION_MESSAGE_FORM_ID = "greeter-activation-message-form";

/**
 * Greeter → Activation message card — the whole card, chrome included. Fully
 * self-contained: fetches its own current settings via useActivationMessage
 * and owns its own save action, rather than being handed
 * `config.activation_message` down from the page's own server fetch. Rendered
 * directly in instance-config.tsx rather than driven through
 * `sections`/`SectionCard`, same move as every other extracted card
 * (docs/decisions.md, 2026-07-24).
 *
 * Posted publicly to room chat on connect — never a whisper, there's no
 * specific user to whisper to at that point — so unlike Welcome/VIP this
 * card has no per-user cooldown, just a flat re-announce cooldown that
 * guards against a reconnect storm spamming the room (see
 * `catalog/greeter.py`'s `GreeterEngine.on_start`).
 */
export function ActivationMessageCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useActivationMessage(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  // Local, editable copy of the fetched values — seeded from `data` during
  // render (not an effect) so a fresh fetch (first load, or the refetch
  // after a successful save) updates it without fighting an in-progress
  // edit. Controlled rather than defaultValue for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves.
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState("");
  const [cooldownM, setCooldownM] = useState<number | "">("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data.enabled);
    setTemplate(data.template);
    setCooldownM(data.cooldown_m);
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
      <h3 className="font-display text-base text-paper">{t("activationMessage.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("activationMessage.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="activation-message-enabled"
              form={ACTIVATION_MESSAGE_FORM_ID}
              name="enabled"
              checked={enabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <div>
              <Label htmlFor="activation-message-enabled" className="font-normal leading-5 text-paper">
                {t("activationMessage.enabledLabel")}
              </Label>
              <p className="mt-1 text-xs text-dust">{t("activationMessage.enabledDescription")}</p>
            </div>
          </div>

          <div className={`grid gap-5 border-t border-paper/10 pt-5 ${enabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="activation-message-template" className="text-dust">
                {t("activationMessage.templateLabel")}
              </Label>
              {/* t.raw(), not t() — this string documents the literal
                  {room_name} template-variable syntax the runtime
                  substitutes into the saved announcement, not something
                  next-intl itself should interpolate. Same class of fix as
                  welcome-card.tsx's templatesDescription. */}
              <Input
                id="activation-message-template"
                form={ACTIVATION_MESSAGE_FORM_ID}
                name="template"
                type="text"
                maxLength={TEMPLATE_MAX_LENGTH}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder={t.raw("activationMessage.templatePlaceholder")}
                className={`h-10 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t.raw("activationMessage.templateDescription")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="activation-message-cooldown" className="text-dust">
                {t("activationMessage.cooldownLabel")}
              </Label>
              <Input
                id="activation-message-cooldown"
                form={ACTIVATION_MESSAGE_FORM_ID}
                name="cooldown_m"
                type="number"
                min={COOLDOWN_M_MIN}
                max={COOLDOWN_M_MAX}
                value={cooldownM}
                onChange={(e) => setCooldownM(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t("activationMessage.cooldownDescription")}</p>
            </div>

            <Button
              type="submit"
              form={ACTIVATION_MESSAGE_FORM_ID}
              variant="outline"
              className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("activationMessage.save")}
            </Button>
          </div>
        </div>
      )}

      {portalTarget &&
        createPortal(<form id={ACTIVATION_MESSAGE_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
