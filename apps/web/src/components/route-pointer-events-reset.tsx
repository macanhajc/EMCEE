"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Radix popups (dropdown menus, dialogs) set `body.style.pointerEvents =
 * "none"` while open, restored on their own unmount. A `<Link>` menu item
 * that triggers client-side navigation *while the menu is still open* can
 * swap the route before that cleanup runs — App Router reuses the same
 * `<body>` across the transition, so the inline style survives onto the new
 * page and silently no-ops every hover/click on it. Resetting on every
 * pathname change is the standard workaround (Radix's own unmount cleanup
 * still runs first in the normal case, so this is a no-op then).
 */
export function RoutePointerEventsReset() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.pointerEvents = "";
  }, [pathname]);

  return null;
}
