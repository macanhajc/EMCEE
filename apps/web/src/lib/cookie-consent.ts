export type CookieConsent = "accepted" | "rejected" | "undecided";

export const COOKIE_CONSENT_COOKIE = "botmarket-cookie-consent";
export const COOKIE_CONSENT_CHANGE_EVENT = "botmarket-cookie-consent-change";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function parseConsent(raw: string | undefined): CookieConsent {
  return raw === "accepted" || raw === "rejected" ? raw : "undecided";
}

/** For the RootLayout server component — reads the cookie the request sent. */
export function readServerCookieConsent(raw: string | undefined): CookieConsent {
  return parseConsent(raw);
}

export function readClientCookieConsent(): CookieConsent {
  const match = document.cookie.match(/(?:^|; )botmarket-cookie-consent=([^;]*)/);
  return parseConsent(match?.[1] && decodeURIComponent(match[1]));
}

export function setCookieConsent(value: "accepted" | "rejected") {
  document.cookie = `${COOKIE_CONSENT_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
}
