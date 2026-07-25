"use client";

import { useActionState, useEffect } from "react";
import {
  getBotTokenInfo,
  replaceRoomId,
  replaceToken,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore } from "../store";

/**
 * Owns the Status → Bot token card end to end — query reads from the shared
 * instance store (populated once by store.ts's `loadAll`, not fetched here)
 * and its two independent mutations (`replaceToken`/`replaceRoomId`, each
 * its own `useActionState`, since they're two separate forms a customer can
 * submit independently) write the refetched result back into the store on
 * success, so it survives this card unmounting when its tab isn't active
 * (docs/decisions.md, 2026-07-24, "instance store"). `bot-token-update.tsx`
 * is the only consumer.
 */
export function useBotTokenUpdate(instanceId: string) {
  const data = useInstanceStore((s) => s.botToken);
  const setSection = useInstanceStore((s) => s.setSection);

  const [tokenState, tokenFormAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) => replaceToken(instanceId, prevState, formData),
    null,
  );
  const [roomState, roomFormAction] = useActionState(
    (prevState: ConfigActionState | null, formData: FormData) => replaceRoomId(instanceId, prevState, formData),
    null,
  );

  // A successful save (either form) is the new source of truth for what's
  // persisted — refetch so the store reflects exactly what was written.
  useEffect(() => {
    if (tokenState?.ok || roomState?.ok) getBotTokenInfo(instanceId).then((result) => setSection("botToken", result));
  }, [tokenState, roomState, instanceId, setSection]);

  return { data, tokenState, tokenFormAction, roomState, roomFormAction };
}
