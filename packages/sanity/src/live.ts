import type { ContentSourceMap } from "@sanity/client";
import { env } from "@workspace/env/server";
import type { StegaCleaned } from "next-sanity";
import { defineLive } from "next-sanity/live";

import { client } from "./client";

/**
 * Use defineLive to enable automatic revalidation and refreshing of your fetched content
 * Learn more: https://github.com/sanity-io/next-sanity?tab=readme-ov-file#1-configure-definelive
 */

const { sanityFetch: liveFetch, SanityLive } = defineLive({
  client,
  // Required for showing draft content when the Sanity Presentation Tool is used, or to enable the Vercel Toolbar Edit Mode
  serverToken: env.SANITY_API_READ_TOKEN,
  // Required for stand-alone live previews, the token is only shared to the browser if it's a valid Next.js Draft Mode session
  browserToken: env.SANITY_API_READ_TOKEN,
});

export { SanityLive };

/**
 * next-sanity 13 brands every string in a stega-enabled fetch as
 * `StegaString`, so that comparing one to a literal is a type error rather
 * than a silent mismatch on the invisible characters stega adds.
 *
 * We unbrand it here, at the one choke point every read goes through, which
 * keeps the generated GROQ result types — the ones every component prop is
 * typed against — as the shape callers receive. The runtime is untouched:
 * stega stays on, so Presentation Tool overlays keep working, and the places
 * that do compare a fetched string to a literal (`hero.tsx`, `json-ld.tsx`)
 * already call `stegaClean` themselves.
 *
 * The alternative is branded types everywhere and a `stegaClean` at every
 * comparison. Worth revisiting if a stega mismatch ever ships; today it would
 * be a wide diff bought with no bug it catches.
 */
type CleanFetch = <const QueryString extends string>(
  ...args: Parameters<typeof liveFetch<QueryString>>
) => Promise<{
  data: StegaCleaned<
    Awaited<ReturnType<typeof liveFetch<QueryString>>>["data"]
  >;
  sourceMap: ContentSourceMap | null;
  tags: string[];
}>;

export const sanityFetch = liveFetch as CleanFetch;
