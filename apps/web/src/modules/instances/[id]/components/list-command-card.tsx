"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Checkbox } from "@/components/UI/checkbox";
import { Label } from "@/components/UI/label";
import { useListCommand } from "../hooks/use-list-command";

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

// id of the standalone <form> this card's field submits to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const LIST_COMMAND_FORM_ID = "emotes-list-command-form";

/**
 * Emotes → Emote list command card — the whole card, chrome included. Fully
 * self-contained: fetches its own current `enabled` via useListCommand and
 * owns its own save action, rather than being handed `config.list_command`
 * down from the page's own server fetch. Rendered directly in
 * instance-config.tsx rather than driven through `sections`/`SectionCard` —
 * same move as the Avatar/Moderation/Greeter modules' cards
 * (docs/decisions.md, 2026-07-24).
 *
 * `enabled` is the section's only field (packages/schemas/emcee/v1.json) —
 * no gated content area, no Save button, the checkbox toggle *is* the whole
 * save action (same auto-save-on-toggle mechanism every other extracted
 * card's `enabled` uses, just with nothing left to gate).
 */
export function ListCommandCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useListCommand(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  const [enabled, setEnabled] = useState(false);
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data.enabled);
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
    // whatever the DOM says yet) sidesteps that race entirely.
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
      <h3 className="font-display text-base text-paper">{t("listCommand.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("listCommand.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 flex items-start gap-3">
          <Checkbox
            id="list-command-enabled"
            form={LIST_COMMAND_FORM_ID}
            name="enabled"
            checked={enabled}
            onCheckedChange={(checked) => handleToggle(checked === true)}
            className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
          />
          <Label htmlFor="list-command-enabled" className="font-normal leading-5 text-paper">
            {t("listCommand.enabledLabel")}
          </Label>
        </div>
      )}

      {portalTarget &&
        createPortal(<form id={LIST_COMMAND_FORM_ID} ref={formRef} action={formAction} />, portalTarget)}
    </div>
  );
}
