"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, tables } from "@/db";

/** "Sign out everywhere" — deletes every session row for this user, not just the current one. */
export async function signOutEverywhere(): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await db.delete(tables.sessions).where(eq(tables.sessions.userId, session.user.id));
  redirect("/login");
}
