/**
 * Product metafield definitions + value builder.
 *
 * The storefront PDP renders four accordion sections from Shopify metafields in
 * the `custom` namespace: `details`, `fit_sizing`, `materials`, `shipping`
 * (see apps/web/src/app/products/[handle]/page.tsx and lib/shopify/queries.ts).
 * They render as plain text with `whitespace-pre-line`, so multi-line values are
 * newline-joined. The definitions must expose storefront read access or the
 * Storefront API returns null for them.
 */

import { adminQuery, log } from "../seed-shopify/client.js";
import type { UserError } from "../seed-shopify/types.js";
import type { HandoffProduct } from "./load.js";

const NAMESPACE = "custom";
const METAFIELD_TYPE = "multi_line_text_field";

interface MetafieldDef {
  key: string;
  name: string;
}

/** The four PDP accordion metafields, in render order. */
const DEFINITIONS: MetafieldDef[] = [
  { key: "details", name: "Details" },
  { key: "fit_sizing", name: "Fit & Sizing" },
  { key: "materials", name: "Materials & Composition" },
  { key: "shipping", name: "Shipping & Returns" },
];

export interface MetafieldInput {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

/**
 * Creates the four `custom.*` product metafield definitions with storefront
 * read access. Idempotent — a "taken" error means the definition already
 * exists and is treated as success.
 */
export async function ensureMetafieldDefinitions(
  verbose: boolean
): Promise<void> {
  log.info("Ensuring product metafield definitions…");

  for (const def of DEFINITIONS) {
    const result = await adminQuery<{
      metafieldDefinitionCreate: {
        createdDefinition: { id: string } | null;
        userErrors: Array<UserError & { code?: string }>;
      };
    }>(
      `mutation($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message code }
        }
      }`,
      {
        definition: {
          name: def.name,
          namespace: NAMESPACE,
          key: def.key,
          type: METAFIELD_TYPE,
          ownerType: "PRODUCT",
          access: { storefront: "PUBLIC_READ" },
        },
      }
    );

    if (result.errors) {
      log.error(
        `Metafield def ${def.key} — GraphQL: ${JSON.stringify(result.errors)}`
      );
      continue;
    }

    const { userErrors } = result.data?.metafieldDefinitionCreate ?? {};
    const taken = userErrors?.find((e) => e.code === "TAKEN");
    if (taken) {
      if (verbose) log.info(`  ${NAMESPACE}.${def.key} — exists`);
      continue;
    }
    if (userErrors?.length) {
      for (const e of userErrors) {
        log.error(`Metafield def ${def.key} — ${e.message}`);
      }
      continue;
    }
    log.info(`  ${NAMESPACE}.${def.key} — created`);
  }
}

/** Joins a bullet list into newline-separated plain text (renders pre-line). */
function joinLines(items: string[]): string {
  return items.map((s) => s.trim()).filter(Boolean).join("\n");
}

/** Builds the metafield inputs for a product from its hand-off JSON. */
export function buildMetafields(prod: HandoffProduct): MetafieldInput[] {
  const fields: MetafieldInput[] = [];

  const push = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      fields.push({ namespace: NAMESPACE, key, type: METAFIELD_TYPE, value: trimmed });
    }
  };

  push("details", joinLines(prod.details));
  push("fit_sizing", joinLines(prod.fitAndSizing));
  push(
    "materials",
    [prod.materials.composition, prod.materials.care]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n")
  );
  push("shipping", prod.shippingAndReturns);

  return fields;
}
