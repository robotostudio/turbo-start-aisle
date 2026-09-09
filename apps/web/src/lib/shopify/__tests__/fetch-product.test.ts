import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchProduct } from "@/lib/shopify/fetch-product";

const PRODUCT = { id: "gid://p/1", handle: "rye-leather-moto-jacket" };

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The browser-side read behind the Layers Showcase's revalidation. It used to
// fold a failed response into `null`, which React Query records as a success:
// once the block was seeded server-side, one 502 on revalidation replaced a
// product the server had rendered correctly with four empty cells.
describe("fetchProduct", () => {
  it("returns the product for a 200", async () => {
    vi.stubGlobal("fetch", respond(200, { product: PRODUCT }));

    await expect(fetchProduct(PRODUCT.handle)).resolves.toEqual(PRODUCT);
    expect(fetch).toHaveBeenCalledWith(`/api/products/${PRODUCT.handle}`);
  });

  it("returns null when the route answers that the product is not there", async () => {
    vi.stubGlobal("fetch", respond(200, { product: null }));

    await expect(fetchProduct("gone")).resolves.toBeNull();
  });

  it("throws on a failed response, so the query keeps its last data and retries", async () => {
    vi.stubGlobal("fetch", respond(502, { product: null }));

    await expect(fetchProduct(PRODUCT.handle)).rejects.toThrow(/502/);
  });
});
