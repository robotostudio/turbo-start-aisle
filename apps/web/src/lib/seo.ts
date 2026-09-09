import { client } from "@workspace/sanity/client";
import { querySettingsData } from "@workspace/sanity/query";
import type { QuerySettingsDataResult } from "@workspace/sanity/types";
import type { Metadata } from "next";
import { cache } from "react";

import { toMarkdownHref } from "@/lib/markdown/shared";
import type { Maybe } from "@/types";
import { capitalize, getBaseUrl, handleErrors } from "@/utils";

/** The site's language, in both spellings. `<html lang>` and `og:locale`. */
export const SITE_LANG = "en";
export const OG_LOCALE = "en_GB";

type SiteConfig = {
  title: string;
  description?: string;
  twitterHandle?: string;
  favicon?: { svg?: string | null; ico?: string | null } | null;
  ogImage?: string | null;
};

// Page-specific SEO data interface
interface PageSeoData extends Metadata {
  title?: string;
  description?: string;
  slug?: string;
  contentId?: string;
  contentType?: string;
  keywords?: string[];
  seoNoIndex?: boolean;
  pageType?: Extract<Metadata["openGraph"], { type: string }>["type"];
  /** Editor overrides from `ogFields`; fall back to the page title/description. */
  ogTitle?: Maybe<string>;
  ogDescription?: Maybe<string>;
}

// OpenGraph image generation parameters
type OgImageParams = {
  type?: string;
  id?: string;
};

/**
 * `client.fetch` does no deduping, so `cache` is what keeps `generateMetadata`
 * and the render pass to one round trip. `handleErrors` because a failed read
 * must not take the whole page's metadata with it.
 */
export const getSettings = cache(async (): Promise<QuerySettingsDataResult> => {
  // `stega: false` is load-bearing: these land in `<title>` and `og:title`,
  // which no overlay decodes. An 11-char title measured 915 chars with it on.
  const [settings] = await handleErrors(
    client.fetch(querySettingsData, {}, { stega: false })
  );
  return settings ?? null;
});

/** `twitter:creator` accepts only `@handle`; the CMS stores a profile URL. */
function toTwitterHandle(profileUrl?: string): string | undefined {
  if (!profileUrl) {
    return;
  }
  const handle = profileUrl.trim().replace(/\/+$/, "").split("/").pop();
  if (!handle || handle.includes(".")) {
    return;
  }
  return handle.startsWith("@") ? handle : `@${handle}`;
}

/** Falls back to the deploy hostname — a literal ships our brand to adopters. */
export async function getSiteConfig(baseUrl: string): Promise<SiteConfig> {
  const settings = await getSettings();

  return {
    title: settings?.siteTitle || new URL(baseUrl).hostname,
    description: settings?.siteDescription || undefined,
    twitterHandle: toTwitterHandle(settings?.socialLinks?.twitter),
    favicon: settings?.favicon ?? null,
    ogImage: settings?.ogImage ?? null,
  };
}

function generateOgImageUrl(params: OgImageParams = {}): string {
  const { type, id } = params;
  const searchParams = new URLSearchParams();

  if (id) {
    searchParams.set("id", id);
  }
  if (type) {
    searchParams.set("type", type);
  }

  const baseUrl = getBaseUrl();
  return `${baseUrl}/api/og?${searchParams.toString()}`;
}

function buildPageUrl({
  baseUrl,
  slug,
}: {
  baseUrl: string;
  slug: string;
}): string {
  const normalizedSlug = slug.startsWith("/") ? slug : `/${slug}`;
  return `${baseUrl}${normalizedSlug}`;
}

