import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws on import outside a React Server Component, and vitest
// resolves its client entry. Same guard `product.test.ts` steps around.
vi.mock("server-only", () => ({}));

const { getFeaturedProducts, getProductByHandle } = vi.hoisted(() => ({
  getFeaturedProducts: vi.fn(),
  getProductByHandle: vi.fn(),
}));
vi.mock("@/lib/shopify/featured", () => ({ getFeaturedProducts }));
vi.mock("@/lib/shopify/product", () => ({ getProductByHandle }));

const { resolvePageBuilderProducts } = await import(
  "@/lib/page-builder-products"
);

type Blocks = Parameters<typeof resolvePageBuilderProducts>[0];
// Fixtures carry only the fields the resolver reads; the generated union wants
// every projected field, so they go through `unknown`.
const asBlocks = (list: unknown[]) => list as Blocks;

const CARD = { id: "gid://p/1", handle: "newest-hoodie" };

const featured = {
  _key: "feat-1",
  _type: "featuredProducts",
  heading: "Picks",
  products: [{ _key: "pick-0", _ref: "product-0", _type: "reference" }],
  productHandles: ["wren-washed-cap"],
};
const showcase = (productHandle: string | null) => ({
  _key: "show-1",
  _type: "layersShowcase",
  heading: "Layers",
  productHandle,
  productTitle: null,
});
const hero = { _key: "hero-1", _type: "hero", title: "SS26" };

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  getFeaturedProducts.mockResolvedValue([CARD]);
  getProductByHandle.mockResolvedValue(CARD);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

// One resolver for every route that renders the page builder, so a block that
// paints without JavaScript on the home page paints the same way on a slug
// page or the blog index. The home page test covers the featured-picks edge
// cases in depth; this suite is about the shape every caller gets back.
describe("resolvePageBuilderProducts", () => {
  it("keys both maps by block, and reads nothing for blocks that need nothing", async () => {
    const result = await resolvePageBuilderProducts(
      asBlocks([hero, featured, showcase(CARD.handle)])
    );

    expect(result.featuredProductsByKey).toEqual({ "feat-1": [CARD] });
    expect(result.layersShowcaseProductByKey).toEqual({ "show-1": CARD });
    expect(getFeaturedProducts).toHaveBeenCalledTimes(1);
    expect(getProductByHandle).toHaveBeenCalledWith(CARD.handle);
  });

  it("returns empty maps for a page with no product-backed blocks", async () => {
    const result = await resolvePageBuilderProducts(asBlocks([hero]));

    expect(result).toEqual({
      featuredProductsByKey: {},
      layersShowcaseProductByKey: {},
    });
    expect(getFeaturedProducts).not.toHaveBeenCalled();
    expect(getProductByHandle).not.toHaveBeenCalled();
  });

  it("hands a showcase null without a read when its product is gone", async () => {
    const result = await resolvePageBuilderProducts(asBlocks([showcase(null)]));

    expect(result.layersShowcaseProductByKey).toEqual({ "show-1": null });
    expect(getProductByHandle).not.toHaveBeenCalled();
  });

  it("hands a showcase null, and warns, when the read comes back empty", async () => {
    getProductByHandle.mockResolvedValue(null);

    const result = await resolvePageBuilderProducts(
      asBlocks([showcase(CARD.handle)])
    );

    expect(result.layersShowcaseProductByKey).toEqual({ "show-1": null });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Layers Showcase block show-1")
    );
  });
});
