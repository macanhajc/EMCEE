import { and, eq, ne, or, isNull } from "drizzle-orm";
import { db, tables } from "./index";

/**
 * Opportunistic locale capture (proxy.ts) — lets async transactional email
 * (crash alerts, payment-failed) address the customer in their own
 * language even though it fires from a cron sweep / webhook with no
 * request-scoped locale of its own. The `ne`/`isNull` guard keeps this a
 * true no-op write on every request but the customer's first and any
 * locale switch, since proxy.ts calls this on every authenticated request.
 */
export function updateUserLocale(userId: string, locale: string) {
  return db
    .update(tables.users)
    .set({ locale })
    .where(and(eq(tables.users.id, userId), or(ne(tables.users.locale, locale), isNull(tables.users.locale))));
}
