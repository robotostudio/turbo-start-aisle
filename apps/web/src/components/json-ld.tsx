import { urlFor } from "@workspace/sanity/client";
import type {
  QueryBlogSlugPageDataResult,
  QuerySettingsDataResult,
} from "@workspace/sanity/types";
import { stegaClean } from "next-sanity";
import type {
  Answer,
  BlogPosting,
  BreadcrumbList,
  CollectionPage,
  ContactPoint,
  FAQPage,
  ImageObject,
  ItemList,
  ListItem,
  Organization,
  Person,
  Question,
  WebPage,
  WebSite,
  WithContext,
} from "schema-dts";

import { getSettings } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

type RichTextChild = {
  _type: string;
  text?: string;
  marks?: string[];
  _key: string;
};

type RichTextBlock = {
  _type: string;
  children?: RichTextChild[];
  style?: string;
  _key: string;
};

// Flexible FAQ type that can accept different rich text structures
type FlexibleFaq = {
  _id: string;
  title: string;
  richText?: RichTextBlock[] | null;
};

// Utility function to safely extract plain text from rich text blocks
function extractPlainTextFromRichText(
  richText: RichTextBlock[] | null | undefined
): string {
  if (!Array.isArray(richText)) {
    return "";
  }

  return richText
    .filter((block) => block._type === "block" && Array.isArray(block.children))
    .map(
      (block) =>
        block.children
          ?.filter((child) => child._type === "span" && Boolean(child.text))
          .map((child) => child.text)
          .join("") ?? ""
    )
    .join(" ")
    .trim();
}

// Utility function to safely render JSON-LD.
// Uses dangerouslySetInnerHTML (not JSX text children) so the JSON is emitted
// verbatim — rendering as text children makes React entity-escape `&`/`<`/`>`,
// and those entities are NOT decoded inside <script>, producing invalid JSON-LD
// that Google silently drops. The `.replace(/</g, "\\u003c")` guards against a
// value containing `</script>` breaking out of the tag (XSS).
export function JsonLdScript<T>({ data, id }: { data: T; id: string }) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
      id={id}
      type="application/ld+json"
    />
  );
}

// FAQ JSON-LD Component
type FaqJsonLdProps = {
  faqs: FlexibleFaq[];
  /**
   * Required per block: `pageBuilder` allows two FAQ blocks on a page, and a
   * fixed id gave them a duplicate DOM id and two competing `FAQPage` entities.
   */
  id: string;
};

export function FaqJsonLd({ faqs, id }: FaqJsonLdProps) {
  if (!faqs?.length) {
    return null;
  }

  // Resolve before validating: a non-empty `richText` still yields "" when it
  // holds only images, and a text-less `Answer` invalidates the whole FAQPage.
  const entries = stegaClean(faqs.filter((faq) => faq?.title && faq?.richText))
    .map((faq: FlexibleFaq) => ({
      name: faq.title,
      text: extractPlainTextFromRichText(faq.richText),
    }))
    .filter((entry) => entry.text);

  if (!entries.length) {
    return null;
  }

  const faqJsonLd: WithContext<FAQPage> = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map(
      (entry): Question => ({
        "@type": "Question",
        name: entry.name,
        acceptedAnswer: {
          "@type": "Answer",
          text: entry.text,
        } as Answer,
      })
    ),
  };

  return <JsonLdScript data={faqJsonLd} id={id} />;
}

const IMAGE_SIZE_WIDTH = 1920;
const IMAGE_SIZE_HEIGHT = 1080;
const IMAGE_QUALITY = 80;

function buildSafeImageUrl(image?: { id?: string | null }) {
  if (!image?.id) {
    return;
  }
  return urlFor({ ...image, _id: image.id })
    .size(IMAGE_SIZE_WIDTH, IMAGE_SIZE_HEIGHT)
    .dpr(2)
    .auto("format")
    .quality(IMAGE_QUALITY)
    .url();
}

// Article JSON-LD Component
type ArticleJsonLdProps = {
  article: QueryBlogSlugPageDataResult;
};

/**
 * Read here, not passed in: as an optional prop no caller ever set it, so every
 * article published `publisher.name: "Website"`. `getSettings` is also
 * request-cached and `stega: false`, which the prop path never was.
 */
export async function ArticleJsonLd({
  article: rawArticle,
}: ArticleJsonLdProps) {
  if (!rawArticle) {
    return null;
  }
  const article = stegaClean(rawArticle);
  const settings = await getSettings();

  const baseUrl = getBaseUrl();
  const articleUrl = `${baseUrl}${article.slug}`;
  const imageUrl = buildSafeImageUrl(article.image);

  const articleJsonLd: WithContext<BlogPosting> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description || undefined,
    image: imageUrl ? [imageUrl] : undefined,
    author: article.authors
      ? [
          {
            "@type": "Person",
            name: article.authors.name,
            // No `url`: there is no author route, and pointing every author at
            // the homepage is worse than omitting it.
            image: article.authors.image
              ? ({
                  "@type": "ImageObject",
                  url: buildSafeImageUrl(article.authors.image),
                } as ImageObject)
              : undefined,
          } as Person,
        ]
      : [],
    publisher: {
      "@type": "Organization",
      name: settings?.siteTitle ?? undefined,
      logo: settings?.logo
        ? ({
            "@type": "ImageObject",
            url: settings.logo,
          } as ImageObject)
        : undefined,
    } as Organization,
    datePublished: new Date(
      article.publishedAt || article._createdAt || new Date().toISOString()
    ).toISOString(),
    dateModified: new Date(
      article._updatedAt || new Date().toISOString()
    ).toISOString(),
    url: articleUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    } as WebPage,
  };

  return (
    <JsonLdScript data={articleJsonLd} id={`article-json-ld-${article.slug}`} />
  );
}

