import { describe, expect, it } from "vitest";

import {
  cartLineFor,
  cartLineInput,
  cartLink,
  cartLinkQuery,
  productsSummary,
  shopGuideMarkdown,
  variantGidFromLink,
} from "../agent-shop";
import { allowRequest, MAX_KEYS } from "../rate-limit";
import type { ShopifyCollectionProduct } from "../shopify/types";

const GID = "gid://shopify/ProductVariant/42";
const price = { amount: "20.0", currencyCode: "GBP" };

const product = {
  handle: "tee",
  title: "Tee",
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
          id: "gid://shopify/ProductVariant/43",
          availableForSale: false,
          price,
          selectedOptions: [{ name: "Size", value: "M" }],
        },
      },
    ],
  },
} as unknown as ShopifyCollectionProduct;

describe("cartLineFor", () => {
  it("builds the line from the shop's own product data", () => {
    const line = cartLineFor(product, GID, 2);
    expect(line).toMatchObject({
      ok: true,
      variantId: GID,
      named: "2 x Tee (S) at 20.0 GBP each",
      metadata: { productHandle: "tee", price, variantTitle: "S" },
    });
  });

  it("refuses a sold-out variant and one the product does not have", () => {
    expect(cartLineFor(product, "gid://shopify/ProductVariant/43", 1)).toEqual({
      ok: false,
      reason: "Tee (M) is out of stock. Nothing was added.",
    });
    expect(cartLineFor(product, "gid://shopify/ProductVariant/9", 1).ok).toBe(
      false
    );
  });
});

describe("cartLink", () => {
  it("survives the trip through a URL back to the same variant", () => {
    const link = cartLink("https://shop.example", "tee", GID, 3);
    expect(link).toBe(
      "https://shop.example/cart/add?handle=tee&variant=42&quantity=3"
    );
    const query = cartLinkQuery.parse(
      Object.fromEntries(new URL(link).searchParams)
    );
    expect(query).toEqual({ handle: "tee", variant: "42", quantity: 3 });
    expect(variantGidFromLink(query.variant)).toBe(GID);
  });

  it.each([
    ["no variant", { handle: "tee" }],
    ["a variant that is not an id", { handle: "tee", variant: "42/../x" }],
    ["a handle with a path in it", { handle: "../api", variant: "42" }],
    ["too many", { handle: "tee", variant: "42", quantity: "11" }],
    ["none", { handle: "tee", variant: "42", quantity: "0" }],
  ])("refuses a link with %s", (_name, query) => {
    expect(cartLinkQuery.safeParse(query).success).toBe(false);
  });

  it("adds one when the link gives no quantity", () => {
    expect(cartLinkQuery.parse({ handle: "tee", variant: "42" }).quantity).toBe(
      1
    );
  });
});

describe("allowRequest", () => {
  it("stops a key at its limit, then lets it back in after the window", () => {
    const key = `test-${Math.random()}`;
    expect(allowRequest(key, 2, 1000, 0)).toBe(true);
    expect(allowRequest(key, 2, 1000, 10)).toBe(true);
    expect(allowRequest(key, 2, 1000, 20)).toBe(false);
    expect(allowRequest(`${key}-other`, 2, 1000, 20)).toBe(true);
    expect(allowRequest(key, 2, 1000, 1005)).toBe(true);
  });

  it("keeps a limited caller limited while other addresses sweep through", () => {
    const key = `held-${Math.random()}`;
    expect(allowRequest(key, 1, 60_000, 0)).toBe(true);
    for (let other = 0; other < MAX_KEYS + 10; other++) {
      allowRequest(`sweep-${other}`, 1, 60_000, 1);
      // Still calling, so still among the newest keys.
      if (other % 1000 === 0) {
        expect(allowRequest(key, 1, 60_000, 2)).toBe(false);
      }
    }
  });
});

describe("what the tools take and give", () => {
  it("accepts only a Shopify variant id and a small quantity", () => {
    expect(
      cartLineInput.parse({ handle: "tee", variantGid: GID }).quantity
    ).toBe(1);
    for (const bad of [
      { handle: "tee", variantGid: "42" },
      { handle: "tee", variantGid: GID, quantity: 11 },
      { handle: "a/b", variantGid: GID },
    ]) {
      expect(cartLineInput.safeParse(bad).success).toBe(false);
    }
  });

  it("gives full links when there is an origin, and paths in the page", () => {
    const listed = {
      ...product,
      vendor: "Aisle",
      priceRange: { minVariantPrice: price },
    } as ShopifyCollectionProduct;
    expect(productsSummary([listed], "https://shop.example")[0]?.url).toBe(
      "https://shop.example/products/tee"
    );
    expect(productsSummary([listed])[0]?.url).toBe("/products/tee");
  });
});

describe("shopGuideMarkdown", () => {
  const guide = shopGuideMarkdown("https://shop.test");

  it("points agents at pages on this origin they can open", () => {
    expect(guide).toContain("<https://shop.test/collections.md>");
    expect(guide).toContain("<https://shop.test/llms.txt>");
  });

  it("never sends an agent to a URL under /api/", () => {
    expect(guide).not.toMatch(/https?:\/\/\S*\/api\//);
  });
});
