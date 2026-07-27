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

/**
 * Structural duplicates of MoneyV2 / ShopifyImage / SelectedOption from
 * apps/web/src/lib/shopify/types.ts. This package is standalone and must not
 * import from the web app's `@/` alias, so these are kept in sync by hand.
 */
export interface AiMoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface AiShopifyImage {
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

export interface AiSelectedOption {
  name: string;
  value: string;
}

/** Window event name bridging an in-chat "Add to cart" to the app's cart. */
export const ADD_TO_CART_EVENT = "ai-commerce:add-to-cart" as const;

/**
 * Payload of the `ai-commerce:add-to-cart` window CustomEvent. Consumed by
 * apps/web/src/components/ai-cart-bridge.tsx, which maps it onto
 * buildLineMetadata() + useCartActions().addLine().
 *
 * The metadata travels with the event rather than being re-fetched so the
 * cart's optimistic line can render immediately — the same trade-off the app's
 * own ProductCard makes. Shopify's response replaces it moments later.
 */
export interface AddToCartEventDetail {
  /** Shopify variant GID (`store.gid` on the Sanity productVariant doc). */
  variantGid: string;
  quantity: number;
  /** Shopify product handle (`store.slug.current`) — the cart line's link. */
  productHandle: string;
  productTitle: string;
  /** Variant display title, e.g. "S / White" (`store.title` on the variant). */
  variantTitle: string;
  price: AiMoneyV2;
  image: AiShopifyImage | null;
  selectedOptions: AiSelectedOption[];
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

/**
 * Mirrors PRICE_BUCKETS in apps/web/src/components/collection/filter-utils.ts.
 * Duplicated rather than imported (this package cannot reach the app's `@/`
 * alias). Keep in sync — a mismatch silently stops the Price column from
 * highlighting the row the assistant just applied.
 */
export const PRICE_BUCKETS = [
  { value: "-50", min: undefined, max: 50 },
  { value: "50-100", min: 50, max: 100 },
  { value: "100-150", min: 100, max: 150 },
  { value: "150-", min: 150, max: undefined },
] as const;

/**
 * Shopify option names are merchant-defined ("Color", "Size", "Fit"). Constrain
 * to a safe charset so arbitrary model output never becomes a URL param key.
 */
const optionNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,49}$/, {
  message:
    "option name must be alphanumeric with spaces, hyphens or underscores",
});

export const productFiltersSchema = z.object({
  collection: collectionHandleSchema.describe(
    "Shopify collection handle to navigate to (required)"
  ),
  available: z
    .boolean()
    .optional()
    .describe("Filter to in-stock products only when true"),
  priceMin: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      "Minimum price. Prefer the bucket edges 50, 100 or 150 so the Price filter column highlights."
    ),
  priceMax: z
    .number()
    .positive()
    .optional()
    .describe("Maximum price. Prefer the bucket edges 50, 100 or 150."),
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
  option: z
    .array(z.object({ name: optionNameSchema, value: z.string().min(1) }))
    .optional()
    .describe(
      'Variant option facets, e.g. [{name:"Color",value:"Indigo"},{name:"Size",value:"M"}]. ' +
        "Names and values are merchant-defined and case-sensitive — copy them verbatim from a GROQ result."
    ),
  sort: z
    .enum([
      "COLLECTION_DEFAULT",
      "BEST_SELLING",
      "CREATED",
      "PRICE",
      "TITLE",
      "MANUAL",
      "ID",
      "RELEVANCE",
    ])
    .optional()
    .describe(
      "Shopify ProductCollectionSortKeys. Top-level param, not filter.*"
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
