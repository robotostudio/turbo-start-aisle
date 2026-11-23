import {
  addToCartSchema,
  buildCollectionUrl,
  productFiltersSchema,
} from "@workspace/ai-commerce";
import type { WebMCP } from "webmcp-types";
import { z } from "zod";

import { type AddLineResult, MAX_LINE_QUANTITY } from "@/lib/cart/controller";
import { buildLineMetadata } from "@/lib/cart/metadata";
import type { LineMetadata } from "@/lib/cart/types";
import type {
  Cart,
  MoneyV2,
  PredictiveSearchResponse,
  ProductByHandleResponse,
} from "@/lib/shopify/types";

/** What the tools need from the page. Getters, so a tool reads live state. */
export type ShopToolDeps = {
  getCart: () => Cart | null;
  getSaved: () => string[];
  setSaved: (handle: string, saved: boolean) => void;
  addLine: (
    variantId: string,
    quantity: number,
    metadata: LineMetadata
  ) => Promise<AddLineResult>;
  updateLine: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  openCart: () => void;
  settle: () => Promise<Cart | null>;
  /** Client-side navigation to a path on this site. */
  push: (href: string) => void;
  /** Full navigation, for the Shopify checkout URL. */
  leave: (url: string) => void;
};

const CONFIRM_FIRST =
  "Confirm the exact product, variant and quantity with your user before you call this.";

const handle = z
  .string()
  .regex(/^[\w-]{1,255}$/)
  .describe("Product handle: the last part of a /products/<handle> URL");

const money = ({ amount, currencyCode }: MoneyV2) =>
  `${amount} ${currencyCode}`;

const invalid = (error: z.ZodError) =>
  JSON.stringify({
    error: "Invalid input",
    code: "invalid_fields",
    details: error.issues.map(({ path, message }) => ({
      path: path.join("."),
      message,
    })),
  });

/** One tool: its JSON schema and its input check come from the same Zod schema. */
function tool<S extends z.ZodType>(
  about: Pick<
    WebMCP.ModelContextTool,
    "name" | "title" | "description" | "annotations"
  >,
  schema: S,
  run: (input: z.output<S>, signal: AbortSignal) => Promise<string> | string
): WebMCP.ModelContextTool {
  return {
    ...about,
    inputSchema: z.toJSONSchema(schema, { io: "input" }),
    execute: async (input, { signal }) => {
      const parsed = schema.safeParse(input);
      return parsed.success ? run(parsed.data, signal) : invalid(parsed.error);
    },
  };
}

/** The product, or null when the handle matches nothing. An outage throws. */
async function fetchProduct(productHandle: string, signal?: AbortSignal) {
  const response = await fetch(`/api/products/${productHandle}`, { signal });
  if (!response.ok) {
    throw new Error(`Product lookup answered ${response.status}`);
  }
  return ((await response.json()) as ProductByHandleResponse).product;
}

const noProduct = (productHandle: string) =>
  `No product has the handle "${productHandle}". Find the handle with search_products.`;

/**
 * `path` when it is a page on this site an agent may open, else undefined.
 * Only shop pages: never /api, and never another origin.
 */
export function shopPath(path: string): string | undefined {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return undefined;
  }
  const { pathname, search } = new URL(path, "https://shop.invalid");
  const allowed =
    pathname === "/" ||
    pathname === "/search" ||
    pathname === "/collections" ||
    pathname.startsWith("/products/") ||
    pathname.startsWith("/collections/");
  return allowed ? `${pathname}${search}` : undefined;
}

/**
 * The shopping tools a visitor's own agent gets through WebMCP. Built only in
 * a browser with WebMCP, so other visitors never pay for the JSON schemas.
 */
