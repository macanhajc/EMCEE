"use client";

import { useActionState } from "react";
import {
  requestModeration,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

/**
 * Owns the Activity → Regulars table card end to end — query reads from the
 * shared instance store (populated once by store.ts's `loadAll`, not
 * fetched here) and the shared `requestModeration` action every row's
 * ban/unban buttons submit to (one dispatcher for the whole table — only
 * ever one action in flight from a click at a time, and the toast should
 * reflect whichever was most recent). No refetch after a successful action:
 * banning/unbanning someone doesn't change what this table displays (visit
 * count/last-seen), unlike every config card's own hook — so no store write
 * needed here either. `regulars-table.tsx` is the only consumer.
 */
export function useRegulars(instanceId: string) {
  const data = useInstanceStore((s) => s.regulars);

  const [state, formAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) => requestModeration(instanceId, prevState, formData),
    null,
  );

  return { data, state, formAction };
}
