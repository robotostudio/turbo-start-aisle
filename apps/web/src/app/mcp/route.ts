import {
  buildCollectionUrl,
  productFiltersSchema,
} from "@workspace/ai-commerce";
import { createMcpHandler, getPublicOrigin } from "mcp-handler";
import { z } from "zod";

import { parseFilterParams } from "@/components/collection/filter-utils";
import {
  cartLineFor,
  cartLineInput,
  cartLink,
  collectionsSummary,
  noProduct,
  productHandle,
  productSummary,
  productsSummary,
} from "@/lib/agent-shop";
import { allowRequest } from "@/lib/rate-limit";
import { storefrontQuery } from "@/lib/shopify/client";
import {
  COLLECTION_QUERY,
  PREDICTIVE_SEARCH_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
} from "@/lib/shopify/queries";
import { toStorefrontSearchQuery } from "@/lib/shopify/search-query";
import type {
  CollectionQueryResponse,
  PredictiveSearchResponse,
  ProductByHandleResponse,
} from "@/lib/shopify/types";

/**
 * The shop as a remote MCP server (ROB-6903), for chat apps such as Claude and
 * ChatGPT that connect to a URL. The in-page WebMCP tools
 * (`components/webmcp-tools.tsx`) cover agents inside the shopper's browser;
 * this covers the ones that are not. It can read the catalogue but not the
 * cart, which lives in the shopper's browser, so adding is a link to a page
 * where they press Add to cart.
 */

const SEARCH_LIMIT = 10;
const COLLECTION_LIMIT = 20;

// Chat apps call from a few shared addresses, and one question is several
// calls (initialize, list, each tool). So this stops a loop; it is not a
// per-person limit.
const CALLS_PER_MINUTE = 600;

// The largest honest call is a few filters: far under this.
const MAX_BODY_BYTES = 64_000;

// The server has nothing to push, so no call needs to stay open.
export const maxDuration = 60;

const collectionInput = productFiltersSchema.extend({
  collection: productFiltersSchema.shape.collection.describe(
    "Collection handle, from search_products"
  ),
});

const SHOP_DOWN = "The shop could not be reached. Try again in a moment.";

const readOnly = { readOnlyHint: true, openWorldHint: false };

const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value),
    },
  ],
});

const failed = (message: string) => ({ isError: true, ...text(message) });

async function findProduct(handle: string) {
  const result = await storefrontQuery<ProductByHandleResponse>(
    PRODUCT_BY_HANDLE_QUERY,
    { variables: { handle } }
  );
  return result.ok ? { product: result.data.product } : null;
}

