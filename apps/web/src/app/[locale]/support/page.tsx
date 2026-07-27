import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { hreflangAlternates } from "@/lib/site";
import { SupportTemplate } from "@/modules/support";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "support" });
  const title = t("title");
  const description = t("intro");
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/support`,
      languages: hreflangAlternates("/support"),
    },
    openGraph: { title, description, url: `/${locale}/support` },
    twitter: { title, description },
  };
}

export default function SupportPage() {
  return <SupportTemplate />;
}
