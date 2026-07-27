/**
 * Sets each collection's image by reusing a product image tied to it.
 *
 * The hand-off provides no collection artwork, so every collection borrows the
 * hero (position-1 dark) image of a representative product that belongs to it:
 * the category collections use the first product in that category, and the
 * universal collections (all-products, new-arrivals) use the first product
 * overall. `sale` has no products yet, so it is skipped. The product image is
 * already on Shopify's CDN, so its URL is reused directly as the collection
 * image `src`. Connect then syncs it into Sanity's `store.imageUrl`.
 */

import { adminQuery, hasUserErrors, log } from "../seed-shopify/client.js";
import type { UserError } from "../seed-shopify/types.js";
import { COLLECTIONS, UNIVERSAL_HANDLES } from "./collections.js";
import type { HandoffProduct } from "./load.js";

/** Picks the representative product handle for each collection. */
function representativeByCollection(
  products: HandoffProduct[]
): Record<string, string> {
  const rep: Record<string, string> = {};
  const first = products[0];

  for (const col of COLLECTIONS) {
    if (col.handle === "sale") continue; // rule-based, no products yet
    if (UNIVERSAL_HANDLES.includes(col.handle)) {
      if (first) rep[col.handle] = first.handle;
      continue;
    }
    const match = products.find((p) => p.collectionHandle === col.handle);
    if (match) rep[col.handle] = match.handle;
  }
  return rep;
}

/** Fetches a product's hero (featured) image URL. */
export async function featuredImageUrl(handle: string): Promise<string | null> {
  const result = await adminQuery<{
    productByHandle: { featuredImage: { url: string } | null } | null;
  }>(
    `query($handle: String!) {
      productByHandle(handle: $handle) { featuredImage { url } }
    }`,
    { handle }
  );
  return result.data?.productByHandle?.featuredImage?.url ?? null;
}

/** Resolves a collection GID by handle. */
export async function collectionIdByHandle(
  handle: string
): Promise<string | null> {
  const result = await adminQuery<{
    collectionByHandle: { id: string } | null;
  }>(
    `query($handle: String!) { collectionByHandle(handle: $handle) { id } }`,
    { handle }
  );
  return result.data?.collectionByHandle?.id ?? null;
}

/** Sets a collection's image to the given CDN URL. */
export async function setCollectionImage(
  collectionId: string,
  src: string,
  altText: string
): Promise<boolean> {
  const result = await adminQuery<{
    collectionUpdate: {
      collection: { id: string } | null;
      userErrors: UserError[];
    };
  }>(
    `mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id }
        userErrors { field message }
      }
    }`,
    { input: { id: collectionId, image: { src, altText } } }
  );

  if (result.errors) {
    log.error(`Collection image: ${JSON.stringify(result.errors)}`);
    return false;
  }
  const { userErrors } = result.data?.collectionUpdate ?? {};
  return !hasUserErrors(userErrors, `CollectionImage:${collectionId}`);
}

/**
 * Applies borrowed product images to every eligible collection.
 * `collectionIds` may be preloaded (pipeline mode); otherwise handles are
 * resolved on demand (standalone `--collection-images` run).
 */
export async function setCollectionImages(
  products: HandoffProduct[],
  collectionIds: Record<string, string>,
  verbose: boolean
): Promise<void> {
  log.info("Setting collection images from product photos…");
  const rep = representativeByCollection(products);
  const titleByHandle = new Map(products.map((p) => [p.handle, p.title]));

  let set = 0;
  for (const [colHandle, prodHandle] of Object.entries(rep)) {
    const collectionId =
      collectionIds[colHandle] ?? (await collectionIdByHandle(colHandle));
    if (!collectionId) {
      log.warn(`No collection id for "${colHandle}" — skipping image`);
      continue;
    }
    const url = await featuredImageUrl(prodHandle);
    if (!url) {
      log.warn(`No featured image for "${prodHandle}" — skipping ${colHandle}`);
      continue;
    }
    const alt = `${titleByHandle.get(prodHandle) ?? prodHandle}`;
    const ok = await setCollectionImage(collectionId, url, alt);
    if (ok) {
      set++;
      if (verbose) log.info(`  ${colHandle} ← ${prodHandle} hero image`);
    }
  }
  log.info(`${set} collection image(s) set`);
}
