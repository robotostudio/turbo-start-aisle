import { SearchPageContent } from "@/components/search/search-page-content";
import { getSEOMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return await getSEOMetadata({
    title: "Search",
    description: "Search our products",
    slug: "/search",
    seoNoIndex: true,
  });
}

type PageProps = {
  searchParams: Promise<Record<string, string>>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";

  return (
    <main className="site-container flex w-full flex-col py-12 md:py-20">
      <h1 className="sr-only">Search</h1>
      <SearchPageContent initialQuery={query} />
    </main>
  );
}
