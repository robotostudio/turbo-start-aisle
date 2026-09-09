"use client";

import { useOptimistic } from "@sanity/visual-editing/react";
import { env } from "@workspace/env/client";
import type { QueryHomePageDataResult } from "@workspace/sanity/types";
import { createDataAttribute } from "next-sanity";
import { useCallback, useMemo } from "react";

import type {
  FeaturedProduct,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";
import { CollectionBanner } from "./sections/collection-banner";
import { CTABlock } from "./sections/cta";
import { EditorialTwoUp } from "./sections/editorial-two-up";
import { ExploreCategories } from "./sections/explore-categories";
import { FaqAccordion } from "./sections/faq-accordion";
import { FaqCategories } from "./sections/faq-categories";
import { FeatureCardsWithIcon } from "./sections/feature-cards-with-icon";
import { FeaturedProducts } from "./sections/featured-products";
import { HeroBlock } from "./sections/hero";
import { ImageLinkCards } from "./sections/image-link-cards";
import { LayersShowcase } from "./sections/layers-showcase";
import { SubscribeNewsletter } from "./sections/subscribe-newsletter";

// More specific and descriptive type aliases
type PageBuilderBlock = NonNullable<
  NonNullable<QueryHomePageDataResult>["pageBuilder"]
>[number];

export type PageBuilderProps = {
  readonly pageBuilder?: PageBuilderBlock[];
  readonly id: string;
  readonly type: string;
  /**
   * Full Shopify product data for `featuredProducts` blocks, fetched
   * server-side in the page and keyed by block `_key`. Blocks can't fetch
   * Shopify themselves since this is a client component.
   */
  readonly featuredProductsByKey?: Record<string, FeaturedProduct[]>;
  /**
   * The product each `layersShowcase` block shows, fetched server-side in the
   * page and keyed by block `_key`, for the same reason. It has to be here for
   * the block to paint without JavaScript: left to fetch from the browser, the
   * server HTML was five skeleton cells with nothing behind them. `null` is a
   * read that failed; the block then fetches from the browser as it used to.
   */
  readonly layersShowcaseProductByKey?: Record<
    string,
    ShopifyCollectionProduct | null
  >;
  /**
   * Fallback `<h1>` for a page whose blocks supply none. Omit on a page that
   * renders its own `<h1>` outside the builder, or it ships two.
   */
  readonly title?: string | null;
  /** `div` for the blog routes, which nest this inside their own `<main>`. */
  readonly as?: "main" | "div";
};

type SanityDataAttributeConfig = {
  readonly id: string;
  readonly type: string;
  readonly path: string;
};

// biome-ignore lint/suspicious/noExplicitAny: dynamic block component mapping requires any
const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
  collectionBanner: CollectionBanner,
  cta: CTABlock,
  editorialTwoUp: EditorialTwoUp,
  exploreCategories: ExploreCategories,
  faqAccordion: FaqAccordion,
  faqCategories: FaqCategories,
  featuredProducts: FeaturedProducts,
  hero: HeroBlock,
  featureCardsIcon: FeatureCardsWithIcon,
  layersShowcase: LayersShowcase,
  subscribeNewsletter: SubscribeNewsletter,
  imageLinkCards: ImageLinkCards,
};

/**
 * Helper function to create consistent Sanity data attributes
 */
function createSanityDataAttribute(config: SanityDataAttributeConfig): string {
  return createDataAttribute({
    id: config.id,
    baseUrl: env.NEXT_PUBLIC_SANITY_STUDIO_URL,
    projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.NEXT_PUBLIC_SANITY_DATASET,
    type: config.type,
    path: config.path,
  }).toString();
}

/**
 * Error fallback component for unknown block types
 */
function UnknownBlockError({
  blockType,
  blockKey,
}: {
  blockType: string;
  blockKey: string;
}) {
  return (
    <div
      aria-label={`Unknown block type: ${blockType}`}
      className="flex items-center justify-center rounded-lg border-2 border-muted-foreground/20 border-dashed bg-muted p-8 text-center text-muted-foreground"
      key={`${blockType}-${blockKey}`}
      role="alert"
    >
      <div className="space-y-2">
        <p>Component not found for block type:</p>
        <code className="rounded bg-background px-2 py-1 font-mono text-sm">
          {blockType}
        </code>
      </div>
    </div>
  );
}

/**
 * The document shape `useOptimistic` hands the reducer: the raw document off
 * the mutation stream, not the GROQ projection. Only `_key` order is read off
 * it, so the blocks stay `unknown`.
 */
type OptimisticDocument = {
  pageBuilder?: unknown;
};

/**
 * Reorders the already-resolved blocks to match the raw document's `_key`
 * sequence. Keys with no resolved block (a just-inserted one) are dropped until
 * revalidation projects them.
 */
function reorderByRawKeys(
  currentBlocks: PageBuilderBlock[],
  rawBlocks: readonly unknown[]
): PageBuilderBlock[] {
  const resolved = new Map(currentBlocks.map((block) => [block._key, block]));
  const reordered: PageBuilderBlock[] = [];

  for (const raw of rawBlocks) {
    const key = (raw as { _key?: string } | null)?._key;
    const block = key ? resolved.get(key) : undefined;
    if (block) {
      reordered.push(block);
    }
  }

  return reordered;
}

