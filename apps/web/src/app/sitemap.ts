import { client } from "@workspace/sanity/client";
import { querySitemapData } from "@workspace/sanity/query";
import type { QuerySitemapDataResult } from "@workspace/sanity/types";
import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/utils";

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

/** How a group of URLs is weighted in the sitemap. */
type SitemapRank = {
  readonly priority: number;
  readonly changeFrequency: ChangeFrequency;
};

/** A rank plus the prefix joined to each Sanity slug or Shopify handle. */
type SitemapSource = SitemapRank & { readonly pathPrefix: string };

/**
 * Sanity documents, keyed by `_type`. The key is bound to `querySitemapData`'s
 * result, so adding a source here without adding the matching projection to
 * that query fails `pnpm check-types` instead of silently omitting the pages.
 *
 * `pathPrefix` is empty because `createSlug` (apps/studio/utils/slug.ts) bakes
 * both the leading slash and the type prefix into `slug.current` — a blog slug
 * is already `/blog/my-post`.
 */
const SANITY_SITEMAP_SOURCES = [
  { key: "page", pathPrefix: "", priority: 0.8, changeFrequency: "weekly" },
  { key: "blog", pathPrefix: "", priority: 0.5, changeFrequency: "weekly" },
  // A singleton, so neither a `page` nor a `blog` — it was absent entirely.
  { key: "blogIndex", pathPrefix: "", priority: 0.6, changeFrequency: "daily" },
  {
    key: "product",
    pathPrefix: "/products/",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    key: "collection",
    pathPrefix: "/collections/",
    priority: 0.6,
    changeFrequency: "weekly",
  },
] as const satisfies readonly (SitemapSource & {
  key: keyof QuerySitemapDataResult;
})[];

/** Routes with no backing document. */
const STATIC_SITEMAP_ENTRIES = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/collections", priority: 0.6, changeFrequency: "weekly" },
] as const satisfies readonly ({ path: string } & SitemapRank)[];

const baseUrl = getBaseUrl();

/**
 * Every source projects `_updatedAt`, so `lastModified` is a real edit time.
 * Products and collections fell back to `Date.now()`, telling crawlers the whole
 * catalogue changed on every build.
 */
function toEntry(
  path: string,
  rank: SitemapRank,
  lastModified?: string
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${path}`,
    lastModified: new Date(lastModified ?? Date.now()),
    changeFrequency: rank.changeFrequency,
    priority: rank.priority,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sanityDocs = await client.fetch(querySitemapData);

  return [
    ...STATIC_SITEMAP_ENTRIES.map(({ path, ...rank }) => toEntry(path, rank)),

    ...SANITY_SITEMAP_SOURCES.flatMap(({ key, pathPrefix, ...rank }) =>
      sanityDocs[key]
        .filter((doc) => doc.path !== null)
        .map((doc) =>
          toEntry(`${pathPrefix}${doc.path}`, rank, doc.lastModified)
        )
    ),
  ];
}
