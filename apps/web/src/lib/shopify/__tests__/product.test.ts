import { describe, expect, it, vi } from "vitest";

// `server-only` throws on import outside a React Server Component, and vitest
// resolves its client entry. The guard is doing its job in the app; here it
// just has to not fire.
vi.mock("server-only", () => ({}));

const { storefrontQuery } = vi.hoisted(() => ({ storefrontQuery: vi.fn() }));
vi.mock("@/lib/shopify/client", () => ({ storefrontQuery }));

const { getProductByHandle } = await import("@/lib/shopify/product");

const PRODUCT = {
  id: "gid://shopify/Product/1",
  handle: "rye-leather-moto-jacket",
};

describe("getProductByHandle", () => {
  it("returns the product the Storefront API answers with", async () => {
    storefrontQuery.mockResolvedValue({ ok: true, data: { product: PRODUCT } });

    await expect(getProductByHandle(PRODUCT.handle)).resolves.toEqual(PRODUCT);
    expect(storefrontQuery).toHaveBeenCalledWith(expect.any(String), {
      variables: { handle: PRODUCT.handle },
    });
  });

  it("returns null for a handle Shopify does not know", async () => {
    storefrontQuery.mockResolvedValue({ ok: true, data: { product: null } });

    await expect(getProductByHandle("gone")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the read fails", async () => {
    // The caller is a page render; a rejected promise here would take the whole
    // home page down for one block's product.
    storefrontQuery.mockResolvedValue({
      ok: false,
      error: "boom",
      kind: "network",
    });

    await expect(getProductByHandle(PRODUCT.handle)).resolves.toBeNull();
  });
});
