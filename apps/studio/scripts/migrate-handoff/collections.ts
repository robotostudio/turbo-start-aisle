/**
 * Collection creation + product assignment for the hand-off migration.
 *
 * `all-products` is required — the storefront hardcodes that handle
 * (featured-products.tsx, cart/saved empty states). `new-arrivals` and the
 * per-category collections are manual; `sale` is an automated collection driven
 * by a price-reduced rule (empty until compareAtPrice is set on any variant).
 */

import { adminQuery, hasUserErrors, log } from "../seed-shopify/client.js";
import type { CollectionDef, RunStats, UserError } from "../seed-shopify/types.js";
import type { HandoffProduct } from "./load.js";

export const COLLECTIONS: CollectionDef[] = [
  {
    handle: "all-products",
    title: "All Products",
    descriptionHtml: "<p>Browse the complete collection.</p>",
    ruleSet: null,
  },
  {
    handle: "new-arrivals",
    title: "New Arrivals",
    descriptionHtml: "<p>The latest additions, Spring Summer 2026.</p>",
    ruleSet: null,
  },
  {
    handle: "sale",
    title: "Sale",
    descriptionHtml: "<p>Reduced-price styles.</p>",
    ruleSet: {
      appliedDisjunctively: false,
      rules: [{ column: "IS_PRICE_REDUCED", relation: "IS_SET", condition: "" }],
    },
  },
  { handle: "jackets", title: "Jackets", descriptionHtml: "<p>Outerwear and jackets.</p>", ruleSet: null },
  { handle: "shirts", title: "Shirts", descriptionHtml: "<p>Shirts and overshirts.</p>", ruleSet: null },
  { handle: "knitwear", title: "Knitwear", descriptionHtml: "<p>Sweaters and knits.</p>", ruleSet: null },
  { handle: "bottoms", title: "Bottoms", descriptionHtml: "<p>Trousers and shorts.</p>", ruleSet: null },
  { handle: "tops", title: "Tops", descriptionHtml: "<p>Tees, henleys and tops.</p>", ruleSet: null },
  { handle: "dresses", title: "Dresses", descriptionHtml: "<p>Dresses.</p>", ruleSet: null },
  { handle: "accessories", title: "Accessories", descriptionHtml: "<p>Hats and accessories.</p>", ruleSet: null },
];

/** Handles every product is added to, in addition to its category collection. */
export const UNIVERSAL_HANDLES = ["all-products", "new-arrivals"];

async function createCollection(
  col: CollectionDef,
  stats: RunStats,
  verbose: boolean
): Promise<string | null> {
  const check = await adminQuery<{
    collectionByHandle: { id: string } | null;
  }>(
    `query($handle: String!) { collectionByHandle(handle: $handle) { id } }`,
    { handle: col.handle }
  );

  if (check.data?.collectionByHandle) {
    if (verbose) log.info(`Collection exists: ${col.title}`);
    stats.skipped++;
    return check.data.collectionByHandle.id;
  }

  const input: Record<string, unknown> = {
    title: col.title,
    handle: col.handle,
    descriptionHtml: col.descriptionHtml,
    ...(col.ruleSet ? { ruleSet: col.ruleSet } : {}),
  };

  const result = await adminQuery<{
    collectionCreate: {
      collection: { id: string; title: string } | null;
      userErrors: UserError[];
    };
  }>(
    `mutation($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id title }
        userErrors { field message }
      }
    }`,
    { input }
  );

  if (result.errors) {
    log.error(`Collection:${col.handle} — ${JSON.stringify(result.errors)}`);
    stats.failed++;
    return null;
  }

  const { collection, userErrors } = result.data?.collectionCreate ?? {};
  if (hasUserErrors(userErrors, `Collection:${col.handle}`)) {
    stats.failed++;
    return null;
  }
  if (!collection) {
    log.error(`Collection:${col.handle} — no collection returned`);
    stats.failed++;
    return null;
  }

  log.info(`Collection created: ${collection.title}`);
  stats.created++;
  return collection.id;
}

/** Creates every collection (idempotent). Returns handle→GID map. */
export async function createCollections(
  stats: RunStats,
  verbose: boolean
): Promise<Record<string, string>> {
  log.info("Creating collections…");
  const ids: Record<string, string> = {};
  for (const col of COLLECTIONS) {
    const id = await createCollection(col, stats, verbose);
    if (id) ids[col.handle] = id;
  }
  return ids;
}

/** Adds a set of products to a manual collection (async job, fire-and-forget). */
async function addProductsToCollection(
  collectionId: string,
  productIds: string[]
): Promise<boolean> {
  if (productIds.length === 0) return true;
  const result = await adminQuery<{
    collectionAddProductsV2: {
      job: { id: string } | null;
      userErrors: UserError[];
    };
  }>(
    `mutation($id: ID!, $productIds: [ID!]!) {
      collectionAddProductsV2(id: $id, productIds: $productIds) {
        job { id }
        userErrors { field message }
      }
    }`,
    { id: collectionId, productIds }
  );

  if (result.errors) {
    log.error(`Collection assign: ${JSON.stringify(result.errors)}`);
    return false;
  }
  const { userErrors } = result.data?.collectionAddProductsV2 ?? {};
  return !hasUserErrors(userErrors, `AddToCollection:${collectionId}`);
}

/**
 * Assigns products to their manual collections: all-products + new-arrivals for
 * every product, plus each product's category collection.
 */
export async function assignProductsToCollections(
  products: HandoffProduct[],
  productIds: Record<string, string>,
  collectionIds: Record<string, string>,
  verbose: boolean
): Promise<void> {
  log.info("Assigning products to collections…");

  // Group product GIDs by target collection handle.
  const byCollection: Record<string, string[]> = {};
  const add = (handle: string, gid: string) => {
    (byCollection[handle] ??= []).push(gid);
  };

  for (const prod of products) {
    const gid = productIds[prod.handle];
    if (!gid) continue;
    for (const handle of UNIVERSAL_HANDLES) add(handle, gid);
    add(prod.collectionHandle, gid);
  }

  let dispatched = 0;
  for (const [handle, gids] of Object.entries(byCollection)) {
    const collectionId = collectionIds[handle];
    if (!collectionId) {
      log.warn(`No collection id for "${handle}" — skipping ${gids.length}`);
      continue;
    }
    if (verbose) log.info(`  ${handle} ← ${gids.length} products`);
    const ok = await addProductsToCollection(collectionId, gids);
    if (ok) dispatched += gids.length;
  }

  log.info(`${dispatched} collection assignments dispatched`);
}
