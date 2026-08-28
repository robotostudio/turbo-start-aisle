import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The collections index is prerendered, and next-sanity caches its reads with
 * `revalidate: false` in production, so what it renders on a failed read is
 * what every shopper sees until a tag revalidation replaces it. Degrading to an
 * empty list makes that a 200 nobody can tell apart from a store with no
 * collections; throwing keeps the last good page in place, because Next keeps
 * serving it when a background re-render throws.
 *
 * The four cases are a set, and the last two are what discriminate. A blanket
 * `if (!collections || collections.length === 0) throw` would satisfy the
 * failure cases and break a genuinely empty store, which is a legitimate 200.
 *
 * `environment: "node"` means there is no status code to assert here — resolve
 * versus reject is the honest assertion at this level. That a rejection reaches
 * the shopper as a 5xx is Next's error boundary, `app/error.tsx`.
 */

// The collections read, hoisted so each case can pick resolve or reject.
const { readCollections } = vi.hoisted(() => ({ readCollections: vi.fn() }));

// Every mock below is here for the same reason: the module reaches
// `@workspace/env/*`, which validates with Zod at import time and has nothing
// to validate in the runner.
vi.mock("@workspace/sanity/live", () => ({
  // Both reads go through one `sanityFetch`, so the stand-in discriminates on
  // the query. Only the collections read is under test — the index doc is
  // `[0]`-sliced and legitimately nullable, so the page falls back on its title.
  sanityFetch: async ({ query }: { query: string }) =>
    query.includes("collectionsIndex")
      ? { data: { title: "Collections" } }
      : { data: await readCollections() },
}));
// Reached through `@/lib/seo` → `@/lib/markdown/shared`; the same stub the
// Markdown tests use.
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
}));
vi.mock("@/utils", () => ({
  getBaseUrl: () => "https://base.test",
  capitalize: (value: string) => value,
}));
// Structured data, not the markup these cases assert on.
vi.mock("@/components/json-ld", () => ({
  BreadcrumbJsonLd: () => null,
  CollectionJsonLd: () => null,
}));
// Stands in for the empty state, so the rendering cases prove the page passed
// on the list it was given rather than only that it did not throw.
vi.mock("@/components/collections/collections-content", () => ({
  CollectionsContent: ({ collections }: { collections: unknown[] }) =>
    collections.length === 0 ? "No collections" : `${collections.length} shown`,
}));

const { default: CollectionsPage } = await import("../page");

describe("collections index page", () => {
  it("propagates a failed read rather than rendering an empty index", async () => {
    // `sanityFetch` rejects on any transport failure today. Pinned here because
    // the repo keeps `handleErrors` and already absorbs rejected Sanity reads in
    // `llms.txt/route.ts`, so wrapping this one is a plausible regression.
    readCollections.mockRejectedValue(new Error("sanity 503"));

    await expect(CollectionsPage()).rejects.toThrow(/sanity 503/);
  });

  it("throws when the read comes back with no data", async () => {
    readCollections.mockResolvedValue(null);

    await expect(CollectionsPage()).rejects.toThrow(/collections read failed/i);
  });

  it("renders the empty state when the store genuinely has no collections", async () => {
    readCollections.mockResolvedValue([]);

    expect(renderToStaticMarkup(await CollectionsPage())).toContain(
      "No collections"
    );
  });

  it("renders the collections it was given", async () => {
    readCollections.mockResolvedValue([
      { _id: "collection-1", title: "Shirts", slug: "shirts" },
    ]);

    expect(renderToStaticMarkup(await CollectionsPage())).toContain("1 shown");
  });
});
