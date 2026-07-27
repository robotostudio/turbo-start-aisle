/**
 * Local image upload + attachment for the hand-off migration.
 *
 * Shopify cannot fetch a local file path, so each PNG is pushed through a
 * staged upload (`stagedUploadsCreate` → HTTP POST the bytes → `resourceUrl`),
 * then attached with `productCreateMedia`. Each variant is then linked to its
 * colour's first image via `productVariantsBulkUpdate` so the storefront colour
 * swatch scrolls the gallery to the matching photo.
 *
 * Masters are capped at 14 MB before upload: anything larger is losslessly
 * downscaled (Lanczos, still PNG) via `ensureUnderLimit` so uploads stay fast
 * and the storefront isn't served needlessly heavy originals.
 */

import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { adminQuery, hasUserErrors, log } from "../seed-shopify/client.js";
import type { UserError } from "../seed-shopify/types.js";
import type { HandoffImage, HandoffProduct } from "./load.js";

/** The hand-off ships PNG only; every staged upload is PNG. */
const IMAGE_MIME = "image/png";
/** Upload cap — files above this are downscaled before staging. */
const MAX_UPLOAD_BYTES = 14 * 1024 * 1024;
/** Downscale aims a touch under the cap for headroom. */
const TARGET_BYTES = Math.round(13.5 * 1024 * 1024);
/** Longest-edge scale factors tried in order until the PNG fits TARGET_BYTES. */
const DOWNSCALE_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5];

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

// Resolve sharp lazily from the workspace pnpm store (not a direct studio dep);
// only the handful of oversized files ever need it.
// biome-ignore lint/suspicious/noExplicitAny: dynamically-resolved module
let sharpModule: any = null;
// biome-ignore lint/suspicious/noExplicitAny: dynamically-resolved module
function getSharp(): any {
  if (sharpModule) return sharpModule;
  const require = createRequire(import.meta.url);
  const pnpmDir = resolve(process.cwd(), "../../node_modules/.pnpm");
  const entry = readdirSync(pnpmDir).find((d) => d.startsWith("sharp@"));
  if (!entry) throw new Error("sharp not found in node_modules/.pnpm");
  sharpModule = require(join(pnpmDir, entry, "node_modules/sharp"));
  return sharpModule;
}

/**
 * Returns a path to upload for `file`, capped at MAX_UPLOAD_BYTES. Files already
 * under the cap are returned untouched (`temp: false`). Larger files are
 * downscaled by longest edge (Lanczos, still PNG, alpha preserved), stepping
 * down until they fit TARGET_BYTES, and written to a temp path (`temp: true`)
 * the caller must clean up. Never mutates the source hand-off file.
 */
async function ensureUnderLimit(
  file: string
): Promise<{ path: string; temp: boolean }> {
  if (statSync(file).size <= MAX_UPLOAD_BYTES) return { path: file, temp: false };

  const sharp = getSharp();
  const meta = await sharp(file).metadata();
  let last: Buffer | null = null;
  let usedScale = 1;
  for (const scale of DOWNSCALE_STEPS) {
    const buf: Buffer = await sharp(file)
      .resize(
        Math.round(meta.width * scale),
        Math.round(meta.height * scale),
        { kernel: "lanczos3" }
      )
      .png({ compressionLevel: 9 })
      .toBuffer();
    last = buf;
    usedScale = scale;
    if (buf.length <= TARGET_BYTES) break;
  }

  const dir = mkdtempSync(join(tmpdir(), "reimage-"));
  const dest = join(dir, basename(file));
  writeFileSync(dest, last as Buffer);
  const fromMb = (statSync(file).size / 1024 / 1024).toFixed(1);
  const toMb = ((last as Buffer).length / 1024 / 1024).toFixed(1);
  log.info(
    `  downscaled ${basename(file)}: ${fromMb}MB → ${toMb}MB (${usedScale}x edge)`
  );
  return { path: dest, temp: true };
}

