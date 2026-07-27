/**
 * Clears stale Sanity product/collection/variant docs left over from before the
 * hand-off migration. Source of truth = live Shopify GIDs: any product,
 * collection or productVariant doc whose store GID is NOT a live Shopify GID is
 * stale and gets deleted (drafts included).
 *
 * First re-points the few editorial docs that still reference stale docs
 * (collectionsIndex, homePage + draft, promoBanner) to the new equivalents, so
 * deletion isn't blocked by strong references.
 *
 * DEFAULT = dry run (no writes). Pass --execute to actually re-point + delete.
 *
 * Run from apps/studio:
 *   node --import tsx <path>/cleanup-stale-sanity.ts            # preview
 *   node --import tsx <path>/cleanup-stale-sanity.ts --execute  # apply
 */

import { config } from "dotenv";

config({ path: "../web/.env.local" }); // SANITY_API_WRITE_TOKEN
config({ path: ".env.local" }); // SANITY_STUDIO_* + SHOPIFY_*

import { createClient } from "@sanity/client";

const EXECUTE = process.argv.includes("--execute");

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || "ztcucp3r";
const DATASET = process.env.SANITY_STUDIO_DATASET || "production";
const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOP_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const WRITE_TOKEN = process.env.SANITY_API_WRITE_TOKEN;

/** Fallback product handle for editorial product refs with no 1:1 equivalent. */
const FALLBACK_PRODUCT_HANDLE = "aster-denim-coach-jacket";

async function shopify(query: string) {
  const res = await fetch(
    `https://${SHOP_DOMAIN}/admin/api/2026-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOP_TOKEN!,
      },
      body: JSON.stringify({ query }),
    }
  );
  return (await res.json()).data;
}

const client = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: "2024-01-01",
  token: WRITE_TOKEN,
  useCdn: false,
  perspective: "raw", // include drafts + published
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  if (!WRITE_TOKEN) throw new Error("SANITY_API_WRITE_TOKEN not found");
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}  (${PROJECT_ID}/${DATASET})`);

  // 1. Live Shopify GIDs = keep-set.
  const sp = await shopify(
    `{ products(first:100){nodes{id}} collections(first:50){nodes{id}} }`
  );
  const lp: string[] = sp.products.nodes.map((n: { id: string }) => n.id);
  const lc: string[] = sp.collections.nodes.map((n: { id: string }) => n.id);
  console.log(`Live Shopify: ${lp.length} products, ${lc.length} collections`);

  // 2. New collection ids by handle + fallback product id (re-point targets).
  const newCols: Array<{ h: string; _id: string }> = await client.fetch(
    `*[_type=="collection" && store.gid in $lc]{ "h":store.slug.current, _id }`,
    { lc }
  );
  const newColByHandle = Object.fromEntries(newCols.map((c) => [c.h, c._id]));
  const fallbackProductId: string = await client.fetch(
    `*[_type=="product" && store.slug.current==$h][0]._id`,
    { h: FALLBACK_PRODUCT_HANDLE }
  );

  // 3. Stale doc ids (drafts + published).
  const staleIds: string[] = await client.fetch(
    `*[
      (_type=="product" && !(store.gid in $lp)) ||
      (_type=="collection" && !(store.gid in $lc)) ||
      (_type=="productVariant" && !(store.productGid in $lp))
    ]._id`,
    { lp, lc }
  );
  const staleSet = new Set(staleIds);
  console.log(`Stale docs to delete (incl. drafts): ${staleIds.length}`);

  // 4. Re-point editorial docs that reference stale docs.
  const blockers: Array<{ _id: string }> = await client.fetch(
    `*[!(_id in $ids) && references($ids)]{ _id }`,
    { ids: staleIds }
  );
  console.log(`\nBlocking docs to re-point: ${blockers.length}`);

  for (const { _id } of blockers) {
    const doc = await client.getDocument(_id);
    if (!doc) continue;
    const changes: string[] = [];

    const resolveNew = async (oldRef: string): Promise<string> => {
      const target = await client.fetch(
        `*[_id==$id][0]{ _type, "slug":store.slug.current }`,
        { id: oldRef }
      );
      if (target?._type === "collection") {
        return newColByHandle[target.slug] ?? newColByHandle["all-products"];
      }
      return fallbackProductId;
    };

    const walkPromises: Promise<void>[] = [];
    const walk = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) return v.forEach(walk);
      const obj = v as Record<string, unknown>;
      if (typeof obj._ref === "string" && staleSet.has(obj._ref)) {
        const old = obj._ref;
        walkPromises.push(
          resolveNew(old).then((n) => {
            obj._ref = n;
            changes.push(`${old} → ${n}`);
          })
        );
      }
      for (const k of Object.keys(obj)) if (k !== "_ref") walk(obj[k]);
    };
    walk(doc);
    await Promise.all(walkPromises);

    console.log(`  ${_id}: ${changes.length} ref(s) re-pointed`);
    for (const c of changes) console.log(`      ${c}`);
    if (EXECUTE) await client.createOrReplace(doc as never);
  }

  // 5. Delete stale docs in batches (variants → products → collections order
  //    is irrelevant now that blockers are gone; refs among stale are weak).
  if (!EXECUTE) {
    console.log("\nDRY RUN — no docs deleted. Re-run with --execute to apply.");
    return;
  }

  console.log(`\nDeleting ${staleIds.length} stale docs…`);
  let deleted = 0;
  for (const batch of chunk(staleIds, 100)) {
    const tx = client.transaction();
    for (const id of batch) tx.delete(id);
    await tx.commit({ visibility: "async" });
    deleted += batch.length;
    console.log(`  deleted ${deleted}/${staleIds.length}`);
  }

  // 6. Verify.
  const after = await client.fetch(`{
    "products": count(*[_type=="product"]),
    "collections": count(*[_type=="collection"]),
    "variants": count(*[_type=="productVariant"])
  }`);
  console.log("\nFinal counts:", JSON.stringify(after));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
