/**
 * Hand-off product migration — CLI entry point.
 *
 * Creates the 12 real hand-off products in Shopify (Admin API) with their
 * images, metafield-driven PDP content, and per-category collections. Shopify
 * Connect then syncs them into Sanity, and the storefront reads them live.
 *
 * Usage (from apps/studio):
 *   pnpm migrate:handoff -- --dry-run --verbose        # parse + validate only
 *   pnpm migrate:handoff -- --clean --verbose          # wipe dummies, then migrate
 *   pnpm migrate:handoff -- --reimage --verbose        # swap media on existing products
 *   pnpm migrate:handoff -- --handoff=/path/to/handoff # custom source dir
 */

import "./bootstrap-env.js";

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";

import {
  adminQuery,
  getDefaultLocationId,
  getStoreDomain,
  log,
} from "../seed-shopify/client.js";
import {
  cleanAllProducts,
  cleanAllCollections,
  cleanAllDiscounts,
} from "../seed-shopify/cleanup.js";
import { publishAll } from "../seed-shopify/publish.js";
import type { RunStats } from "../seed-shopify/types.js";
import { setCollectionImages } from "./collection-images.js";
import {
  assignProductsToCollections,
  createCollections,
} from "./collections.js";
import {
  reimageProduct,
  relinkVariantImagesForProduct,
  uploadAndAttachImages,
} from "./images.js";
import { buildMetafields, ensureMetafieldDefinitions } from "./metafields.js";
import { loadProducts } from "./load.js";
import { createProduct } from "./products.js";
import { applySales } from "./sale.js";

interface Flags {
  clean: boolean;
  verbose: boolean;
  dryRun: boolean;
  relink: boolean;
  reimage: boolean;
  collectionImages: boolean;
  sale: boolean;
  publish: boolean;
  handoffDir: string;
  /** When set, restrict --reimage/--relink to these handles. */
  only: string[];
}

function parseFlags(): Flags {
  let clean = false;
  let verbose = false;
  let dryRun = false;
  let relink = false;
  let reimage = false;
  let collectionImages = false;
  let sale = false;
  let publish = false;
  let handoffDir =
    process.env.HANDOFF_DIR ?? `${homedir()}/Downloads/shopify-handoff`;
  let only: string[] = [];

  for (const arg of process.argv.slice(2)) {
    if (arg === "--clean") clean = true;
    else if (arg === "--verbose" || arg === "-v") verbose = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--relink") relink = true;
    else if (arg === "--reimage") reimage = true;
    else if (arg === "--collection-images") collectionImages = true;
    else if (arg === "--sale") sale = true;
    else if (arg === "--publish") publish = true;
    else if (arg.startsWith("--handoff=")) {
      handoffDir = arg.slice("--handoff=".length);
    } else if (arg.startsWith("--only=")) {
      only = arg
        .slice("--only=".length)
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
    }
  }

  return {
    clean,
    verbose,
    dryRun,
    relink,
    reimage,
    collectionImages,
    sale,
    publish,
    handoffDir,
    only,
  };
}

/** Validates + prints a per-product summary without writing anything. */
function dryRun(handoffDir: string): void {
  const products = loadProducts(handoffDir);
  log.info(`Loaded ${products.length} products from ${handoffDir}`);

  let missing = 0;
  for (const prod of products) {
    const metafields = buildMetafields(prod);
    for (const img of prod.images) {
      if (!existsSync(img.file)) {
        log.error(`  MISSING image: ${img.file}`);
        missing++;
      }
    }
    log.info(
      `${prod.handle} → ${prod.variants.length} variants, ` +
        `${prod.images.length} images, ` +
        `${metafields.length} metafields, tags=[${prod.tags.join(", ")}], ` +
        `collection=${prod.collectionHandle}, status=${prod.status}`
    );
  }

  if (missing > 0) {
    log.error(`${missing} image file(s) missing — fix before a real run`);
    process.exit(1);
  }
  log.info("Dry run OK — all images present, all products parsed.");
}