/** The server for one request. `base` is the origin the caller reached. */
const serve = (base: string) =>
  createMcpHandler(
    (server) => {
      server.registerTool(
        "search_products",
        {
          title: "Search products",
          description:
            "Search this shop's products and collections by keyword. Returns handles to use with get_product and list_collection_products.",
          inputSchema: z.object({ query: z.string().trim().min(1).max(100) }),
          annotations: readOnly,
        },
        async ({ query }) => {
          const nothing = text(`Nothing matches "${query}".`);
          // Only reserved search characters: nothing left to search for.
          const searchQuery = toStorefrontSearchQuery(query);
          if (!searchQuery) {
            return nothing;
          }
          const result = await storefrontQuery<PredictiveSearchResponse>(
            PREDICTIVE_SEARCH_QUERY,
            { variables: { query: searchQuery, limit: SEARCH_LIMIT } }
          );
          if (!result.ok) {
            return failed(SHOP_DOWN);
          }
          const { products, collections } = result.data.predictiveSearch;
          if (products.length === 0 && collections.length === 0) {
            return nothing;
          }
          return text({
            products: productsSummary(products, base),
            collections: collectionsSummary(collections, base),
          });
        }
      );

      server.registerTool(
        "get_product",
        {
          title: "Get a product",
          description:
            "Get one product's options and its variants with live price and stock. Each variant's variantGid is what get_add_to_cart_link takes.",
          inputSchema: z.object({ handle: productHandle }),
          annotations: readOnly,
        },
        async ({ handle }) => {
          const found = await findProduct(handle);
          if (!found) {
            return failed(SHOP_DOWN);
          }
          return found.product
            ? text(productSummary(found.product, base))
            : failed(noProduct(handle));
        }
      );

      server.registerTool(
        "list_collection_products",
        {
          title: "List a collection's products",
          description: `List up to ${COLLECTION_LIMIT} products in one collection, with optional filters and a sort order. Get the collection handle from search_products.`,
          inputSchema: collectionInput,
          annotations: readOnly,
        },
        async (filters) => {
          const { href } = buildCollectionUrl(filters);
          const { searchParams } = new URL(href, base);
          const productFilters = parseFilterParams(searchParams);
          const result = await storefrontQuery<CollectionQueryResponse>(
            COLLECTION_QUERY,
            {
              variables: {
                handle: filters.collection,
                first: COLLECTION_LIMIT,
                sortKey: filters.sort ?? "COLLECTION_DEFAULT",
                reverse: filters.reverse ?? false,
                filters: productFilters.length > 0 ? productFilters : undefined,
              },
            }
          );
          if (!result.ok) {
            return failed(SHOP_DOWN);
          }
          const { collection } = result.data;
          if (!collection) {
            return failed(
              `No collection has the handle "${filters.collection}". Find it with search_products.`
            );
          }
          const products = collection.products.edges.map(({ node }) => node);
          return text({
            collection: collection.title,
            url: `${base}${href}`,
            products: productsSummary(products, base),
            more: collection.products.pageInfo.hasNextPage,
          });
        }
      );

      server.registerTool(
        "get_add_to_cart_link",
        {
          title: "Get an add-to-cart link",
          description:
            "Get a link that offers one product variant for your user's cart: it opens a page showing the item with an Add to cart button. You cannot change the cart yourself: it lives in their browser. Get the handle and the variantGid from get_product, and never guess a size or colour. Give your user the link as it is.",
          inputSchema: cartLineInput,
          annotations: readOnly,
        },
        async ({ handle, variantGid, quantity }) => {
          const found = await findProduct(handle);
          if (!found) {
            return failed(SHOP_DOWN);
          }
          if (!found.product) {
            return failed(noProduct(handle));
          }
          const line = cartLineFor(found.product, variantGid, quantity);
          if (!line.ok) {
            return failed(line.reason);
          }
          // The item sits in its own field, apart from the instruction.
          return text({
            link: cartLink(base, handle, variantGid, quantity),
            item: line.named,
            note: "The link shows your user this item with an Add to cart button. Nothing is added until they press it, and they pay at checkout themselves.",
          });
        }
      );
    },
    {
      serverInfo: { name: "aisle-shop", version: "1.0.0" },
      maxSubscriptions: 0,
      instructions:
        "A shop. Use search_products, get_product and list_collection_products to find products with live prices and stock. To put something in your user's cart, call get_add_to_cart_link and give them the link: they confirm on the page it opens.",
    }
  );

/** A refusal a client can read as a JSON-RPC error, not a broken transport. */
const refused = (status: number, message: string, headers?: HeadersInit) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32_000, message }, id: null },
    { status, headers }
  );

/**
 * The caller's address, from the header the nearest proxy wrote. The first
 * `x-forwarded-for` entry is whatever the caller sent, so it is never used:
 * a new value per call would be a new allowance per call.
 */
function callerAddress({ headers }: Request): string {
  return (
    headers.get("x-vercel-forwarded-for") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}

function limited(request: Request): Promise<Response> | Response {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return refused(413, "The request is too large.");
  }
  if (!allowRequest(callerAddress(request), CALLS_PER_MINUTE, 60_000)) {
    return refused(429, "Too many requests. Try again in a minute.", {
      "Retry-After": "60",
    });
  }
  return serve(getPublicOrigin(request))(request);
}

export { limited as GET, limited as POST };
