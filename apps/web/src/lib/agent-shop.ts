import { z } from "zod";

import { buildLineMetadata } from "@/lib/cart/metadata";
import type { LineMetadata } from "@/lib/cart/types";
import type {
  MoneyV2,
  ShopifyCollectionLite,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";

/**
 * What the shop tells an agent, shared by the in-page WebMCP tools
 * (`components/webmcp-shop-tools.ts`) and the remote server (`app/mcp`), so
 * both answer in the same words. `base` is "" in the page and the site origin
 * on `/mcp`, where a path means nothing to the caller.
 */

export const productHandle = z
  .string()
  .regex(/^[\w-]{1,255}$/)
  .describe("Product handle: the last part of a /products/<handle> URL");

/** One variant and how many: what every add-to-cart tool takes. */
export const cartLineInput = z.object({
  handle: productHandle,
  variantGid: z
    .string()
    .regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/)
    .describe(
      "The variant's variantGid from get_product, as given: gid://shopify/ProductVariant/<digits>"
    ),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const money = ({ amount, currencyCode }: MoneyV2) =>
  `${amount} ${currencyCode}`;

export const noProduct = (handle: string) =>
  `No product has the handle "${handle}". Find the handle with search_products.`;

export const productsSummary = (
  products: ShopifyCollectionProduct[],
  base = ""
) =>
  products.map((product) => ({
    handle: product.handle,
    title: product.title,
    vendor: product.vendor,
    from: money(product.priceRange.minVariantPrice),
    url: `${base}/products/${product.handle}`,
  }));

export const collectionsSummary = (
  collections: Pick<ShopifyCollectionLite, "handle" | "title">[],
  base = ""
) =>
  collections.map((collection) => ({
    handle: collection.handle,
    title: collection.title,
    url: `${base}/collections/${collection.handle}`,
  }));

export const productSummary = (
  product: ShopifyCollectionProduct,
  base = ""
) => ({
  handle: product.handle,
  title: product.title,
  vendor: product.vendor,
  url: `${base}/products/${product.handle}`,
  options: product.options.map(({ name, values }) => ({ name, values })),
  variants: product.variants.edges.map(({ node }) => ({
    variantGid: node.id,
    options: node.selectedOptions,
    price: money(node.price),
    available: node.availableForSale,
  })),
});

export type CartLineChoice =
  | { ok: true; variantId: string; metadata: LineMetadata; named: string }
  | { ok: false; reason: string };

/**
 * The cart line for `quantity` of one variant, or why it can't be added. Price
 * and title come from the product Shopify returned, never from the caller.
 */
export function cartLineFor(
  product: ShopifyCollectionProduct,
  variantGid: string,
  quantity: number
): CartLineChoice {
  const variant = product.variants.edges.find(
    ({ node }) => node.id === variantGid
  )?.node;
  if (!variant) {
    return {
      ok: false,
      reason: `${product.title} has no variant ${variantGid}. Call get_product for its variants.`,
    };
  }
  const metadata = buildLineMetadata({
    productTitle: product.title,
    productHandle: product.handle,
    price: variant.price,
    selectedOptions: variant.selectedOptions,
    image: product.featuredImage,
  });
  if (!variant.availableForSale) {
    return {
      ok: false,
      reason: `${product.title} (${metadata.variantTitle}) is out of stock. Nothing was added.`,
    };
  }
  return {
    ok: true,
    variantId: variant.id,
    metadata,
    named: `${quantity} x ${product.title} (${metadata.variantTitle}) at ${money(variant.price)} each`,
  };
}

const VARIANT_GID = "gid://shopify/ProductVariant/";

/** The query of an add-to-cart link: what `/cart/add` reads back. */
export const cartLinkQuery = z.object({
  handle: productHandle,
  variant: z.string().regex(/^\d{1,20}$/),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
});

/**
 * A link to the page that offers one line; the shopper adds it there. The cart
 * lives in the shopper's browser, so this is how a chat app elsewhere fills it.
 */
export function cartLink(
  base: string,
  handle: string,
  variantGid: string,
  quantity: number
): string {
  const query = new URLSearchParams({
    handle,
    variant: variantGid.replace(VARIANT_GID, ""),
    quantity: String(quantity),
  });
  return `${base}/cart/add?${query}`;
}

export const variantGidFromLink = (variant: string) =>
  `${VARIANT_GID}${variant}`;
