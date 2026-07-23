import { useFormatter, useTranslations } from "next-intl";
import { DashboardShell } from "@/components/Elements/dashboard-shell";
import { Button } from "@/components/UI/button";
import { Link } from "@/i18n/navigation";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-paper/5 pb-4 last:border-0 last:pb-0">
      <span className="font-ui-mono text-[11px] text-dust uppercase">{label}</span>
      <span className="font-marquee-body text-sm text-paper">{value}</span>
    </div>
  );
}

export function AccountTemplate({
  email,
  role,
  hasBilling,
  identityProviders,
  memberSince,
  ageAttestedAt,
}: {
  email: string;
  role: "customer" | "admin";
  hasBilling: boolean;
  identityProviders: string[];
  memberSince: Date | null;
  ageAttestedAt: Date | null;
}) {
  const t = useTranslations("account");
  const format = useFormatter();

  return (
    <DashboardShell email={email} role={role} hasBilling={hasBilling}>
      <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="mt-2 font-display text-3xl text-paper">{t("title")}</h1>

      <div className="mt-8 grid gap-4 rounded-2xl border border-paper/10 bg-panel p-6">
        <Row label={t("rows.email")} value={email || "—"} />
        <Row
          label={t("rows.signInMethods")}
          value={
            identityProviders.length > 0
              ? identityProviders.map((p) => (t.has(`providerLabels.${p}`) ? t(`providerLabels.${p}`) : p)).join(", ")
              : "—"
          }
        />
        <Row
          label={t("rows.memberSince")}
          value={memberSince ? format.dateTime(memberSince, { year: "numeric", month: "long", day: "numeric" }) : "—"}
        />
        <Row
          label={t("rows.ageAttestation")}
          value={
            ageAttestedAt ? (
              t("confirmed", { date: format.dateTime(ageAttestedAt, { year: "numeric", month: "long", day: "numeric" }) })
            ) : (
              <Link href="/account/attest-age" className="text-marquee hover:underline">
                {t("confirmYourAge")}
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
        <Link href="/dashboard">{t("backToDashboard")}</Link>
      </Button>
    </DashboardShell>
  );
}
