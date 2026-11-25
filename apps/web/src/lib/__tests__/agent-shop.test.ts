import { describe, expect, it } from "vitest";

import {
  cartLineFor,
  cartLineInput,
  cartLink,
  cartLinkQuery,
  type GuideProduct,
  groupGuideLines,
  lineTotal,
  optionsLine,
  productsSummary,
  shopGuide,
  shopGuideMarkdown,
  shopPrompt,
  variantGidFromLink,
} from "../agent-shop";
import { allowRequest, MAX_KEYS } from "../rate-limit";
import { formatMoney } from "../shopify/money";
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

describe("the /cart/add slip", () => {
  it("words a variant's options, and says nothing for a product with none", () => {
    expect(
      optionsLine([
        { name: "Size", value: "S" },
        { name: "Color", value: "pink" },
      ])
    ).toBe("Size S · Color pink");
    expect(optionsLine([{ name: "Title", value: "Default Title" }])).toBe("");
  });

  it("totals a line in the price's own currency", () => {
    const total = lineTotal({ amount: "46.42", currencyCode: "USD" }, 3);
    expect(total.currencyCode).toBe("USD");
    expect(formatMoney(total)).toBe("$139.26");
    // 0.1 * 3 is 0.30000000000000004: the formatter, not the sum, rounds it.
    expect(
      formatMoney(lineTotal({ amount: "0.1", currencyCode: "USD" }, 3))
    ).toBe("$0.30");
    // A three-decimal currency keeps its third digit.
    expect(lineTotal({ amount: "1.275", currencyCode: "KWD" }, 1).amount).toBe(
      "1.275"
    );
  });
});

describe("shopGuideMarkdown", () => {
  const variant = (id: number, title: string, availableForSale: boolean) => ({
    node: {
      id: `gid://shopify/ProductVariant/${id}`,
      title,
      availableForSale,
      price,
    },
  });
  const tee = (title = "Tee") => ({
    handle: "tee",
    title,
    featuredImage: { url: "https://cdn.test/tee.png" },
    variants: { edges: [variant(42, "S", true), variant(43, "M", false)] },
  });
  const guideFor = (products: GuideProduct[], partial = false) =>
    shopGuideMarkdown("https://shop.test", { products, partial });
  const guide = guideFor([tee()]);

  it("lists each item in stock with a link /cart/add can read back", () => {
    const link = guide.match(/- Tee, S, 20\.0 GBP: <(\S+)>/)?.[1];
    const query = Object.fromEntries(new URL(link as string).searchParams);
    expect(cartLinkQuery.parse(query)).toEqual({
      handle: "tee",
      variant: "42",
      quantity: 1,
    });
  });

  it("puts each product's own photo ahead of its items", () => {
    const photo = guide.indexOf("- Tee, photo: <https://cdn.test/tee.png>");
    expect(photo).toBeGreaterThan(-1);
    expect(photo).toBeLessThan(guide.indexOf("- Tee, S, 20.0 GBP:"));
  });

  it("marks only the photo line as a picture, for the page to embed", () => {
    const { steps } = shopGuide("https://shop.test", {
      products: [tee()],
      partial: false,
    });
    const pictures = steps
      .flatMap((step) => step.lines)
      .filter((line) => line.photoOf);
    expect(pictures).toEqual([
      { text: "Tee, photo:", url: "https://cdn.test/tee.png", photoOf: "Tee" },
    ]);
  });

  it("groups the item list by product for the page, and keeps notes apart", () => {
    const hat = {
      ...tee("Hat"),
      handle: "hat",
      featuredImage: null,
      variants: { edges: [variant(7, "Default Title", true)] },
    };
    const { steps } = shopGuide("https://shop.test", {
      products: [tee(), hat],
      partial: true,
    });
    const { notes, groups } = groupGuideLines(steps[1]?.lines ?? []);
    expect(groups).toEqual([
      {
        product: "Tee",
        photo: "https://cdn.test/tee.png",
        items: [
          {
            variant: "S",
            price: "20.0 GBP",
            url: "https://shop.test/cart/add?handle=tee&variant=42&quantity=1",
          },
        ],
      },
      {
        product: "Hat",
        items: [
          {
            variant: undefined,
            price: "20.0 GBP",
            url: "https://shop.test/cart/add?handle=hat&variant=7&quantity=1",
          },
        ],
      },
    ]);
    // The search link belongs to no product, so it stays a note.
    expect(notes.at(-1)?.url).toBe("https://shop.test/search");
    expect(notes.every((note) => !(note.item || note.photoOf))).toBe(true);
  });

  it("lists no photo for a sold-out product or one without a picture", () => {
    const soldOut = {
      ...tee(),
      variants: { edges: [variant(43, "M", false)] },
    };
    expect(guideFor([soldOut])).not.toContain("photo:");
    expect(guideFor([{ ...tee(), featuredImage: null }])).not.toContain(
      "photo:"
    );
  });

  it("leaves out a sold-out variant", () => {
    expect(guide).not.toContain("Tee, M");
    expect(guide).not.toContain("variant=43");
  });

  it("names a product with no options by its title alone", () => {
    const cap = {
      handle: "cap",
      title: "Cap",
      featuredImage: null,
      variants: { edges: [variant(7, "Default Title", true)] },
    };
    expect(guideFor([cap])).toContain(
      "- Cap, 20.0 GBP: <https://shop.test/cart/add?"
    );
  });

  it("links the cart, not a URL written in a product title", () => {
    expect(guideFor([tee("Tee https://x.io")])).toContain(
      "- Tee https://x.io, S, 20.0 GBP: <https://shop.test/cart/add?"
    );
  });

  it("says nothing is in stock, not that an item is missing", () => {
    const soldOut = {
      handle: "tee",
      title: "Tee",
      featuredImage: { url: "https://cdn.test/tee.png" },
      variants: { edges: [variant(43, "M", false)] },
    };
    expect(guideFor([soldOut])).toContain("Nothing in this list is in stock");
    expect(guideFor([])).toContain("Nothing in this list is in stock");
  });

  it("does not call an unlisted item sold out when the list was cut", () => {
    expect(guide).toContain("is sold out or not sold here");
    const cut = guideFor([tee()], true);
    expect(cut).not.toContain("is sold out or not sold here");
    expect(cut).toContain("<https://shop.test/search>");
  });

  it("never sends an agent to a URL under /api/", () => {
    expect(guide).not.toMatch(/https?:\/\/\S*\/api\//);
  });
});

describe("shopPrompt", () => {
  it("names the shop and ends with the guide address, no full stop", () => {
    expect(shopPrompt("Aisle", "https://shop.test")).toBe(
      "Shop Aisle for me. Ask me for anything you need first. The steps are at https://shop.test/shop-for-agents"
    );
  });
});
