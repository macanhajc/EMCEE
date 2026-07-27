import type { Metadata } from "next";
import { JsonLd } from "@/components/Elements/json-ld";
import { getEmceePrices } from "@/lib/pricing";
import { hreflangAlternates, SITE_URL } from "@/lib/site";
import { HomeTemplate } from "@/modules/home";

// A numeric price for structured data — pricing.ts only exposes display
// strings ("R$14,99"), and Offer.price needs a plain decimal.
function parseBrl(display: string): string {
  return display.replace("R$", "").replace(",", ".");
}

// title/description inherited from the layout default (that copy is written
// for this page) — only canonical/OG url need to be set here.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    alternates: {
      canonical: `/${locale}`,
      languages: hreflangAlternates("/"),
    },
    openGraph: {
      url: `/${locale}`,
    },
  };
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const prices = await getEmceePrices();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Emcee",
          applicationCategory: "GameApplication",
          operatingSystem: "Highrise",
          description:
            "A hosted Highrise bot that runs emotes, greets guests, moderates chat, and wears an outfit in your Highrise room — bring your own bot account, we keep it online 24/7.",
          url: `${SITE_URL}/${locale}`,
          offers: [
            {
              "@type": "Offer",
              price: parseBrl(prices.monthly.brl),
              priceCurrency: "BRL",
              url: `${SITE_URL}/${locale}`,
              category: "subscription",
            },
            {
              "@type": "Offer",
              price: parseBrl(prices.annual.brl),
              priceCurrency: "BRL",
              url: `${SITE_URL}/${locale}`,
              category: "subscription",
            },
          ],
        }}
      />
      <HomeTemplate prices={prices} />
    </>
  );
}
