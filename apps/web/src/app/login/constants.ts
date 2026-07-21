// Auth.js's verify-request redirect only carries `provider`/`type` query
// params (by design — it never echoes user input into a URL). This cookie
// is the one channel for the verify-request screen to greet the user by
// the address they just typed. Display-only: sign-in itself never reads it.
export const PENDING_EMAIL_COOKIE = "botmarket-pending-email";
