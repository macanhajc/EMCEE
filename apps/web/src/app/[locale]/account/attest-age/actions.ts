"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "@/i18n/redirect";
import { db, tables } from "@/db";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function attestAge(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) await redirect("/login");

  const next = safeRedirectPath(formData.get("next")?.toString()); // bare, locale-free — see proxy.ts

  if (formData.get("confirm") !== "on") {
    await redirect(`/account/attest-age?error=required&next=${encodeURIComponent(next)}`);
  }

  await db
    .update(tables.users)
    .set({ ageAttestedAt: new Date() })
    .where(eq(tables.users.id, session!.user.id));

  await redirect(next);
}
