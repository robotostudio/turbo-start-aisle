import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/utils";

const baseUrl = getBaseUrl();

/** Not secrets — this saves crawl budget, it is not access control. */
const DISALLOWED = ["/api/", "/og-preview"] as const;

/**
 * `/api/og` renders every `og:image`, and Twitterbot, facebookexternalhit,
 * LinkedInBot and Slackbot all honour robots.txt when fetching one — a bare
 * `Disallow: /api/` strips the image from every shared link. Longest-match wins
 * for all four. `/cart` is absent on purpose: it is `noindex`, and disallowing
 * it would stop crawlers fetching the page carrying that directive.
 */
const ALLOWED = ["/", "/api/og"] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [...ALLOWED],
      disallow: [...DISALLOWED],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
