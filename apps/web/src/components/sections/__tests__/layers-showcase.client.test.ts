// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ShopifyCollectionProduct } from "@/lib/shopify/types";

/**
 * The seed puts the product in the server HTML; these cases are about what the
 * browser does with it afterwards.
 *
 * The home page is prerendered and cached until a tag revalidation, and a
 * Shopify price change does not rebuild it — so the seed can be hours old by
 * the time it is hydrated. TanStack stamps `initialData` as fetched-now unless
 * told otherwise, and `staleTime` then suppressed the mount refetch: the block
 * showed the prerender's price while the PDP showed the live one. And once a
 * refetch does run, a failed response must not replace the seeded product
 * with nothing.
 */

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement("img", { alt, src }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/cart/cart-context", () => ({
  useCartActions: () => ({ addLine: vi.fn(), openCart: vi.fn() }),
}));

const { LayersShowcase } = await import(
  "@/components/sections/layers-showcase"
);

type LayersShowcaseProps = Parameters<typeof LayersShowcase>[0];

function product(handle: string, price: string): ShopifyCollectionProduct {
  return {
    id: `gid://shopify/Product/${handle}`,
    handle,
    title: handle,
    vendor: "Roboto",
    productType: "Jackets",
    tags: [],
    options: [],
    featuredImage: {
      url: `https://cdn.test/${handle}.jpg`,
      altText: null,
      width: 1200,
      height: 1500,
    },
    images: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
    priceRange: {
      minVariantPrice: { amount: price, currencyCode: "GBP" },
      maxVariantPrice: { amount: price, currencyCode: "GBP" },
    },
    variants: {
      edges: [
        {
          node: {
            id: `gid://shopify/ProductVariant/${handle}`,
            availableForSale: true,
            quantityAvailable: 5,
            price: { amount: price, currencyCode: "GBP" },
            selectedOptions: [],
            image: null,
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

const SEED = product("rye-leather-moto-jacket", "240.0");

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

async function mount(response: { ok: boolean; status: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fetchMock);

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  const element = createElement(
    QueryClientProvider,
    // No retries: a failed revalidation should settle inside the test, not
    // back off for seconds first.
    {
      client: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    },
    createElement(LayersShowcase, {
      _key: "show-1",
      _type: "layersShowcase",
      heading: "Layers",
      productHandle: SEED.handle,
      productTitle: SEED.title,
      product: SEED,
    } as LayersShowcaseProps)
  );

  await act(async () => root.render(element));
  // Lets the mount refetch, if any, start and settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  return { fetchMock };
}

const price = () =>
  container.querySelector("span.font-medium.text-foreground.text-sm")
    ?.textContent;

describe("LayersShowcase after hydration", () => {
  it("revalidates the seed on mount rather than trusting its age", async () => {
    const fresh = product(SEED.handle, "199.0");
    const { fetchMock } = await mount({
      ok: true,
      status: 200,
      body: { product: fresh },
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/products/${SEED.handle}`);
    expect(price()).toBe("£199.00");
  });

  it("keeps the seeded product on screen when the revalidation fails", async () => {
    await mount({ ok: false, status: 502, body: { product: null } });

    expect(
      container.querySelector('a[href="/products/rye-leather-moto-jacket"]')
    ).not.toBeNull();
    expect(price()).toBe("£240.00");
  });
});
