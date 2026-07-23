import { LegalDocument, type LegalSection } from "@/components/Elements/legal-document";
import { SiteFooter } from "@/components/Elements/site-footer";
import { SiteNav } from "@/components/Elements/site-nav";

const SECTIONS: readonly LegalSection[] = [
  { key: "acceptance" },
  { key: "whatWeProvide" },
  { key: "independentOperator" },
  { key: "eligibilityAndAccounts" },
  { key: "yourBotAndToken" },
  { key: "noGold" },
  { key: "acceptableUse", variant: "list" },
  { key: "subscriptionAndBilling" },
  { key: "refunds" },
  { key: "paymentIssuesAndSuspension" },
  { key: "terminationForAbuse" },
  { key: "serviceAvailability" },
  { key: "intellectualProperty" },
  { key: "disclaimersLiability" },
  { key: "governingLaw" },
  { key: "changes" },
  { key: "contact" },
];

export function TermsTemplate() {
  return (
    <div className="flex flex-1 flex-col bg-ink font-marquee-body">
      <SiteNav />
      <main className="flex-1">
        <LegalDocument namespace="terms" sections={SECTIONS} />
      </main>
      <SiteFooter />
    </div>
  );
}
