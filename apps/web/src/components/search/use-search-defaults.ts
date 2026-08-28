"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  ShopifyCollectionLite,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";

const CACHE_STALE_TIME_MS = 5 * 60 * 1000;

type SearchDefaultsResponse = {
  collections: ShopifyCollectionLite[];
  bestSellers: ShopifyCollectionProduct[];
};

async function fetchDefaults(): Promise<SearchDefaultsResponse> {
  const response = await fetch("/api/search/defaults");
  // Throws rather than degrading to empty. Swallowing it here left the empty
  // state rendering a "Best Sellers" heading over "No products found.", which
  // is the same failure this route now reports honestly.
  if (!response.ok) {
    throw new Error("Failed to load search defaults");
  }
  return response.json() as Promise<SearchDefaultsResponse>;
}

/** Lazily loads the empty-state data (top collections + best sellers). */
export function useSearchDefaults() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["search-defaults"],
    queryFn: fetchDefaults,
    staleTime: CACHE_STALE_TIME_MS,
    retry: 1,
  });

  return {
    collections: data?.collections ?? [],
    bestSellers: data?.bestSellers ?? [],
    isLoading,
    error,
  };
}
