import { env } from "@workspace/env/client";
import type { PortableTextBlock } from "next-sanity";
import slugify from "slugify";

/**
 * Canonical origin, no trailing slash. `NEXT_PUBLIC_SITE_URL` first: the
 * `VERCEL_*` vars are Vercel-only, so elsewhere they fall through to their
 * `localhost:3000` defaults and every canonical and sitemap entry ships as
 * localhost. It also wins on Vercel, where `*.vercel.app` is rarely canonical.
 */
export const getBaseUrl = () => {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL;
  }

  if (env.NEXT_PUBLIC_VERCEL_ENV === "production") {
    return env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  }

  // Preview deploys stay on their own generated url so each one self-references.
  if (env.NEXT_PUBLIC_VERCEL_ENV === "preview") {
    return env.NEXT_PUBLIC_VERCEL_URL;
  }

  return "http://localhost:3000";
};

// A leading `//` — or `/\`, which browsers normalise to it — looks like a path
// but navigates off-site, so it must not read as relative.
const PROTOCOL_RELATIVE = /^\/[/\\]/;

// The WHATWG parser strips tabs and newlines before parsing, so
// `/\t/evil.example` passes the check above then resolves as `//evil.example`.
// Rejected outright rather than stripped — guessing intent is how an open
// redirect ships.
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
const CONTROL_CHARS = /[\u0000-\u0020\u007f]/;

export const isRelativeUrl = (url: string) =>
  !(PROTOCOL_RELATIVE.test(url) || CONTROL_CHARS.test(url)) &&
  (url.startsWith("/") || url.startsWith("#") || url.startsWith("?"));

export const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch (_e) {
    return isRelativeUrl(url);
  }
};

export const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

/**
 * Display title from a Shopify handle, for `generateMetadata` on a doc-less
 * collection or product where the real title costs a second storefront call.
 */
export const titleFromHandle = (handle: string) =>
  handle.split("-").filter(Boolean).map(capitalize).join(" ");

export const getTitleCase = (name: string) => {
  const titleTemp = name.replace(/([A-Z])/g, " $1");
  return titleTemp.charAt(0).toUpperCase() + titleTemp.slice(1);
};

type Response<T> = [T, undefined] | [undefined, string];

export async function handleErrors<T>(
  promise: Promise<T>
): Promise<Response<T>> {
  try {
    const data = await promise;
    return [data, undefined];
  } catch (err) {
    return [
      undefined,
      err instanceof Error ? err.message : JSON.stringify(err),
    ];
  }
}

export function convertToSlug(
  text?: string,
  { fallback }: { fallback?: string } = { fallback: "top-level" }
) {
  if (!text) {
    return fallback;
  }
  return slugify(text.trim(), {
    lower: true,
    remove: /[^a-zA-Z0-9 ]/g,
  });
}

export function parseChildrenToSlug(children: PortableTextBlock["children"]) {
  if (!children) {
    return "";
  }
  return convertToSlug(children.map((child) => child.text).join(""));
}

const BLOG_ITEMS_PER_PAGE = 10;

export function getBlogPaginationStartEnd(page: number): {
  start: number;
  end: number;
} {
  const start = (page - 1) * BLOG_ITEMS_PER_PAGE;
  const end = start + BLOG_ITEMS_PER_PAGE;
  return { start, end };
}

export type PaginationMetadata = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export function calculatePaginationMetadata(
  totalItems: number,
  currentPage = 1,
  itemsPerPage = BLOG_ITEMS_PER_PAGE
): PaginationMetadata {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    hasNextPage,
    hasPreviousPage,
  };
}
