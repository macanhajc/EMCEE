import { useTranslations } from "next-intl";
import type { instanceErrorKind, instanceStatus, subscriptionStatus } from "@/db/schema";

type InstanceStatus = (typeof instanceStatus.enumValues)[number];
type ErrorKind = (typeof instanceErrorKind.enumValues)[number];
type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];

const STATUS_DOT: Record<InstanceStatus, { dot: string; pulse?: boolean }> = {
  created: { dot: "bg-dust" },
  provisioning: { dot: "bg-marquee", pulse: true },
  running: { dot: "bg-emerald-400", pulse: true },
  degraded: { dot: "bg-red-400", pulse: true },
  stopped: { dot: "bg-dust" },
  suspended: { dot: "bg-red-400" },
};

export function InstanceStatusBadge({
  status,
  errorKind,
}: {
  status: InstanceStatus;
  errorKind?: ErrorKind | null;
}) {
  const t = useTranslations("instanceStatus");
  const dot = STATUS_DOT[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${dot.dot} ${dot.pulse ? "animate-bulb-pulse" : ""}`}
      />
      {t(`status.${status}`)}
      {status === "degraded" && errorKind && ` — ${t(`errorKind.${errorKind}`)}`}
    </span>
  );
}

const SUBSCRIPTION_CLASS: Record<SubscriptionStatus, string | null> = {
  trialing: "text-marquee",
  active: "text-emerald-400",
  past_due: "text-red-400",
  suspended: null,
  canceled: null,
  lifetime: "text-spotlight",
};

export function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  const t = useTranslations("instanceStatus");
  const className = SUBSCRIPTION_CLASS[status];
  if (!className) return null;
  return <span className={`font-ui-mono text-xs ${className}`}>{t(`subscription.${status}`)}</span>;
}
