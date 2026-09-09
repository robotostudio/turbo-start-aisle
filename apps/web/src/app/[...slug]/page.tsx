import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";
import { sanityFetch } from "@workspace/sanity/live";
import { querySlugPageData, querySlugPagePaths } from "@workspace/sanity/query";
import { notFound } from "next/navigation";

import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PageBuilder } from "@/components/pagebuilder";
import { resolvePageBuilderProducts } from "@/lib/page-builder-products";
import { seoFromDocument } from "@/lib/seo";
import { capitalize, getBaseUrl } from "@/utils";

const logger = new Logger("PageSlug");

async function fetchSlugPageData(slug: string, stega = true) {
  return await sanityFetch({
    query: querySlugPageData,
    params: { slug: `/${slug}` },
    stega,
  });
}

async function fetchSlugPagePaths() {
  try {
    const slugs = await client.fetch(querySlugPagePaths);

    // If no slugs found, return empty array to prevent build errors
    if (!Array.isArray(slugs) || slugs.length === 0) {
      return [];
    }

    const paths: { slug: string[] }[] = [];
    for (const slug of slugs) {
      if (!slug) {
        continue;
      }
      const parts = slug.split("/").filter(Boolean);
      paths.push({ slug: parts });
    }
    return paths;
  } catch (error) {
    logger.error("Error fetching slug paths", error);
    // Return empty array to allow build to continue
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const slugString = slug.join("/");
  const { data: pageData } = await fetchSlugPageData(slugString, false);
  return await seoFromDocument(pageData, {
    slug: pageData?.slug ?? `/${slugString}`,
  });
}

export async function generateStaticParams() {
  const paths = await fetchSlugPagePaths();
  return paths;
}

// Allow dynamic params for paths not generated at build time
export const dynamicParams = true;

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const slugString = slug.join("/");
  const { data: pageData } = await fetchSlugPageData(slugString);

  if (!pageData) {
    return notFound();
  }

  const { title, pageBuilder, _id, _type } = pageData ?? {};

  const baseUrl = getBaseUrl();
  // Home → one crumb per URL segment; the last (current) page uses the page
  // title and omits its url per schema.org guidance.
  const breadcrumbItems = [
    { name: "Home", url: baseUrl },
    ...slug.map((segment, index) => {
      const isLast = index === slug.length - 1;
      const name = isLast
        ? (title ?? capitalize(segment.replace(/-/g, " ")))
        : capitalize(segment.replace(/-/g, " "));
      return isLast
        ? { name }
        : { name, url: `${baseUrl}/${slug.slice(0, index + 1).join("/")}` };
    }),
  ];

  const breadcrumb = <BreadcrumbJsonLd items={breadcrumbItems} />;

  // Product-backed blocks get their Shopify data from the route, as on the home
  // page. A slug page used to hand the builder none, so a Featured Products
  // block here rendered nothing and a Layers Showcase fetched from the browser
  // — skeletons for anyone without JavaScript. See `resolvePageBuilderProducts`.
  const { featuredProductsByKey, layersShowcaseProductByKey } =
    await resolvePageBuilderProducts(
      Array.isArray(pageBuilder) ? pageBuilder : []
    );

  return !Array.isArray(pageBuilder) || pageBuilder?.length === 0 ? (
    <main className="flex min-h-[50vh] flex-col items-center justify-center p-4 text-center">
      {breadcrumb}
      <h1 className="mb-4 font-semibold text-2xl capitalize">{title}</h1>
      <p className="mb-6 text-muted-foreground">
        This page has no content blocks yet.
      </p>
    </main>
  ) : (
    <>
      {breadcrumb}
      <PageBuilder
        featuredProductsByKey={featuredProductsByKey}
        id={_id}
        layersShowcaseProductByKey={layersShowcaseProductByKey}
        pageBuilder={pageBuilder}
        title={title}
        type={_type}
      />
    </>
  );
}
