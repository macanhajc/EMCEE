"use client";

import { useActionState, useEffect } from "react";
import {
  getLoopConfig,
  updateLoopConfig,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

/**
 * Owns the Emotes → Loop card end to end — query reads from the shared
 * instance store (populated once by store.ts's `loadAll`, not fetched here)
 * and mutate (`updateLoopConfig`, via `useActionState`) writes the
 * refetched result back into the store on success, so it survives this card
 * unmounting when its tab isn't active (docs/decisions.md, 2026-07-24,
 * "instance store"). Mirrors every other card's hook; `loop-card.tsx` is
 * the only consumer.
 */
export function useLoop(instanceId: string) {
  const data = useInstanceStore((s) => s.loop);
  const setSection = useInstanceStore((s) => s.setSection);

  const [state, formAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) =>
      updateLoopConfig(instanceId, prevState, formData),
    null,
  );

  // A successful save is the new source of truth for what's persisted —
  // refetch so the store reflects exactly what was written.
  useEffect(() => {
    if (state?.ok) getLoopConfig(instanceId).then((result) => setSection("loop", result));
  }, [state, instanceId, setSection]);

  return { data, state, formAction };
}
