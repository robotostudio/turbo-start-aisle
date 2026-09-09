import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The blog index renders the page builder three ways — inside the client
 * `BlogPageContent` on the happy path, and directly on the two read-failure
 * paths — and none of them handed it any Shopify data. A Featured Products or
 * Layers Showcase block placed under the blog therefore never painted without
 * JavaScript. All three paths have to carry the same two maps.
 */

const { getFeaturedProducts, getProductByHandle } = vi.hoisted(() => ({
  getFeaturedProducts: vi.fn(),
  getProductByHandle: vi.fn(),
}));
const { readCount, readBlogs } = vi.hoisted(() => ({
  readCount: vi.fn(),
  readBlogs: vi.fn(),
}));

const INDEX = {
  _id: "blogIndex",
  _type: "blogIndex",
  title: "Journal",
  displayFeaturedBlogs: false,
  featuredBlogsCount: "0",
  pageBuilder: [
    {
      _key: "show-1",
      _type: "layersShowcase",
      heading: "Layers",
      productHandle: "newest-hoodie",
      productTitle: "Newest Hoodie",
    },
  ],
};

// `server-only` throws on import outside a React Server Component, and vitest
// resolves its client entry. The route reaches it through the product resolver.
vi.mock("server-only", () => ({}));
// The four reads share one `sanityFetch`, so the stand-in discriminates on the
// query; the query constants are swapped for sentinels to make that exact.
vi.mock("@workspace/sanity/query", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  queryBlogIndexPageData: "q:index",
  queryBlogCategories: "q:categories",
  queryBlogIndexPageBlogsCount: "q:count",
  queryBlogIndexPageBlogs: "q:blogs",
}));
vi.mock("@workspace/sanity/live", () => ({
  sanityFetch: async ({ query }: { query: string }) => {
    switch (query) {
      case "q:index":
        return { data: INDEX };
      case "q:categories":
        return { data: [] };
      case "q:count":
        return { data: await readCount() };
      default:
        return { data: await readBlogs() };
    }
  },
}));
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
  client: { fetch: async () => null },
}));
// `@/utils` reaches `@workspace/env/client`; the pagination helpers below are
// the minimum the route needs to reach its render paths on page 1.
vi.mock("@/utils", () => ({
  getBaseUrl: () => "https://base.test",
  capitalize: (value: string) => value,
  handleErrors: async (promise: Promise<unknown>) => {
    try {
      return [await promise, undefined];
    } catch (error) {
      return [undefined, error];
    }
  },
  calculatePaginationMetadata: () => ({ currentPage: 1, totalPages: 1 }),
  getBlogPaginationStartEnd: () => ({ start: 0, end: 10 }),
}));
vi.mock("@/components/json-ld", () => ({ BreadcrumbJsonLd: () => null }));
vi.mock("@/components/blog-card", () => ({ BlogHeader: () => null }));

const stringifyMaps = ({
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
  ].join(" ");

// The happy path renders the builder through the client `BlogPageContent`;
// the failure paths render it directly. Both stand-ins print the maps they
// were handed, so the assertions read the same either way.
vi.mock("@/components/blog-page-content", () => ({
  BlogPageContent: (props: Parameters<typeof stringifyMaps>[0]) =>
    `content ${stringifyMaps(props)}`,
}));
vi.mock("@/components/pagebuilder", () => ({
  PageBuilder: (props: Parameters<typeof stringifyMaps>[0]) =>
    `builder ${stringifyMaps(props)}`,
}));
vi.mock("@/lib/shopify/featured", () => ({ getFeaturedProducts }));
vi.mock("@/lib/shopify/product", () => ({ getProductByHandle }));

const { default: BlogIndexPage } = await import("../page");

const render = async (searchParams: { page?: string } = {}) =>
  renderToStaticMarkup(
    await BlogIndexPage({ searchParams: Promise.resolve(searchParams) })
  );

beforeEach(() => {
  vi.clearAllMocks();
  getFeaturedProducts.mockResolvedValue([]);
  getProductByHandle.mockResolvedValue({ handle: "newest-hoodie" });
  readCount.mockResolvedValue(1);
  readBlogs.mockResolvedValue([
    { _id: "post-1", title: "Post", slug: "/blog/post" },
  ]);
});

describe("blog index product-backed blocks", () => {
  it("hands the resolved showcase product to the page content", async () => {
    const markup = await render();

    expect(markup).toContain("content ");
    expect(markup).toContain("show-1=newest-hoodie");
  });

  it("hands it to the builder on the failed-count path too", async () => {
    readCount.mockRejectedValue(new Error("count read failed"));

    const markup = await render();

    expect(markup).toContain("builder ");
    expect(markup).toContain("show-1=newest-hoodie");
  });
});

// The Shopify reads are a leg of their own on every /blog request. They must
// not hold the posts query behind them, and a request that is about to 404 on
// an out-of-range page should not pay for them at all.
describe("blog index Shopify reads", () => {
  it("runs alongside the posts read rather than ahead of it", async () => {
    // The product read only settles once the posts query has been asked for.
    // Awaited serially before the posts read, that never happens and the
    // render hangs; joined with it, both are in flight together.
    let postsRequested: () => void = () => undefined;
    const postsWereRequested = new Promise<void>((resolve) => {
      postsRequested = resolve;
    });
    readBlogs.mockImplementation(async () => {
      postsRequested();
      return [{ _id: "post-1", title: "Post", slug: "/blog/post" }];
    });
    getProductByHandle.mockImplementation(async () => {
      await postsWereRequested;
      return { handle: "newest-hoodie" };
    });

    const markup = await render();

    expect(markup).toContain("show-1=newest-hoodie");
  });

  it("skips them on a page that is out of range", async () => {
    // `calculatePaginationMetadata` is stubbed to one page, so page 5 404s.
    await expect(render({ page: "5" })).rejects.toThrow();

    expect(getProductByHandle).not.toHaveBeenCalled();
  });
});
