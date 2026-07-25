"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useStrikeEscalation } from "../hooks/use-strike-escalation";
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

// Matches packages/schemas/emcee/v1.json's ladder bounds — this card no
// longer goes through sectionsFromSchema, so these are hand-kept in sync
// rather than derived, same tradeoff the other extracted cards already made
// for their own schema-derived bounds/enums.
const STRIKE_DECAY_MIN = 1;
const STRIKE_DECAY_MAX = 168;
const MUTE_AT_MIN = 1;
const MUTE_AT_MAX = 20;
const MUTE_DURATION_MIN = 10;
const MUTE_DURATION_MAX = 86400;
const KICK_AT_MIN = 1;
const KICK_AT_MAX = 20;
const BAN_AT_MIN = 2;
const BAN_AT_MAX = 20;
const BAN_DURATION_MIN = 0;
const BAN_DURATION_MAX = 2592000;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const LADDER_FORM_ID = "moderation-strike-escalation-form";

/**
 * Moderation → Warning escalation card (schema section key `ladder`) — the
 * whole card, chrome included. Fully self-contained: fetches its own current
 * settings via useStrikeEscalation and owns its own save action, rather than
 * being handed `config.ladder` down from the page's own server fetch.
 * Rendered directly in instance-config.tsx rather than driven through
 * `sections`/`SectionCard` — same move as the Avatar module's cards
 * (docs/decisions.md, 2026-07-24).
 *
 * Unlike every other extracted card, this section has no `enabled` toggle of
 * its own (packages/schemas/emcee/v1.json) — every field is always shown, a
 * single Save button covers all of them, same shape
 * anchor-from-dashboard-card.tsx uses for the same reason. `ban_enabled`
 * isn't a section-level toggle either — it just gates `ban_at_strikes`/
 * `ban_duration_s`'s visibility (the schema's `x-enabled-by`), the same
 * client-side-only gating SectionCard's `gates` state used to do generically
 * — no dedicated auto-save form of its own, it submits with everything else
 * on the one Save button.
 */
