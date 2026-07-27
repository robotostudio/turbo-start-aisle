/**
 * Loads the hand-off product catalog from disk and maps it to the internal
 * shape the migration uses. Reads `<handoff>/products/<handle>/product.json`.
 *
 * Applies the migration decisions: vendor "Turbo Start", status ACTIVE, a `new`
 * tag (drives the storefront "New" badge), random 5–50 inventory per variant,
 * and a description limited to the intro paragraph (the Details/Fit/Materials/
 * Shipping copy is delivered via metafields, not descriptionHtml).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const VENDOR = "Turbo Start";
const MIN_INVENTORY = 5;
const MAX_INVENTORY = 50;

/** Maps a hand-off `category` to a storefront collection handle. */
const CATEGORY_TO_COLLECTION: Record<string, string> = {
  Jackets: "jackets",
  Shirts: "shirts",
  Knitwear: "knitwear",
  Trousers: "bottoms",
  Shorts: "bottoms",
  Tops: "tops",
  Dresses: "dresses",
  Accessories: "accessories",
};

export interface HandoffImage {
  /** 1-based position within its colour, used for ordering. */
  position: number;
  /** Absolute path to the PNG. */
  file: string;
  alt: string;
  color: string;
}

export interface HandoffVariant {
  sku: string;
  size: string;
  color: string;
  price: string;
  grams: number;
  inventoryQuantity: number;
}

export interface HandoffProduct {
  handle: string;
  title: string;
  descriptionHtml: string;
  productType: string;
  category: string;
  vendor: string;
  tags: string[];
  status: "ACTIVE";
  /** Option names in order — always ["Size", "Color"] for this catalog. */
  optionNames: string[];
  variants: HandoffVariant[];
  /** All images across every colour, ordered by colour then position. */
  images: HandoffImage[];
  /** Collection handle derived from `category`. */
  collectionHandle: string;
  // Raw content for metafields:
  details: string[];
  fitAndSizing: string[];
  materials: { composition: string; care: string };
  shippingAndReturns: string;
}

interface RawImage {
  position: number;
  alt: string;
  /** Path to the neutral cutout, relative to the hand-off root. */
  file: string;
  transparent?: boolean;
  width?: number;
  height?: number;
}

interface RawColor {
  name: string;
  images: RawImage[];
}

interface RawProduct {
  handle: string;
  title: string;
  description: string;
  category: string;
  product_type: string;
  options: { sizes: string[]; colors: string[] };
  colors: RawColor[];
  variants: Array<{
    sku: string;
    size: string;
    color: string;
    price: string;
    grams: number;
  }>;
  tags: string[];
  details: string[];
  fit_and_sizing: string[];
  materials: { composition: string; care: string };
  shipping_and_returns: string;
}

/** Inclusive random integer in [min, max]. */
function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function mapProduct(raw: RawProduct, handoffDir: string): HandoffProduct {
  const images: HandoffImage[] = [];
  for (const color of raw.colors) {
    for (const img of color.images) {
      images.push({
        position: img.position,
        file: resolve(handoffDir, img.file),
        alt: img.alt,
        color: color.name,
      });
    }
  }

  const variants: HandoffVariant[] = raw.variants.map((v) => ({
    sku: v.sku,
    size: v.size,
    color: v.color,
    price: v.price,
    grams: v.grams,
    inventoryQuantity: randomInt(MIN_INVENTORY, MAX_INVENTORY),
  }));

  const tags = [...new Set([...raw.tags, "new"])];

  const collectionHandle = CATEGORY_TO_COLLECTION[raw.category];
  if (!collectionHandle) {
    throw new Error(
      `No collection mapping for category "${raw.category}" (${raw.handle})`
    );
  }

  return {
    handle: raw.handle,
    title: raw.title,
    descriptionHtml: `<p>${raw.description}</p>`,
    productType: raw.product_type,
    category: raw.category,
    vendor: VENDOR,
    tags,
    status: "ACTIVE",
    optionNames: ["Size", "Color"],
    variants,
    images,
    collectionHandle,
    details: raw.details,
    fitAndSizing: raw.fit_and_sizing,
    materials: raw.materials,
    shippingAndReturns: raw.shipping_and_returns,
  };
}

/** Reads and parses every `product.json` under `<handoff>/products/`. */
export function loadProducts(handoffDir: string): HandoffProduct[] {
  const productsDir = join(handoffDir, "products");
  const handles = readdirSync(productsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const products: HandoffProduct[] = [];
  for (const handle of handles) {
    const jsonPath = join(productsDir, handle, "product.json");
    const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as RawProduct;
    products.push(mapProduct(raw, handoffDir));
  }
  return products;
}
