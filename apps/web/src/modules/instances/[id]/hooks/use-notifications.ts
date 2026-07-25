"use client";

import { useActionState } from "react";
import {
  updateEmailAlerts,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

/**
 * Owns the Notifications card's email toggle end to end — reads
 * emailAlertsEnabled/browserAlertsEnabled from the shared instance store
 * (baked into the store's initial state from page.tsx's server fetch,
 * docs/decisions.md 2026-07-24 "instance store") and exposes `setNotifications`
 * for the card to write straight back into the store — optimistically, on
 * the click itself, not waiting for `state?.ok` (the card already knows the
 * value it just submitted; this preserves the "optimistic, never resynced
 * from a server-refreshed value" design `setBrowserAlertsEnabled` already
 * used before this change). `setBrowserAlertsEnabled` itself is called
 * directly by the card — it was already a plain non-redirect call, nothing
 * to change there. `notifications-card.tsx` is the only consumer.
 */
export function useNotifications(instanceId: string) {
  const notifications = useInstanceStore((s) => s.notifications);
  const setNotifications = useInstanceStore((s) => s.setNotifications);

  const [state, formAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) => updateEmailAlerts(instanceId, prevState, formData),
    null,
  );

  return { notifications, setNotifications, state, formAction };
}
