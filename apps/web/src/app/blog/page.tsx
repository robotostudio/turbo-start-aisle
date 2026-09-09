import { sanityFetch } from "@workspace/sanity/live";
import {
  queryBlogCategories,
  queryBlogIndexPageBlogs,
  queryBlogIndexPageBlogsCount,
  queryBlogIndexPageData,
} from "@workspace/sanity/query";
import { notFound } from "next/navigation";

import { BlogHeader } from "@/components/blog-card";
import { BlogPageContent } from "@/components/blog-page-content";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PageBuilder } from "@/components/pagebuilder";
import { resolvePageBuilderProducts } from "@/lib/page-builder-products";
import { seoFromDocument } from "@/lib/seo";
import {
  calculatePaginationMetadata,
  getBaseUrl,
  getBlogPaginationStartEnd,
  handleErrors,
} from "@/utils";

async function fetchBlogIndexPageData() {
  const res = await sanityFetch({ query: queryBlogIndexPageData });
  return res.data;
}

async function fetchBlogIndexPageBlogs(
  start: number,
  end: number,
  category: string
) {
  const res = await sanityFetch({
    query: queryBlogIndexPageBlogs,
    params: { start, end, category },
  });
  return res.data;
}

async function fetchBlogIndexPageBlogsCount(category: string) {
  const res = await sanityFetch({
    query: queryBlogIndexPageBlogsCount,
    params: { category },
  });
  return res.data;
}

async function fetchBlogCategories() {
  const res = await sanityFetch({ query: queryBlogCategories });
  return res.data;
}

type BlogPageProps = {
  searchParams: Promise<{
    page?: string;
    category?: string;
  }>;
};

/**
 * `/blog?page=3` is a distinct set of posts, so it self-canonicalises —
 * canonicalising every page to bare `/blog` drops deep posts from the index.
 * Filtered views are noindex instead: a category is a re-cut of posts already
 * indexed under `/blog`.
 */
