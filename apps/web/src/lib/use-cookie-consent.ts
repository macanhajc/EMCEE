"use client";

import { useSyncExternalStore } from "react";
import {
  type CookieConsent,
  COOKIE_CONSENT_CHANGE_EVENT,
  readClientCookieConsent,
} from "@/lib/cookie-consent";

function subscribe(onChange: () => void) {
  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
}

/**
 * `initial` is the value RootLayout already read from the request cookie,
 * so the server render and the first client render agree from the start —
 * no post-hydration flip, no flash for visitors who already decided.
 */
export function useCookieConsent(initial: CookieConsent): CookieConsent {
  return useSyncExternalStore(subscribe, readClientCookieConsent, () => initial);
}
