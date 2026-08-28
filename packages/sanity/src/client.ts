import type { SanityImageSource } from "@sanity/asset-utils";
import { createImageUrlBuilder } from "@sanity/image-url";
import { env } from "@workspace/env/client";
import { createClient } from "next-sanity";

// Wall-clock budget for a single read, and the retry count that multiplies it.
// `@sanity/client` defaults to a five-minute timeout and five retries, which on
// the render path means a hung Content Lake can hold a request open far past
// any point a shopper is still waiting — and the root layout now awaits its
// reads before flushing any HTML, so that stall is the whole page.
//
// The bound has to live here. `sanityFetch` from `defineLive` accepts only
// query, params, tags, perspective, stega and requestTag, and silently drops
// anything else — no signal, no timeout. `createClient` is honoured with a real
// AbortController underneath, and `defineLive`'s internal `withConfig` preserves
// it, so this is the one place that genuinely cancels.
//
// Generous rather than aggressive: `sitemap.ts` and the `generateStaticParams`
// reads inherit this too, and they are the slowest queries in the app.
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export const client = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION,
  useCdn: env.NODE_ENV === "production",
  perspective: "published",
  timeout: REQUEST_TIMEOUT_MS,
  maxRetries: MAX_RETRIES,
  stega: {
    studioUrl: env.NEXT_PUBLIC_SANITY_STUDIO_URL,
    enabled: env.NEXT_PUBLIC_VERCEL_ENV === "preview",
  },
});

const imageBuilder = createImageUrlBuilder({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
});

export const urlFor = (source: SanityImageSource) =>
  imageBuilder.image(source).auto("format").quality(80).format("webp");
