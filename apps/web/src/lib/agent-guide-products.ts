import "server-only";

import type { GuideProduct } from "@/lib/agent-shop";
import { storefrontQuery } from "@/lib/shopify/client";
import type { Connection } from "@/lib/shopify/types";

// shortcut: one page of 50 best sellers with their variants, enough for a small
// catalogue. A bigger shop needs the guide split by collection, or a search.
const GUIDE_PRODUCTS_QUERY = /* graphql */ `
  query GuideProducts {
    products(first: 50, sortKey: BEST_SELLING) {
      edges {
        node {
          handle
          title
          variants(first: 100) {
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

/** The products the agent guide lists. Empty on an outage: the guide still serves. */
export async function guideProducts(): Promise<GuideProduct[]> {
  const result = await storefrontQuery<{ products: Connection<GuideProduct> }>(
    GUIDE_PRODUCTS_QUERY
  );
  return result.ok ? result.data.products.edges.map((edge) => edge.node) : [];
}
