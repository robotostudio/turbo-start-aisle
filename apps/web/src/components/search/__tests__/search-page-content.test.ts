import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The count line sits outside the grid, so an error state inside the grid is not
 * enough on its own: a failed search still printed `0 results for "jacket"`
 * directly above it. That is the flaw `blog-search-results` still has, and the
 * reason this file asserts on the count rather than only on the grid.
 */

vi.mock("@workspace/env/client", () => ({
  env: {
    NEXT_PUBLIC_SANITY_PROJECT_ID: "testproject",
    NEXT_PUBLIC_SANITY_DATASET: "test",
    NEXT_PUBLIC_SANITY_API_VERSION: "2024-10-28",
    NEXT_PUBLIC_SANITY_STUDIO_URL: "http://localhost:3333",
  },
}));

const useQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQuery(options),
}));

// Reads its own query and router state; not what is under test here.
vi.mock("@/components/search/search-empty-state", () => ({
  SearchEmptyState: () => "Popular Searches",
}));
// Stands in for the real grid's own copy, so the failure case can assert the
// shopper is not shown it.
vi.mock("@/components/search/search-product-grid", () => ({
  SearchProductGrid: ({
    products,
    error,
  }: {
    products: unknown[];
    error?: Error | null;
  }) => {
    if (error) {
      return "Search isn't available";
    }
    return products.length === 0
      ? "No products found."
      : `${products.length} shown`;
  },
}));

const { SearchPageContent } = await import("../search-page-content");

// `useDebounce` seeds its state from the value it is given, so an initial query
// makes `hasQuery` true on the very first render — no timers, no jsdom.
const render = () =>
  renderToStaticMarkup(
    createElement(SearchPageContent, { initialQuery: "jacket" })
  );

describe("search page", () => {
  it("reports a failed search as unavailable, with no result count", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to search"),
    });

    const markup = render();

    expect(markup).toContain("Search isn&#x27;t available");
    expect(markup).not.toContain("No products found.");
    expect(markup).not.toContain("0 result");
  });

  it("still reports a genuine zero-result search as zero results", () => {
    useQuery.mockReturnValue({
      data: { products: [], totalCount: 0 },
      isLoading: false,
      error: null,
    });

    const markup = render();

    expect(markup).toContain("0 result");
    expect(markup).toContain("No products found.");
    expect(markup).not.toContain("Search isn&#x27;t available");
  });

  it("puts the active term in the search box", () => {
    // Uncontrolled, a Popular Searches chip set `query` and swapped the results
    // in while the box kept the empty DOM value it mounted with — the shopper
    // read results under an apparently empty field, and the next keystroke
    // started a fresh term rather than extending the chip's.
    useQuery.mockReturnValue({
      data: { products: [], totalCount: 0 },
      isLoading: false,
      error: null,
    });

    expect(render()).toContain('value="jacket"');
  });

  it("spends only one retry before answering", () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });

    render();

    expect(useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ retry: 1 });
  });
});
