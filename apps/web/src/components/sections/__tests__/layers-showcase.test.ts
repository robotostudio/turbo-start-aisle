import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ShopifyCollectionProduct } from "@/lib/shopify/types";

// Neither `next/image` nor `next/link` renders outside a Next request, and the
// block's own markup — not Next's — is what the assertions are about.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement("img", { alt, src }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
// The purchase bar reads its actions from the cart context; the drawer itself
// is not under test.
vi.mock("@/components/cart/cart-context", () => ({
  useCartActions: () => ({ addLine: vi.fn(), openCart: vi.fn() }),
}));

const { LayersShowcase } = await import(
  "@/components/sections/layers-showcase"
);

type LayersShowcaseProps = Parameters<typeof LayersShowcase>[0];

const PRODUCT: ShopifyCollectionProduct = {
  id: "gid://shopify/Product/1",
  handle: "rye-leather-moto-jacket",
  title: "Rye Leather Moto Jacket",
  vendor: "Roboto",
  productType: "Jackets",
  tags: [],
  options: [{ id: "opt-size", name: "Size", values: ["S", "M"] }],
  featuredImage: {
    url: "https://cdn.test/rye-1.jpg",
    altText: null,
    width: 1200,
    height: 1500,
  },
  images: {
    edges: [
      { node: { url: "https://cdn.test/rye-1.jpg" } },
      { node: { url: "https://cdn.test/rye-2.jpg" } },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
  priceRange: {
    minVariantPrice: { amount: "240.0", currencyCode: "GBP" },
    maxVariantPrice: { amount: "240.0", currencyCode: "GBP" },
  },
  variants: {
    edges: [
      {
        node: {
          id: "gid://shopify/ProductVariant/1",
          availableForSale: true,
          quantityAvailable: 5,
          price: { amount: "240.0", currencyCode: "GBP" },
          selectedOptions: [{ name: "Size", value: "S" }],
          image: null,
        },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};

const render = (props: Partial<LayersShowcaseProps>) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(LayersShowcase, {
        _key: "show-1",
        _type: "layersShowcase",
        heading: "Layers of\nthe season",
        description: "Designed to layer or stand alone.",
        productHandle: PRODUCT.handle,
        productTitle: PRODUCT.title,
        ...props,
      } as LayersShowcaseProps)
    )
  );

// Before the page seeded it, this block fetched its product from the browser,
// so the server HTML was five skeleton cells and nothing else — which is what a
// visitor with JavaScript off kept. The seed has to reach the markup, not just
// the query cache.
describe("LayersShowcase server markup", () => {
  it("paints the product images from the seed, with no skeleton", () => {
    const html = render({ product: PRODUCT });

    expect(html).not.toContain('data-slot="skeleton"');
    expect(html).toContain("https://cdn.test/rye-1.jpg");
  });

  it("links the large image to the product page", () => {
    expect(render({ product: PRODUCT })).toContain(
      'href="/products/rye-leather-moto-jacket"'
    );
  });

  it("ships the price in the purchase bar", () => {
    expect(render({ product: PRODUCT })).toContain("£240");
  });

  it("falls back to the skeletons when no seed reached it", () => {
    // A `null` seed is a failed server read, or a route that resolves none; the
    // browser fetch takes over after hydration, exactly as before.
    const html = render({ product: null });

    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(5);
    expect(html).not.toContain('href="/products/');
  });
});