function blogIndexSlug(page: number, category: string): string {
  const params = new URLSearchParams();
  if (category) {
    params.set("category", category);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/blog?${query}` : "/blog";
}

/**
 * `?page=999` rendered a 200 with an empty list — a soft 404 that lets crawlers
 * index unbounded empty pages. Page 1 stays valid so an empty blog still renders.
 * `Number.isInteger` because `Number("1.5")` passes a `>` bound and then slices
 * a half-overlapping window.
 */
function isPageOutOfRange(page: number, totalPages: number): boolean {
  return !Number.isInteger(page) || page < 1 || page > Math.max(totalPages, 1);
}

/**
 * Each paginated view is separately indexable, so each needs its own title —
 * otherwise they are N documents claiming to be the same one. Written to
 * `seoTitle` because `seoFromDocument` reads the override first.
 */
function withPageSuffix(
  doc: NonNullable<Awaited<ReturnType<typeof fetchBlogIndexPageData>>>,
  page: number
) {
  if (page <= 1) {
    return doc;
  }
  const title = doc.seoTitle || doc.title;
  const description = doc.seoDescription || doc.description;
  return {
    ...doc,
    seoTitle: title ? `${title} — Page ${page}` : `Page ${page}`,
    seoDescription: description ? `${description} — page ${page}` : undefined,
  };
}

export async function generateMetadata({ searchParams }: BlogPageProps) {
  const { page, category } = await searchParams;
  const currentPage = Number(page) || 1;
  const activeCategory = category ?? "";

  const { data: result } = await sanityFetch({
    query: queryBlogIndexPageData,
    stega: false,
  });

  return await seoFromDocument(
    result ? withPageSuffix(result, currentPage) : result,
    {
      slug: blogIndexSlug(currentPage, activeCategory),
      seoNoIndex: Boolean(activeCategory),
    }
  );
}

export default async function BlogIndexPage({ searchParams }: BlogPageProps) {
  const { page, category } = await searchParams;
  // NaN slips past every range check below; `|| 1` folds junk back to page 1.
  const currentPage = Number(page) || 1;
  const activeCategory = category ?? "";

  // Fetch page data, categories, and total count in parallel
  const [
    [indexPageData, errIndexPageData],
    [categories, errCategories],
    [totalCount, errTotalCount],
  ] = await Promise.all([
    handleErrors(fetchBlogIndexPageData()),
    handleErrors(fetchBlogCategories()),
    handleErrors(fetchBlogIndexPageBlogsCount(activeCategory)),
  ]);

  if (errIndexPageData || !indexPageData) {
    notFound();
  }

  // Product-backed blocks get their Shopify data from the route, on every path
  // that renders the builder below — the two read-failure states included.
  // The reads are a Storefront leg of their own, so they start where each path
  // can overlap them with its next read rather than up front: the count-failure
  // branch needs them at once, the main path joins them with the posts read
  // after the range check, and a request about to 404 on `?page=` never makes
  // them. See `resolvePageBuilderProducts`.
  const readProducts = () =>
    resolvePageBuilderProducts(indexPageData.pageBuilder ?? []);

  if (errTotalCount || totalCount === null || totalCount === undefined) {
    const { featuredProductsByKey, layersShowcaseProductByKey } =
      await readProducts();
    return (
      <main className="site-container my-16">
        <BlogHeader title={indexPageData.title} />
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            Unable to load blog posts at the moment.
          </p>
        </div>
        {indexPageData.pageBuilder && indexPageData.pageBuilder.length > 0 && (
          <PageBuilder
            as="div"
            featuredProductsByKey={featuredProductsByKey}
            id={indexPageData._id}
            layersShowcaseProductByKey={layersShowcaseProductByKey}
            pageBuilder={indexPageData.pageBuilder}
            type={indexPageData._type}
          />
        )}
      </main>
    );
  }

  // Featured posts only apply on the unfiltered, first-page view.
  const featuredBlogsCount =
    indexPageData.displayFeaturedBlogs && !activeCategory
      ? Number(indexPageData.featuredBlogsCount) || 0
      : 0;

  // Page 1 holds `10 + featuredBlogsCount`, later pages 10 — so the featured
  // count comes off the total first, or the last page is one too many and
  // `BlogPagination` links to an empty, indexable page.
  const paginationMetadata = calculatePaginationMetadata(
    Math.max(totalCount - featuredBlogsCount, 0),
    currentPage
  );

  if (isPageOutOfRange(currentPage, paginationMetadata.totalPages)) {
    notFound();
  }

  const { start, end } = getBlogPaginationStartEnd(currentPage);
  const blogStart = currentPage === 1 ? 0 : start + featuredBlogsCount;
  const blogEnd =
    currentPage === 1 ? end + featuredBlogsCount : end + featuredBlogsCount;

  const [
    { featuredProductsByKey, layersShowcaseProductByKey },
    [blogs, errBlogs],
  ] = await Promise.all([
    readProducts(),
    handleErrors(fetchBlogIndexPageBlogs(blogStart, blogEnd, activeCategory)),
  ]);

  if (errBlogs || !blogs) {
    return (
      <main className="site-container my-16">
        <BlogHeader title={indexPageData.title} />
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            No blog posts available at the moment.
          </p>
        </div>
        {indexPageData.pageBuilder && indexPageData.pageBuilder.length > 0 && (
          <PageBuilder
            as="div"
            featuredProductsByKey={featuredProductsByKey}
            id={indexPageData._id}
            layersShowcaseProductByKey={layersShowcaseProductByKey}
            pageBuilder={indexPageData.pageBuilder}
            type={indexPageData._type}
          />
        )}
      </main>
    );
  }

  const baseUrl = getBaseUrl();

  return (
    <>
      <BreadcrumbJsonLd
        items={[{ name: "Home", url: baseUrl }, { name: "Blog" }]}
      />
      <BlogPageContent
        activeCategory={activeCategory}
        blogs={blogs}
        categories={errCategories ? [] : (categories ?? [])}
        featuredProductsByKey={featuredProductsByKey}
        indexPageData={indexPageData}
        layersShowcaseProductByKey={layersShowcaseProductByKey}
        paginationMetadata={paginationMetadata}
      />
    </>
  );
}
