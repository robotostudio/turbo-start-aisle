/**
 * Seeds the settings singleton with Aisle's branding.
 * Run with: pnpm --filter studio exec sanity exec scripts/seed-settings.ts --with-user-token
 *
 * These three fields used to be a hardcoded `siteConfig` in
 * apps/web/src/lib/seo.ts. Upstream deleted it and now reads them from this
 * document, falling back to the bare deploy hostname — so without this seed the
 * site titles itself "localhost:3000". See ROB-2908.
 *
 * Idempotent, and a merge rather than a replace: createIfNotExists lays down
 * the required fields, then the patch overwrites only what we own. Anything
 * else on the doc — logo, favicon, ogImage, contactEmail, the other social
 * links — is left alone, so re-running never clobbers Studio edits.
 */

import { getCliClient } from "sanity/cli";

const client = getCliClient();

const SETTINGS_ID = "settings";

const branding = {
  siteTitle: "Turbo Start Aisle",
  // The schema caps siteDescription at 160 characters; the old seo.ts literal
  // was 165, so this is the same sentence trimmed to fit.
  siteDescription:
    "AI shopping assistant for headless Shopify. A chat widget that surfaces products, controls collection filters, and renders inline product cards.",
  // Stored as a full URL. Upstream's toTwitterHandle() in seo.ts takes the last
  // path segment and prefixes "@", so this renders as @akintola4.
  twitterUrl: "https://x.com/akintola4",
};

async function seed() {
  await client.createIfNotExists({
    _id: SETTINGS_ID,
    _type: "settings",
    label: "Settings",
    siteTitle: branding.siteTitle,
    siteDescription: branding.siteDescription,
  });

  await client
    .patch(SETTINGS_ID)
    // A dotted path needs its parent to exist before it can be set.
    .setIfMissing({ socialLinks: {} })
    .set({
      siteTitle: branding.siteTitle,
      siteDescription: branding.siteDescription,
      "socialLinks.twitter": branding.twitterUrl,
    })
    .commit();
}

seed()
  .then(() => {
    console.log(`Seeded settings (${SETTINGS_ID}) with Aisle branding`);
  })
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  });
