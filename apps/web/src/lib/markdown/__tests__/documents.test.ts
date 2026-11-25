import { describe, expect, it, vi } from "vitest";

// documents.ts reaches env validation through these three; stub them so the
// string builders import in the test runner.
vi.mock("@workspace/env/client", () => ({
  env: { NEXT_PUBLIC_STORE_CURRENCY: "GBP" },
}));
vi.mock("@workspace/sanity/client", () => ({ urlFor: () => undefined }));
vi.mock("@/utils", () => ({ getBaseUrl: () => "https://shop.test" }));

import { cartLinkQuery } from "../../agent-shop";
import type { ShopifyCollection, ShopifyProduct } from "../../shopify/types";
import { collectionToMarkdown, productToMarkdown } from "../documents";

const price = { amount: "20.0", currencyCode: "GBP" };
const variant = (id: number, size: string, availableForSale: boolean) => ({
  node: {
    id: `gid://shopify/ProductVariant/${id}`,
    title: size,
    availableForSale,
    price,
    selectedOptions: [{ name: "Size", value: size }],
  },
});

const product = {
  handle: "tee",
  title: "Tee",
  description: "",
  updatedAt: "2026-01-01T00:00:00Z",
  vendor: "",
  productType: "",
  options: [{ name: "Size", values: ["S", "M"] }],
  variants: { edges: [variant(42, "S", true), variant(43, "M", false)] },
  images: { edges: [] },
  seo: { title: null, description: null },
  metafields: [],
} as unknown as ShopifyProduct;

describe("productToMarkdown", () => {
  const rows = productToMarkdown(product, null, "https://shop.test")
    .split("\n")
    .filter((line) => line.startsWith("| "));

  it("gives each in-stock variant a link /cart/add can read back", () => {
    const [, inStock, soldOut] = rows;
    const link = inStock?.match(/\[Add to cart\]\((\S+)\)/)?.[1];
    expect(link?.startsWith("https://shop.test/cart/add?")).toBe(true);
    const query = Object.fromEntries(new URL(link as string).searchParams);
    expect(cartLinkQuery.parse(query)).toEqual({
      handle: "tee",
      variant: "42",
      quantity: 1,
    });
    expect(soldOut).not.toContain("Add to cart");
  });

  it("keeps every row the same width", () => {
    const widths = rows.map((row) => row.split("|").length);
    expect(new Set(widths).size).toBe(1);
  });
});

describe("collectionToMarkdown", () => {
  it("links each product by its full .md URL, so an agent can open it", () => {
    const collection = {
      title: "Tees",
      description: "",
      products: {
        edges: [
          {
            node: {
              handle: "tee",
              title: "Tee",
              priceRange: { minVariantPrice: price },
            },
          },
        ],
      },
    } as unknown as ShopifyCollection;
    expect(collectionToMarkdown(collection, null)).toContain(
      "[Tee](https://shop.test/products/tee.md)"
    );
  });

  it("gives each item in stock an add-to-cart link on the page itself", () => {
    const collection = {
      title: "Tees",
      description: "",
      products: {
        edges: [
          {
            node: {
              handle: "tee",
              title: "Tee",
              priceRange: { minVariantPrice: price },
              variants: {
                edges: [variant(42, "S", true), variant(43, "M", false)],
              },
            },
          },
        ],
      },
    } as unknown as ShopifyCollection;
    const markdown = collectionToMarkdown(collection, null);
    expect(markdown).toContain(
      "add to cart: <https://shop.test/cart/add?handle=tee&variant=42&quantity=1>"
    );
    expect(markdown).toContain("  - Size S, ");
    expect(markdown).not.toContain("variant=43");
  });

  it("says when the list is cut, and gives the search", () => {
    const node = {
      handle: "tee",
      title: "Tee",
      priceRange: { minVariantPrice: price },
    };
    const collection = (hasNextPage: boolean) =>
      ({
        title: "Tees",
        description: "",
        products: { edges: [{ node }], pageInfo: { hasNextPage } },
      }) as unknown as ShopifyCollection;
    expect(collectionToMarkdown(collection(true), null)).toContain(
      "first 1 products of the collection"
    );
    expect(collectionToMarkdown(collection(true), null)).toContain(
      "<https://shop.test/search>"
    );
    expect(collectionToMarkdown(collection(false), null)).not.toContain(
      "/search"
    );
  });
});
