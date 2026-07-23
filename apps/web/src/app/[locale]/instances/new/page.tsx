import { eq, ne } from "drizzle-orm";
import { auth } from "@/auth";
import { NewInstanceTemplate } from "@/modules/instances/new";
import { db, tables } from "@/db";
import { createInstance } from "./actions";

export default async function NewInstancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth(); // proxy.ts already guarantees this is set

  const [bots, [user]] = await Promise.all([
    db.select().from(tables.catalogBots).where(ne(tables.catalogBots.lifecycle, "retired")),
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
  ]);
  // v1: exactly one bot, not a catalog to choose between (docs/decisions.md, 2026-07-20).
  const bot = bots[0] ?? null;

  return (
    <NewInstanceTemplate
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
      error={error}
      bot={bot}
      createInstance={createInstance}
    />
  );
}
