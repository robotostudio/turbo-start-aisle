import "server-only";

import { storefrontQuery } from "@/lib/shopify/client";
import { PRODUCT_BY_HANDLE_QUERY } from "@/lib/shopify/queries";
import type {
  ProductByHandleResponse,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";

/**
 * One product by handle, for a page that has to hand it to a client block.
 *
 * `null` covers both a handle Shopify does not know and a read that failed.
 * The callers are page renders, and either way the block falls back to
 * fetching from the browser, so the distinction buys nothing here. The API
 * route at `app/api/products/[handle]` keeps it, because a browser can act on
 * a 502.
 */
export async function getProductByHandle(
  handle: string
): Promise<ShopifyCollectionProduct | null> {
  const result = await storefrontQuery<ProductByHandleResponse>(
    PRODUCT_BY_HANDLE_QUERY,
    { variables: { handle } }
  );
  if (!result.ok) return null;
  return result.data.product;
}
