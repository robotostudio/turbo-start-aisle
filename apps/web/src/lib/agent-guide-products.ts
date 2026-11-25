import "server-only";

import { unstable_cache } from "next/cache";

import type { GuideCatalogue, GuideProduct } from "@/lib/agent-shop";
import { storefrontQuery } from "@/lib/shopify/client";

const PAGE_SIZE = 50;

// shortcut: the best sellers up to this cap, on one page. At about six lines
// a product, 100 products is some 600 lines and 90 KB of Markdown, and the
// HTML page is several times that. Past the cap the guide links each
// collection's `.md` page, which lists 50 products: a bigger collection falls
// back to the shop's search, so page that list when one exists. `partial`
// tells the guide when the list was cut, so it never says an item it left out
// is sold out.
export const MAX_GUIDE_PRODUCTS = 100;

/** The collections a cut guide links. A shop with more is not all linked. */
const MAX_GUIDE_COLLECTIONS = 50;

const GUIDE_COLLECTIONS_QUERY = /* graphql */ `
  query GuideCollections($first: Int!) {
    collections(first: $first, sortKey: TITLE) {
      edges {
        node {
          handle
          title
        }
      }
    }
  }
`;

type GuideCollectionsResponse = {
  collections: { edges: { node: { handle: string; title: string } }[] };
};

const GUIDE_PRODUCTS_QUERY = /* graphql */ `
  query GuideProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: BEST_SELLING) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          handle
          title
          featuredImage {
            url(transform: { maxWidth: 800 })
          }
          variants(first: 100) {
            pageInfo {
              hasNextPage
            }
            edges {
              node {
                id
                title
                availableForSale
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

type Page = { pageInfo: { hasNextPage: boolean } };

type ListedProduct = GuideProduct & { variants: Page };

type GuideProductsResponse = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: ListedProduct }[];
  };
};

/** One page of best sellers. Throws when Shopify cannot be read. */
async function guideProductsPage(
  first: number,
  after: string | null
): Promise<GuideProductsResponse["products"]> {
  const result = await storefrontQuery<GuideProductsResponse>(
    GUIDE_PRODUCTS_QUERY,
    { variables: { first, after } }
  );
  if (!result.ok) {
    throw new Error(`Guide products read failed: ${result.error}`);
  }
  return result.data.products;
}

/**
 * What the agent guide lists. Throws when Shopify cannot be read: the page
 * then keeps its last good copy and the `.md` twin answers 503, instead of
 * either caching an empty list. A failed later page throws too, so a short
 * list is never cached as the whole shop. Cached for 5 minutes, so the page
 * and its twin show the same stock and share one set of Shopify reads. A cut
 * list comes with the shop's collections, for the guide to link.
 */
export const guideCatalogue = unstable_cache(
  async (): Promise<GuideCatalogue> => {
    const products: ListedProduct[] = [];
    let after: string | null = null;
    let more = true;
    while (more && products.length < MAX_GUIDE_PRODUCTS) {
      // The last read asks only for what the cap still allows.
      const { edges, pageInfo } = await guideProductsPage(
        Math.min(PAGE_SIZE, MAX_GUIDE_PRODUCTS - products.length),
        after
      );
      products.push(...edges.map((edge) => edge.node));
      after = pageInfo.endCursor;
      more = pageInfo.hasNextPage;
      // Shopify says there is more but gave no way to ask for it: stop, and
      // leave `more` set so the list is marked partial.
      if (after === null || edges.length === 0) break;
    }
    const partial =
      more || products.some((product) => product.variants.pageInfo.hasNextPage);
    // A shop that fits on the page never asks for its collections.
    if (!partial) return { products, partial };
    const result = await storefrontQuery<GuideCollectionsResponse>(
      GUIDE_COLLECTIONS_QUERY,
      { variables: { first: MAX_GUIDE_COLLECTIONS } }
    );
    if (!result.ok) {
      throw new Error(`Guide collections read failed: ${result.error}`);
    }
    return {
      products,
      partial,
      collections: result.data.collections.edges.map((edge) => edge.node),
    };
  },
  // Bump the key when the query gains a field the guide reads: the cache
  // outlives a deploy, and the old entry would be served without that field
  // for up to 5 minutes.
  ["agent-guide-catalogue-v4"],
  { revalidate: 300 }
);
