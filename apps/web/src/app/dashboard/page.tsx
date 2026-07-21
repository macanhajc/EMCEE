import { eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { InstanceCard } from "@/components/dashboard/instance-card";
import { QueryToast } from "@/components/query-toast";
import { Button } from "@/components/ui/button";
import { db, tables } from "@/db";
import { getActiveSubscriptionsForInstances } from "@/db/billing";
import { listInstancesForUser } from "@/db/instances";

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
    <DashboardShell
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
    >
      <QueryToast success={deleted ? "Bot deleted." : undefined} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
            Dashboard
          </p>
          <h1 className="mt-2 font-display text-3xl text-paper">Your bots</h1>
        </div>
        {instances.length > 0 && (
          <Button asChild className="bg-marquee text-ink hover:bg-marquee/85">
            <Link href="/instances/new">New bot instance</Link>
          </Button>
        )}
      </div>

      {instances.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-paper/20 px-8 py-16 text-center">
          <p className="font-display text-xl text-paper">No bots yet</p>
          <p className="mx-auto mt-2 max-w-sm font-marquee-body text-sm text-dust">
            Pick a bot, paste your token, and it&apos;ll be live in your room in about two
            minutes.
          </p>
          <Button asChild className="mt-6 bg-marquee text-ink hover:bg-marquee/85">
            <Link href="/instances/new">Create your first bot</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              botName={botNames.get(instance.catalogBotSlug) ?? instance.catalogBotSlug}
              subscription={subscriptions.get(instance.id) ?? null}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
