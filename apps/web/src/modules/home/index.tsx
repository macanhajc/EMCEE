import { SiteFooter } from "@/components/Elements/site-footer";
import { SiteNav } from "@/components/Elements/site-nav";
import { BotShowcase } from "./components/bot-showcase";
import { Comparison } from "./components/comparison";
import { Hero } from "./components/hero";
import { HowItWorks } from "./components/how-it-works";
import { MarqueeTicker } from "./components/marquee-ticker";
import { Pricing } from "./components/pricing";
import { TrustStrip } from "./components/trust-strip";

export function HomeTemplate() {
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
