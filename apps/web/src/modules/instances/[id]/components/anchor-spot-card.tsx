"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Checkbox } from "@/components/UI/checkbox";
import { Label } from "@/components/UI/label";
import { useAnchorSpotEnabled } from "../hooks/use-anchor-spot-enabled";
import { AnchorFromDashboardCard } from "./anchor-from-dashboard-card";

// document doesn't exist during SSR — this card also renders server-side as
// part of the page's initial HTML ("use client" only means "hydrates
// interactively," not "server never touches it"). useSyncExternalStore (same
// technique notifications-card.tsx uses for Notification.permission) gives
// an SSR-safe snapshot without the "setState synchronously in an effect"
// cascading-render issue a useEffect+useState pair would hit here. Every
// other extracted card's portaled <form> uses this same pattern.
function subscribeNever() {
  return () => {};
}
function getBodySnapshot(): Element | null {
  return document.body;
}
function getServerBodySnapshot(): Element | null {
  return null;
}

// id of the standalone <form> this card's own `enabled` checkbox submits to
// — this card renders inside the shared multi-module config <form>, and
// HTML forbids nesting one <form> inside another. Portaled to <body> below,
// same trick every other extracted card uses.
const ANCHOR_SPOT_ENABLED_FORM_ID = "avatar-anchor-spot-enabled-form";

/**
 * Avatar → Anchor spot — the outer card wrapper around AnchorFromDashboardCard
 * (the x/y/z/facing "set from the dashboard" editor). Hand-written and
 * rendered directly in instance-config.tsx rather than driven through
 * `sections`/`SectionCard`, the same way the Activity/Status tabs
 * (ACTIVITY_TAB_KEY/STATUS_TAB_KEY) are hand-written blocks instead of
 * schema-derived ones.
 *
 * The in-game "say anchor" half used to be its own sub-card
 * (AnchorInGameCard) with a "who can trigger it" picker — removed
 * 2026-07-24: only the bot owner can move the bot now, no dashboard control
 * needed for that anymore, so there was nothing left in that card to show.
 * `updateAnchorSpotEnabled` (the hook below) pins `position.permission` to
 * `"owner"` on every save regardless.
 *
 * `enabled` (`position.enabled`) owns its own query/mutate
 * (useAnchorSpotEnabled), same as every other extracted card's `enabled` —
 * it used to ride the shared config form on purpose (docs/decisions.md,
 * 2026-07-23), but that meant it neither auto-saved nor hid the rest of the
 * card on toggle, unlike every sibling card. Toggling the checkbox now
 * submits its own dedicated one-field form immediately (no Save button
 * needed for just this), and AnchorFromDashboardCard below is hidden — not
 * unmounted, so its own in-progress state survives — while it's off.
 */
export function AnchorSpotCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config.anchorSpot");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useAnchorSpotEnabled(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);
  const formRef = useRef<HTMLFormElement>(null);

  // Local, toggleable copy of the fetched value — seeded from `data` during
  // render (React's documented pattern for "adjust state when a prop
  // changes", not an effect) so a fresh fetch, first load or the refetch
  // after a successful save, updates it without fighting the user's own
  // in-progress click.
  const [enabled, setEnabled] = useState(true);
  const [seededFor, setSeededFor] = useState<boolean | null>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setEnabled(data);
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
      <h3 className="font-display text-base text-paper">{t("title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("description")}</p>

      <div className="mt-5 grid gap-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="position-enabled"
            form={ANCHOR_SPOT_ENABLED_FORM_ID}
            name="enabled"
            checked={enabled}
            onCheckedChange={(checked) => handleToggle(checked === true)}
            className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
          />
          <div>
            <Label htmlFor="position-enabled" className="font-normal leading-5 text-paper">
              {t("enabledLabel")}
            </Label>
            <p className="mt-1 text-xs text-dust">{t("enabledDescription")}</p>
          </div>
        </div>

        <div className={`grid gap-5 border-t border-paper/10 pt-5 ${enabled ? "" : "hidden"}`}>
          <AnchorFromDashboardCard instanceId={instanceId} />
        </div>
      </div>

      {portalTarget &&
        createPortal(
          <form id={ANCHOR_SPOT_ENABLED_FORM_ID} ref={formRef} action={formAction} />,
          portalTarget,
        )}
    </div>
  );
}
