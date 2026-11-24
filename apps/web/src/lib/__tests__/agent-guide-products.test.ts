import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Component, and the cache needs
// a running Next server: the test calls the function underneath it.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));

const storefrontQuery = vi.fn();
vi.mock("@/lib/shopify/client", () => ({ storefrontQuery }));

const { guideCatalogue, MAX_GUIDE_PRODUCTS } = await import(
  "../agent-guide-products"
);

const product = (handle: string, moreVariants = false) => ({
  node: {
    handle,
    title: handle,
    featuredImage: null,
    variants: { pageInfo: { hasNextPage: moreVariants }, edges: [] },
  },
});

/** One page of the `products` connection. */
const page = (
  handles: string[],
  endCursor: string | null,
  hasNextPage = endCursor !== null
) => ({
  ok: true,
  data: {
    products: {
      pageInfo: { hasNextPage, endCursor },
      edges: handles.map((handle) => product(handle)),
    },
  },
});

const handles = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => `p${from + index}`);

beforeEach(() => {
  storefrontQuery.mockReset();
});

describe("guideCatalogue", () => {
  it("joins the pages in order and follows the cursor", async () => {
    storefrontQuery
      .mockResolvedValueOnce(page(["a", "b"], "cursor-1"))
      .mockResolvedValueOnce(page(["c"], null));

    const { products, partial } = await guideCatalogue();

    expect(products.map(({ handle }) => handle)).toEqual(["a", "b", "c"]);
    expect(partial).toBe(false);
    expect(storefrontQuery.mock.calls.map(([, options]) => options)).toEqual([
      { variables: { first: 50, after: null } },
      { variables: { first: 50, after: "cursor-1" } },
    ]);
  });

  it("throws when a later page fails, so no short list is cached", async () => {
    storefrontQuery
      .mockResolvedValueOnce(page(["a"], "cursor-1"))
      .mockResolvedValueOnce({ ok: false, error: "boom", kind: "network" });

    await expect(guideCatalogue()).rejects.toThrow("boom");
  });

  it("stops at the cap and says the list was cut", async () => {
    // A shop with more products than the cap: every read returns exactly
    // what was asked for, and there is always more.
    storefrontQuery.mockImplementation(
      async (
        _query,
        { variables }: { variables: { first: number; after: string | null } }
      ) => {
        const from = Number(variables.after ?? 0);
        return page(
          handles(from, variables.first),
          String(from + variables.first)
        );
      }
    );

    const { products, partial } = await guideCatalogue();

    expect(products).toHaveLength(MAX_GUIDE_PRODUCTS);
    expect(products.at(-1)?.handle).toBe(`p${MAX_GUIDE_PRODUCTS - 1}`);
    expect(partial).toBe(true);
    // No read asks for more than the cap has room for.
    const asked = storefrontQuery.mock.calls.map(
      ([, options]) => options.variables.first as number
    );
    expect(asked.reduce((sum, first) => sum + first, 0)).toBe(
      MAX_GUIDE_PRODUCTS
    );
  });

  it("is not partial when the shop ends exactly at the cap", async () => {
    storefrontQuery
      .mockResolvedValueOnce(page(handles(0, 50), "50"))
      .mockResolvedValueOnce(page(handles(50, 50), null));

    expect((await guideCatalogue()).partial).toBe(false);
  });

  it("is partial when a product has more variants than one read returns", async () => {
    storefrontQuery.mockResolvedValueOnce({
      ok: true,
      data: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [product("big", true)],
        },
      },
    });

    expect((await guideCatalogue()).partial).toBe(true);
  });
});
