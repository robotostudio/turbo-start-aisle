import {
  addToCartSchema,
  isAddToCartConfirmation,
  toAddToCartDetail,
} from "@workspace/ai-commerce";
import { describe, expect, it, vi } from "vitest";

import { buildLineMetadata } from "../metadata";

// The package index also exports the chat UI, whose Sanity client validates
// env vars at import time. Nothing under test here touches it.
vi.mock("@workspace/sanity/client", () => ({ client: {} }));

const GID = "gid://shopify/ProductVariant/49859176628452";

const variant = {
  gid: GID,
  title: "M / White",
  available: true,
  price: 45,
  optionValues: ["M", "White", null],
  product: {
    title: "Chill Guy Everyday Tee",
    slug: "chill-guy-everyday-tee",
    imageUrl: "https://cdn.shopify.com/tee.png?v=1",
    isActive: true,
    optionNames: ["Size", "Color"],
  },
};

describe("addToCartSchema", () => {
  it("accepts a variant GID and defaults quantity to 1", () => {
    expect(addToCartSchema.parse({ variantGid: GID })).toEqual({
      variantGid: GID,
      quantity: 1,
    });
  });

  it.each([
    "shopifyProductVariant-49859176628452",
    "49859176628452",
    "gid://shopify/Product/9233682727140",
  ])("rejects %s", (variantGid) => {
    expect(addToCartSchema.safeParse({ variantGid }).success).toBe(false);
  });

  it("rejects a quantity outside 1-10", () => {
    for (const quantity of [0, 11, 1.5]) {
      expect(
        addToCartSchema.safeParse({ variantGid: GID, quantity }).success
      ).toBe(false);
    }
  });
});

describe("toAddToCartDetail", () => {
  it("builds a payload the cart's line metadata accepts", () => {
    const detail = toAddToCartDetail(variant, 2, "GBP");
    if (typeof detail === "string") throw new Error(detail);

    expect(detail.variantGid).toBe(GID);
    expect(detail.quantity).toBe(2);
    expect(buildLineMetadata(detail)).toMatchObject({
      productTitle: "Chill Guy Everyday Tee",
      productHandle: "chill-guy-everyday-tee",
      variantTitle: "M / White",
      price: { amount: "45", currencyCode: "GBP" },
      selectedOptions: [
        { name: "Size", value: "M" },
        { name: "Color", value: "White" },
      ],
    });
  });

  it("refuses a missing, inactive or out-of-stock variant", () => {
    expect(toAddToCartDetail(null, 1, "GBP")).toMatch(/doesn't exist/);
    expect(toAddToCartDetail({ ...variant, product: null }, 1, "GBP")).toMatch(
      /doesn't exist/
    );
    expect(
      toAddToCartDetail(
        { ...variant, product: { ...variant.product, isActive: false } },
        1,
        "GBP"
      )
    ).toMatch(/no longer for sale/);
    expect(
      toAddToCartDetail({ ...variant, available: false }, 1, "GBP")
    ).toMatch(/out of stock/);
  });
});

describe("isAddToCartConfirmation", () => {
  it("accepts a pending line and rejects error strings and other outputs", () => {
    const detail = toAddToCartDetail(variant, 1, "GBP");
    expect(isAddToCartConfirmation({ status: "pending", detail })).toBe(true);
    expect(
      isAddToCartConfirmation("Chill Guy Everyday Tee is out of stock.")
    ).toBe(false);
    expect(isAddToCartConfirmation({ detail: "nope" })).toBe(false);
    expect(isAddToCartConfirmation(null)).toBe(false);
  });
});
