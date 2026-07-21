import type { instanceErrorKind, instanceStatus, subscriptionStatus } from "@/db/schema";

type InstanceStatus = (typeof instanceStatus.enumValues)[number];
type ErrorKind = (typeof instanceErrorKind.enumValues)[number];
type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];

const STATUS_COPY: Record<InstanceStatus, { label: string; dot: string; pulse?: boolean }> = {
  created: { label: "Not started", dot: "bg-dust" },
  provisioning: { label: "Starting…", dot: "bg-marquee", pulse: true },
  running: { label: "Live", dot: "bg-emerald-400", pulse: true },
  degraded: { label: "Needs attention", dot: "bg-red-400", pulse: true },
  stopped: { label: "Stopped", dot: "bg-dust" },
  suspended: { label: "Suspended", dot: "bg-red-400" },
};

const ERROR_COPY: Record<ErrorKind, string> = {
  token: "bad token",
  permissions: "missing designer rights",
  room: "room not found",
};

export function InstanceStatusBadge({
  status,
  errorKind,
}: {
  status: InstanceStatus;
  errorKind?: ErrorKind | null;
}) {
  const copy = STATUS_COPY[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${copy.dot} ${copy.pulse ? "animate-bulb-pulse" : ""}`}
      />
      {copy.label}
      {status === "degraded" && errorKind && ` — ${ERROR_COPY[errorKind]}`}
    </span>
  );
}

const SUBSCRIPTION_COPY: Record<SubscriptionStatus, { label: string; className: string } | null> = {
  trialing: { label: "Trial", className: "text-marquee" },
  active: { label: "Active", className: "text-emerald-400" },
  past_due: { label: "Payment failed", className: "text-red-400" },
  suspended: null,
  canceled: null,
};

export function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  const copy = SUBSCRIPTION_COPY[status];
  if (!copy) return null;
  return <span className={`font-ui-mono text-xs ${copy.className}`}>{copy.label}</span>;
}
