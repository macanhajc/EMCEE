"use client";

import { useInstanceStore } from "../store";

/**
 * Owns the Activity → activity log card's data end to end — reads from the
 * shared instance store (populated once by store.ts's `loadAll`) instead of
 * fetching its own copy, so it survives this card unmounting when its tab
 * isn't active (docs/decisions.md, 2026-07-24, "instance store"). No
 * mutation — this card is read-only. Takes no `instanceId` — the store is
 * already populated centrally.
 */
export function useActivityLog() {
  const data = useInstanceStore((s) => s.activityLog);
  return { data };
}
