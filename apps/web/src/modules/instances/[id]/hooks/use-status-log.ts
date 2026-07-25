"use client";

import { useEffect } from "react";
import { getStatusLogData } from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

// Same cadence as notifications-card.tsx's status poll — no push channel to
// the browser exists (Postgres LISTEN/NOTIFY wakes the *worker*, not the
// dashboard tab), so this is the only way the card reflects a status change
// or new event without a manual page refresh.
const POLL_INTERVAL_MS = 30_000;

/**
 * Owns the Status → connection log card's data end to end — seeded once from
 * the shared instance store (populated by store.ts's `loadAll`), then kept
 * fresh by its own poll while the card is mounted (docs/decisions.md,
 * 2026-07-24, "instance store", covers the seed; the poll is this hook's
 * addition on top). Polling naturally pauses when this card's tab is
 * inactive — Radix unmounts it — and resumes on remount against whatever
 * `loadAll` already has, so there's no extra flash. No mutation — this card
 * is read-only plus a client-side clipboard copy.
 */
export function useStatusLog(instanceId: string) {
  const data = useInstanceStore((s) => s.statusLog);
  const setSection = useInstanceStore((s) => s.setSection);

  useEffect(() => {
    const interval = setInterval(() => {
      getStatusLogData(instanceId).then((v) => setSection("statusLog", v));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [instanceId, setSection]);

  return { data };
}
