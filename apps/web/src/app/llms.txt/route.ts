import { Logger } from "@workspace/logger";
import { sanityFetch } from "@workspace/sanity/live";
import { querySitemapData } from "@workspace/sanity/query";

import { toMarkdownHref } from "@/lib/markdown/shared";
import { getSiteConfig } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

const logger = new Logger("LlmsTxt");

const PUBLISHED = { perspective: "published", stega: false } as const;

/** How to reach the `.md` representation; the name comes from Settings. */
const FORMAT_NOTE =
  "Append .md to any URL, or send Accept: text/markdown, to get a structured Markdown view of a page.";

/** The WebMCP tools `components/webmcp-tools.tsx` registers on every page. */
const AGENT_TOOLS =
  "In a browser with WebMCP, every page registers shopping tools: search_products, get_product, get_cart, get_saved_items, open_page, set_collection_filters, add_to_cart, update_cart_line, set_saved_item, go_to_checkout. Checkout is a hand-off: the shopper pays.";

/** The remote MCP server at `app/mcp`, for chat apps that connect to a URL. */
const mcpServer = (base: string) =>
  `MCP server (Streamable HTTP, no key): ${base}/mcp. Tools: search_products, get_product, list_collection_products, get_add_to_cart_link. It cannot change a cart: it returns a link to a page where the shopper presses Add to cart.`;

/** Absolute `.md` URL for an internal path. */
function mdUrl(base: string, path: string): string {
  return `${base}${toMarkdownHref(path)}`;
}

function section(title: string, links: string[]): string | null {
  if (links.length === 0) return null;
  return `## ${title}\n${links.map((line) => `- ${line}`).join("\n")}`;
}

export async function GET(): Promise<Response> {
  const base = getBaseUrl();

  // `querySitemapData` already excludes `seoNoIndex` docs, so a page the site
  // asks crawlers to skip is no longer handed to model crawlers instead.
  const [siteConfig, docs] = await Promise.all([
    getSiteConfig(base),
    sanityFetch({ query: querySitemapData, ...PUBLISHED })
      .then((res) => res.data)
      .catch((error) => {
        logger.error("Failed to load documents for llms.txt", error);
        return null;
      }),
  ]);

  const paths = (key: keyof NonNullable<typeof docs>, prefix = "") =>
    (docs?.[key] ?? [])
      .map((doc) => doc.path)
      .filter((path): path is string => Boolean(path))
      .map((path) => mdUrl(base, `${prefix}${path}`));

  const body = [
    `# ${siteConfig.title}`,
    `> ${siteConfig.description ? `${siteConfig.description} ` : ""}${FORMAT_NOTE}`,
    section("Agents", [mcpServer(base), AGENT_TOOLS]),
    section("Pages", [mdUrl(base, "/"), ...paths("page")]),
    section("Collections", [
      // Has a markdown handler and sitemap entry but no `querySitemapData` key.
      mdUrl(base, "/collections"),
      ...paths("collection", "/collections/"),
    ]),
    section("Products", paths("product", "/products/")),
    section("Blog", [...paths("blogIndex"), ...paths("blog")]),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  return new Response(`${body}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
