"use client";

import { useActionState, useEffect } from "react";
import {
  getEmoteOnSayConfig,
  updateEmoteOnSayConfig,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

/**
 * Owns the Emotes → Emote on say card end to end — query reads from the
 * shared instance store (populated once by store.ts's `loadAll`, not
 * fetched here) and mutate (`updateEmoteOnSayConfig`, via `useActionState`)
 * writes the refetched result back into the store on success, so it
 * survives this card unmounting when its tab isn't active (docs/decisions.md,
 * 2026-07-24, "instance store"). Mirrors every other card's hook;
 * `emote-on-say-card.tsx` is the only consumer.
 */
export function useEmoteOnSay(instanceId: string) {
  const data = useInstanceStore((s) => s.emoteOnSay);
  const setSection = useInstanceStore((s) => s.setSection);

  const [state, formAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) =>
      updateEmoteOnSayConfig(instanceId, prevState, formData),
    null,
  );

  // A successful save is the new source of truth for what's persisted —
  // refetch so the store reflects exactly what was written.
  useEffect(() => {
    if (state?.ok) getEmoteOnSayConfig(instanceId).then((result) => setSection("emoteOnSay", result));
  }, [state, instanceId, setSection]);

  return { data, state, formAction };
}
