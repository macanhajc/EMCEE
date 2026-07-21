import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { botInstances, subscriptions } from "@/db/schema";
import { InstanceStatusBadge, SubscriptionBadge } from "./instance-status";

type Instance = typeof botInstances.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

export function InstanceCard({
  instance,
  botName,
  subscription,
}: {
  instance: Instance;
  botName: string;
  subscription: Subscription | null;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-paper/10 bg-panel p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg text-paper">{botName}</h2>
          <InstanceStatusBadge status={instance.status} errorKind={instance.errorKind} />
        </div>
        <p className="mt-1 font-ui-mono text-xs text-dust">room {instance.roomId}</p>
        <div className="mt-2">
          {subscription ? (
            <SubscriptionBadge status={subscription.status} />
          ) : (
            <Link
              href={`/checkout?instance=${instance.id}`}
              className="font-ui-mono text-xs text-spotlight hover:underline"
            >
              Subscribe to activate →
            </Link>
          )}
        </div>
      </div>

      <Button
        asChild
        variant="outline"
        className="border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
      >
        <Link href={`/instances/${instance.id}`}>Manage</Link>
      </Button>
    </div>
  );
}
