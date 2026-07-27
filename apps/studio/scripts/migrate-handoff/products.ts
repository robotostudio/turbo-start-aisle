/** Product creation via productSet (with metafields), returning variant IDs. */

import { adminQuery, hasUserErrors, log } from "../seed-shopify/client.js";
import type { RunStats, UserError } from "../seed-shopify/types.js";
import type { HandoffProduct } from "./load.js";
import { buildMetafields } from "./metafields.js";

export interface CreatedProduct {
  productId: string;
  /** Maps variant SKU → Shopify variant GID. */
  variantIdsBySku: Record<string, string>;
}

/**
 * Creates a product with all its variants and metafields via productSet.
 * Skips (returns null) if a product with the handle already exists.
 * Images are attached separately (see images.ts) since they need staged upload.
 */
export async function createProduct(
  prod: HandoffProduct,
  locationId: string,
  stats: RunStats,
  verbose: boolean
): Promise<CreatedProduct | null> {
  const check = await adminQuery<{
    productByHandle: { id: string } | null;
  }>(
    `query($handle: String!) { productByHandle(handle: $handle) { id } }`,
    { handle: prod.handle }
  );

  if (check.data?.productByHandle) {
    if (verbose) log.info(`Skipped (exists): ${prod.title}`);
    stats.skipped++;
    return null;
  }

  const productOptions = prod.optionNames.map((optName, optIdx) => {
    const values = [
      ...new Set(
        prod.variants.map((v) => (optIdx === 0 ? v.size : v.color))
      ),
    ];
    return { name: optName, values: values.map((name) => ({ name })) };
  });

  const variantsInput = prod.variants.map((v) => ({
    optionValues: [
      { optionName: "Size", name: v.size },
      { optionName: "Color", name: v.color },
    ],
    price: v.price,
    sku: v.sku,
    inventoryPolicy: "DENY",
    inventoryItem: {
      tracked: true,
      requiresShipping: true,
      measurement: {
        weight: { value: v.grams, unit: "GRAMS" },
      },
    },
    inventoryQuantities: [
      { locationId, name: "available", quantity: v.inventoryQuantity },
    ],
  }));

  const input: Record<string, unknown> = {
    title: prod.title,
    handle: prod.handle,
    descriptionHtml: prod.descriptionHtml,
    productType: prod.productType,
    vendor: prod.vendor,
    tags: prod.tags,
    status: prod.status,
    productOptions,
    variants: variantsInput,
    metafields: buildMetafields(prod),
  };

  const result = await adminQuery<{
    productSet: {
      product: {
        id: string;
        variants: { edges: Array<{ node: { id: string; sku: string } }> };
      } | null;
      userErrors: UserError[];
    };
  }>(
    `mutation($input: ProductSetInput!) {
      productSet(synchronous: true, input: $input) {
        product {
          id
          variants(first: 100) { edges { node { id sku } } }
        }
        userErrors { field message }
      }
    }`,
    { input }
  );

  if (result.errors) {
    log.error(`Product:${prod.handle} — GraphQL: ${JSON.stringify(result.errors)}`);
    stats.failed++;
    return null;
  }

  const { product, userErrors } = result.data?.productSet ?? {};
  if (hasUserErrors(userErrors, `Product:${prod.handle}`)) {
    stats.failed++;
    return null;
  }
  if (!product) {
    log.error(`Product:${prod.handle} — no product returned`);
    stats.failed++;
    return null;
  }

  const variantIdsBySku: Record<string, string> = {};
  for (const { node } of product.variants.edges) {
    if (node.sku) variantIdsBySku[node.sku] = node.id;
  }

  log.info(`Created: ${prod.title} (${prod.variants.length} variants)`);
  stats.created++;
  return { productId: product.id, variantIdsBySku };
}
