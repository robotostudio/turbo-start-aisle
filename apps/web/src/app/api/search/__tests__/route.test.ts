import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * This route answered a failed Storefront read with a 200 and an empty body, so
 * the drawer's `if (!response.ok) throw` could never fire and a total outage
 * reached the shopper as "No products found." It now answers 500, matching
 * `api/search/full`.
 *
 * The blank-query case is the counterpart and the reason this is not a blanket
 * change: a search for nothing legitimately matches nothing, and turning that
 * into an error would be a lie in the other direction.
 */

const { storefrontQuery } = vi.hoisted(() => ({ storefrontQuery: vi.fn() }));
vi.mock("@/lib/shopify/client", () => ({ storefrontQuery }));

const { GET } = await import("../route");

const get = (q: string) =>
  GET(new Request(`https://shop.test/api/search?q=${encodeURIComponent(q)}`));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/search", () => {
  it("answers a failed catalogue read with a 500", async () => {
    storefrontQuery.mockResolvedValue({
      ok: false,
      error: "network",
      kind: "network",
    });

    expect((await get("jacket")).status).toBe(500);
  });

  it("keeps a blank query a 200, because that is a real empty", async () => {
    const response = await get("   ");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ products: [] });
    expect(storefrontQuery).not.toHaveBeenCalled();
  });

  it("answers a successful read with a 200 and its results", async () => {
    storefrontQuery.mockResolvedValue({
      ok: true,
      data: {
        predictiveSearch: {
          products: [{ title: "Wren Washed Cap" }],
          collections: [],
          queries: [],
        },
      },
    });

    const response = await get("cap");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      products: [{ title: "Wren Washed Cap" }],
    });
  });
});
