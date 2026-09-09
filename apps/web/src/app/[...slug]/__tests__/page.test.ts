import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A slug page rendered the page builder with no Shopify data at all, so a
 * Featured Products block placed on `/about-us` showed nothing and a Layers
 * Showcase there fetched from the browser — five skeleton cells for anyone
 * without JavaScript. The home page had already solved both; this route has
 * to hand the builder the same two maps.
 */

const { getFeaturedProducts, getProductByHandle } = vi.hoisted(() => ({
  getFeaturedProducts: vi.fn(),
  getProductByHandle: vi.fn(),
}));
const { readSlugPage } = vi.hoisted(() => ({ readSlugPage: vi.fn() }));

// `server-only` throws on import outside a React Server Component, and vitest
// resolves its client entry. The route reaches it through the product resolver.
vi.mock("server-only", () => ({}));
// Every mock below is here for the same reason as in the home page test: the
// module reaches `@workspace/env/*`, which validates with Zod at import time
// and has nothing to validate in the runner.
vi.mock("@workspace/sanity/live", () => ({
  sanityFetch: async () => ({ data: await readSlugPage() }),
}));
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
  client: { fetch: async () => [] },
}));
vi.mock("@/utils", () => ({
  getBaseUrl: () => "https://base.test",
  capitalize: (value: string) => value,
  handleErrors: async (promise: Promise<unknown>) => [await promise, undefined],
}));
vi.mock("@/components/json-ld", () => ({
  BreadcrumbJsonLd: () => null,
}));
// Standing in for the client page builder makes the resolved maps observable.
vi.mock("@/components/pagebuilder", () => ({
  PageBuilder: ({
    featuredProductsByKey,
    layersShowcaseProductByKey,
  }: {
    featuredProductsByKey?: Record<string, unknown[]>;
    layersShowcaseProductByKey?: Record<string, { handle: string } | null>;
  }) =>
    [
      `blocks:${Object.entries(featuredProductsByKey ?? {})
        .map(([key, products]) => `${key}=${products.length}`)
        .join(",")}`,
      `showcase:${Object.entries(layersShowcaseProductByKey ?? {})
        .map(([key, product]) => `${key}=${product?.handle ?? "null"}`)
        .join(",")}`,
    ].join(" "),
}));
// Both real modules open with `import "server-only"`.
vi.mock("@/lib/shopify/featured", () => ({ getFeaturedProducts }));
vi.mock("@/lib/shopify/product", () => ({ getProductByHandle }));

const { default: SlugPage } = await import("../page");

const CARD = { id: "gid://p/1", handle: "newest-hoodie" };

const render = async () =>
  renderToStaticMarkup(
    await SlugPage({ params: Promise.resolve({ slug: ["about-us"] }) })
  );

beforeEach(() => {
  vi.clearAllMocks();
  getFeaturedProducts.mockResolvedValue([CARD]);
  getProductByHandle.mockResolvedValue(CARD);
  readSlugPage.mockResolvedValue({
    _id: "page-about",
    _type: "page",
    title: "About us",
    slug: "/about-us",
    pageBuilder: [
      {
        _key: "feat-1",
        _type: "featuredProducts",
        heading: "Picks",
        products: [],
        productHandles: [],
      },
      {
        _key: "show-1",
        _type: "layersShowcase",
        heading: "Layers",
        productHandle: CARD.handle,
        productTitle: "Newest Hoodie",
      },
    ],
  });
});

describe("slug page product-backed blocks", () => {
  it("resolves the featured products for the builder", async () => {
    const markup = await render();

    expect(getFeaturedProducts).toHaveBeenCalledTimes(1);
    expect(markup).toContain("feat-1=1");
  });

  it("resolves the showcase product for the builder", async () => {
    const markup = await render();

    expect(getProductByHandle).toHaveBeenCalledWith(CARD.handle);
    expect(markup).toContain("show-1=newest-hoodie");
  });
});
