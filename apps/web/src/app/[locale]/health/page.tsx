import { getSystemHealthStatus } from "@/db/health";
import { HealthTemplate } from "@/modules/health";

// Always live — this reads current DB state (supervisor heartbeat, recent
// instance_events), so it must never be statically optimized/cached at
// build time (docs/decisions.md, 2026-07-25).
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const status = await getSystemHealthStatus();
  return <HealthTemplate status={status} />;
}
