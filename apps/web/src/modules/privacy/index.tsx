import { LegalDocument, type LegalSection } from "@/components/Elements/legal-document";
import { SiteFooter } from "@/components/Elements/site-footer";
import { SiteNav } from "@/components/Elements/site-nav";

const SECTIONS: readonly LegalSection[] = [
  { key: "whoWeAre" },
  { key: "whatWeCollect", variant: "list" },
  { key: "whyWeCollect", variant: "list" },
  { key: "howLongWeKeep" },
  { key: "whoWeShareWith", variant: "list" },
  { key: "cookiesAndAnalytics" },
  { key: "yourRights", variant: "list" },
  { key: "ageRequirement" },
  { key: "security" },
  { key: "internationalTransfer" },
  { key: "changes" },
  { key: "contact" },
];

export function PrivacyTemplate() {
  return (
    <div className="flex flex-1 flex-col bg-ink font-marquee-body">
      <SiteNav />
      <main className="flex-1">
        <LegalDocument namespace="privacy" sections={SECTIONS} />
      </main>
      <SiteFooter />
    </div>
  );
}