export function StrikeEscalationCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useStrikeEscalation(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);

  // Local, editable copy of the fetched values — seeded from `data` during
  // render (not an effect) so a fresh fetch (first load, or the refetch
  // after a successful save) updates it without fighting an in-progress
  // edit. Controlled rather than defaultValue for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves.
  const [strikeDecayH, setStrikeDecayH] = useState<number | "">("");
  const [muteAtStrikes, setMuteAtStrikes] = useState<number | "">("");
  const [muteDurationS, setMuteDurationS] = useState<number | "">("");
  const [kickAtStrikes, setKickAtStrikes] = useState<number | "">("");
  const [banEnabled, setBanEnabled] = useState(false);
  const [banAtStrikes, setBanAtStrikes] = useState<number | "">("");
  const [banDurationS, setBanDurationS] = useState<number | "">("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setStrikeDecayH(data.strike_decay_h);
    setMuteAtStrikes(data.mute_at_strikes);
    setMuteDurationS(data.mute_duration_s);
    setKickAtStrikes(data.kick_at_strikes);
    setBanEnabled(data.ban_enabled);
    setBanAtStrikes(data.ban_at_strikes);
    setBanDurationS(data.ban_duration_s);
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
      <h3 className="font-display text-base text-paper">{t("strikeEscalation.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("strikeEscalation.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="ladder-strike-decay" className="text-dust">
              {t("strikeEscalation.strikeDecayLabel")}
            </Label>
            <Input
              id="ladder-strike-decay"
              form={LADDER_FORM_ID}
              name="strike_decay_h"
              type="number"
              min={STRIKE_DECAY_MIN}
              max={STRIKE_DECAY_MAX}
              value={strikeDecayH}
              onChange={(e) => setStrikeDecayH(e.target.value === "" ? "" : Number(e.target.value))}
              className={`h-10 max-w-40 ${fieldControlClass}`}
            />
            <p className="text-xs text-dust">{t("strikeEscalation.strikeDecayDescription")}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ladder-mute-at-strikes" className="text-dust">
              {t("strikeEscalation.muteAtStrikesLabel")}
            </Label>
            <Input
              id="ladder-mute-at-strikes"
              form={LADDER_FORM_ID}
              name="mute_at_strikes"
              type="number"
              min={MUTE_AT_MIN}
              max={MUTE_AT_MAX}
              value={muteAtStrikes}
              onChange={(e) => setMuteAtStrikes(e.target.value === "" ? "" : Number(e.target.value))}
              className={`h-10 max-w-40 ${fieldControlClass}`}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ladder-mute-duration" className="text-dust">
              {t("strikeEscalation.muteDurationLabel")}
            </Label>
            <Input
              id="ladder-mute-duration"
              form={LADDER_FORM_ID}
              name="mute_duration_s"
              type="number"
              min={MUTE_DURATION_MIN}
              max={MUTE_DURATION_MAX}
              value={muteDurationS}
              onChange={(e) => setMuteDurationS(e.target.value === "" ? "" : Number(e.target.value))}
              className={`h-10 max-w-40 ${fieldControlClass}`}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ladder-kick-at-strikes" className="text-dust">
              {t("strikeEscalation.kickAtStrikesLabel")}
            </Label>
            <Input
              id="ladder-kick-at-strikes"
              form={LADDER_FORM_ID}
              name="kick_at_strikes"
              type="number"
              min={KICK_AT_MIN}
              max={KICK_AT_MAX}
              value={kickAtStrikes}
              onChange={(e) => setKickAtStrikes(e.target.value === "" ? "" : Number(e.target.value))}
              className={`h-10 max-w-40 ${fieldControlClass}`}
            />
          </div>

          <div className="flex items-start gap-3 border-t border-paper/10 pt-5">
            <Checkbox
              id="ladder-ban-enabled"
              form={LADDER_FORM_ID}
              name="ban_enabled"
              checked={banEnabled}
              onCheckedChange={(checked) => setBanEnabled(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <div>
              <Label htmlFor="ladder-ban-enabled" className="font-normal leading-5 text-paper">
                {t("strikeEscalation.banEnabledLabel")}
              </Label>
              <p className="mt-1 text-xs text-dust">{t("strikeEscalation.banEnabledDescription")}</p>
            </div>
          </div>

          <div className={`grid gap-5 ${banEnabled ? "" : "hidden"}`}>
            <div className="grid gap-2">
              <Label htmlFor="ladder-ban-at-strikes" className="text-dust">
                {t("strikeEscalation.banAtStrikesLabel")}
              </Label>
              <Input
                id="ladder-ban-at-strikes"
                form={LADDER_FORM_ID}
                name="ban_at_strikes"
                type="number"
                min={BAN_AT_MIN}
                max={BAN_AT_MAX}
                value={banAtStrikes}
                onChange={(e) => setBanAtStrikes(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t("strikeEscalation.banAtStrikesDescription")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ladder-ban-duration" className="text-dust">
                {t("strikeEscalation.banDurationLabel")}
              </Label>
              <Input
                id="ladder-ban-duration"
                form={LADDER_FORM_ID}
                name="ban_duration_s"
                type="number"
                min={BAN_DURATION_MIN}
                max={BAN_DURATION_MAX}
                value={banDurationS}
                onChange={(e) => setBanDurationS(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-10 max-w-40 ${fieldControlClass}`}
              />
              <p className="text-xs text-dust">{t("strikeEscalation.banDurationDescription")}</p>
            </div>
          </div>

          <Button
            type="submit"
            form={LADDER_FORM_ID}
            variant="outline"
            className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
          >
            {t("strikeEscalation.save")}
          </Button>
        </div>
      )}

      {portalTarget && createPortal(<form id={LADDER_FORM_ID} action={formAction} />, portalTarget)}
    </div>
  );
}
