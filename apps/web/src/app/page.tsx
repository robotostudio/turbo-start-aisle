import { Logger } from "@workspace/logger";
import { sanityFetch } from "@workspace/sanity/live";
import { queryHomePageData } from "@workspace/sanity/query";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { PageBuilder } from "@/components/pagebuilder";
import { resolvePageBuilderProducts } from "@/lib/page-builder-products";
import { getSEOMetadata, seoFromDocument } from "@/lib/seo";

const logger = new Logger("HomePage");

async function fetchHomePageData() {
  return await sanityFetch({
    query: queryHomePageData,
  });
}

export async function generateMetadata() {
  const { data: homePageData } = await fetchHomePageData();
  return homePageData
    ? await seoFromDocument(homePageData, { slug: homePageData.slug ?? "/" })
    : await getSEOMetadata(
        // Same failed read the render path answers with HomePageUnavailable, so
        // the metadata has to agree with it. Without this the unavailable state
        // ships `robots: index, follow` under the site title, canonical `/` and
        // the OG image — and because the route prerenders and next-sanity caches
        // at `revalidate: false`, one failed build-time read pins an indexable
        // "couldn't be loaded" as the home page until a tag revalidation.
        { seoNoIndex: true }
      );
}

/**
 * What a home page with nothing behind it looks like.
 *
 * The string this replaces ("No home page data") sat unstyled between a working
 * navbar and a working footer, and read as an unfinished build rather than as a
 * page that could not be assembled. It also rendered no `<main>` at all, since
 * `PageBuilder` is what supplies the only one on a normal render.
 *
 * Same shell and heading as `app/error.tsx`, so the two failure surfaces read as
 * one system. No "Try again": `reset()` only exists inside an error boundary,
 * and a button that merely reloads would be theatre.
 */
function HomePageUnavailable() {
  return (
    <main className="site-container grid min-h-[60vh] content-center justify-items-center gap-4 py-16 text-center">
      <h1 className="font-light text-3xl tracking-tight md:text-4xl">
        This page couldn&apos;t be loaded
      </h1>
      <p className="max-w-prose text-muted-foreground text-sm tracking-wide">
        Our content service didn&apos;t answer just now. The shop is still open.
      </p>
      <Button asChild className="mt-4 uppercase tracking-wider" size="lg">
        <Link href="/collections">Back to Shop</Link>
      </Button>
    </main>
  );
}

export default async function Page() {
  const { data: homePageData } = await fetchHomePageData();

  if (!homePageData) {
    // Logged here and not in `generateMetadata`, which reads the same deduped
    // response on the same request — two lines for one fact is noise.
    //
    // This page prerenders and next-sanity caches at `revalidate: false` in
    // production, so both this line and the page below it are a build-time
    // event: the warning fires once during the build, and the state it explains
    // is then served from cache until a tag revalidation replaces it. It is a
    // deploy signal, not a live alarm.
    logger.warn(
      "Home page read returned no document — rendering the unavailable state"
    );
    return <HomePageUnavailable />;
  }

  const { _id, _type, pageBuilder } = homePageData ?? {};
  const blocks = pageBuilder ?? [];

  // Product-backed blocks can't fetch Shopify themselves (they render inside
  // the client PageBuilder), so the route resolves their products, keyed by
  // block, and hands them down. Shared with the slug and blog routes.
  const { featuredProductsByKey, layersShowcaseProductByKey } =
    await resolvePageBuilderProducts(blocks);

  // One PageBuilder over the whole array. Splitting the hero into a second
  // instance gave both the same document id, so each optimistic reducer only
  // saw its own slice and a drag across the boundary never moved anything.
  return (
    <PageBuilder
      featuredProductsByKey={featuredProductsByKey}
      id={_id}
      layersShowcaseProductByKey={layersShowcaseProductByKey}
      pageBuilder={blocks}
      title={homePageData.title}
      type={_type}
    />
  );
}
