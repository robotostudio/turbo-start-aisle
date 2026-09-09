---
name: add-pagebuilder-block
description: Use when adding a new block to the Sanity page builder — creates the schema, GROQ fragment, React section component and both registry entries, then regenerates types. Use when the user says "add a block", "new page builder section", "add a section to the page builder", or names a section they want built.
---

# Add a Page Builder Block

## Overview

Adds one block to the page builder. Two new files, six edits, one blocking codegen step.

The work is deterministic — every insertion point is known — but it spans both apps and the shared `packages/sanity`, and a block that is registered in some places and not others fails in a specific, confusing way. Follow the order below; step 5 blocks step 6.

## Prerequisites

**STOP and check:**

1. `apps/studio/schemaTypes/blocks/` and `apps/web/src/components/sections/` exist. If not, this isn't a `turbo-start-shopify` project.
2. Working tree is reasonably clean, so the user can review the diff.
3. An env file is **not** needed to build the block. Do not block on it.

   Verified on a fresh clone with no `.env` anywhere: `pnpm --filter studio type` succeeds, prints `Missing or invalid SANITY_STUDIO_PROJECT_ID` as a warning, and generates types normally. Extraction and typegen are entirely local — they parse the schema from source and never call the Sanity API.

   What does need env is the end-to-end check at the bottom of this skill. `pnpm dev` and any web build fail with `Invalid environment variables` from `@workspace/env` until `apps/web` has one. So write the code first, and raise env only when you reach Verify.

   If the project does have an env file, either `.env` or `.env.local` works: the Sanity CLI loads both before evaluating the config, and `.env.local` takes precedence. Never create a second one.

## Before you start

Ask all of these and **wait for the user to answer before proceeding**:

1. **Block name and title?** Name is camelCase and becomes the schema `name` and the `_type` (e.g. `quoteBanner`). File names are kebab-case (`quote-banner.ts`).
2. **Which insert-menu group?** `heroBanners` (Hero & Banners) · `content` (Content) · `cards` (Cards & Categories) · `faq` (FAQ) · `commerce` (Commerce). Groups are defined in `apps/studio/schemaTypes/definitions/pagebuilder.ts`. A block may belong to more than one; a block in none still appears under "All".
3. **Does it need Shopify product data?** Determines whether Part B runs. Most blocks don't.
4. **What fields?** Get specifics — names, types, which are optional. If the user is vague, propose a shape and confirm before writing.

