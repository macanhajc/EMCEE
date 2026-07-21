"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const PARAMS_TO_CLEAR = ["error", "saved", "checkout", "deleted"];

/**
 * Fires a toast for a success/error message computed server-side from
 * this page's query params, then strips those params from the URL —
 * otherwise a refresh (or back button) would re-show the same toast.
 */
export function QueryToast({ success, error }: { success?: string; error?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (!success && !error) return;
    // App Router runs Strict Mode in dev, which double-invokes this
    // effect on mount; without this guard the toast fires twice.
    if (fired.current) return;
    fired.current = true;

    if (error) toast.error(error);
    else if (success) toast.success(success);

    const next = new URLSearchParams(searchParams.toString());
    for (const key of PARAMS_TO_CLEAR) next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // Mount-only: fires once for whatever the server passed in, then
    // cleans up the params itself — re-running on their change would
    // just no-op against an already-cleared URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
