"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useVip } from "../hooks/use-vip";
import { EmoteSelect } from "./emote-select";
import { fieldControlClass } from "./field-control-class";
import { TagListInput } from "./tag-list-input";

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

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses in
// anchor-spot-card.tsx.
const VIP_FORM_ID = "greeter-vip-form";

/**
 * Greeter → VIP recognition card — the whole card, chrome included. Fully
 * self-contained: fetches its own current settings via useVip and owns its
 * own save action, rather than being handed `config.vip` down from the
 * page's own server fetch. Rendered directly in instance-config.tsx rather
 * than driven through `sections`/`SectionCard` — same move as the Avatar and
 * Moderation modules' cards (docs/decisions.md, 2026-07-24).
 *
 * No `enabled` toggle of its own (packages/schemas/emcee/v1.json) — every
 * field is always shown, a single Save button covers all of them, same
 * shape anchor-from-dashboard-card.tsx uses for the same reason.
 * `emote_celebration_enabled` isn't a section-level toggle either, it just
 * gates `emote_celebration_id`'s visibility (the schema's `x-enabled-by`),
 * the same client-side-only gating StrikeEscalationCard's `ban_enabled`
 * does.
 */
export function VipCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useVip(instanceId);
  const portalTarget = useSyncExternalStore(subscribeNever, getBodySnapshot, getServerBodySnapshot);

  // Local, editable copy of the fetched values — seeded from `data` during
  // render (not an effect) so a fresh fetch (first load, or the refetch
  // after a successful save) updates it without fighting an in-progress
  // edit. Controlled rather than defaultValue for the same reason
  // emote-select.tsx documents: React 19 resets uncontrolled fields inside a
  // `<form action={...}>` back to defaultValue once the action resolves.
  const [template, setTemplate] = useState("");
  const [announceToRoom, setAnnounceToRoom] = useState(false);
  const [emoteCelebrationEnabled, setEmoteCelebrationEnabled] = useState(false);
  const [emoteCelebrationId, setEmoteCelebrationId] = useState("");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setTemplate(data.template);
    setAnnounceToRoom(data.announce_to_room);
    setEmoteCelebrationEnabled(data.emote_celebration_enabled);
    setEmoteCelebrationId(data.emote_celebration_id);
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
      <h3 className="font-display text-base text-paper">{t("vip.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("vip.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="mt-5 grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="vip-users" className="text-dust">
              {t("vip.usersLabel")}
            </Label>
            <TagListInput
              id="vip-users"
              name="users"
              form={VIP_FORM_ID}
              defaultValue={data.users}
              placeholder={t("tagListPlaceholder")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vip-template" className="text-dust">
              {t("vip.templateLabel")}
            </Label>
            <Input
              id="vip-template"
              form={VIP_FORM_ID}
              name="template"
              type="text"
              maxLength={200}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className={`h-10 ${fieldControlClass}`}
            />
            {/* t.raw(), not t() — documents the literal {username}/
                {room_name} template-variable syntax, same reasoning as
                welcome-card.tsx's templatesDescription. */}
            <p className="text-xs text-dust">{t.raw("vip.templateDescription")}</p>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="vip-announce-to-room"
              form={VIP_FORM_ID}
              name="announce_to_room"
              checked={announceToRoom}
              onCheckedChange={(checked) => setAnnounceToRoom(checked === true)}
              className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
            />
            <div>
              <Label htmlFor="vip-announce-to-room" className="font-normal leading-5 text-paper">
                {t("vip.announceToRoomLabel")}
              </Label>
              <p className="mt-1 text-xs text-dust">{t("vip.announceToRoomDescription")}</p>
            </div>
          </div>

          <div className="grid gap-5 border-t border-paper/10 pt-5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="vip-emote-celebration-enabled"
                form={VIP_FORM_ID}
                name="emote_celebration_enabled"
                checked={emoteCelebrationEnabled}
                onCheckedChange={(checked) => setEmoteCelebrationEnabled(checked === true)}
                className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
              />
              <Label htmlFor="vip-emote-celebration-enabled" className="font-normal leading-5 text-paper">
                {t("vip.emoteCelebrationEnabledLabel")}
              </Label>
            </div>

            <div className={`grid gap-2 ${emoteCelebrationEnabled ? "" : "hidden"}`}>
              <Label htmlFor="vip-emote-celebration-id" className="text-dust">
                {t("vip.emoteCelebrationIdLabel")}
              </Label>
              <EmoteSelect
                id="vip-emote-celebration-id"
                form={VIP_FORM_ID}
                name="emote_celebration_id"
                value={emoteCelebrationId}
                onChange={setEmoteCelebrationId}
              />
            </div>
          </div>

          <Button
            type="submit"
            form={VIP_FORM_ID}
            variant="outline"
            className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
          >
            {t("vip.save")}
          </Button>
        </div>
      )}

      {portalTarget && createPortal(<form id={VIP_FORM_ID} action={formAction} />, portalTarget)}
    </div>
  );
}
