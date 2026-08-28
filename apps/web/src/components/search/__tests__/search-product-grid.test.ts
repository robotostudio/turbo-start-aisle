import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The grid answered a failed read and a search that matched nothing with the
 * same sentence. `/api/search/full` returns a 500 on a failed Storefront read,
 * the fetcher throws, and `data ?? EMPTY` left this component an empty array —
 * so "No products found." told a shopper the store does not sell something it
 * does.
 *
 * Both cases are asserted, and the second is the one that matters: an
 * unavailable state shown for a genuine zero-result search would be its own lie.
 */

// Pulls the cart and saved-items contexts, neither of which exists here.
vi.mock("@/components/product/product-card", () => ({
  ProductCard: ({ slug }: { slug: string }) => slug,
}));
// The card mapper wants a full Storefront product; which branch the grid takes
// is what is under test, not how a product maps onto a card.
vi.mock("@/lib/shopify/product-card", () => ({
  collectionProductToCardProps: (product: { handle: string }) => ({
    slug: product.handle,
  }),
}));

const { SearchProductGrid } = await import("../search-product-grid");

const PRODUCT = { id: "gid://p/1", handle: "wren-washed-cap" } as never;

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(SearchProductGrid, {
      isLoading: false,
      products: [],
      ...props,
    } as never)
  );

describe("search product grid", () => {
  it("says search is unavailable when the read failed", () => {
    const markup = render({ error: new Error("Failed to search") });

    expect(markup).toContain("Search isn&#x27;t available");
    expect(markup).not.toContain("No products found.");
  });

  it("still reports a genuine zero-result search as zero results", () => {
    const markup = render({ error: null });

    expect(markup).toContain("No products found.");
    expect(markup).not.toContain("Search isn&#x27;t available");
  });

  it("announces the failure, rather than swapping it in silently", () => {
    // Focus stays in the search box on both surfaces and nothing navigates, so
    // without a live region a screen reader user hears nothing at all and still
    // cannot separate an outage from a genuine miss.
    expect(render({ error: new Error("boom") })).toContain('role="alert"');
  });

  it("shows skeletons over a failure while a retry is in flight", () => {
    // Loading wins: holding a failure through the retry that may clear it would
    // flash an outage the shopper never actually had.
    const markup = render({ isLoading: true, error: new Error("boom") });

    expect(markup).not.toContain("Search isn&#x27;t available");
    expect(markup).not.toContain("No products found.");
  });

  it("renders results, failure state or not, once there are some", () => {
    expect(render({ products: [PRODUCT] })).toContain("wren-washed-cap");
  });
});
