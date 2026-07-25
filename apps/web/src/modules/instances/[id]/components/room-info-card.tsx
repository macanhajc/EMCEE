"use client";

import { useTranslations } from "next-intl";
import { useInstanceStore } from "../store";

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

/**
 * Self-contained — reads roomInfo/roomId from the shared instance store
 * (baked into the store's initial state from page.tsx's server fetch,
 * docs/decisions.md 2026-07-24 "instance store") instead of receiving them
 * as props. No mutation — this card is read-only.
 */
export function RoomInfoCard() {
  const t = useTranslations("instanceDetail.roomInfo");
  const room = useInstanceStore((s) => s.roomInfo);
  const roomId = useInstanceStore((s) => s.header.instance.roomId);

  return (
    <div className="mt-6 rounded-2xl border border-paper/10 bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-paper">{t("title")}</h2>
        {room && (
          <span className="inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />
            {t("onlineNow", { count: room.numConnected })}
          </span>
        )}
      </div>

      {room ? (
        <div className="mt-3">
          <p className="font-display text-lg text-paper">{room.name}</p>
          {room.description && (
            <p className="mt-1 text-sm text-dust">{room.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-ui-mono text-xs text-dust uppercase tracking-[0.1em]">
            <span>{humanize(room.category)}</span>
            <span>{humanize(room.accessPolicy)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-dust">
          {t.rich("notLoaded", {
            roomId,
            code: (chunks) => <span className="font-ui-mono text-paper">{chunks}</span>,
          })}
        </p>
      )}
    </div>
  );
}
