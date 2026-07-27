import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { hreflangAlternates } from "@/lib/site";
import { TermsTemplate } from "@/modules/terms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  const title = t("title");
  const description = t.raw("intro")[0] as string;
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/terms`,
      languages: hreflangAlternates("/terms"),
    },
    openGraph: { title, description, url: `/${locale}/terms` },
    twitter: { title, description },
  };
}

export default function TermsPage() {
  return <TermsTemplate />;
}