// Organization JSON-LD Component
type OrganizationJsonLdProps = {
  settings: QuerySettingsDataResult;
};

export function OrganizationJsonLd({ settings }: OrganizationJsonLdProps) {
  if (!settings) {
    return null;
  }

  const baseUrl = getBaseUrl();

  const socialLinks = settings.socialLinks
    ? (Object.values(settings.socialLinks).filter(Boolean) as string[])
    : undefined;

  const organizationJsonLd: WithContext<Organization> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.siteTitle,
    description: settings.siteDescription || undefined,
    url: baseUrl,
    logo: settings.logo
      ? ({
          "@type": "ImageObject",
          url: settings.logo,
        } as ImageObject)
      : undefined,
    contactPoint: settings.contactEmail
      ? ({
          "@type": "ContactPoint",
          email: settings.contactEmail,
          contactType: "customer service",
        } as ContactPoint)
      : undefined,
    sameAs: socialLinks?.length ? socialLinks : undefined,
  };

  return <JsonLdScript data={organizationJsonLd} id="organization-json-ld" />;
}

// Website JSON-LD Component
type WebSiteJsonLdProps = {
  settings: QuerySettingsDataResult;
};

export function WebSiteJsonLd({ settings }: WebSiteJsonLdProps) {
  if (!settings) {
    return null;
  }

  const baseUrl = getBaseUrl();

  const websiteJsonLd: WithContext<WebSite> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.siteTitle,
    description: settings.siteDescription || undefined,
    url: baseUrl,
    publisher: {
      "@type": "Organization",
      name: settings.siteTitle,
    } as Organization,
    // Enables the sitelinks search box in Google results. The site search
    // endpoint is /search?q= (see app/search/page.tsx).
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
      // schema.org SearchAction requires `query-input` referencing the
      // {search_term_string} placeholder; typed loosely as schema-dts models
      // this action variant without the query-input property.
    } as WebSite["potentialAction"],
  };

  return <JsonLdScript data={websiteJsonLd} id="website-json-ld" />;
}

// Breadcrumb JSON-LD Component — renders a BreadcrumbList so Google shows the
// page hierarchy in search results. Callers pass human-readable names; the last
// (current) item omits its `url` per schema.org guidance.
type BreadcrumbItem = { name: string; url?: string };

export function BreadcrumbJsonLd({
  items,
  id = "breadcrumb-json-ld",
}: {
  items: BreadcrumbItem[];
  id?: string;
}) {
  if (!items.length) {
    return null;
  }

  const breadcrumbJsonLd: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(
      (crumb, index): ListItem => ({
        "@type": "ListItem",
        position: index + 1,
        // stegaClean strips Sanity visual-editing markers (zero-width chars)
        // from CMS-sourced names; no-op on plain strings (e.g. Shopify titles).
        name: stegaClean(crumb.name),
        ...(crumb.url ? { item: crumb.url } : {}),
      })
    ),
  };

  return <JsonLdScript data={breadcrumbJsonLd} id={id} />;
}

// Collection JSON-LD Component — a CollectionPage wrapping an ItemList of the
// products (or nested collections) shown on the page.
type CollectionJsonLdProps = {
  name: string;
  description?: string | null;
  url?: string;
  items: BreadcrumbItem[];
  id?: string;
};

export function CollectionJsonLd({
  name,
  description,
  url,
  items,
  id = "collection-json-ld",
}: CollectionJsonLdProps) {
  // stegaClean strips Sanity visual-editing markers from CMS-sourced strings;
  // no-op on plain strings (e.g. Shopify product titles).
  // Dropped before numbering, since `position` has to stay contiguous.
  const listed = items.filter((entry) => Boolean(entry.name));

  const collectionJsonLd: WithContext<CollectionPage> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: stegaClean(name),
    description: description ? stegaClean(description) : undefined,
    url: url || undefined,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listed.length,
      itemListElement: listed.map(
        (entry, index): ListItem => ({
          "@type": "ListItem",
          position: index + 1,
          name: stegaClean(entry.name),
          ...(entry.url ? { url: entry.url } : {}),
        })
      ),
    } as ItemList,
  };

  return <JsonLdScript data={collectionJsonLd} id={id} />;
}

// Combined JSON-LD Component for pages with multiple structured data
type CombinedJsonLdProps = {
  settings?: QuerySettingsDataResult;
  article?: QueryBlogSlugPageDataResult;
  faqs?: FlexibleFaq[];
  includeWebsite?: boolean;
  includeOrganization?: boolean;
};

export async function CombinedJsonLd({
  includeWebsite = false,
  includeOrganization = false,
}: CombinedJsonLdProps) {
  const cleanSettings = await getSettings();
  return (
    <>
      {includeWebsite && cleanSettings && (
        <WebSiteJsonLd settings={cleanSettings} />
      )}
      {includeOrganization && cleanSettings && (
        <OrganizationJsonLd settings={cleanSettings} />
      )}
    </>
  );
}