function extractTitle({
  pageTitle,
  slug,
  siteTitle,
}: {
  pageTitle?: Maybe<string>;
  slug: string;
  siteTitle: string;
}): string {
  if (pageTitle) {
    return pageTitle;
  }
  if (slug && slug !== "/") {
    return capitalize(slug.replace(/^\//, ""));
  }
  return siteTitle;
}

/** The SEO-bearing subset every page-ish Sanity document shares. */
type SeoSourceDocument = {
  _id?: string | null;
  _type?: string | null;
  title?: string | null;
  seoTitle?: string | null;
  description?: string | null;
  seoDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  seoNoIndex?: boolean | null;
};

export async function getSEOMetadata(
  page: PageSeoData = {}
): Promise<Metadata> {
  const {
    title: pageTitle,
    description: pageDescription,
    slug = "/",
    contentId,
    contentType,
    keywords: pageKeywords = [],
    seoNoIndex = false,
    pageType = "website",
    ogTitle,
    ogDescription,
    ...pageOverrides
  } = page;

  const baseUrl = getBaseUrl();
  const pageUrl = buildPageUrl({ baseUrl, slug });
  const siteConfig = await getSiteConfig(baseUrl);

  // Build default metadata values
  const defaultTitle = extractTitle({
    pageTitle,
    slug,
    siteTitle: siteConfig.title,
  });
  const defaultDescription = pageDescription || siteConfig.description;

  // `ogFields` overrides the social tags only, not `<title>`/`description`.
  const socialTitle = ogTitle || defaultTitle;
  const socialDescription = ogDescription || defaultDescription;

  // The generated image needs a document. Without one (Shopify-only collection,
  // root layout) fall back to Settings, then to `public/opengraph.png`.
  const ogImage = contentId
    ? generateOgImageUrl({ type: contentType, id: contentId })
    : (siteConfig.ogImage ?? `${baseUrl}/opengraph.png`);

  const fullTitle =
    defaultTitle === siteConfig.title
      ? defaultTitle
      : `${defaultTitle} | ${siteConfig.title}`;

  // Build default metadata object
  const defaultMetadata: Metadata = {
    title: fullTitle,
    description: defaultDescription,
    metadataBase: new URL(baseUrl),
    creator: siteConfig.title,
    authors: [{ name: siteConfig.title }],
    // SVG first so browsers that support it take it. Each slot falls back
    // separately: an SVG-only setting must still emit the ICO for Safari.
    icons: {
      icon: [
        ...(siteConfig.favicon?.svg
          ? [{ url: siteConfig.favicon.svg, type: "image/svg+xml" }]
          : []),
        {
          url: siteConfig.favicon?.ico ?? `${baseUrl}/favicon.ico`,
          sizes: "16x16 32x32 48x48",
        },
      ],
    },
    keywords: pageKeywords.length ? pageKeywords : undefined,
    // `follow`, not `nofollow`: keeping a page out of the index is a separate
    // decision from refusing to crawl through it, and a category listing is the
    // only route to some posts.
    robots: seoNoIndex ? "noindex, follow" : "index, follow",
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
      // Both slots resolve from the one handle in Settings: for a single-brand
      // storefront the publishing account and the authoring account are the same.
      site: siteConfig.twitterHandle,
      creator: siteConfig.twitterHandle,
      title: socialTitle,
      description: socialDescription,
    },
    alternates: {
      canonical: pageUrl,
      // Withheld on noindex (advertising a second URL undoes the directive)
      // and on a slug with a query: `toMarkdownHref` appends `.md` to the whole
      // string, so `/blog?page=2` would advertise `/blog?page=2.md` — still
      // pathname `/blog`, so it serves HTML under a `text/markdown` label.
      types:
        seoNoIndex || slug.includes("?")
          ? undefined
          : { "text/markdown": `${baseUrl}${toMarkdownHref(slug)}` },
    },
    openGraph: {
      type: pageType ?? "website",
      // No `countryName`: was hardcoded "UK", and OG has no sane default.
      locale: OG_LOCALE,
      siteName: siteConfig.title,
      description: socialDescription,
      title: socialTitle,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: socialTitle,
          secureUrl: ogImage,
        },
      ],
      url: pageUrl,
    },
  };

  // `alternates` is merged rather than replaced: the spread is shallow, so a
  // route passing only `alternates.languages` would otherwise drop the canonical.
  const { alternates: alternatesOverride, ...restOverrides } = pageOverrides;
  return {
    ...defaultMetadata,
    ...restOverrides,
    alternates: { ...defaultMetadata.alternates, ...alternatesOverride },
  };
}

/** The SEO fallback chain every route's `generateMetadata` was repeating. */
export function seoFromDocument(
  doc: SeoSourceDocument | null | undefined,
  {
    slug,
    pageType,
    seoNoIndex,
  }: {
    slug: string;
    pageType?: PageSeoData["pageType"];
    seoNoIndex?: boolean;
  }
): Promise<Metadata> {
  return getSEOMetadata({
    // Override first, and `||` not `??`: `title` is a required field, so
    // `title ?? seoTitle` could never reach the override `seoFields` promises.
    title: doc?.seoTitle || doc?.title || undefined,
    description: doc?.seoDescription || doc?.description || undefined,
    ogTitle: doc?.ogTitle,
    ogDescription: doc?.ogDescription,
    seoNoIndex: seoNoIndex ?? doc?.seoNoIndex ?? false,
    contentId: doc?._id ?? undefined,
    contentType: doc?._type ?? undefined,
    slug,
    pageType,
  });
}
