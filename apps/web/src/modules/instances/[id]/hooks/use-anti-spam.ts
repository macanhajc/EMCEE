"use client";

import { useActionState, useEffect } from "react";
import {
  getAntiSpamConfig,
  updateAntiSpamConfig,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

/**
 * Owns the Moderation → Anti-spam card end to end — query reads from the
 * shared instance store (populated once by store.ts's `loadAll`, not
 * fetched here) and mutate (`updateAntiSpamConfig`, via `useActionState`)
 * writes the refetched result back into the store on success, so it
 * survives this card unmounting when its tab isn't active (docs/decisions.md,
 * 2026-07-24, "instance store"). Mirrors every other card's hook;
 * `anti-spam-card.tsx` is the only consumer.
 */
export function useAntiSpam(instanceId: string) {
  const data = useInstanceStore((s) => s.antiSpam);
  const setSection = useInstanceStore((s) => s.setSection);

  const [state, formAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) =>
      updateAntiSpamConfig(instanceId, prevState, formData),
    null,
  );

  // A successful save is the new source of truth for what's persisted —
  // refetch so the store reflects exactly what was written.
  useEffect(() => {
    if (state?.ok) getAntiSpamConfig(instanceId).then((result) => setSection("antiSpam", result));
  }, [state, instanceId, setSection]);

  return { data, state, formAction };
}
