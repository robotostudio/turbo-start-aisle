import "server-only";

import { unstable_cache } from "next/cache";

import type { GuideCatalogue, GuideProduct } from "@/lib/agent-shop";
import { storefrontQuery } from "@/lib/shopify/client";

const PAGE_SIZE = 50;

// shortcut: the best sellers up to this cap, on one page. At about six lines
// a product, 100 products is some 600 lines and 90 KB of Markdown, and the
// HTML page is several times that. A bigger shop needs the guide split by
// collection, or a search. `partial` tells the guide when the list was cut,
// so it never says an item it left out is sold out.
export const MAX_GUIDE_PRODUCTS = 100;

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
  after: string | null
): Promise<GuideProductsResponse["products"]> {
  const result = await storefrontQuery<GuideProductsResponse>(
    GUIDE_PRODUCTS_QUERY,
    { variables: { first: PAGE_SIZE, after } }
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
 * and its twin show the same stock and share one set of Shopify reads.
 */
export const guideCatalogue = unstable_cache(
  async (): Promise<GuideCatalogue> => {
    const products: ListedProduct[] = [];
    let after: string | null = null;
    let more = true;
    while (more && products.length < MAX_GUIDE_PRODUCTS) {
      const { edges, pageInfo } = await guideProductsPage(after);
      products.push(...edges.map((edge) => edge.node));
      after = pageInfo.endCursor;
      more = pageInfo.hasNextPage;
      // Shopify says there is more but gave no way to ask for it: stop, and
      // leave `more` set so the list is marked partial.
      if (after === null || edges.length === 0) break;
    }
    return {
      products,
      partial:
        more ||
        products.some((product) => product.variants.pageInfo.hasNextPage),
    };
  },
  // Bump the key when the query gains a field the guide reads: the cache
  // outlives a deploy, and the old entry would be served without that field
  // for up to 5 minutes.
  ["agent-guide-catalogue-v3"],
  { revalidate: 300 }
);