Also pick a [lucide](https://lucide.dev) icon for the Studio picker.

---

## Part A: Always

### 1. Schema — `apps/studio/schemaTypes/blocks/<kebab-name>.ts`

Follow `blocks/cta.ts` as the reference. `defineType` with `name`, `type: "object"`, `icon`, `description`, `fields`, `preview`. No `title` key — Sanity derives it from `name`.

```ts
import { QuoteIcon } from "lucide-react";
import { defineField, defineType } from "sanity";

import { buttonsField } from "@/schemaTypes/common";
import { customRichText } from "@/schemaTypes/definitions/rich-text";

export const quoteBanner = defineType({
  name: "quoteBanner",
  type: "object",
  icon: QuoteIcon,
  description: "…what an editor sees when choosing this block",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: "…what this field is for",
    }),
  ],
  preview: {
    select: { title: "title" },
    prepare: ({ title }) => ({
      title: title || "Untitled",
      subtitle: "Quote Banner",
      media: QuoteIcon,
    }),
  },
});
```

Reuse the shared helpers rather than redefining them:

| Helper | From | Used as |
|---|---|---|
| `buttonsField` | `@/schemaTypes/common` | a field value — drop it straight into `fields` |
| `richTextField` | `@/schemaTypes/common` | a field value |
| `iconField` | `@/schemaTypes/common` | a field value |
| `imageWithAltField` | `@/schemaTypes/common` | **a function** — `imageWithAltField({ name: "image", title: "Image", description: "…" })`, all options optional |
| `customRichText` | `@/schemaTypes/definitions/rich-text` | **a function** — `customRichText(["block"])` to restrict which members are allowed |

Every field needs a `description` — it is the editor-facing help text, and the Studio conventions in `.cursor/rules/sanity-rules.mdc` require it. Always give `preview.prepare` a fallback title; blocks with no content render as "Untitled" rather than blank.

### 2. Register the schema — `apps/studio/schemaTypes/blocks/index.ts`

Add the import and push into `pageBuilderBlocks`. The array is not sorted — append rather than trying to place it alphabetically.

### 3. Insert-menu group — `apps/studio/schemaTypes/definitions/pagebuilder.ts`

Add the block `name` to the `of` array of **every** group the user picked — gating question 2 allows more than one, and a block can legitimately appear under several tabs. Skip this step only if they picked none.

### 4. GROQ fragment — `packages/sanity/src/query.ts`

Add a fragment beside the other per-block fragments, then include it in `pageBuilderFragment`:

```ts
const quoteBannerBlock = /* groq */ `
  _type == "quoteBanner" => {
    ...,
    ${richTextFragment},
    ${buttonsFragment},
  }
` as const;
```

**Both the `/* groq */` comment and the trailing `as const` are required.** The comment is what the typegen parser keys on. The `as const` is what keeps the fragment's *literal* string type: `sanityFetch` resolves its result by matching that literal against the keys typegen generates, so a fragment without it widens every query embedding it to a `${string}` pattern and the lookup misses.

**The failure is loud but points at the wrong file.** Typegen still succeeds — it parses the source text, so your block's types are generated correctly — and `lint` still passes. `check-types` is what breaks, and it breaks in the *pages* that consume the query, not in the fragment you edited:

```text
src/app/[...slug]/page.tsx(58,28): error TS2339: Property 'title' does not exist on type '{}'
```

Dozens of those, across files you never touched, is the signature. Before hunting through the pages, check that the fragment you just added ends with `as const` — every other fragment in the file does.

(Verified by dry run: omitting it produced exactly this, and adding it cleared every error.)

Spread `...` first, then pull in only the fragments matching fields you actually defined. The common ones: `imageFragment`, `richTextFragment`, `buttonsFragment`, `customLinkFragment`. Rich text members each have their own fragment too (`blockMemberFragment`, `imageMemberFragment`, `accordionMemberFragment`, and the rest, composed by `portableTextMembersFragment`) — read the file rather than assuming this list is complete.

**If your block references a product or collection, the dereference must be gated.** Shopify keeps archived and deleted items in Sanity, so the reference still resolves, but the product and collection routes only render items matching a visibility predicate — an ungated deref renders a link into a `notFound()`. Use `visibleProduct(ref)` / `visibleCollection(ref)`, and read the comment above them on why they are spelled out inline rather than composed.

**The shared fragments hardcode their field names.** `imageFragment` opens with `image {`, `richTextFragment` with `richText[]{`, `buttonsFragment` with `buttons[]{`. Your schema field must use exactly that name or the fragment silently matches nothing and the field arrives `undefined` on the frontend — with no error anywhere.

So `imageWithAltField()` with its default name works; `imageWithAltField({ name: "portrait" })` does not. Either keep the default name, or inline the projection using `imageFields` (the inner fragment, without the `image {` wrapper) under your own key.

Then add `${quoteBannerBlock},` to `pageBuilderFragment`.

### 5. Regenerate types — **blocking**

```bash
pnpm --filter studio type
```

This runs three steps:

```text
sanity schema extract --enforce-required-fields --force
sanity typegen generate
pnpm --filter @workspace/sanity format
```

It rewrites `packages/sanity/src/sanity.types.ts` and `apps/studio/schema.json`. `--force` is required because extract now refuses to overwrite an existing `schema.json`. The third step is a Biome pass, so expect a formatting diff across `packages/sanity` alongside the regenerated types.

**Step 6 cannot typecheck until this completes.** If it errors, the schema or the fragment is malformed — fix it here rather than pressing on.

### 6. Section component — `apps/web/src/components/sections/<kebab-name>.tsx`

Follow `sections/cta.tsx`. Type it off the generated types — never hand-write the prop shape:

```tsx
import type { PagebuilderType } from "@/types";

export type QuoteBannerProps = PagebuilderType<"quoteBanner">;

export function QuoteBanner({ title }: QuoteBannerProps) {
  return (
    <section className="py-12 md:py-20">
      <div className="site-container">…</div>
    </section>
  );
}
```

No `"use client"` — it's already inside the client boundary of `pagebuilder.tsx`. Use `packages/ui` primitives and the `site-container` class for consistent page width. Sanity fields are frequently nullable under `noUncheckedIndexedAccess`; guard rather than assert.

### 7. Register the component — `apps/web/src/components/pagebuilder.tsx`

Add the import and an entry in `BLOCK_COMPONENTS`, keyed by the schema `name`.

### 8. Type union — `apps/web/src/types.ts`

`PageBuilderBlockTypes` derives from the generated query result, so it usually widens on its own once step 5 has run. Verify the new `_type` is included; only edit if it isn't.

---

## Part B: Only if the block needs Shopify data

**Skip this entirely if the user answered no to gating question 3.**

Section components are under the `"use client"` boundary of `pagebuilder.tsx` and **cannot fetch Shopify**. The page fetches server-side and injects results keyed by block `_key`.

Follow the `featuredProducts` precedent exactly — read these three before writing:

- `apps/web/src/components/sections/featured-products.tsx`
- the `featuredProductsByKey` prop and its doc comment in `apps/web/src/components/pagebuilder.tsx`
- `apps/web/src/lib/shopify/featured.ts`
- `apps/web/src/lib/featured-blocks.ts` — where `apps/web/src/app/page.tsx` actually builds the keyed map, and where the picked-vs-dropped reasoning lives

Add a parallel prop to `PageBuilderProps`, populate it in each page that renders the page builder, and thread it through. All Shopify calls go through `storefrontQuery()` from `apps/web/src/lib/shopify/client.ts` — handle its `{ ok: false }` branch.

---

## Part C: Thumbnail — do not skip

**The block is not finished without this.** The insert menu's grid view reads `/static/thumbnails/<schemaTypeName>.webp`. Until that file exists, the new block shows as a blank tile in the picker while every other block has a preview — so editors can't tell what it is, and it looks broken next to the rest.

Nothing fails and nothing warns. It is purely visual, which is exactly why it gets missed.

Hand off to the **`generate-thumbnails-agentic`** skill. Do not reimplement it — it handles placeholder uploads, screenshotting and image processing.

If the user defers it, say plainly that the block will show an empty tile in the Studio until it's done.

---

## Verify

```bash
pnpm check-types
pnpm lint
```

**Idempotency check.** Typegen must produce identical output on two consecutive runs. Compare the two *runs* against each other — **not** against `git`, which will always show a diff because the block is new:

```bash
cp packages/sanity/src/sanity.types.ts /tmp/types-run1.ts
cp apps/studio/schema.json /tmp/schema-run1.json
pnpm --filter studio type
diff -q /tmp/types-run1.ts packages/sanity/src/sanity.types.ts
diff -q /tmp/schema-run1.json apps/studio/schema.json
```

Both `diff`s must print nothing.

Then end-to-end:

1. `pnpm dev`
2. In Studio (:3333), open the home page, add the block via the insert menu, confirm it appears under the expected group, and fill in the fields.
3. On :3000, confirm it renders.
4. **Confirm Visual Editing click-to-edit works on it** — clicking the block in Presentation should jump to the right field. This proves the `data-sanity` attribute that `pagebuilder.tsx` puts on each block via `createBlockDataAttribute(block._key)`, which is easy to get silently wrong and is invisible on the page otherwise.
5. Leave the field values empty and confirm it degrades gracefully rather than throwing.
6. Discard the test content when done.

## Common Mistakes

- **Editing `packages/sanity/src/sanity.types.ts` by hand.** It's generated. Run `pnpm --filter studio type`.
- **Importing generated types from anywhere but `@workspace/sanity/types`.** That is the only copy, generated into `packages/sanity/src/sanity.types.ts`.
- **Adding `fetch` to a section component.** Client boundary — see Part B.
- **Adding `"use client"` to a section component.** Already inside one.
- **Omitting the `/* groq */` comment.** Typegen won't see the fragment and the types come back wrong.
- **Omitting `as const` on the fragment.** Typegen and lint still pass, but `check-types` fails across unrelated page files. See step 4.
- **Writing step 6 before running step 5.** The types don't exist yet; you'll be guessing at the prop shape.
- **Creating a barrel file** for the new section. Import directly.
- **Skipping field `description`s.** They're the editor's only guidance in the Studio.

## Red Flags — STOP If You Notice These

- **The block renders `UnknownBlockError` instead of your component.** The `_type` is in the GROQ fragment but missing from `BLOCK_COMPONENTS`, or the keys don't match. Both registries must agree, and the key is the schema `name`, not the file name.
- **The block doesn't appear in the Studio insert menu at all.** It's missing from `pageBuilderBlocks` in `blocks/index.ts`.
- **It appears in the menu but the fields come back `undefined` on the frontend.** The GROQ fragment is missing from `pageBuilderFragment`, so the data is never queried.
- **`pnpm --filter studio type` produces a diff on a second consecutive run.** Something is non-deterministic — stop and investigate rather than committing.
- **You're about to define a button, image or rich-text field from scratch.** Use `buttonsField`, `imageWithAltField` or `customRichText` — hand-rolled versions won't match the existing GROQ fragments and will silently return the wrong shape.
- **You renamed an image, richText or buttons field.** The shared fragments hardcode those names — the field will come back `undefined` with no error. See step 4.
- **`check-types` suddenly fails in pages you never edited, with `Property 'x' does not exist on type '{}'`.** The fragment you added is missing `as const`. Fix that before investigating the pages themselves.
- **You're about to report the block as done without a thumbnail.** It isn't. See Part C.