export function shopTools(deps: ShopToolDeps): WebMCP.ModelContextTool[] {
  const addInput = addToCartSchema.extend({
    handle,
    dryRun: z
      .boolean()
      .optional()
      .describe(
        "true checks the variant and its stock and adds nothing. Use it before your user says yes."
      ),
  });

  return [
    tool(
      {
        name: "search_products",
        title: "Search products",
        description:
          "Search this shop's products and collections by keyword. Returns handles to use with get_product and open_page.",
        annotations: { readOnlyHint: true },
      },
      z.object({ query: z.string().trim().min(1).max(100) }),
      async ({ query }, signal) => {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal }
        );
        if (!response.ok) {
          throw new Error(`Search answered ${response.status}`);
        }
        const { products, collections } =
          (await response.json()) as PredictiveSearchResponse["predictiveSearch"];
        if (products.length === 0 && collections.length === 0) {
          return `Nothing matches "${query}".`;
        }
        return JSON.stringify({
          products: products.map((product) => ({
            handle: product.handle,
            title: product.title,
            vendor: product.vendor,
            from: money(product.priceRange.minVariantPrice),
            path: `/products/${product.handle}`,
          })),
          collections: collections.map((collection) => ({
            handle: collection.handle,
            title: collection.title,
            path: `/collections/${collection.handle}`,
          })),
        });
      }
    ),
    tool(
      {
        name: "get_product",
        title: "Get a product",
        description:
          "Get one product's options and its variants with live price and stock. Each variant's variantGid is what add_to_cart takes.",
        annotations: { readOnlyHint: true },
      },
      z.object({ handle }),
      async (input, signal) => {
        const product = await fetchProduct(input.handle, signal);
        if (!product) {
          return noProduct(input.handle);
        }
        return JSON.stringify({
          handle: product.handle,
          title: product.title,
          vendor: product.vendor,
          path: `/products/${product.handle}`,
          options: product.options.map(({ name, values }) => ({
            name,
            values,
          })),
          variants: product.variants.edges.map(({ node }) => ({
            variantGid: node.id,
            options: node.selectedOptions,
            price: money(node.price),
            available: node.availableForSale,
          })),
        });
      }
    ),
    tool(
      {
        name: "get_cart",
        title: "Get the cart",
        description:
          "Read your user's cart: each line's lineId, product, variant, quantity and price.",
        annotations: { readOnlyHint: true },
      },
      z.object({}),
      () => {
        const cart = deps.getCart();
        const lines = cart?.lines.edges.map(({ node }) => node) ?? [];
        if (!cart || lines.length === 0) {
          return "The cart is empty.";
        }
        return JSON.stringify({
          totalQuantity: cart.totalQuantity,
          subtotal: money(cart.cost.subtotalAmount),
          lines: lines.map((line) => ({
            lineId: line.id,
            product: line.merchandise.product.title,
            handle: line.merchandise.product.handle,
            variant: line.merchandise.title,
            quantity: line.quantity,
            price: money(line.merchandise.price),
          })),
        });
      }
    ),
    tool(
      {
        name: "get_saved_items",
        title: "Get saved items",
        description: "List the product handles your user has saved for later.",
        annotations: { readOnlyHint: true },
      },
      z.object({}),
      () => {
        const saved = deps.getSaved();
        return saved.length > 0
          ? JSON.stringify({ handles: saved })
          : "Nothing is saved.";
      }
    ),
    tool(
      {
        name: "open_page",
        title: "Open a shop page",
        description:
          "Show your user a page of this shop. Takes a path: / for home, /products/<handle>, /collections, /collections/<handle>, or /search?q=<words>. To show one variant, add its options as query params: /products/<handle>?Color=Blue&Size=M.",
      },
      z.object({ path: z.string().max(500) }),
      ({ path }) => {
        const href = shopPath(path);
        if (!href) {
          return `"${path}" is not a shop page. Use /, /products/<handle>, /collections/<handle> or /search?q=<words>.`;
        }
        deps.push(href);
        return `Opened ${href}.`;
      }
    ),
    tool(
      {
        name: "set_collection_filters",
        title: "Filter a collection",
        description:
          "Open a collection with filters and a sort order. Every call replaces the filters that were there.",
      },
      productFiltersSchema,
      (filters) => {
        const { href, applied } = buildCollectionUrl(filters);
        deps.push(href);
        return `Opened ${href}. Applied: ${applied.join(", ") || "no filters"}.`;
      }
    ),
    tool(
      {
        name: "add_to_cart",
        title: "Add to cart",
        description: `Add one product variant to your user's cart. Get the handle and the variantGid from get_product: never guess a size or colour. ${CONFIRM_FIRST}`,
        annotations: { consequentialHint: true },
      },
      addInput,
      // No abort signal: a cancelled call could still add a line the agent
      // never hears about.
      async ({ handle: productHandle, variantGid, quantity, dryRun }) => {
        const product = await fetchProduct(productHandle);
        if (!product) {
          return noProduct(productHandle);
        }
        const variant = product.variants.edges.find(
          ({ node }) => node.id === variantGid
        )?.node;
        if (!variant) {
          return `${product.title} has no variant ${variantGid}. Call get_product for its variants.`;
        }
        const metadata = buildLineMetadata({
          productTitle: product.title,
          productHandle: product.handle,
          price: variant.price,
          selectedOptions: variant.selectedOptions,
          image: product.featuredImage,
        });
        const named = `${quantity} x ${product.title} (${metadata.variantTitle}) at ${money(variant.price)} each`;
        if (!variant.availableForSale) {
          return `${product.title} (${metadata.variantTitle}) is out of stock. Nothing was added.`;
        }
        if (dryRun === true) {
          return `Dry run: ${named} is in stock. Nothing was added.`;
        }
        deps.openCart();
        const { ok, warnings } = await deps.addLine(
          variant.id,
          quantity,
          metadata
        );
        const notes = warnings.map((warning) => warning.message).join(" ");
        return ok
          ? `Added ${named}. ${notes}`.trim()
          : `The cart refused ${named}. ${notes} Tell your user nothing was added.`;
      }
    ),
    tool(
      {
        name: "update_cart_line",
        title: "Change a cart line",
        description: `Set the quantity of one cart line. 0 removes the line. Get the lineId from get_cart. ${CONFIRM_FIRST}`,
        annotations: { consequentialHint: true },
      },
      z.object({
        lineId: z.string().min(1).max(500),
        quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
      }),
      ({ lineId, quantity }) => {
        const line = deps
          .getCart()
          ?.lines.edges.find(({ node }) => node.id === lineId)?.node;
        if (!line) {
          return "The cart has no line with that lineId. Call get_cart for the current lines.";
        }
        if (quantity === 0) {
          deps.removeLine(lineId);
          return `Removed ${line.merchandise.product.title} from the cart.`;
        }
        deps.updateLine(lineId, quantity);
        return `Set ${line.merchandise.product.title} to ${quantity}. Call get_cart to check the result.`;
      }
    ),
    tool(
      {
        name: "set_saved_item",
        title: "Save or unsave a product",
        description:
          "Add a product to your user's saved items, or take it off. saved: true saves it, false removes it.",
      },
      z.object({ handle, saved: z.boolean() }),
      async ({ handle: productHandle, saved }) => {
        // Checked on the way in only: a handle that matches nothing would sit
        // in the saved drawer as a broken card.
        if (saved && !(await fetchProduct(productHandle))) {
          return noProduct(productHandle);
        }
        deps.setSaved(productHandle, saved);
        return saved
          ? `Saved ${productHandle}.`
          : `Removed ${productHandle} from saved items.`;
      }
    ),
    tool(
      {
        name: "go_to_checkout",
        title: "Go to checkout",
        description:
          "Send your user to the checkout page with their cart. They enter their details and pay there themselves: you cannot pay for them. Only call this when your user asks to check out.",
        annotations: { consequentialHint: true },
      },
      z.object({}),
      async () => {
        if (!deps.getCart()?.totalQuantity) {
          return "The cart is empty, so there is nothing to check out.";
        }
        const confirmed = await deps.settle();
        if (!confirmed?.checkoutUrl) {
          return "The cart could not be confirmed. Ask your user to open the cart and try again.";
        }
        deps.leave(confirmed.checkoutUrl);
        return "Your user is on the checkout page. They finish payment themselves.";
      }
    ),
  ];
}
