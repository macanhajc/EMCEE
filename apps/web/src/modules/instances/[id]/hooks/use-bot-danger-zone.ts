"use client";

import { useInstanceStore } from "../store";

/**
 * Owns the Status → Danger zone card's data end to end — reads from the
 * shared instance store (populated once by store.ts's `loadAll`) instead of
 * fetching its own copy, so it survives this card unmounting when its tab
 * isn't active (docs/decisions.md, 2026-07-24, "instance store"). No
 * mutation here — `deleteInstance`/`openBillingPortal` are imported and
 * bound directly in `bot-danger-zone.tsx` instead, see
 * `getBotDangerZoneInfo`'s own comment for why. Takes no `instanceId` — the
 * store is already populated centrally, and `bot-danger-zone.tsx` (the only
 * consumer) keeps its own `instanceId` prop to bind `deleteInstance`,
 * independent of this hook.
 */
export function useBotDangerZone() {
  const data = useInstanceStore((s) => s.botDangerZone);
  return { data };
}
