/**
 * Puts a curated few products on sale by setting `compareAtPrice` above the
 * current `price` on every variant. The storefront derives the sale badge and
 * strikethrough from compareAtPrice vs price (product-card.tsx), and Shopify's
 * automated `sale` collection (rule IS_PRICE_REDUCED) auto-populates. Also gives
 * the `sale` collection an image borrowed from the first on-sale product.
 */

import { adminQuery, hasUserErrors, log } from "../seed-shopify/client.js";
import type { UserError } from "../seed-shopify/types.js";
import {
  collectionIdByHandle,
  featuredImageUrl,
  setCollectionImage,
} from "./collection-images.js";
import type { HandoffProduct } from "./load.js";

/** Products marked down: handle → discount fraction (0.2 = 20% off). */
export const SALE_PERCENTAGES: Record<string, number> = {
  "rye-leather-moto-jacket": 0.2,
  "meridian-wide-leg-trouser": 0.25,
  "bramley-wool-crewneck": 0.15,
  "lucca-sleeveless-dress": 0.3,
};

/** Discounted price string (2dp) for an original price at the given fraction. */
function salePrice(original: string, pct: number): string {
  const value = Math.round(Number(original) * (1 - pct) * 100) / 100;
  return value.toFixed(2);
}

/** Marks every variant of one product down: price ↓, compareAtPrice = old price. */
async function markDownProduct(
  handle: string,
  pct: number,
  verbose: boolean
): Promise<boolean> {
  const res = await adminQuery<{
    productByHandle: {
      id: string;
      variants: { nodes: Array<{ id: string; price: string }> };
    } | null;
  }>(
    `query($handle: String!) {
      productByHandle(handle: $handle) {
        id
        variants(first: 100) { nodes { id price } }
      }
    }`,
    { handle }
  );

  const product = res.data?.productByHandle;
  if (!product) {
    log.warn(`sale: product not found — ${handle}`);
    return false;
  }

  const variants = product.variants.nodes.map((v) => ({
    id: v.id,
    price: salePrice(v.price, pct),
    compareAtPrice: v.price,
  }));

  const upd = await adminQuery<{
    productVariantsBulkUpdate: {
      productVariants: Array<{ id: string }> | null;
      userErrors: UserError[];
    };
  }>(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }`,
    { productId: product.id, variants }
  );

  if (upd.errors) {
    log.error(`Sale:${handle} — GraphQL: ${JSON.stringify(upd.errors)}`);
    return false;
  }
  if (hasUserErrors(upd.data?.productVariantsBulkUpdate?.userErrors, `Sale:${handle}`)) {
    return false;
  }

  if (verbose) {
    log.info(`  ${handle} −${Math.round(pct * 100)}% (${variants.length} variants)`);
  }
  return true;
}

/** Applies the curated sale set and gives the sale collection an image. */
export async function applySales(
  products: HandoffProduct[],
  verbose: boolean
): Promise<void> {
  log.info("Applying sale prices…");

  let n = 0;
  for (const [handle, pct] of Object.entries(SALE_PERCENTAGES)) {
    if (await markDownProduct(handle, pct, verbose)) n++;
  }
  log.info(`${n} product(s) marked down`);

  // Give the (now non-empty) sale collection an image from an on-sale product.
  const [first] = Object.keys(SALE_PERCENTAGES);
  if (!first) return;
  const collectionId = await collectionIdByHandle("sale");
  const url = await featuredImageUrl(first);
  if (collectionId && url) {
    const title = products.find((p) => p.handle === first)?.title ?? first;
    if (await setCollectionImage(collectionId, url, title) && verbose) {
      log.info(`  sale ← ${first} hero image`);
    }
  }
}
