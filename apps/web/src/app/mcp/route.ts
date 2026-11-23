import {
  addToCartSchema,
  buildCollectionUrl,
  productFiltersSchema,
} from "@workspace/ai-commerce";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { parseFilterParams } from "@/components/collection/filter-utils";
import {
  cartLineFor,
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
import { getBaseUrl } from "@/utils";

/**
 * The shop as a remote MCP server (ROB-6903), for chat apps such as Claude and
 * ChatGPT that connect to a URL. The in-page WebMCP tools
 * (`components/webmcp-tools.tsx`) cover agents inside the shopper's browser;
 * this covers the ones that are not. It can read the catalogue but not the
 * cart, which lives in the shopper's browser, so adding is a link they open.
 */

const SEARCH_LIMIT = 10;
const COLLECTION_LIMIT = 20;

// Chat apps call from a few shared addresses, so this is per app more than
// per person: high enough for many people at once, low enough to stop a loop.
const CALLS_PER_MINUTE = 120;

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

const handler = createMcpHandler(
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
        const result = await storefrontQuery<PredictiveSearchResponse>(
          PREDICTIVE_SEARCH_QUERY,
          {
            variables: {
              query: toStorefrontSearchQuery(query),
              limit: SEARCH_LIMIT,
            },
          }
        );
        if (!result.ok) {
          return failed(SHOP_DOWN);
        }
        const { products, collections } = result.data.predictiveSearch;
        if (products.length === 0 && collections.length === 0) {
          return text(`Nothing matches "${query}".`);
        }
        const base = getBaseUrl();
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
          ? text(productSummary(found.product, getBaseUrl()))
          : failed(noProduct(handle));
      }
    );

    server.registerTool(
      "list_collection_products",
      {
        title: "List a collection's products",
        description: `List up to ${COLLECTION_LIMIT} products in one collection, with optional filters and a sort order. Get the collection handle from search_products.`,
        inputSchema: productFiltersSchema,
        annotations: readOnly,
      },
      async (filters) => {
        const { href } = buildCollectionUrl(filters);
        const base = getBaseUrl();
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
          "Get a link that adds one product variant to your user's cart when they open it. You cannot change the cart yourself: it lives in their browser. Get the handle and the variantGid from get_product, and never guess a size or colour. Give your user the link as it is.",
        inputSchema: addToCartSchema.extend({ handle: productHandle }),
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
        const link = cartLink(getBaseUrl(), handle, variantGid, quantity);
        return text(
          `${link}\nOpening this link adds ${line.named} to your user's cart. Nothing is added until they open it, and they pay at checkout themselves.`
        );
      }
    );
  },
  {
    serverInfo: { name: "aisle-shop", version: "1.0.0" },
    instructions:
      "A shop. Use search_products, get_product and list_collection_products to find products with live prices and stock. To put something in your user's cart, call get_add_to_cart_link and give them the link.",
  }
);

function limited(request: Request): Promise<Response> | Response {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(address, CALLS_PER_MINUTE, 60_000)) {
    return new Response("Too many requests. Try again in a minute.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  return handler(request);
}

export { limited as GET, limited as POST };
