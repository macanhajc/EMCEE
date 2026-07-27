import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { hreflangAlternates } from "@/lib/site";
import { PrivacyTemplate } from "@/modules/privacy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  const title = t("title");
  const description = t.raw("intro")[0] as string;
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: hreflangAlternates("/privacy"),
    },
    openGraph: { title, description, url: `/${locale}/privacy` },
    twitter: { title, description },
  };
}

export default function PrivacyPage() {
  return <PrivacyTemplate />;
}
