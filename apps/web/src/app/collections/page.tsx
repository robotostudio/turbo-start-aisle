import { sanityFetch } from "@workspace/sanity/live";
import {
  queryAllCollections,
  queryCollectionsIndexPageData,
} from "@workspace/sanity/query";

import { CollectionsContent } from "@/components/collections/collections-content";
import { BreadcrumbJsonLd, CollectionJsonLd } from "@/components/json-ld";
import { getSEOMetadata } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

export async function generateMetadata() {
  const { data } = await sanityFetch({
    query: queryCollectionsIndexPageData,
  });

  return getSEOMetadata({
    title: data?.seoTitle ?? data?.title ?? "Collections",
    description:
      data?.seoDescription ?? data?.subtitle ?? "Browse all collections",
    slug: "/collections",
  });
}

export default async function CollectionsPage() {
  const [{ data: indexData }, { data: collections }] = await Promise.all([
    sanityFetch({ query: queryCollectionsIndexPageData }),
    sanityFetch({ query: queryAllCollections }),
  ]);

  // Throwing rather than degrading to an empty list. This page prerenders, and
  // next-sanity caches its reads with `revalidate: false` in production, so
  // whatever renders here is served until a Sanity tag revalidation replaces
  // it. An empty grid from a failed read is a 200 no shopper can tell apart
  // from a store with no collections; throwing leaves the last good page in
  // place, because Next keeps serving it when a background re-render throws.
  //
  // Nullish rather than empty: `[]` is a legitimate 200 for a store with no
  // collections yet, and a blanket length check would break it. The guard is
  // live despite `QueryAllCollectionsResult` being a non-nullable array,
  // because `ClientReturn` falls back to `any` for any query missing from the
  // generated map — a stale `pnpm --filter studio type` is exactly when a null
  // would otherwise reach `CollectionsContent` untyped.
  if (!collections) {
    throw new Error("Collections read failed: sanityFetch returned no data");
  }

  const baseUrl = getBaseUrl();
  const title = indexData?.title ?? "Collections";

  return (
    <>
      <BreadcrumbJsonLd
        items={[{ name: "Home", url: baseUrl }, { name: title }]}
      />
      <CollectionJsonLd
        description={indexData?.subtitle ?? null}
        items={collections.map((c) => ({
          name: c.title ?? "",
          ...(c.slug ? { url: `${baseUrl}/collections/${c.slug}` } : {}),
        }))}
        name={title}
        url={`${baseUrl}/collections`}
      />
      <CollectionsContent collections={collections} title={title} />
    </>
  );
}
