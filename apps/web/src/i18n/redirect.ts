import { getLocale } from "next-intl/server";
import { redirect as rawRedirect } from "./navigation";

/**
 * next-intl v4's `redirect` (from ./navigation) wants the locale passed
 * explicitly rather than inferring it — reasonable for a one-off call, but
 * every Server Action in this app redirects to a same-app path and always
 * wants "the locale this request is already in." This wraps that lookup so
 * call sites read like the plain next/navigation redirect() they replace.
 *
 * Must be awaited at the call site: the actual redirect() throws inside
 * this async function, so without `await` it surfaces as a rejected
 * promise instead of the thrown NEXT_REDIRECT Next.js expects.
 */
export async function redirect(href: string): Promise<never> {
  const locale = await getLocale();
  return rawRedirect({ href, locale });
}
