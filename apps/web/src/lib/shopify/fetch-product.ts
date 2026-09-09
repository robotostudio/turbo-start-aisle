import type {
  ProductByHandleResponse,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";

/**
 * Browser-side read of one product, through the API route — the client half of
 * the pair whose server half is `getProductByHandle`.
 *
 * A failed response throws rather than resolving `null`. React Query records a
 * resolved value as a success, so a `null` here on a revalidation would replace
 * a product the server had already rendered with nothing — no error state, no
 * retry, and no skeleton either, since the query is settled. Throwing keeps the
 * last data on screen and lets the retry policy run. `null` is reserved for the
 * route's own answer that the product is not there.
 */
export async function fetchProduct(
  handle: string
): Promise<ShopifyCollectionProduct | null> {
  const res = await fetch(`/api/products/${handle}`);
  if (!res.ok) {
    throw new Error(`Product read for ${handle} failed with ${res.status}`);
  }
  const data: ProductByHandleResponse = await res.json();
  return data.product;
}
