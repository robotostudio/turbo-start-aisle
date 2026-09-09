import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two failures met on this page, and both rendered as something healthy.
 *
 * A home page with no document behind it printed the bare string "No home page
 * data", unstyled, between a working navbar and a working footer — and with no
 * `<main>` at all, since `PageBuilder` supplies the only one.
 *
 * A Featured Products block whose every pick had been deleted or archived
 * reached the resolver as an empty handle list, which is the same input as "the
 * editor picked nothing" — and that is what makes it answer with best-sellers.
 * The block became four products the editor never chose, under their heading.
 *
 * The honest counterparts are asserted alongside each: a genuinely empty
 * `products` array must still get the best-seller row, or the fix would have
 * broken a documented feature of the block.
 */

const { getFeaturedProducts, getProductByHandle } = vi.hoisted(() => ({
  getFeaturedProducts: vi.fn(),
  getProductByHandle: vi.fn(),
}));
const { readHomePage } = vi.hoisted(() => ({ readHomePage: vi.fn() }));

// `server-only` throws on import outside a React Server Component, and vitest
// resolves its client entry. The route reaches it through the product resolver.
vi.mock("server-only", () => ({}));
// Every mock below is here for the same reason as in the collections page test:
// the module reaches `@workspace/env/*`, which validates with Zod at import time
// and has nothing to validate in the runner.
vi.mock("@workspace/sanity/live", () => ({
  sanityFetch: async () => ({ data: await readHomePage() }),
}));
// Reached through `@/lib/seo` -> `@/lib/markdown/shared`.
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
  client: { fetch: async () => null },
}));
vi.mock("@/utils", () => ({
  getBaseUrl: () => "https://base.test",
  capitalize: (value: string) => value,
  handleErrors: async (promise: Promise<unknown>) => [await promise, undefined],
}));
// A client component that pulls `@workspace/env/client`, the visual-editing
// runtime and twelve section components. Standing in for it also makes the
// resolved products observable.
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
// Mocked for the spies, and because both real modules open with `import
// "server-only"` — a package whose non-`react-server` entry is a bare `throw`.
vi.mock("@/lib/shopify/featured", () => ({ getFeaturedProducts }));
vi.mock("@/lib/shopify/product", () => ({ getProductByHandle }));

const { default: Page, generateMetadata } = await import("../page");

const CARD = { id: "gid://p/1", handle: "newest-hoodie" };

function homePage(blocks: unknown[] = []) {
  return {
    _id: "homePage",
    _type: "homePage",
    title: "Home",
    pageBuilder: blocks,
  };
}

function featuredBlock(productHandles: string[] | null, pickCount: number) {
  return {
    _key: "feat-1",
    _type: "featuredProducts",
    heading: "Editor's picks",
    products: Array.from({ length: pickCount }, (_, i) => ({
      _key: `pick-${i}`,
      _ref: `product-${i}`,
      _type: "reference",
    })),
    productHandles,
  };
}

function showcaseBlock(productHandle: string | null) {
  return {
    _key: "show-1",
    _type: "layersShowcase",
    heading: "Layers of the season",
    productHandle,
    productTitle: productHandle ? "Rye Leather Moto Jacket" : null,
  };
}

const render = async () => renderToStaticMarkup(await Page());

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  getFeaturedProducts.mockResolvedValue([CARD]);
  getProductByHandle.mockResolvedValue(CARD);
  // The page warns on both branches under test; swallow it to keep the run
  // readable, and hold the spy so the assertions do not reach for the global.
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("home page with no document", () => {
  it("renders the branded state, not the bare string", async () => {
    readHomePage.mockResolvedValue(null);

    const markup = await render();

    expect(markup).toContain("This page couldn&#x27;t be loaded");
    expect(markup).toContain("Back to Shop");
    expect(markup).not.toContain("No home page data");
  });

  it("gives that state a main landmark", async () => {
    readHomePage.mockResolvedValue(null);

    expect(await render()).toContain("<main");
  });

  it("says so in the log, since nothing on screen names the cause", async () => {
    readHomePage.mockResolvedValue(null);

    await render();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Home page read returned no document")
    );
  });

  it("keeps the failure state out of the index", async () => {
    // The route prerenders and next-sanity caches at `revalidate: false`, so an
    // indexable "couldn't be loaded" would stand in as the home page until a tag
    // revalidation. The metadata has to agree with what the body says.
    readHomePage.mockResolvedValue(null);

    // The `noindex` half alone is what keeps this out of the index, and holds
    // for either pairing. "index, follow" does not contain "noindex".
    expect(await generateMetadata()).toMatchObject({
      robots: expect.stringContaining("noindex"),
    });
  });

  it("leaves a real home page indexable", async () => {
    readHomePage.mockResolvedValue(homePage());

    expect(await generateMetadata()).toMatchObject({ robots: "index, follow" });
  });

  it("still renders the page builder when a document is there", async () => {
    readHomePage.mockResolvedValue(homePage());

    expect(await render()).toContain("blocks:");
  });
});

describe("home page featured products", () => {
  it("renders nothing rather than best-sellers when every pick is gone", async () => {
    readHomePage.mockResolvedValue(homePage([featuredBlock([], 4)]));

    const markup = await render();

    expect(getFeaturedProducts).not.toHaveBeenCalled();
    expect(markup).toContain("feat-1=0");
  });

  it("still falls back to best-sellers when the editor picked none", async () => {
    readHomePage.mockResolvedValue(homePage([featuredBlock([], 0)]));

    const markup = await render();

    // An empty handle list is what triggers the fallback, and it must survive.
    expect(getFeaturedProducts).toHaveBeenCalledWith([]);
    expect(markup).toContain("feat-1=1");
  });

  it("renders the picks that survived when only some dangled", async () => {
    readHomePage.mockResolvedValue(
      homePage([featuredBlock(["wren-washed-cap"], 3)])
    );

    await render();

    expect(getFeaturedProducts).toHaveBeenCalledWith(["wren-washed-cap"]);
  });
});

// The showcase used to fetch its product from the browser, so the server HTML
// carried five skeleton cells and nothing behind them — permanent grey boxes
// for a visitor with JavaScript off. The page resolves it here instead, on the
// same footing as the featured row.
describe("home page layers showcase", () => {
  it("resolves the product on the server, keyed by block", async () => {
    readHomePage.mockResolvedValue(homePage([showcaseBlock(CARD.handle)]));

    const markup = await render();

    expect(getProductByHandle).toHaveBeenCalledWith(CARD.handle);
    expect(markup).toContain("show-1=newest-hoodie");
  });

  it("skips the read when the referenced product is gone", async () => {
    // GROQ nulls the handle for an archived or deleted product, and the block
    // renders nothing for it; a Storefront call would be a wasted round trip.
    readHomePage.mockResolvedValue(homePage([showcaseBlock(null)]));

    const markup = await render();

    expect(getProductByHandle).not.toHaveBeenCalled();
    expect(markup).toContain("show-1=null");
  });

  it("hands the block null, and says so, when the read comes back empty", async () => {
    getProductByHandle.mockResolvedValue(null);
    readHomePage.mockResolvedValue(homePage([showcaseBlock(CARD.handle)]));

    const markup = await render();

    // `null` puts the block back on its browser fetch; the warning is the only
    // thing that says the first paint degraded.
    expect(markup).toContain("show-1=null");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Layers Showcase block show-1")
    );
  });
});
