"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function attestAge(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const next = safeRedirectPath(formData.get("next")?.toString());

  if (formData.get("confirm") !== "on") {
    redirect(`/account/attest-age?error=required&next=${encodeURIComponent(next)}`);
  }

  await db
    .update(tables.users)
    .set({ ageAttestedAt: new Date() })
    .where(eq(tables.users.id, session.user.id));

  redirect(next);
}
