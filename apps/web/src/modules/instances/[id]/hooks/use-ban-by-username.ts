"use client";

import { useActionState } from "react";
import { requestModeration, type ConfigActionState } from "@/app/[locale]/instances/[id]/actions";

/**
 * Owns the Activity → Ban by username card's save action — its own
 * independent `useActionState` over the same `requestModeration` action
 * Regulars' per-row buttons use, since this is a separate form on a
 * separate card. No query — this card has nothing to display, just an
 * input form. `ban-by-username.tsx` is the only consumer.
 */
export function useBanByUsername(instanceId: string) {
  const [state, formAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) => requestModeration(instanceId, prevState, formData),
    null,
  );

  return { state, formAction };
}
