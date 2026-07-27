"use client";

import { cn } from "@workspace/ui/lib/utils";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { SearchEmptyState } from "./search-empty-state";
import { SearchResults } from "./search-results";
import { useProductSearch } from "./use-product-search";

type SearchPanelProps = {
  initialQuery?: string;
  /** When provided, renders a "Close" button that calls this handler. */
  onClose?: () => void;
  /** Fill the parent height with an internal scroll area (used inside the drawer). */
  scrollable?: boolean;
};

export function SearchPanel({
  initialQuery = "",
  onClose,
  scrollable = false,
}: SearchPanelProps) {
  const router = useRouter();
  const {
    query,
    setQuery,
    debouncedQuery,
    products,
    collections,
    related,
    isSearching,
    hasQuery,
  } = useProductSearch(initialQuery);

  // Keep the URL in sync with the query so a refresh / shared link lands on the
  // /search page with the same term. `replace` avoids polluting history.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    router.replace(
      trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search",
      { scroll: false }
    );
  }, [debouncedQuery, router]);

  // Focus the input when the panel mounts.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={cn("flex flex-col", scrollable && "h-full")}>
      <div className="flex items-center gap-4 border-b px-4 py-4 md:px-8">
        <input
          className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing to search…"
          ref={inputRef}
          type="text"
          value={query}
        />
        {onClose && (
          <button
            className="inline-flex items-center gap-1 text-base text-foreground tracking-[0.24px] transition-opacity hover:opacity-70"
            onClick={onClose}
            type="button"
          >
            Close
            <X className="size-4.5" />
          </button>
        )}
      </div>

      <div
        className={cn("bg-muted/30", scrollable && "flex-1 overflow-y-auto")}
      >
        {hasQuery ? (
          <SearchResults
            collections={collections}
            isSearching={isSearching}
            onSelectTerm={setQuery}
            products={products}
            related={related}
          />
        ) : (
          <SearchEmptyState onSelectTerm={setQuery} />
        )}
      </div>
    </div>
  );
}
