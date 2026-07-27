/**
 * One-off seed: uploads portrait images for authors that are missing one and
 * assigns them. Idempotent — skips authors that already have an image.
 *
 * Run from apps/studio:  npx tsx scripts/seed-author-images.ts
 */

import { config } from "dotenv";

config({ path: "../web/.env.local" });
config({ path: ".env.local" });

import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "ztcucp3r";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!token) {
  throw new Error(
    "Missing SANITY_API_WRITE_TOKEN (expected in ../web/.env.local)"
  );
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2025-05-08",
  token,
  useCdn: false,
});

// Stable portrait photos keyed by author id.
const authorPortraits: Record<string, string> = {
  "author-alex-smith": "https://randomuser.me/api/portraits/men/32.jpg",
  "author-jane-doe": "https://randomuser.me/api/portraits/women/44.jpg",
};

async function uploadPortrait(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return client.assets.upload("image", buffer, { filename });
}

async function main() {
  for (const [authorId, url] of Object.entries(authorPortraits)) {
    const author = await client.getDocument(authorId);
    if (!author) {
      console.log(`- skip (not found): ${authorId}`);
      continue;
    }
    if ((author as { image?: unknown }).image) {
      console.log(`- skip (already has image): ${authorId}`);
      continue;
    }

    const asset = await uploadPortrait(url, `${authorId}.jpg`);
    await client
      .patch(authorId)
      .set({
        image: {
          _type: "image",
          asset: { _type: "reference", _ref: asset._id },
          alt: (author as { name?: string }).name ?? "Author portrait",
        },
      })
      .commit();
    console.log(`✓ image set: ${authorId}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
