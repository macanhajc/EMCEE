import { eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { db, tables } from "@/db";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  nodemailer: "Email link",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-paper/5 pb-4 last:border-0 last:pb-0">
      <span className="font-ui-mono text-[11px] text-dust uppercase">{label}</span>
      <span className="font-marquee-body text-sm text-paper">{value}</span>
    </div>
  );
}

export default async function AccountPage() {
  const session = await auth(); // proxy.ts already guarantees this is set

  const [[user], identities] = await Promise.all([
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
    db.select().from(tables.accounts).where(eq(tables.accounts.userId, session!.user.id)),
  ]);

  return (
    <DashboardShell
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
    >
      <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">Account</p>
      <h1 className="mt-2 font-display text-3xl text-paper">Profile</h1>

      <div className="mt-8 grid gap-4 rounded-2xl border border-paper/10 bg-panel p-6">
        <Row label="Email" value={session!.user.email ?? "—"} />
        <Row
          label="Sign-in methods"
          value={
            identities.length > 0
              ? identities.map((i) => PROVIDER_LABELS[i.provider] ?? i.provider).join(", ")
              : "—"
          }
        />
        <Row label="Member since" value={user ? formatDate(user.createdAt) : "—"} />
        <Row
          label="Age attestation"
          value={
            user?.ageAttestedAt ? (
              `Confirmed ${formatDate(user.ageAttestedAt)}`
            ) : (
              <Link href="/account/attest-age" className="text-marquee hover:underline">
                Confirm your age
              </Link>
            )
          }
        />
      </div>

      <Button
        asChild
        variant="outline"
        className="mt-6 border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
      >
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </DashboardShell>
  );
}
