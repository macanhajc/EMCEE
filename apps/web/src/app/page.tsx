import { BotShowcase } from "@/components/marketing/bot-showcase";
import { Comparison } from "@/components/marketing/comparison";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { MarqueeTicker } from "@/components/marketing/marquee-ticker";
import { Pricing } from "@/components/marketing/pricing";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { TrustStrip } from "@/components/marketing/trust-strip";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-x-hidden bg-ink font-marquee-body">
      <SiteNav />
      <MarqueeTicker />
      <main className="flex-1">
        <Hero />
        <BotShowcase />
        <HowItWorks />
        <Comparison />
        <TrustStrip />
        <Pricing />
      </main>
      <SiteFooter />
    </div>
  );
}
