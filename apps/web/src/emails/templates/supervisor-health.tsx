/**
 * Ops-only alert pair for the supervisor dead-man's-switch (docs/decisions.md,
 * 2026-07-23) — sent to us, never to a customer, so unlike every other
 * template in this directory these are plain English, no translator/locale
 * involved. Uses EmailLayout/EmailButton directly, same as the customer
 * templates, just without emails/translator.ts in the mix.
 */
import "server-only";
import { EmailLayout } from "../components/layout";

const OPS_FOOTER = "BotMarket internal ops alert — never sent to a customer.";

export function SupervisorDownEmail({ lastSeenAt }: { lastSeenAt: Date | null }) {
  const lastSeen = lastSeenAt ? lastSeenAt.toUTCString() : "never — no heartbeat has ever been recorded";
  return (
    <EmailLayout preview="No supervisor heartbeat — every customer bot is likely offline." footer={OPS_FOOTER}>
      <p style={{ margin: "0 0 8px" }}>
        No supervisor heartbeat has been seen recently. The data plane looks down, which means every
        customer&apos;s bot is likely offline right now, not just one instance.
      </p>
      <p style={{ margin: "0 0 8px" }}>Last heartbeat: {lastSeen}</p>
      <p style={{ margin: "0 0 8px" }}>
        Check the runtime process/container is running and its logs for a crash at startup (bad env var,
        unhandled exception before the reconcile loop starts) — that class of failure never writes anything to
        `bot_instances`/`instance_events`, so this heartbeat check is the only thing that catches it.
      </p>
    </EmailLayout>
  );
}

export function SupervisorRecoveredEmail() {
  return (
    <EmailLayout preview="Supervisor heartbeat is back." footer={OPS_FOOTER}>
      <p style={{ margin: "0 0 8px" }}>
        A supervisor heartbeat was seen again — the data plane looks healthy. This is the only notice you&apos;ll
        get; no further reminders unless it goes down again.
      </p>
    </EmailLayout>
  );
}

export const SUPERVISOR_DOWN_SUBJECT = "BotMarket: supervisor is down";
export const SUPERVISOR_RECOVERED_SUBJECT = "BotMarket: supervisor recovered";