/**
 * Hook to handle optimistic updates for page builder blocks
 */
function useOptimisticPageBuilder(
  initialBlocks: PageBuilderBlock[],
  documentId: string
) {
  return useOptimistic<PageBuilderBlock[], OptimisticDocument>(
    initialBlocks,
    (currentBlocks, action) => {
      if (action.id !== documentId) {
        return currentBlocks;
      }

      // Sanity unsets an emptied array, so an absent `pageBuilder` means every
      // block was deleted. A truthy non-array is malformed — keep what we have
      // rather than throwing out of `for...of` mid-render.
      const rawBlocks = action.document?.pageBuilder ?? [];
      if (!Array.isArray(rawBlocks)) {
        return currentBlocks;
      }

      // The action carries the raw document, not the GROQ projection the page
      // rendered from, so only its `_key` order is usable.
      const reordered = reorderByRawKeys(currentBlocks, rawBlocks);

      // Nothing resolved against a non-empty array means every `_key` is new at
      // once (the whole array was replaced). Keep rendering what we have rather
      // than blanking the page until revalidation.
      if (!reordered.length && rawBlocks.length) {
        return currentBlocks;
      }

      // Editing any field replays this reducer with an unchanged key order.
      // Returning a fresh array there would reconcile every section, so hand
      // back the same reference when nothing actually moved.
      const unchanged =
        reordered.length === currentBlocks.length &&
        reordered.every((block, index) => block === currentBlocks[index]);

      return unchanged ? currentBlocks : reordered;
    }
  );
}

/**
 * Custom hook for block component rendering logic
 */
function useBlockRenderer(
  id: string,
  type: string,
  featuredProductsByKey?: Record<string, FeaturedProduct[]>,
  layersShowcaseProductByKey?: Record<string, ShopifyCollectionProduct | null>
) {
  const createBlockDataAttribute = useCallback(
    (blockKey: string) =>
      createSanityDataAttribute({
        id,
        type,
        path: `pageBuilder[_key=="${blockKey}"]`,
      }),
    [id, type]
  );

  const renderBlock = useCallback(
    (block: PageBuilderBlock, _index: number) => {
      const Component =
        BLOCK_COMPONENTS[block._type as keyof typeof BLOCK_COMPONENTS];

      if (!Component) {
        return (
          <UnknownBlockError
            blockKey={block._key}
            blockType={block._type}
            key={`${block._type}-${block._key}`}
          />
        );
      }

      // Blocks that read Shopify receive their data (fetched server-side)
      // injected here, since a client block can't fetch it. A block absent
      // from its map — rendered by a route that resolves nothing — gets the
      // empty value, which is each block's own signal to render nothing or to
      // fetch from the browser.
      let injectedProps: Record<string, unknown> = {};
      if (block._type === "featuredProducts") {
        injectedProps = {
          products: featuredProductsByKey?.[block._key] ?? [],
        };
      } else if (block._type === "layersShowcase") {
        injectedProps = {
          product: layersShowcaseProductByKey?.[block._key] ?? null,
        };
      }

      return (
        <div
          data-sanity={createBlockDataAttribute(block._key)}
          key={`${block._type}-${block._key}`}
        >
          {/** biome-ignore lint/suspicious/noExplicitAny: <any is used to allow for dynamic component rendering> */}
          <Component {...(block as any)} {...injectedProps} />
        </div>
      );
    },
    [
      createBlockDataAttribute,
      featuredProductsByKey,
      layersShowcaseProductByKey,
    ]
  );

  return { renderBlock };
}

/**
 * PageBuilder component for rendering dynamic content blocks from Sanity CMS
 */
export function PageBuilder({
  pageBuilder: initialBlocks = [],
  id,
  type,
  featuredProductsByKey,
  layersShowcaseProductByKey,
  title,
  as: Wrapper = "main",
}: PageBuilderProps) {
  const blocks = useOptimisticPageBuilder(initialBlocks, id);

  // `hero` is the only block that renders an `<h1>`; the rest open at `<h2>`.
  // Keyed on the hero having a title, not on the block existing — `title` is
  // optional, and an image-led full-bleed hero routinely has none.
  const hasHeroHeading = useMemo(
    () =>
      blocks.some(
        (block) =>
          block._type === "hero" && Boolean((block as { title?: string }).title)
      ),
    [blocks]
  );

  const { renderBlock } = useBlockRenderer(
    id,
    type,
    featuredProductsByKey,
    layersShowcaseProductByKey
  );

  const containerDataAttribute = useMemo(
    () => createSanityDataAttribute({ id, type, path: "pageBuilder" }),
    [id, type]
  );

  // Rendered even when empty: dropping the element would take the `pageBuilder`
  // drop target off the page, leaving an editor who deleted the last block with
  // nothing to drag onto.
  return (
    <Wrapper className="flex flex-col" data-sanity={containerDataAttribute}>
      {/* Restores exactly one `<h1>` without touching layout, as `/search` does. */}
      {!hasHeroHeading && title && <h1 className="sr-only">{title}</h1>}
      {blocks.map(renderBlock)}
    </Wrapper>
  );
}
