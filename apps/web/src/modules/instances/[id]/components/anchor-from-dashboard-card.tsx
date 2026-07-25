"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { useAvatarAnchorPosition } from "../hooks/use-avatar-anchor-position";
import { fieldControlClass } from "./field-control-class";
import { RoomLayoutPreview } from "./room-layout-preview";

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

const FACING_VALUES = [
  "FrontRight",
  "FrontLeft",
  "BackRight",
  "BackLeft",
] as const;

// id of the standalone <form> this card's fields submit to via the HTML
// `form=` attribute — this card renders inside the "Anchor spot" card
// (anchor-spot-card.tsx), itself nested inside the shared multi-module
// config <form>, and HTML forbids nesting one <form> inside another.
// Portaled to <body> below, same trick ANCHOR_SPOT_ENABLED_FORM_ID uses.
const POSITION_FORM_ID = "avatar-position-form";

/**
 * The "set from the dashboard" content of the Anchor spot card — a manual
 * x/y/z/facing editor. (The in-game "say anchor" half used to be a sibling
 * sub-card with its own "who can trigger it" picker; removed 2026-07-24 —
 * only the bot owner can move the bot now, so this is the only configurable
 * content left under anchor-spot-card.tsx.) Fully self-contained: fetches
 * its own current saved position and owns its own save action via
 * useAvatarAnchorPosition, rather than being handed it down from the page's
 * server fetch — coordinates are deliberately kept out of
 * `bot_instances.config` (specs/bots/avatar.md), so this card's save button
 * only ever touches `avatar_positions`.
 */
export function AnchorFromDashboardCard({
  instanceId,
}: {
  instanceId: string;
}) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useAvatarAnchorPosition(instanceId);
  const portalTarget = useSyncExternalStore(
    subscribeNever,
    getBodySnapshot,
    getServerBodySnapshot,
  );

  // Controlled, rather than the plain defaultValue this card used before the
  // isometric preview existed, so a grid click and a typed number stay in
  // sync in both directions — RoomLayoutPreview only ever sees x/y/z via
  // props/callbacks, it doesn't touch the saved position itself. `facing`
  // has no such UI dependency but is controlled for a second reason: React
  // 19 resets uncontrolled fields inside a `<form action={...}>` back to
  // defaultValue once the action resolves, which would snap it back to its
  // pre-save value the instant a save completes (this hook's own refetch
  // hasn't necessarily landed yet at that exact point) — same issue
  // emote-select.tsx documents. Seeded from `data` during render (React's
  // documented pattern for "adjust state when a prop changes", not an
  // effect) so a fresh fetch — first load, or the refetch after a
  // successful save — overwrites in-progress edits only when the
  // underlying data itself actually changed.
  const [x, setX] = useState<number | "">("");
  const [y, setY] = useState<number | "">("");
  const [z, setZ] = useState<number | "">("");
  const [facing, setFacing] = useState<string>("FrontRight");
  const [seededFor, setSeededFor] = useState<typeof data>(undefined);
  if (data !== undefined && data !== seededFor) {
    setSeededFor(data);
    setX(data?.x ?? 0);
    setY(data?.y ?? 0);
    setZ(data?.z ?? 0);
    setFacing(data?.facing ?? "FrontRight");
  }

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(tInstance("savedMessage"));
    } else {
      toast.error(
        tInstance.has(`errors.${state.error}`)
          ? tInstance(`errors.${state.error}`)
          : state.error,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="grid gap-3">
      <div className="mb-2">
        <p className="font-semibold text-xs tracking-[0.15em] text-paper uppercase">
          {t("position.fromDashboard")}
        </p>
        {data !== undefined && (
          <p className="mt-1 text-xs text-dust">
            {data ? t("position.withPosition") : t("position.withoutPosition")}
          </p>
        )}
      </div>

      {data === undefined ? (
        <p className="text-xs text-dust">{t("loading")}</p>
      ) : (
        <div className="flex gap-6">
          <div className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="avatar-position-x" className="text-dust">
                {t("position.x")}
              </Label>
              <Input
                id="avatar-position-x"
                form={POSITION_FORM_ID}
                name="x"
                type="number"
                step="any"
                required
                value={x}
                onChange={(event) =>
                  setX(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
                className={`h-10 ${fieldControlClass}`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="avatar-position-z" className="text-dust">
                {t("position.z")}
              </Label>
              <Input
                id="avatar-position-z"
                form={POSITION_FORM_ID}
                name="z"
                type="number"
                step="any"
                required
                value={z}
                onChange={(event) =>
                  setZ(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
                className={`h-10 ${fieldControlClass}`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="avatar-position-facing" className="text-dust">
                {t("position.facing")}
              </Label>
              <select
                id="avatar-position-facing"
                form={POSITION_FORM_ID}
                name="facing"
                value={facing}
                onChange={(event) => setFacing(event.target.value)}
                className={`h-10 rounded-lg border px-3 text-sm focus-visible:outline-none ${fieldControlClass}`}
              >
                {FACING_VALUES.map((value) => (
                  <option key={value} value={value} className="bg-ink">
                    {t(`facingLabels.${value}`)}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              form={POSITION_FORM_ID}
              variant="outline"
              className="h-9 mt-2 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("position.save")}
            </Button>
          </div>

          <RoomLayoutPreview
            instanceId={instanceId}
            x={x}
            z={z}
            y={y}
            onSelectTile={(nextX, nextZ) => {
              setX(nextX);
              setZ(nextZ);
            }}
            onChangeY={setY}
          />
        </div>
      )}

      {portalTarget &&
        createPortal(
          <form id={POSITION_FORM_ID} action={formAction} />,
          portalTarget,
        )}
    </div>
  );
}
