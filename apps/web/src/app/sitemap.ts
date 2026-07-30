import { client } from "@workspace/sanity/client";
import {
  queryCollectionPaths,
  queryProductPaths,
  querySitemapData,
} from "@workspace/sanity/query";
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
] as const satisfies readonly (SitemapSource & {
  key: keyof QuerySitemapDataResult;
})[];

/**
 * Shopify-backed routes. These reuse the path queries that also drive
 * `generateStaticParams` and llms.txt rather than being folded into
 * `querySitemapData`. Results are fetched by mapping over this array, so they
 * stay index-aligned with it.
 */
const SHOPIFY_SITEMAP_SOURCES = [
  {
    query: queryProductPaths,
    pathPrefix: "/products/",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    query: queryCollectionPaths,
    pathPrefix: "/collections/",
    priority: 0.6,
    changeFrequency: "weekly",
  },
] as const satisfies readonly (SitemapSource & { query: string })[];

/** Routes with no backing document. */
const STATIC_SITEMAP_ENTRIES = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/collections", priority: 0.6, changeFrequency: "weekly" },
] as const satisfies readonly ({ path: string } & SitemapRank)[];

const baseUrl = getBaseUrl();

/**
 * Sanity sources carry `_updatedAt`; Shopify handles have no timestamp, so
 * they fall back to now — matching what each branch emitted previously.
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
  const [sanityDocs, shopifyPaths] = await Promise.all([
    client.fetch(querySitemapData),
    Promise.all(
      SHOPIFY_SITEMAP_SOURCES.map((source) => client.fetch(source.query))
    ),
  ]);

  return [
    ...STATIC_SITEMAP_ENTRIES.map(({ path, ...rank }) => toEntry(path, rank)),

    ...SANITY_SITEMAP_SOURCES.flatMap(({ key, pathPrefix, ...rank }) =>
      sanityDocs[key].map((doc) =>
        toEntry(`${pathPrefix}${doc.path}`, rank, doc.lastModified)
      )
    ),

    ...SHOPIFY_SITEMAP_SOURCES.flatMap(({ pathPrefix, ...rank }, index) =>
      (shopifyPaths[index] ?? [])
        .filter((handle): handle is string => handle !== null)
        .map((handle) => toEntry(`${pathPrefix}${handle}`, rank))
    ),
  ];
}
