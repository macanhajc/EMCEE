import { useSyncExternalStore } from "react";

export type CookieConsent = "accepted" | "rejected" | "undecided";

const STORAGE_KEY = "botmarket-cookie-consent";
const CHANGE_EVENT = "botmarket-cookie-consent-change";

function readConsent(): CookieConsent {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "accepted" || raw === "rejected" ? raw : "undecided";
}

function getServerConsent(): CookieConsent {
  return "undecided";
}

export function setCookieConsent(value: "accepted" | "rejected") {
  window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  // "storage" covers other tabs; the custom event covers this one, since
  // "storage" doesn't fire in the tab that made the write.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * "undecided" on the server and on first client render (matching, so no
 * hydration mismatch); useSyncExternalStore re-renders with the real
 * localStorage value right after mount.
 */
export function useCookieConsent(): CookieConsent {
  return useSyncExternalStore(subscribe, readConsent, getServerConsent);
}
