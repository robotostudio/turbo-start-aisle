import { z } from "zod";

/** User context sent with every chat request — captured client-side per turn. */
export interface UserContext {
  documentTitle: string;
  documentDescription?: string;
  documentLocation: string;
}

/** Page-context React Query entry — written by route segments, read by chat. */
export type PageSurface =
  | "home"
  | "pdp"
  | "collection"
  | "search"
  | "cart"
  | "content"
  | "other";

export interface PageContext {
  route: string;
  surface: PageSurface;
  product?: { id: string; slug: string; title: string };
  collection?: {
    handle: string;
    activeFilters: Record<string, unknown>;
  };
}

/** Tool name constants — shared between server (route.ts) and client (Chat panel). */
export const CLIENT_TOOLS = {
  PAGE_CONTEXT: "page_context",
  SCREENSHOT: "screenshot",
  SET_FILTERS: "set_collection_filters",
} as const;

export type ClientToolName = (typeof CLIENT_TOOLS)[keyof typeof CLIENT_TOOLS];

/**
 * Filter input schema for set_collection_filters tool. Mirrors
 * turbo-start-shopify's collection page searchParams (filter.* keys).
 * The tool's `execute` rebuilds the URL with the filter.* prefix.
 */
/** Shopify collection handle: lowercase letters/digits/hyphens only. Prevents path-traversal in router.push. */
const collectionHandleSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message:
      "collection must be a Shopify handle (lowercase letters, digits, hyphens)",
  });

export const productFiltersSchema = z.object({
  collection: collectionHandleSchema.describe(
    "Shopify collection handle to navigate to (required)"
  ),
  available: z
    .boolean()
    .optional()
    .describe("Filter to in-stock products only when true"),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  vendor: z
    .array(z.string())
    .optional()
    .describe("Multi-select vendor / brand names from Shopify"),
  type: z
    .array(z.string())
    .optional()
    .describe("Multi-select Shopify productType values"),
  tag: z
    .array(z.string())
    .optional()
    .describe("Multi-select Shopify tag values"),
  sort: z
    .string()
    .optional()
    .describe(
      "Shopify ProductCollectionSortKeys: BEST_SELLING, PRICE, CREATED, TITLE, etc."
    ),
  reverse: z.boolean().optional(),
});

export type ProductFiltersInput = z.infer<typeof productFiltersSchema>;

/** The directive shape returned by the set_collection_filters tool to the client. */
export interface NavigateDirective {
  kind: "navigate";
  href: string;
  applied: string[];
}
