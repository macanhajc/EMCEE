import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Mirrors src/lib/route-access.ts's gating map: everything auth-gated or
// admin-only has no SEO value and shouldn't be crawled. Locale-prefixed
// (localePrefix "always"), hence the leading "/*/".
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/*/dashboard",
        "/*/checkout",
        "/*/instances",
        "/*/account",
        "/*/admin",
        "/*/login",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
