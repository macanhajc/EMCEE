import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { AccountTemplate } from "@/modules/account";

export default async function AccountPage() {
  const session = await auth(); // proxy.ts already guarantees this is set

  const [[user], identities] = await Promise.all([
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
    db.select().from(tables.accounts).where(eq(tables.accounts.userId, session!.user.id)),
  ]);

  return (
    <AccountTemplate
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
      identityProviders={identities.map((i) => i.provider)}
      memberSince={user?.createdAt ?? null}
      ageAttestedAt={user?.ageAttestedAt ?? null}
    />
  );
}
