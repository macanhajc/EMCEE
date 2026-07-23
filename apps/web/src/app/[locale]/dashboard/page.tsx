import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { getActiveSubscriptionsForInstances } from "@/db/billing";
import { listInstancesForUser } from "@/db/instances";
import { DashboardTemplate } from "@/modules/dashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const session = await auth(); // proxy.ts already guarantees this is set

  const [instances, bots, [user]] = await Promise.all([
    listInstancesForUser(session!.user.id),
    db.select().from(tables.catalogBots),
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
  ]);
  const botNames = new Map(bots.map((bot) => [bot.slug, bot.name]));
  const subscriptions = await getActiveSubscriptionsForInstances(instances.map((i) => i.id));

  return (
    <DashboardTemplate
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
      deletedMessage={Boolean(deleted)}
      instances={instances}
      botNames={botNames}
      subscriptions={subscriptions}
    />
  );
}
