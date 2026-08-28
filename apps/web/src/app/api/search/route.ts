import { NextResponse } from "next/server";

import { storefrontQuery } from "@/lib/shopify/client";
import { PREDICTIVE_SEARCH_QUERY } from "@/lib/shopify/queries";
import { toStorefrontSearchQuery } from "@/lib/shopify/search-query";
import type { PredictiveSearchResponse } from "@/lib/shopify/types";

const LIMIT = 10;

const EMPTY = { products: [], collections: [], related: [] };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  const searchQuery = toStorefrontSearchQuery(query);

  if (!searchQuery) {
    return NextResponse.json(EMPTY);
  }

  const result = await storefrontQuery<PredictiveSearchResponse>(
    PREDICTIVE_SEARCH_QUERY,
    { variables: { query: searchQuery, limit: LIMIT } }
  );

  // 500, matching `api/search/full/route.ts`. A 200 with an empty body here was
  // indistinguishable from a search that genuinely matched nothing, and the
  // drawer's `if (!response.ok) throw` could never fire — so a total Storefront
  // outage reached the shopper as "No products found." The blank-query 200 above
  // stays: that one really is an empty result, not a failure.
  if (!result.ok) {
    return NextResponse.json(EMPTY, { status: 500 });
  }

  const { products, collections, queries } = result.data.predictiveSearch;

  // "Related" should surface catalog names that closely match the query. Prefer
  // real collection + product titles (Shopify's `queries` suggestions are often
  // empty on low-traffic stores), then top up with any query suggestions.
  const normalizedQuery = query.toLowerCase();
  const titleSuggestions = [
    ...collections.map((collection) => collection.title),
    ...products.map((product) => product.title),
  ].filter(
    (title): title is string =>
      Boolean(title) && title.toLowerCase() !== normalizedQuery
  );

  const related = Array.from(
    new Set([...titleSuggestions, ...queries.map((q) => q.text)])
  ).slice(0, 8);

  return NextResponse.json({ products, collections, related });
}
