import { Logger } from "@workspace/logger";
import { sanityFetch } from "@workspace/sanity/live";
import { queryHomePageData } from "@workspace/sanity/query";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { PageBuilder } from "@/components/pagebuilder";
import {
  isFeaturedProductsBlock,
  resolveFeaturedPicks,
} from "@/lib/featured-blocks";
import { getSEOMetadata } from "@/lib/seo";
import { getFeaturedProducts } from "@/lib/shopify/featured";
import type { FeaturedProduct } from "@/lib/shopify/types";

const logger = new Logger("HomePage");

async function fetchHomePageData() {
  return await sanityFetch({
    query: queryHomePageData,
  });
}

export async function generateMetadata() {
  const { data: homePageData } = await fetchHomePageData();
  return getSEOMetadata(
    homePageData
      ? {
          title: homePageData?.title ?? homePageData?.seoTitle ?? "",
          description:
            homePageData?.description ?? homePageData?.seoDescription ?? "",
          slug: homePageData?.slug,
          contentId: homePageData?._id,
          contentType: homePageData?._type,
        }
      : // Same failed read the render path answers with HomePageUnavailable, so
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

  // Featured Products blocks can't fetch Shopify themselves (they render inside
  // the client PageBuilder), so resolve their products here, keyed by block.
  const featuredBlocks = blocks.filter(isFeaturedProductsBlock);
  const featuredEntries = await Promise.all(
    featuredBlocks.map(async (block) => {
      const { handles, pickedCount, droppedCount, allDropped } =
        resolveFeaturedPicks(block);

      if (allDropped) {
        // Every pick is gone, and no handles is precisely the input that makes
        // the resolver answer with best-sellers. Showing an editor four products
        // they did not choose, under their own heading, is worse than showing
        // none — the same call `a0ecbeb` made for the layers showcase. Nothing
        // is on screen either way, so the log is the only thing that can say so.
        //
        // `_key` leads and `heading` trails: stega encoding is on for every read
        // on a preview deploy, and `heading` is not on @sanity/client's denylist,
        // so it arrives carrying invisible markers. `_key` is denylisted.
        logger.warn(
          `Featured Products block ${block._key} has ${pickedCount} pick(s) and not one resolved — rendering nothing rather than best-sellers (heading: ${block.heading ?? "untitled"})`
        );
        return [block._key, [] as FeaturedProduct[]] as const;
      }

      if (droppedCount > 0) {
        // Still renders the survivors: a short row is a smaller lie than a
        // substituted one, and the block has no way to say "and three more".
        logger.warn(
          `Featured Products block ${block._key} lost ${droppedCount} of ${pickedCount} pick(s) to deleted or archived products`
        );
      }

      return [block._key, await getFeaturedProducts(handles)] as const;
    })
  );
  const featuredProductsByKey: Record<string, FeaturedProduct[]> =
    Object.fromEntries(featuredEntries);

  // One PageBuilder over the whole array. Splitting the hero into a second
  // instance gave both the same document id, so each optimistic reducer only
  // saw its own slice and a drag across the boundary never moved anything.
  return (
    <PageBuilder
      featuredProductsByKey={featuredProductsByKey}
      id={_id}
      pageBuilder={blocks}
      type={_type}
    />
  );
}