async function main(): Promise<void> {
  const {
    clean,
    verbose,
    dryRun: isDryRun,
    relink,
    reimage,
    collectionImages,
    sale,
    publish,
    handoffDir,
    only,
  } = parseFlags();

  if (!existsSync(handoffDir) || !statSync(handoffDir).isDirectory()) {
    log.error(`Hand-off dir not found: ${handoffDir}`);
    process.exit(1);
  }

  if (isDryRun) {
    log.info("Mode: DRY RUN");
    dryRun(handoffDir);
    return;
  }

  const domain = getStoreDomain();
  log.info(`Store: ${domain}`);

  /** Loads products, optionally narrowed to the --only handles. */
  const loadSelected = () => {
    const all = loadProducts(handoffDir);
    if (only.length === 0) return all;
    const selected = all.filter((p) => only.includes(p.handle));
    log.info(`--only → ${selected.length}/${all.length}: ${only.join(", ")}`);
    return selected;
  };

  // ── Relink mode: repair variant→image links on existing products only ──────
  if (relink) {
    log.info("Mode: RELINK");
    const products = loadSelected();
    let ok = 0;
    for (const prod of products) {
      try {
        if (await relinkVariantImagesForProduct(prod, verbose)) ok++;
      } catch (err) {
        log.error(`Relink ${prod.handle}: ${(err as Error).message}`);
      }
    }
    log.info(`Relinked ${ok}/${products.length} products`);
    return;
  }

  // ── Reimage mode: swap media on existing products (keeps GIDs/variants) ─────
  if (reimage) {
    log.info("Mode: REIMAGE");
    const products = loadSelected();
    let ok = 0;
    for (const prod of products) {
      try {
        if (await reimageProduct(prod, verbose)) ok++;
      } catch (err) {
        log.error(`Reimage ${prod.handle}: ${(err as Error).message}`);
      }
    }
    log.info(`Reimaged ${ok}/${products.length} products`);
    return;
  }

  // ── Collection-images mode: set collection artwork from product photos ──────
  if (collectionImages) {
    log.info("Mode: COLLECTION IMAGES");
    const products = loadProducts(handoffDir);
    await setCollectionImages(products, {}, verbose);
    return;
  }

  // ── Sale mode: mark the curated few products down on the existing catalog ───
  if (sale && !clean) {
    log.info("Mode: SALE");
    const products = loadProducts(handoffDir);
    await applySales(products, verbose);
    return;
  }

  // ── Publish mode: publish all live products + collections to all channels ───
  if (publish && !clean) {
    log.info("Mode: PUBLISH");
    const [prods, cols] = await Promise.all([
      adminQuery<{ products: { nodes: Array<{ id: string; handle: string }> } }>(
        `{ products(first: 100) { nodes { id handle } } }`
      ),
      adminQuery<{
        collections: { nodes: Array<{ id: string; handle: string }> };
      }>(`{ collections(first: 50) { nodes { id handle } } }`),
    ]);
    const productIds = Object.fromEntries(
      (prods.data?.products.nodes ?? []).map((n) => [n.handle, n.id])
    );
    const collectionIds = Object.fromEntries(
      (cols.data?.collections.nodes ?? []).map((n) => [n.handle, n.id])
    );
    await publishAll(productIds, collectionIds, verbose);
    return;
  }

  const stats: RunStats = { created: 0, skipped: 0, failed: 0 };

  try {
    if (clean) {
      log.info("Cleaning existing catalog…");
      await cleanAllProducts();
      await cleanAllCollections();
      await cleanAllDiscounts();
    }

    await ensureMetafieldDefinitions(verbose);

    const locationId = await getDefaultLocationId();
    const collectionIds = await createCollections(stats, verbose);
    const products = loadProducts(handoffDir);
    log.info(`Loaded ${products.length} products`);

    const productIds: Record<string, string> = {};
    for (const prod of products) {
      const created = await createProduct(prod, locationId, stats, verbose);
      if (!created) continue;
      productIds[prod.handle] = created.productId;
      await uploadAndAttachImages(
        created.productId,
        prod,
        created.variantIdsBySku,
        verbose
      );
    }

    await assignProductsToCollections(
      products,
      productIds,
      collectionIds,
      verbose
    );
    await setCollectionImages(products, collectionIds, verbose);
    if (sale) await applySales(products, verbose);
    await publishAll(productIds, collectionIds, verbose);
  } catch (err) {
    log.error(`Fatal: ${(err as Error).message}`);
    process.exit(1);
  }

  log.info(
    `Done — created:${stats.created} skipped:${stats.skipped} failed:${stats.failed}`
  );
  if (stats.failed > 0) process.exit(1);
}

main();
