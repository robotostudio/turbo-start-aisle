"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { useEffect, useRef, useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";
import type { ShopifyCollectionProduct } from "@/lib/shopify/types";
import { readSearchQuery, searchUrlWithQuery } from "./paths";
import { SearchEmptyState } from "./search-empty-state";
import { SearchProductGrid } from "./search-product-grid";

const SEARCH_DEBOUNCE_MS = 250;
const CACHE_STALE_TIME_MS = 30_000;

type FullSearchResponse = {
  products: ShopifyCollectionProduct[];
  totalCount: number;
};

const EMPTY: FullSearchResponse = { products: [], totalCount: 0 };

async function fetchFullResults(
  query: string,
  signal: AbortSignal
): Promise<FullSearchResponse> {
  const response = await fetch(
    `/api/search/full?q=${encodeURIComponent(query)}`,
    {
      signal,
    }
  );
  if (!response.ok) {
    throw new Error("Failed to search");
  }
  return response.json() as Promise<FullSearchResponse>;
}

export function SearchPageContent({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const trimmed = debouncedQuery.trim();
  const hasQuery = query.trim().length > 0 && trimmed.length > 0;

  // Keep the address bar in sync WITHOUT a router navigation — a client nav to
  // /search would re-trigger the intercepting route and open the drawer.
  useEffect(() => {
    // Skip identical writes, and rebuild from the live URL rather than from
    // scratch: this page is a share/ad landing target, so it routinely arrives
    // carrying utm_* params that a from-scratch URL would silently drop.
    if (readSearchQuery(window.location.search) === trimmed) {
      return;
    }
    window.history.replaceState(
      null,
      "",
      searchUrlWithQuery(trimmed, window.location.search)
    );
  }, [trimmed]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["search-full", trimmed],
    queryFn: ({ signal }) => fetchFullResults(trimmed, signal),
    enabled: hasQuery,
    staleTime: CACHE_STALE_TIME_MS,
    // One retry, not TanStack's default three. The backoff on three is
    // 1s + 2s + 4s, so the failure state below would sit behind seven seconds of
    // skeletons and a shopper would retype or leave before ever seeing it. One
    // still absorbs a single-request blip. Scoped here rather than on the shared
    // QueryClient, which cart mutations also use.
    retry: 1,
  });

  const results = data ?? EMPTY;

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center border-b px-4 py-4 md:px-8">
        <input
          className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          id="search-page-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing to search…"
          ref={inputRef}
          type="text"
          // Controlled, matching search-panel.tsx. With `defaultValue` a Popular
          // Searches chip set `query` and swapped the results in while the box
          // kept the empty DOM value it mounted with, so the shopper read results
          // under an apparently empty field and the next keystroke started a
          // fresh term instead of extending the chip's. `query` is already seeded
          // from `initialQuery`, so the mount value is unchanged.
          value={query}
        />
        {query && (
          <Button
            className="h-auto py-0 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            size="sm"
            variant="ghost"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="bg-muted/30">
        {hasQuery ? (
          <div className="site-container py-8 ">
            {!(isLoading || error) && (
              <p className="mb-6 text-muted-foreground text-sm">
                {results.totalCount} result
                {results.totalCount !== 1 ? "s" : ""} for &ldquo;{trimmed}
                &rdquo;
              </p>
            )}
            <SearchProductGrid
              error={error}
              isLoading={isLoading}
              products={results.products}
            />
          </div>
        ) : (
          <SearchEmptyState onSelectTerm={setQuery} />
        )}
      </div>
    </div>
  );
}