/** Creates staged upload targets for the given files (batched). */
async function createStagedTargets(
  files: string[]
): Promise<StagedTarget[]> {
  const input = files.map((file) => ({
    filename: basename(file),
    mimeType: IMAGE_MIME,
    httpMethod: "POST",
    resource: "IMAGE",
    fileSize: String(statSync(file).size),
  }));

  const result = await adminQuery<{
    stagedUploadsCreate: {
      stagedTargets: StagedTarget[];
      userErrors: UserError[];
    };
  }>(
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    { input }
  );

  if (result.errors) {
    throw new Error(`stagedUploadsCreate: ${JSON.stringify(result.errors)}`);
  }
  const data = result.data?.stagedUploadsCreate;
  if (hasUserErrors(data?.userErrors, "stagedUploadsCreate")) {
    throw new Error("stagedUploadsCreate returned user errors");
  }
  const targets = data?.stagedTargets ?? [];
  if (targets.length !== files.length) {
    throw new Error(
      `stagedUploadsCreate returned ${targets.length} targets for ${files.length} files`
    );
  }
  return targets;
}

/** POSTs a file's bytes to its staged target. Returns the resourceUrl. */
async function uploadToTarget(
  file: string,
  target: StagedTarget
): Promise<string> {
  const form = new FormData();
  for (const { name, value } of target.parameters) {
    form.append(name, value);
  }
  const bytes = readFileSync(file);
  form.append("file", new Blob([bytes], { type: IMAGE_MIME }), basename(file));

  const res = await fetch(target.url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}) for ${basename(file)}: ${text}`);
  }
  return target.resourceUrl;
}

/**
 * Stages + uploads a list of local files, returning their resource URLs (in
 * order). Oversized files are transparently downscaled first (see
 * `ensureUnderLimit`); any temp files produced are removed afterwards.
 */
export async function uploadFiles(files: string[]): Promise<string[]> {
  const resolved = await Promise.all(files.map(ensureUnderLimit));
  try {
    const uploadPaths = resolved.map((r) => r.path);
    const targets = await createStagedTargets(uploadPaths);
    const urls: string[] = [];
    for (let i = 0; i < uploadPaths.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: targets aligns with paths by index
      urls.push(await uploadToTarget(uploadPaths[i]!, targets[i]!));
    }
    return urls;
  } finally {
    for (const r of resolved) {
      if (r.temp) rmSync(dirname(r.path), { recursive: true, force: true });
    }
  }
}

interface AttachedMedia {
  id: string;
  color: string;
  position: number;
}

/**
 * Uploads a product's images and attaches them as media, then links each
 * variant to its colour's first image. Returns nothing; logs progress.
 */
export async function uploadAndAttachImages(
  productId: string,
  prod: HandoffProduct,
  variantIdsBySku: Record<string, string>,
  verbose: boolean
): Promise<void> {
  const images: HandoffImage[] = prod.images;
  if (images.length === 0) {
    log.warn(`${prod.handle}: no images found`);
    return;
  }

  // 1. Stage + upload every file, preserving order (oversized files auto-shrunk).
  const sources = await uploadFiles(images.map((i) => i.file));

  // 2. Attach all as product media (media[] comes back in input order).
  const mediaInput = images.map((img, i) => ({
    originalSource: sources[i],
    alt: img.alt,
    mediaContentType: "IMAGE",
  }));

  const result = await adminQuery<{
    productCreateMedia: {
      media: Array<{ id: string; status: string }>;
      mediaUserErrors: UserError[];
    };
  }>(
    `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id status } }
        mediaUserErrors { field message }
      }
    }`,
    { productId, media: mediaInput }
  );

  const created = result.data?.productCreateMedia;
  if (created?.mediaUserErrors?.length) {
    for (const e of created.mediaUserErrors) {
      log.warn(`${prod.handle} media: ${e.message}`);
    }
  }
  const media = created?.media ?? [];
  if (media.length !== images.length) {
    log.warn(
      `${prod.handle}: attached ${media.length}/${images.length} media`
    );
  }

  const attached: AttachedMedia[] = media.map((m, i) => ({
    id: m.id,
    // biome-ignore lint/style/noNonNullAssertion: media aligns with images by index
    color: images[i]!.color,
    position: images[i]!.position,
  }));

  if (verbose) log.info(`  ${media.length} images attached`);

  // 3. Wait for Shopify to finish processing, then link each variant to its
  //    colour's first image (append fails on non-READY media).
  await waitForMediaReady(
    attached.map((m) => m.id),
    verbose
  );
  await linkVariantImages(productId, prod, variantIdsBySku, attached, verbose);
}

/**
 * Polls media until every id is READY (or FAILED/timeout). Freshly uploaded
 * media is PROCESSING for a few seconds; variant linking requires READY.
 */
export async function waitForMediaReady(
  mediaIds: string[],
  verbose: boolean
): Promise<void> {
  if (mediaIds.length === 0) return;
  const deadline = Date.now() + 90_000;
  let delay = 1000;

  while (Date.now() < deadline) {
    const result = await adminQuery<{
      nodes: Array<{ id: string; status: string } | null>;
    }>(
      `query($ids: [ID!]!) {
        nodes(ids: $ids) { ... on MediaImage { id status } }
      }`,
      { ids: mediaIds }
    );

    const nodes = result.data?.nodes ?? [];
    const statuses = nodes.map((n) => n?.status ?? "PROCESSING");
    const pending = statuses.filter((s) => s !== "READY" && s !== "FAILED");
    if (pending.length === 0) {
      const failed = statuses.filter((s) => s === "FAILED").length;
      if (failed > 0) log.warn(`  ${failed} media failed to process`);
      if (verbose) log.info(`  media ready (${statuses.length})`);
      return;
    }

    await sleep(delay);
    delay = Math.min(delay * 1.5, 5000);
  }
  log.warn("  media readiness timed out — some variant links may be skipped");
}

/** Maps colour → first attached media id (lowest position). */
function firstMediaByColor(
  attached: AttachedMedia[]
): Record<string, string> {
  const byColor: Record<string, AttachedMedia> = {};
  for (const m of attached) {
    const current = byColor[m.color];
    if (!current || m.position < current.position) byColor[m.color] = m;
  }
  const result: Record<string, string> = {};
  for (const [color, m] of Object.entries(byColor)) result[color] = m.id;
  return result;
}

/**
 * Repairs variant→image links for an already-created product without
 * re-uploading. Fetches the product's existing media (in creation order, which
 * matches the hand-off image order) and variants, waits for readiness, and
 * appends each variant its colour's first image. Idempotent.
 */
export async function relinkVariantImagesForProduct(
  prod: HandoffProduct,
  verbose: boolean
): Promise<boolean> {
  const result = await adminQuery<{
    productByHandle: {
      id: string;
      media: { nodes: Array<{ id: string; status: string } | null> };
      variants: { nodes: Array<{ id: string; sku: string }> };
    } | null;
  }>(
    `query($handle: String!) {
      productByHandle(handle: $handle) {
        id
        media(first: 50) { nodes { ... on MediaImage { id status } } }
        variants(first: 100) { nodes { id sku } }
      }
    }`,
    { handle: prod.handle }
  );

  const product = result.data?.productByHandle;
  if (!product) {
    log.warn(`relink: product not found — ${prod.handle}`);
    return false;
  }

  const mediaNodes = product.media.nodes.filter(
    (n): n is { id: string; status: string } => Boolean(n?.id)
  );
  if (mediaNodes.length !== prod.images.length) {
    log.warn(
      `relink ${prod.handle}: media count ${mediaNodes.length} ≠ expected ${prod.images.length} — skipping`
    );
    return false;
  }

  await waitForMediaReady(
    mediaNodes.map((m) => m.id),
    verbose
  );

  const attached: AttachedMedia[] = mediaNodes.map((m, i) => ({
    id: m.id,
    // biome-ignore lint/style/noNonNullAssertion: media aligns with images by creation order
    color: prod.images[i]!.color,
    // biome-ignore lint/style/noNonNullAssertion: media aligns with images by creation order
    position: prod.images[i]!.position,
  }));

  const variantIdsBySku: Record<string, string> = {};
  for (const v of product.variants.nodes) {
    if (v.sku) variantIdsBySku[v.sku] = v.id;
  }

  await linkVariantImages(product.id, prod, variantIdsBySku, attached, verbose);
  return true;
}

async function linkVariantImages(
  productId: string,
  prod: HandoffProduct,
  variantIdsBySku: Record<string, string>,
  attached: AttachedMedia[],
  verbose: boolean
): Promise<void> {
  const firstByColor = firstMediaByColor(attached);

  // productVariantsBulkUpdate SETS the variant's media (unlike
  // productVariantAppendMedia, which rejects a variant that already has an
  // image) — so it works whether the variant is fresh or being reimaged.
  const variants: Array<{ id: string; mediaId: string }> = [];
  for (const v of prod.variants) {
    const variantId = variantIdsBySku[v.sku];
    const mediaId = firstByColor[v.color];
    if (!variantId || !mediaId) continue;
    variants.push({ id: variantId, mediaId });
  }

  if (variants.length === 0) return;

  const result = await adminQuery<{
    productVariantsBulkUpdate: {
      userErrors: UserError[];
    };
  }>(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    { productId, variants }
  );

  const errs = result.data?.productVariantsBulkUpdate?.userErrors;
  if (errs?.length) {
    for (const e of errs) log.warn(`${prod.handle} variant media: ${e.message}`);
  } else if (verbose) {
    log.info(`  ${variants.length} variant images linked`);
  }
}

/**
 * Swaps an existing product's media for the current hand-off images without
 * touching the product itself — handle, GID, variants, prices, metafields and
 * collections all stay put, so Sanity refs and Shopify Connect keep working.
 *
 * Uploads + attaches the new images and links variants first (so the product is
 * never image-less), waits for the new media to be READY, then deletes the old
 * media. Returns false when the product isn't found.
 */
export async function reimageProduct(
  prod: HandoffProduct,
  verbose: boolean
): Promise<boolean> {
  const res = await adminQuery<{
    productByHandle: {
      id: string;
      media: { nodes: Array<{ id: string } | null> };
      variants: { nodes: Array<{ id: string; sku: string }> };
    } | null;
  }>(
    `query($handle: String!) {
      productByHandle(handle: $handle) {
        id
        media(first: 50) { nodes { ... on MediaImage { id } } }
        variants(first: 100) { nodes { id sku } }
      }
    }`,
    { handle: prod.handle }
  );

  const product = res.data?.productByHandle;
  if (!product) {
    log.warn(`reimage: product not found — ${prod.handle}`);
    return false;
  }

  const oldMediaIds = product.media.nodes
    .filter((n): n is { id: string } => Boolean(n?.id))
    .map((n) => n.id);

  const variantIdsBySku: Record<string, string> = {};
  for (const v of product.variants.nodes) {
    if (v.sku) variantIdsBySku[v.sku] = v.id;
  }

  // 1. Upload + attach the new images and link variants (product keeps its old
  //    images until this succeeds).
  await uploadAndAttachImages(product.id, prod, variantIdsBySku, verbose);

  // 2. Remove the now-stale old media.
  if (oldMediaIds.length > 0) {
    const del = await adminQuery<{
      productDeleteMedia: {
        deletedMediaIds: string[];
        mediaUserErrors: UserError[];
      };
    }>(
      `mutation($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors { field message }
        }
      }`,
      { productId: product.id, mediaIds: oldMediaIds }
    );
    hasUserErrors(
      del.data?.productDeleteMedia?.mediaUserErrors,
      `${prod.handle} delete media`
    );
  }

  log.info(
    `${prod.handle}: reimaged (${oldMediaIds.length} old → ${prod.images.length} new)`
  );
  return true;
}
