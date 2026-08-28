import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The blank-query state renders a "Best Sellers" heading over the grid. When
 * `/api/search/defaults` failed, the hook swallowed it and handed the grid an
 * empty array, so that heading sat over "No products found." — a Storefront
 * outage presented as a catalogue with nothing in it.
 *
 * A store that genuinely has no best sellers is the counterpart, and still
 * reads as empty rather than broken.
 */

const useSearchDefaults = vi.fn();
vi.mock("@/components/search/use-search-defaults", () => ({
  useSearchDefaults: () => useSearchDefaults(),
}));
vi.mock("@/components/product/product-card", () => ({
  ProductCard: ({ slug }: { slug: string }) => slug,
}));
vi.mock("@/lib/shopify/product-card", () => ({
  collectionProductToCardProps: (product: { handle: string }) => ({
    slug: product.handle,
  }),
}));

const { SearchEmptyState } = await import("../search-empty-state");

const render = () =>
  renderToStaticMarkup(
    createElement(SearchEmptyState, {
      onSelectTerm: () => {
        // Not exercised by these cases.
      },
    })
  );

describe("search empty state", () => {
  it("says the catalogue is unavailable when the defaults read failed", () => {
    useSearchDefaults.mockReturnValue({
      collections: [],
      bestSellers: [],
      isLoading: false,
      error: new Error("Failed to load search defaults"),
    });

    const markup = render();

    expect(markup).toContain("Search isn&#x27;t available");
    expect(markup).not.toContain("No products found.");
  });

  it("still reads as empty when the store genuinely has no best sellers", () => {
    useSearchDefaults.mockReturnValue({
      collections: [],
      bestSellers: [],
      isLoading: false,
      error: null,
    });

    const markup = render();

    expect(markup).toContain("No products found.");
    expect(markup).not.toContain("Search isn&#x27;t available");
  });

  it("renders the best sellers it was given", () => {
    useSearchDefaults.mockReturnValue({
      collections: [],
      bestSellers: [{ id: "gid://p/1", handle: "wren-washed-cap" }],
      isLoading: false,
      error: null,
    });

    expect(render()).toContain("wren-washed-cap");
  });
});
