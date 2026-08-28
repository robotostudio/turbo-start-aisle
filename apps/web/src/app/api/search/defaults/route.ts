import { NextResponse } from "next/server";

import { storefrontQuery } from "@/lib/shopify/client";
import {
  ALL_COLLECTIONS_QUERY,
  BEST_SELLING_PRODUCTS_QUERY,
} from "@/lib/shopify/queries";
import type {
  AllCollectionsResponse,
  BestSellingProductsResponse,
} from "@/lib/shopify/types";

const EMPTY = { collections: [], bestSellers: [] };

const COLLECTIONS_LIMIT = 8;
const BEST_SELLERS_LIMIT = 4;

export async function GET() {
  const [collectionsResult, bestSellersResult] = await Promise.all([
    storefrontQuery<AllCollectionsResponse>(ALL_COLLECTIONS_QUERY, {
      variables: { first: COLLECTIONS_LIMIT },
    }),
    storefrontQuery<BestSellingProductsResponse>(BEST_SELLING_PRODUCTS_QUERY, {
      variables: { first: BEST_SELLERS_LIMIT },
    }),
  ]);

  // 500 on either read, matching the other two search routes. Degrading to
  // empty arrays here put a "Best Sellers" heading over "No products found.",
  // which reports a Storefront outage to the shopper as a catalogue with
  // nothing in it. Either read failing means this endpoint cannot answer what
  // it promises, and a half-answer is how the quiet version of that gets back
  // in.
  if (!(collectionsResult.ok && bestSellersResult.ok)) {
    return NextResponse.json(EMPTY, { status: 500 });
  }

  return NextResponse.json({
    collections: collectionsResult.data.collections.edges.map(
      (edge) => edge.node
    ),
    bestSellers: bestSellersResult.data.products.edges.map((edge) => edge.node),
  });
}
