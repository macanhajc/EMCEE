"use client";

import { useActionState, useEffect } from "react";
import {
  getAnchorSpotEnabled,
  updateAnchorSpotEnabled,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

/**
 * Owns the Anchor spot card's `enabled` toggle end to end — query reads
 * from the shared instance store (populated once by store.ts's `loadAll`,
 * not fetched here) and mutate (`updateAnchorSpotEnabled`, via
 * `useActionState`) writes the refetched result back into the store on
 * success, so it survives this card unmounting when its tab isn't active
 * (docs/decisions.md, 2026-07-24, "instance store"), same pattern as every
 * other extracted card's own `enabled` field. `anchor-spot-card.tsx` is the
 * only consumer.
 */
export function useAnchorSpotEnabled(instanceId: string) {
  const data = useInstanceStore((s) => s.anchorSpotEnabled);
  const setSection = useInstanceStore((s) => s.setSection);

  const [state, formAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) =>
      updateAnchorSpotEnabled(instanceId, prevState, formData),
    null,
  );

  useEffect(() => {
    if (state?.ok) getAnchorSpotEnabled(instanceId).then((result) => setSection("anchorSpotEnabled", result));
  }, [state, instanceId, setSection]);

  return { data, state, formAction };
}
