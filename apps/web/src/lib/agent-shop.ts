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

/** The guide a chat agent reads when its user pastes the shop prompt. */
export const SHOP_GUIDE_PATH = "/shop-for-agents";

export const SHOP_GUIDE_TITLE = "Shop here, for AI agents";

export const SHOP_GUIDE_DESCRIPTION =
  "How an AI agent finds a product in this shop for its user and gives them a link that adds it to their cart.";

/**
 * The guide's steps. Every URL an agent must open is one it finds on a page:
 * chat agents refuse URLs they build themselves, and robots.txt closes /api/.
 */
export function shopGuide(base: string) {
  return {
    intro:
      "Use this page when your user asks you to find or buy something in this shop. You read the shop as Markdown pages and give your user a link. You need no API key, account or connector. You cannot change a cart or pay: your user does both.",
    steps: [
      {
        title: "1. Ask your user",
        lines: [
          "What they are looking for, and any size, colour or budget.",
          "How many they want. One link adds up to 10.",
        ],
      },
      {
        title: "2. Find the product",
        lines: [
          `Open ${base}/collections.md for the collections. Each collection page lists up to 50 of its products with their lowest price.`,
          `Or open ${base}/llms.txt, which lists the product pages.`,
          "Only open links you find on these pages. Do not build a search or API URL: /api/ is closed to agents.",
        ],
      },
      {
        title: "3. Read the product page",
        lines: [
          "Open the product's page ending in .md. It has the description, the options and a table of variants with price and stock.",
          'Each variant in stock has an "Add to cart" link in that table.',
        ],
      },
      {
        title: "4. Confirm with your user",
        lines: [
          "Tell them the product, the variant and the price, then wait for their answer.",
          "Never pick a size or colour they did not choose.",
        ],
      },
      {
        title: "5. Give your user the link",
        lines: [
          'Copy the variant\'s "Add to cart" link exactly as listed. For more than one, change quantity=1 to the number they want.',
          'Tell them the link opens a page that shows the item, and nothing is added until they press "Add to cart". They check out and pay themselves.',
        ],
      },
      {
        title: "Using tools instead",
        lines: [
          `${base}/llms.txt also lists an MCP server and the WebMCP tools, for agents that can connect to them.`,
        ],
      },
    ],
  };
}

/** A URL inside a guide line: the page and the `.md` twin both make it a link. */
export const GUIDE_URL = /(https?:\/\/[^\s,]+)/;

/** The guide as Markdown: the `.md` twin of the page. */
export function shopGuideMarkdown(base: string): string {
  const { intro, steps } = shopGuide(base);
  return [
    `# ${SHOP_GUIDE_TITLE}`,
    intro,
    ...steps.map(
      ({ title, lines }) =>
        `## ${title}\n\n${lines
          .map((line) => `- ${line.replace(GUIDE_URL, "<$1>")}`)
          .join("\n")}`
    ),
  ].join("\n\n");
}
