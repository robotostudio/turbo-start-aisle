import { afterEach, describe, expect, it, vi } from "vitest";

import { type ShopToolDeps, shopPath, shopTools } from "../webmcp-shop-tools";

// The package index also exports the chat UI, whose Sanity client validates
// env vars at import time. Nothing under test here touches it.
vi.mock("@workspace/sanity/client", () => ({ client: {} }));

const GID = "gid://shopify/ProductVariant/1";
const SOLD_OUT_GID = "gid://shopify/ProductVariant/2";
const price = { amount: "20.0", currencyCode: "GBP" };

const product = {
  handle: "tee",
  title: "Tee",
  vendor: "Aisle",
  options: [{ id: "o", name: "Size", values: ["S", "M"] }],
  featuredImage: null,
  variants: {
    edges: [
      {
        node: {
          id: GID,
          availableForSale: true,
          price,
          selectedOptions: [{ name: "Size", value: "S" }],
        },
      },
      {
        node: {
          id: SOLD_OUT_GID,
          availableForSale: false,
          price,
          selectedOptions: [{ name: "Size", value: "M" }],
        },
      },
    ],
  },
};

const cart = {
  totalQuantity: 1,
  checkoutUrl: "https://shop.example/checkout",
  cost: { subtotalAmount: price },
  lines: {
    edges: [
      {
        node: {
          id: "line-1",
          quantity: 1,
          merchandise: {
            title: "S",
            price,
            product: { handle: "tee", title: "Tee" },
          },
        },
      },
    ],
  },
} as unknown as NonNullable<ReturnType<ShopToolDeps["getCart"]>>;

function setup(found: unknown = product) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ product: found }))
  );
  const deps = {
    getCart: vi.fn(() => cart),
    getSaved: vi.fn(() => []),
    setSaved: vi.fn(),
    addLine: vi.fn(async () => ({ ok: true, warnings: [] })),
    updateLine: vi.fn(),
    removeLine: vi.fn(),
    openCart: vi.fn(),
    settle: vi.fn(async () => cart),
    push: vi.fn(),
    leave: vi.fn(),
  } satisfies ShopToolDeps;
  const tools = shopTools(deps);
  const call = async (name: string, input: object) => {
    const found = tools.find((tool) => tool.name === name);
    if (!found) {
      throw new Error(`No tool ${name}`);
    }
    return String(
      await found.execute(input as Record<string, unknown>, {
        signal: new AbortController().signal,
      })
    );
  };
  return { deps, tools, call };
}

afterEach(() => vi.unstubAllGlobals());

describe("shopTools", () => {
  it("marks every tool that changes the cart or leaves the site", () => {
    const { tools } = setup();
    const consequential = tools
      .filter((tool) => tool.annotations?.consequentialHint)
      .map((tool) => tool.name);
    expect(consequential).toEqual([
      "add_to_cart",
      "update_cart_line",
      "go_to_checkout",
    ]);
  });

  it("adds an in-stock variant with the shop's own price", async () => {
    const { deps, call } = setup();
    const answer = await call("add_to_cart", {
      handle: "tee",
      variantGid: GID,
      quantity: 2,
    });
    expect(deps.addLine).toHaveBeenCalledWith(
      GID,
      2,
      expect.objectContaining({ productTitle: "Tee", price, variantTitle: "S" })
    );
    expect(deps.openCart).toHaveBeenCalled();
    expect(answer).toContain("Added 2 x Tee (S)");
  });

  it("adds nothing on a dry run", async () => {
    const { deps, call } = setup();
    const answer = await call("add_to_cart", {
      handle: "tee",
      variantGid: GID,
      dryRun: true,
    });
    expect(answer).toContain("Dry run");
    expect(deps.addLine).not.toHaveBeenCalled();
  });

  it.each([
    ["a sold-out variant", { handle: "tee", variantGid: SOLD_OUT_GID }],
    [
      "a variant of another product",
      { handle: "tee", variantGid: "gid://shopify/ProductVariant/9" },
    ],
    ["a missing variant", { handle: "tee" }],
    ["a made-up id", { handle: "tee", variantGid: "S" }],
  ])("refuses %s", async (_name, input) => {
    const { deps, call } = setup();
    await call("add_to_cart", input);
    expect(deps.addLine).not.toHaveBeenCalled();
  });

  it("refuses a product that does not exist", async () => {
    const { deps, call } = setup(null);
    expect(
      await call("add_to_cart", { handle: "nope", variantGid: GID })
    ).toContain("No product");
    await call("set_saved_item", { handle: "nope", saved: true });
    expect(deps.addLine).not.toHaveBeenCalled();
    expect(deps.setSaved).not.toHaveBeenCalled();
  });

  it("removes a line at quantity 0 and refuses an unknown line", async () => {
    const { deps, call } = setup();
    await call("update_cart_line", { lineId: "line-1", quantity: 0 });
    expect(deps.removeLine).toHaveBeenCalledWith("line-1");
    await call("update_cart_line", { lineId: "line-1", quantity: 3 });
    expect(deps.updateLine).toHaveBeenCalledWith("line-1", 3);
    await call("update_cart_line", { lineId: "other", quantity: 3 });
    expect(deps.updateLine).toHaveBeenCalledTimes(1);
  });

  it("sends the visitor to the confirmed cart's checkout", async () => {
    const { deps, call } = setup();
    await call("go_to_checkout", {});
    expect(deps.leave).toHaveBeenCalledWith(cart.checkoutUrl);
  });

  it("does not check out an empty cart", async () => {
    const { deps, call } = setup();
    deps.getCart.mockReturnValue({ ...cart, totalQuantity: 0 });
    await call("go_to_checkout", {});
    expect(deps.settle).not.toHaveBeenCalled();
    expect(deps.leave).not.toHaveBeenCalled();
  });

  it("opens a filtered collection", async () => {
    const { deps, call } = setup();
    await call("set_collection_filters", {
      collection: "tees",
      available: true,
    });
    expect(deps.push).toHaveBeenCalledWith(
      "/collections/tees?filter.available=true"
    );
  });

  it("opens shop pages only", async () => {
    const { deps, call } = setup();
    await call("open_page", { path: "/api/chat" });
    await call("open_page", { path: "//evil.example/products/x" });
    expect(deps.push).not.toHaveBeenCalled();
    await call("open_page", { path: "/products/tee?Size=M" });
    expect(deps.push).toHaveBeenCalledWith("/products/tee?Size=M");
  });
});

describe("shopPath", () => {
  it.each([
    "/",
    "/search?q=tee",
    "/collections",
    "/collections/tees?sort=PRICE",
    "/products/tee",
  ])("allows %s", (path) => {
    expect(shopPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "/api/search",
    "/products/../api/chat",
    "/cart",
    "products/tee",
  ])("refuses %s", (path) => {
    expect(shopPath(path)).toBeUndefined();
  });
});
