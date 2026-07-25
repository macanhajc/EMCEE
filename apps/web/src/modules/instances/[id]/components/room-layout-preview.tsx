"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/UI/label";
import { fieldControlClass } from "./field-control-class";
import { getRoomLayout, ROOM_LAYOUTS, ROOM_MASKS, type RoomLayoutId } from "./room-layouts";
import { cn } from "@/lib/utils";

// Same SSR-safe external-store technique as the portal-target snapshot in
// anchor-spot-card.tsx/anchor-from-dashboard-card.tsx: localStorage isn't
// reachable during SSR, and seeding client-only state via useEffect+setState
// would hydrate with the wrong value for a frame (flagged by
// react-hooks/set-state-in-effect). getServerLayoutSnapshot keeps the SSR
// pass and the first client render in agreement; the real value shows up
// once useSyncExternalStore re-checks after mount.
function subscribeNever() {
  return () => {};
}
function getServerLayoutSnapshot(): RoomLayoutId | null {
  return null;
}

const MIN_TILE = 10;
const MAX_TILE = 30;
// Target footprint (px) for a layout's longer axis before clamping — keeps
// small rooms (8x8) from rendering as tiny dots and large ones (18x30) from
// blowing out the card.
const TILE_FIT_BUDGET = 300;

const ELEVATION_MIN = 1;
const ELEVATION_MAX = 20;
const ELEVATION_STEP = 1;

// Persists which physical room layout this instance uses so it survives a
// reload — there's no server-side field for it (specs/bots/avatar.md keeps
// coordinates out of `bot_instances.config` entirely, and a layout pick is
// even further from being an actual bot setting), so localStorage keyed by
// instance is the right altitude: purely this browser's memory of which
// preset to line the grid up with.
const LAYOUT_STORAGE_PREFIX = "botmarket:anchor-room-layout:";

function readStoredLayout(instanceId: string): RoomLayoutId | null {
  const raw = window.localStorage.getItem(LAYOUT_STORAGE_PREFIX + instanceId);
  return raw && ROOM_LAYOUTS.some((layout) => layout.id === raw) ? (raw as RoomLayoutId) : null;
}

/**
 * Isometric preview of the "Anchor spot" card's coordinates — click a floor
 * tile to set X/Z, drag the elevation slider for Y. Purely a visual/click
 * convenience layered on top of the existing number inputs (AnchorFromDashboardCard
 * keeps owning the actual submitted values); this component never reads or
 * writes them beyond the callbacks below.
 */
export function RoomLayoutPreview({
  instanceId,
  x,
  z,
  onSelectTile,
}: {
  instanceId: string;
  x: number | "";
  z: number | "";
  y: number | "";
  onSelectTile: (x: number, z: number) => void;
  onChangeY: (y: number) => void;
}) {
  const t = useTranslations("instanceDetail.config");

  const getStoredLayoutSnapshot = useCallback(() => readStoredLayout(instanceId), [instanceId]);
  const storedLayout = useSyncExternalStore(subscribeNever, getStoredLayoutSnapshot, getServerLayoutSnapshot);

  // Takes over from `storedLayout` the moment the user picks something this
  // session, since a plain localStorage write doesn't itself trigger a
  // re-read (subscribeNever never notifies — same-tab writes don't fire
  // "storage" events either).
  const [sessionLayout, setSessionLayout] = useState<RoomLayoutId | null>(null);
  const selectedLayout = sessionLayout ?? storedLayout;

  function selectLayout(id: RoomLayoutId) {
    setSessionLayout(id);
    window.localStorage.setItem(LAYOUT_STORAGE_PREFIX + instanceId, id);
  }

  const layout = selectedLayout ? getRoomLayout(selectedLayout) : undefined;
  const tileSize = useMemo(() => {
    if (!layout) return MAX_TILE;
    const fit = Math.floor(TILE_FIT_BUDGET / Math.max(layout.width, layout.depth));
    return Math.min(MAX_TILE, Math.max(MIN_TILE, fit));
  }, [layout]);

  return (
    <div className="flex-1 rounded-xl border border-paper/10 bg-ink/40 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Label className="text-dust">
          {selectedLayout ? t("position.changeRoomLayout") : t("position.roomLayoutPrompt")}
        </Label>
        <select
          value={selectedLayout ?? ""}
          className={`h-10 rounded-lg border px-3 text-sm focus-visible:outline-none ${fieldControlClass}`}
          onChange={(e) => selectLayout(e.target.value as RoomLayoutId)}
        >
          <option value="" disabled className="bg-ink">
            {t("position.roomLayoutPrompt")}
          </option>
          {ROOM_LAYOUTS.map((value) => (
            <option key={value.id} value={value.id} className="bg-ink">
              {value.label}
            </option>
          ))}
        </select>
      </div>

      {!layout ? (
        <p className="mt-2 text-xs text-dust">{t("position.roomLayoutDescription")}</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-dust">{t("position.gridHint")}</p>

          <div className="p-6 rotate-x-45 -rotate-z-45 -translate-y-24">
            {ROOM_MASKS[layout.id]
              .map((row, rowIndex) => ({ row, rowIndex }))
              .reverse()
              .map(({ row, rowIndex }) => (
                <div key={`row-${rowIndex}`} className="flex">
                  {row.map((cell, colIndex) => {
                    const tileX = colIndex + 1;
                    const tileZ = rowIndex + 1;
                    const isSelected = x === tileX && z === tileZ;
                    return (
                      <button
                        key={`${rowIndex}-col-${colIndex}`}
                        aria-label={t("position.tileLabel", { x: tileX, z: tileZ })}
                        aria-pressed={isSelected}
                        type="button"
                        onClick={() => onSelectTile(tileX, tileZ)}
                        style={{ width: tileSize, height: tileSize }}
                        className={cn(
                          cell ? "visible" : "invisible",
                          "cursor-pointer border p-0 outline-none transition-all duration-150 ease-out",
                          "focus-visible:ring-2 focus-visible:ring-spotlight/60",
                          isSelected
                            ? "border-spotlight/70 bg-linear-to-br from-spotlight/85 to-marquee/85 shadow-[0_0_18px_2px_rgba(255,92,138,0.55)]"
                            : "border-paper/15 bg-paper/8 hover:-translate-y-1 hover:border-marquee/60 hover:bg-marquee/30 hover:shadow-[0_10px_18px_-6px_rgba(0,0,0,0.5),0_0_14px_1px_rgba(247,183,51,0.5)]",
                        )}
                      />
                    );
                  })}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
