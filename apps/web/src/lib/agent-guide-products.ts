import "server-only";

import { unstable_cache } from "next/cache";

import type { GuideCatalogue, GuideProduct } from "@/lib/agent-shop";
import { storefrontQuery } from "@/lib/shopify/client";

// shortcut: one page of 50 best sellers with their variants, enough for a small
// catalogue. A bigger shop needs the guide split by collection, or a search.
// `hasNextPage` tells the guide when the list was cut, so it never says an
// item it left out is sold out.
const GUIDE_PRODUCTS_QUERY = /* graphql */ `
  query GuideProducts {
    products(first: 50, sortKey: BEST_SELLING) {
      pageInfo {
        hasNextPage
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

type GuideProductsResponse = {
  products: Page & {
    edges: { node: GuideProduct & { variants: Page } }[];
  };
};

/**
 * What the agent guide lists. Throws when Shopify cannot be read: the page
 * then keeps its last good copy and the `.md` twin answers 503, instead of
 * either caching an empty list. Cached for 5 minutes, so the page and its
 * twin show the same stock and share one Shopify read.
 */
export const guideCatalogue = unstable_cache(
  async (): Promise<GuideCatalogue> => {
    const result =
      await storefrontQuery<GuideProductsResponse>(GUIDE_PRODUCTS_QUERY);
    if (!result.ok) {
      throw new Error(`Guide products read failed: ${result.error}`);
    }
    const products = result.data.products.edges.map((edge) => edge.node);
    return {
      products,
      partial:
        result.data.products.pageInfo.hasNextPage ||
        products.some((product) => product.variants.pageInfo.hasNextPage),
    };
  },
  // Bump the key when the query gains a field: the cache outlives a deploy,
  // and the old entry would be served without that field for up to 5 minutes.
  ["agent-guide-catalogue-v3"],
  { revalidate: 300 }
);
