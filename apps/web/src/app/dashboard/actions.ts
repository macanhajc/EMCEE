"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db, tables } from "@/db";

/** Sign out of the current session only. A named export so client components
 * (the header user menu) can use it as a form action directly. */
export async function signOutHere(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/** "Sign out everywhere" — deletes every session row for this user, not just the current one. */
export async function signOutEverywhere(): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await db.delete(tables.sessions).where(eq(tables.sessions.userId, session.user.id));
  redirect("/login");
}
