import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The drawer told the same lie in a second place. On a failed read both arrays
 * are empty, so the tab strip read "Products [0]  Collections [0]" above "No
 * products found." — a count an `error` prop on the grid cannot reach, which is
 * why the failure state replaces the tab strip rather than sitting under it.
 *
 * `/api/search` had to change for any of this to be reachable: it answered a
 * failed Storefront read with a 200 and an empty body, so the drawer's fetcher
 * never threw and the client could not tell an outage from a miss.
 */

vi.mock("@/components/product/product-card", () => ({
  ProductCard: ({ slug }: { slug: string }) => slug,
}));
vi.mock("@/components/collection/collection-card", () => ({
  CollectionCard: ({ title }: { title: string }) => title,
}));
vi.mock("@/lib/shopify/product-card", () => ({
  collectionProductToCardProps: (product: { handle: string }) => ({
    slug: product.handle,
  }),
}));
vi.mock("@/lib/collection-card", () => ({
  shopifyCollectionToCardProps: (collection: { title: string }) => ({
    title: collection.title,
  }),
}));

const { SearchResults } = await import("../search-results");

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(SearchResults, {
      related: [],
      products: [],
      collections: [],
      isSearching: false,
      onSelectTerm: () => {
        // Not exercised by these cases.
      },
      ...props,
    } as never)
  );

describe("search drawer results", () => {
  it("replaces the tab counts, not just the grid, when the read failed", () => {
    const markup = render({ error: new Error("Failed to search") });

    expect(markup).toContain("Search isn&#x27;t available");
    expect(markup).not.toContain("Products [0]");
    expect(markup).not.toContain("Collections [0]");
    expect(markup).not.toContain("No products found.");
  });

  it("still shows a zero count for a search that genuinely matched nothing", () => {
    const markup = render({ error: null });

    expect(markup).toContain("Products [0]");
    expect(markup).toContain("No products found.");
    expect(markup).not.toContain("Search isn&#x27;t available");
  });

  it("renders the tabs and results it was given", () => {
    const markup = render({
      products: [{ id: "gid://p/1", handle: "wren-washed-cap" }],
    });

    expect(markup).toContain("Products [1]");
    expect(markup).toContain("wren-washed-cap");
  });
});
