import { eq } from "drizzle-orm";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance, hasUsedTrial } from "@/db/billing";
import { getOwnedInstance } from "@/db/instances";
import { startCheckout } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  bad_plan: "Pick a plan.",
  unavailable: "This bot isn't available for purchase yet.",
  stripe_error: "Something went wrong starting checkout — try again.",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ instance?: string; error?: string }>;
}) {
  const { instance: instanceId, error } = await searchParams;
  if (!instanceId) redirect("/dashboard");

  const session = await auth(); // proxy.ts guarantees auth + age attestation on this route
  const instance = await getOwnedInstance(session!.user.id, instanceId);
  if (!instance) redirect("/dashboard");

  const existing = await getActiveSubscriptionForInstance(instanceId);
  if (existing) redirect(`/instances/${instanceId}`); // already subscribed — nothing to do here

  const [bot] = await db
    .select()
    .from(tables.catalogBots)
    .where(eq(tables.catalogBots.slug, instance.catalogBotSlug));

  // Mirrors the eligibility check in ./actions.ts so the trial disclaimer
  // shown here never promises something the submit will contradict.
  const trialEligible = instance.tokenFingerprint
    ? !(await hasUsedTrial(instance.roomId, instance.tokenFingerprint))
    : false;

  return (
    <AuthShell
      eyebrow="Checkout"
      title={bot?.name ?? instance.catalogBotSlug}
      subtitle={`Room ${instance.roomId}`}
      maxWidth="max-w-lg"
    >
      <Link
        href={`/instances/${instance.id}`}
        className="mb-5 inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust hover:text-paper"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back
      </Link>

      {error && (
        <Alert className="mb-5 border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {ERROR_MESSAGES[error] ?? "Something went wrong."}
          </AlertDescription>
        </Alert>
      )}

      <form action={startCheckout.bind(null, instance.id)} className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <PlanOption
            id="plan-monthly"
            value="monthly"
            defaultChecked
            label="Monthly"
            price="R$39"
            period="/mo"
            reference="~US$7 reference"
          />
          <PlanOption
            id="plan-annual"
            value="annual"
            label="Annual"
            price="R$390"
            period="/yr"
            reference="~US$70 reference"
            badge="2 months free"
          />
        </div>

        <p className="font-marquee-body text-xs leading-relaxed text-dust">
          {trialEligible ? (
            <>
              7-day free trial included — card or Pix required now, first charge on day 7.
              Cancel anytime before then.
            </>
          ) : (
            <>This room already used its trial, so the first period is charged right away.</>
          )}
        </p>

        <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
          Continue to payment
        </Button>

        <p className="flex items-center justify-center gap-1.5 font-ui-mono text-[11px] text-dust">
          <Lock aria-hidden className="size-3 text-marquee" />
          Payments handled by Stripe — we never see your card.
        </p>
      </form>
    </AuthShell>
  );
}

function PlanOption({
  id,
  value,
  label,
  price,
  period,
  reference,
  badge,
  defaultChecked,
}: {
  id: string;
  value: "monthly" | "annual";
  label: string;
  price: string;
  period: string;
  reference: string;
  badge?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="radio"
        name="plan"
        id={id}
        value={value}
        defaultChecked={defaultChecked}
        required
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="block cursor-pointer rounded-2xl border border-paper/10 bg-ink/40 p-5 transition-colors peer-checked:border-marquee peer-checked:bg-panel-2/60 peer-focus-visible:ring-2 peer-focus-visible:ring-marquee/50"
      >
        {badge && (
          <span className="absolute top-4 right-4 rounded-full bg-spotlight px-2.5 py-0.5 font-ui-mono text-[10px] text-ink">
            {badge}
          </span>
        )}
        <p className="font-display text-xs tracking-wide text-dust uppercase">{label}</p>
        <p className="mt-2 font-display text-2xl text-paper">
          {price}
          <span className="font-ui-mono text-sm text-dust">{period}</span>
        </p>
        <p className="mt-1 font-ui-mono text-[11px] text-dust">{reference}</p>
      </label>
    </div>
  );
}
