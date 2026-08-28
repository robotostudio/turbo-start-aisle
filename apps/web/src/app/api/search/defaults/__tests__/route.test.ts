import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * This route degraded a failed Storefront read to empty arrays at 200, so
 * `useSearchDefaults` never saw an error and the search empty state rendered a
 * "Best Sellers" heading over "No products found." — a Storefront outage
 * reported to the shopper as a catalogue with nothing in it.
 *
 * A store that genuinely has no collections and no best sellers is still a 200,
 * which is the counterpart that keeps this from being a blanket change.
 */

const { storefrontQuery } = vi.hoisted(() => ({ storefrontQuery: vi.fn() }));
vi.mock("@/lib/shopify/client", () => ({ storefrontQuery }));

const { GET } = await import("../route");

const collections = (nodes: unknown[]) => ({
  ok: true,
  data: { collections: { edges: nodes.map((node) => ({ node })) } },
});
const products = (nodes: unknown[]) => ({
  ok: true,
  data: { products: { edges: nodes.map((node) => ({ node })) } },
});
const failed = { ok: false, error: "network", kind: "network" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/search/defaults", () => {
  it("answers a failed best-sellers read with a 500", async () => {
    storefrontQuery
      .mockResolvedValueOnce(collections([{ id: "c1" }]))
      .mockResolvedValueOnce(failed);

    expect((await GET()).status).toBe(500);
  });

  it("answers a failed collections read with a 500 too", async () => {
    storefrontQuery
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(products([{ id: "p1" }]));

    expect((await GET()).status).toBe(500);
  });

  it("keeps a genuinely empty catalogue a 200", async () => {
    storefrontQuery
      .mockResolvedValueOnce(collections([]))
      .mockResolvedValueOnce(products([]));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      collections: [],
      bestSellers: [],
    });
  });

  it("returns both lists when the reads succeed", async () => {
    storefrontQuery
      .mockResolvedValueOnce(collections([{ id: "c1" }]))
      .mockResolvedValueOnce(products([{ id: "p1" }]));

    await expect((await GET()).json()).resolves.toEqual({
      collections: [{ id: "c1" }],
      bestSellers: [{ id: "p1" }],
    });
  });
});
