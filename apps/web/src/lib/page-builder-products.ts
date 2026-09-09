import "server-only";

import { Logger } from "@workspace/logger";

import {
  isFeaturedProductsBlock,
  resolveFeaturedPicks,
} from "@/lib/featured-blocks";
import { getFeaturedProducts } from "@/lib/shopify/featured";
import { getProductByHandle } from "@/lib/shopify/product";
import type {
  FeaturedProduct,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";
import type { PageBuilderBlock, PagebuilderType } from "@/types";

const logger = new Logger("PageBuilderProducts");

export type PageBuilderProducts = {
  /** Full Shopify product data per `featuredProducts` block, keyed by `_key`. */
  featuredProductsByKey: Record<string, FeaturedProduct[]>;
  /**
   * The product per `layersShowcase` block, keyed by `_key`. `null` is a read
   * that failed; the block then fetches from the browser as it used to.
   */
  layersShowcaseProductByKey: Record<string, ShopifyCollectionProduct | null>;
};

function isLayersShowcaseBlock(
  block: PageBuilderBlock
): block is PagebuilderType<"layersShowcase"> {
  return block._type === "layersShowcase";
}

/**
 * Resolves, server-side, the Shopify data the product-backed page-builder
 * blocks need, keyed by block `_key` — for every route that renders the builder.
 *
 * `PageBuilder` is `"use client"` for visual editing, so a block under it
 * cannot read Shopify itself. Left to fetch from the browser, a block ships its
 * skeleton in the server HTML with nothing behind it, which is what a visitor
 * without JavaScript keeps. Resolving here and passing plain values puts the
 * real markup in the first paint. The home page did this first for Featured
 * Products; the slug pages and the blog index rendered the same blocks with no
 * data at all, so a curated row there showed nothing.
 *
 * Every read starts before any is awaited, so a page with a showcase and two
 * featured rows pays for the slowest read rather than their sum. No read
 * rejects: a failed one resolves to its empty value, which is each block's own
 * signal to render nothing or to fetch from the browser.
 */
export async function resolvePageBuilderProducts(
  blocks: readonly PageBuilderBlock[]
): Promise<PageBuilderProducts> {
  const featuredReads = Promise.all(
    blocks.filter(isFeaturedProductsBlock).map(async (block) => {
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

  const showcaseReads = Promise.all(
    blocks.filter(isLayersShowcaseBlock).map(async (block) => {
      // GROQ nulls the handle for an archived or deleted product, and the block
      // renders nothing for it. No read to make.
      if (!block.productHandle) {
        return [block._key, null] as const;
      }

      const product = await getProductByHandle(block.productHandle);
      if (!product) {
        // `null` puts the block back on its browser fetch, so the first paint
        // degrades to skeletons rather than the page failing. Nothing on screen
        // says so; this line does. `_key` leads for the reason above.
        logger.warn(
          `Layers Showcase block ${block._key} could not resolve its product — rendering the browser-fetch fallback (handle: ${block.productHandle})`
        );
      }
      return [block._key, product] as const;
    })
  );

  const [featuredEntries, showcaseEntries] = await Promise.all([
    featuredReads,
    showcaseReads,
  ]);

  return {
    featuredProductsByKey: Object.fromEntries(featuredEntries),
    layersShowcaseProductByKey: Object.fromEntries(showcaseEntries),
  };
}
