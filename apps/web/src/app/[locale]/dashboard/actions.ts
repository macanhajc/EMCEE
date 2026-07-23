"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { redirect } from "@/i18n/redirect";
import { db, tables } from "@/db";

/** Sign out of the current session only. A named export so client components
 * (the header user menu) can use it as a form action directly. */
export async function signOutHere(): Promise<void> {
  // signOut's redirectTo bypasses next-intl's redirect helper, same as
  // signIn's — see login/actions.ts's sendMagicLink.
  const locale = await getLocale();
  await signOut({ redirectTo: `/${locale}` });
}

/** "Sign out everywhere" — deletes every session row for this user, not just the current one. */
export async function signOutEverywhere(): Promise<void> {
  const session = await auth();
  if (!session?.user) await redirect("/login");

  await db.delete(tables.sessions).where(eq(tables.sessions.userId, session!.user.id));
  await redirect("/login");
}
