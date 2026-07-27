import type { Metadata } from "next";
import { Geist, Geist_Mono, Bungee, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { RoutePointerEventsReset } from "@/components/Elements/route-pointer-events-reset";
import { PostHogProvider } from "@/components/Elements/posthog-provider";
import { CookieConsentBanner } from "@/components/Elements/cookie-consent-banner";
import { JsonLd } from "@/components/Elements/json-ld";
import { Toaster } from "@/components/UI/sonner";
import { routing } from "@/i18n/routing";
import { COOKIE_CONSENT_COOKIE, readServerCookieConsent } from "@/lib/cookie-consent";
import { hreflangAlternates, SITE_NAME, SITE_URL } from "@/lib/site";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bungee = Bungee({
  variable: "--font-bungee",
  weight: "400",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const title = t("title");
  const description = t("description");

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s · ${SITE_NAME}` },
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: hreflangAlternates("/"),
    },
    openGraph: {
      title,
      description,
      url: `/${locale}`,
      siteName: SITE_NAME,
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Enables static rendering for this locale's request-config lookups.
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const initialConsent = readServerCookieConsent(cookieStore.get(COOKIE_CONSENT_COOKIE)?.value);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${bungee.variable} ${plusJakarta.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                name: SITE_NAME,
                url: SITE_URL,
              },
              {
                "@type": "WebSite",
                name: SITE_NAME,
                url: SITE_URL,
              },
            ],
          }}
        />
        <NextIntlClientProvider>
          <PostHogProvider initialConsent={initialConsent}>
            <RoutePointerEventsReset />
            {children}
            <Toaster />
            <CookieConsentBanner initialConsent={initialConsent} />
          </PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
