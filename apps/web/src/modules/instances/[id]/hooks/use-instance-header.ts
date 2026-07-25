"use client";

import { useActionState, useEffect } from "react";
import {
  getInstanceHeaderData,
  setBotRunning,
  type ConfigActionState,
} from "@/app/[locale]/instances/[id]/actions";
import { useInstanceStore, useInstanceStoreImperative } from "../store";

/**
 * Owns the page header's start/stop button end to end — reads header data
 * from the shared instance store (baked into the store's initial state from
 * page.tsx's server fetch, docs/decisions.md 2026-07-24 "instance store")
 * and mutate (`setBotRunning`, via `useActionState`) refetches just the
 * header on success and writes it back into the store, so the button/badge
 * update live without a page reload. `index.tsx` is the only consumer.
 */
export function useInstanceHeader(instanceId: string) {
  const header = useInstanceStore((s) => s.header);
  const storeApi = useInstanceStoreImperative();

  // Arity-0 — setBotRunning takes only instanceId (it's a toggle, no form
  // fields to read) — still assignable where useActionState expects a
  // `(state, payload) => state` action, since a function can always be
  // called with more arguments than it declares. Explicit type arguments
  // keep `payload` correctly inferred as FormData (there's no parameter
  // for TypeScript to infer it from otherwise), matching what <form
  // action={formAction}> actually calls this with.
  const [state, formAction] = useActionState<ConfigActionState | null, FormData>(
    () => setBotRunning(instanceId),
    null,
  );

  useEffect(() => {
    if (!state?.ok) return;
    getInstanceHeaderData(instanceId).then((freshHeader) => {
      const current = storeApi.getState();
      current.reseedHeader(instanceId, freshHeader, current.notifications, current.roomInfo);
    });
  }, [state, instanceId, storeApi]);

  return { header, state, formAction };
}
