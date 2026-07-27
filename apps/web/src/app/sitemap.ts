import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { hreflangAlternates, SITE_URL } from "@/lib/site";

// Legal copy's own "Last updated" date (messages/*.json privacy.updated /
// terms.updated) — kept in sync by hand since it's just metadata, not a
// value either page's rendering depends on.
const LEGAL_LAST_MODIFIED = new Date("2026-07-22");

interface PublicPage {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  lastModified: Date;
}

const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", changeFrequency: "weekly", priority: 1, lastModified: new Date() },
  { path: "/support", changeFrequency: "monthly", priority: 0.5, lastModified: new Date() },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3, lastModified: LEGAL_LAST_MODIFIED },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3, lastModified: LEGAL_LAST_MODIFIED },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.flatMap(({ path, changeFrequency, priority, lastModified }) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path === "/" ? "" : path}`,
      lastModified,
      changeFrequency,
      priority,
      alternates: { languages: hreflangAlternates(path) },
    })),
  );
}
