import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { openBillingPortal } from "@/app/[locale]/checkout/actions";
import { InstanceDetailTemplate } from "@/modules/instances/[id]";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { getOwnedInstance } from "@/db/instances";
import { getRoomInfo } from "@/lib/highrise-webapi";

export default async function InstancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; checkout?: string }>;
}) {
  const { id } = await params;
  const { error, saved, checkout } = await searchParams;
  const session = await auth(); // proxy.ts guarantees a session on this route
  const instance = await getOwnedInstance(session!.user.id, id);
  if (!instance) notFound();

  const [
    subscription,
    [bot],
    [user],
    roomInfo,
    tInstance,
  ] = await Promise.all([
    getActiveSubscriptionForInstance(id),
    db
      .select()
      .from(tables.catalogBots)
      .where(eq(tables.catalogBots.slug, instance.catalogBotSlug)),
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
    getRoomInfo(instance.roomId),
    getTranslations("instanceDetail"),
  ]);

  return (
    <InstanceDetailTemplate
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
      emailAlertsEnabled={user?.emailAlertsEnabled ?? true}
      browserAlertsEnabled={user?.browserAlertsEnabled ?? false}
      instance={instance}
      bot={bot}
      subscription={subscription}
      successMessage={
        checkout === "success"
          ? tInstance("checkoutSuccessMessage")
          : saved
            ? tInstance("savedMessage")
            : undefined
      }
      errorMessage={
        error ? (tInstance.has(`errors.${error}`) ? tInstance(`errors.${error}`) : decodeURIComponent(error)) : undefined
      }
      roomInfo={roomInfo}
      openBillingPortal={openBillingPortal}
    />
  );
}
