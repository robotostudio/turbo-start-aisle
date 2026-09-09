# AGENTS.md

Guidance for AI coding agents working in this repository. Shopify + Sanity headless commerce — pnpm monorepo, Turborepo.

Read this before writing code. For task-specific recipes, use the skills in `.claude/skills/`.

## Commands

```bash
pnpm dev                  # all apps (web :3000, studio :3333)
pnpm build                # all
pnpm lint                 # biome lint
pnpm format               # biome format --write
pnpm check-types          # tsc --noEmit across all packages
pnpm test                 # vitest via turbo (or: pnpm --filter web test)
pnpm test:coverage        # what CI runs — feeds the SonarQube scan
pnpm --filter studio type # schema extract + typegen — run after ANY schema change
```

`pnpm --filter studio type` regenerates `packages/sanity/src/sanity.types.ts`. Any change to a Sanity schema or a GROQ query needs it, and code depending on the new types will not typecheck until it runs. It also runs a Biome pass over `packages/sanity` as its third step, so expect a formatting diff alongside the types.

Specs live in `__tests__/` directories next to what they cover, and must be named `.test.ts` — **not** `.test.tsx`. The Vitest include glob matches `.ts` only, so a `.tsx` spec is silently never run. Components are therefore exercised with `createElement` + `renderToStaticMarkup` rather than JSX. See `apps/web/src/components/sections/__tests__/` for the pattern.

## Architecture rules

These are the ones that get written wrong. They are not style preferences — breaking them produces code that fails at runtime or build.

**1. Every Shopify call goes through `storefrontQuery()`**

`apps/web/src/lib/shopify/client.ts`. It returns a discriminated union, not a value:

```ts
type StorefrontQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: "network" | "graphql" | "unknown" };
```

Always handle the `ok: false` branch. Never call `storefront.request()` directly — you lose the error classification and logging. The module is `server-only`; it cannot be imported into a client component.

**2. Page builder blocks cannot fetch Shopify**

`apps/web/src/components/pagebuilder.tsx` is a `"use client"` component, so every section under it is client-side. Blocks that need Shopify data get it injected: the route calls `resolvePageBuilderProducts` (`apps/web/src/lib/page-builder-products.ts`), which fetches server-side, keys results by block `_key`, and hands back the maps `PageBuilderProps` takes. Every route that renders the builder calls it — home, `/[...slug]` and the blog index — so a block that paints without JavaScript on one paints the same way on all of them.

Follow the `featuredProducts` precedent — see the `featuredProductsByKey` prop and its doc comment in `pagebuilder.tsx`, and `apps/web/src/components/sections/featured-products.tsx`. `layersShowcase` follows it with `layersShowcaseProductByKey`, feeding the block's query as `initialData` so the client still revalidates. Adding a `fetch` to a section component is always wrong.

`PageBuilder` renders its wrapper unconditionally, but the tag is the caller's choice: `<main>` by default, `<div>` when passed `as="div"`. The blog routes do exactly that, because they nest it inside their own `<main>` — see `apps/web/src/app/blog/page.tsx`. So a section that wraps itself in `<main>` produces two on a normal page, but stripping a blog route's own `<main>` as a duplicate leaves that page with no landmark at all.

A block registered in the GROQ fragment but missing from `BLOCK_COMPONENTS` renders `UnknownBlockError`, not nothing. Both registries have to agree.

**3. Cart mutations go through the intent pipeline**

`apps/web/src/lib/cart/` — `intents.ts` (build the intent) → `engine.ts` (pure `applyIntent` / `fold` / `recalcTotals`) → `controller.ts` (`CartController`). Server actions live in `apps/web/src/app/cart/actions.ts`.

Never issue cart GraphQL directly; the optimistic-update and conflict-classification logic lives in the engine and gets bypassed. Cart mutations that change server state must call `invalidateCartCache()` from `apps/web/src/lib/cart/server.ts`.

**4. Dereferencing a product or collection must be gated on visibility**

Shopify keeps archived and deleted items in Sanity, so a reference to one still resolves — but `/products/[handle]` and `/collections/[slug]` only render items matching a visibility predicate. An ungated dereference renders a link straight into a `notFound()`.

Use `visibleProduct(ref)` / `visibleCollection(ref)` from `packages/sanity/src/query.ts` on every link surface. Note the comment there on why the predicates are spelled out rather than composed: typegen's extractor only substitutes *literal* arguments into a helper.

**5. Generated files are never hand-edited**

`packages/sanity/src/sanity.types.ts` and `apps/studio/schema.json` are generated. Run the typegen command instead.

`packages/sanity/src/sanity.types.ts` is the only copy, exported as `@workspace/sanity/types`. Import types from there.

**6. GROQ fragments end with `as const`**

Every fragment in `packages/sanity/src/query.ts` closes its template literal with `as const`. `sanityFetch` resolves its result type by matching the query's string *literal* type against the keys typegen generates; a fragment without it widens every query embedding it to a `${string}` pattern and the lookup misses.

Typegen and lint still pass. `check-types` fails — and it fails in the pages that consume the query (`Property 'title' does not exist on type '{}'`), not in the fragment you edited. A sudden burst of TS2339 errors in files you did not touch means a fragment lost its `as const`.

Note the doc comment in `query.ts` describes this as falling back to `any`. It does not, in current code: `sanityFetch`'s `StegaCleaned` wrapper in `packages/sanity/src/live.ts` collapses it to `{}`, which is why the failure is loud rather than silent.

**7. The Studio is frozen on the `@sanity/ui` v3 line**

`sanity`, `@sanity/vision` and the seven plugins in `apps/studio/package.json` are pinned to exact versions, never ranges — a caret would put a second `@sanity/ui` in the tree. `pnpm-workspace.yaml` carries `overrides` holding the line, and pnpm drops that file's comments when it rewrites on `pnpm update`. `.github/renovate.json` disables updates for the frozen packages.

Adding a Sanity *plugin*, or `sanity` itself, means an exact pin plus a `renovate.json` entry. This is not a blanket rule for the org: `@sanity/ui`, `@sanity/icons`, `@sanity/asset-utils`, `@sanity/functions` and `@sanity/uuid` stay on carets, and `.github/renovate.json` caps the first two at `<4` rather than pinning them so fixes inside v3 still land. Pinning those would stop updates the repo wants. After any install, `pnpm --filter studio why @sanity/ui` must show 3.x only. CLAUDE.md carries the full why.

## Conventions

**Formatting** (Biome 2.5.10, `biome.jsonc` is authoritative) — 80 columns, 2-space indent, LF, double quotes including JSX, semicolons always, `es5` trailing commas.

**Import order** is enforced by Biome's organize-imports assist:

```text
URL / protocol-prefixed / node:
external packages
                              ← blank line
@/… aliases and relative paths
```

**Lint** — `useConst` and `useTemplate` are errors. `noExplicitAny`, `noConsole`, `useExhaustiveDependencies` and `noExcessiveCognitiveComplexity` are warnings. `noConsole` is off under `**/scripts/**` and `packages/logger/`. Use `Logger` from `@workspace/logger` in app code rather than `console`.

**TypeScript** — strict, `noUncheckedIndexedAccess`, target ES2022. Indexed access returns `T | undefined`; handle it rather than asserting. Module resolution differs by preset: `packages/typescript-config/base.json` is `NodeNext`, but `apps/web` extends `nextjs.json`, which overrides to `ESNext` / `Bundler`.

**No barrel files.** Import from the module that defines the symbol.

**Path aliases** — `@/*` → `apps/web/src/*`, `@workspace/ui/*` → `packages/ui/src/*`, plus `@workspace/{env,sanity,logger}`.

**Env vars** are validated. Import from `@workspace/env/client` or `@workspace/env/server`, never raw `process.env`. Adding one always means editing the zod schema in `packages/env/src/{client,server}.ts`, plus `experimental__runtimeEnv` for a client var. Then, only where it applies: `turbo.json` `globalEnv` if a build task reads it — note it currently lists no `NEXT_PUBLIC_*` at all, since those are inlined at build time — and whichever of the three `.env.example` files (`apps/web`, `apps/studio`, `packages/sanity`) covers it.

This applies to `apps/web` and the shared packages only. `apps/studio` is outside the validated system entirely — it reads `process.env` directly with no schema. See CLAUDE.md.

One client var is worth knowing about when working on anything URL-shaped: `NEXT_PUBLIC_SITE_URL` is the canonical origin, checked *before* the Vercel vars so it overrides the generated `*.vercel.app` URL. Off Vercel it is effectively required — `getBaseUrl()` falls back to `localhost:3000`, and every canonical, OG URL and sitemap entry ships pointing there.

**Tailwind CSS v4** — CSS-first config via `@import "tailwindcss"` in `packages/ui/src/styles/globals.css`; there is no `tailwind.config.js`. Theme values are OKLCH tokens declared in `@theme`, and dark mode is a `@custom-variant`. New source outside the existing `@source` globs is not scanned, and its classes will not be generated.

**UI** — shadcn/ui (new-york) in `packages/ui/src/components/`. Add components with `pnpm dlx shadcn@latest add <name> -c packages/ui`; don't hand-write a primitive that the CLI can generate.

## Data flow

1. GROQ queries are defined with `defineQuery` in `packages/sanity/src/query.ts` — composable fragments for images, links, rich text, and page builder blocks.
2. `sanityFetch()` from `packages/sanity/src/live.ts` is used in RSC pages, and carries live-preview support.
3. Product and collection pages fetch Sanity and Shopify **in parallel** — Sanity holds editorial content and drives `generateStaticParams`; Shopify holds live price and inventory. See `apps/web/src/app/products/[handle]/page.tsx`.
4. Products exist in Sanity as `product` documents whose `store.*` subtree is synced read-only by Sanity Connect for Shopify. Don't write to `store.*`.

## Skills

`.claude/skills/` holds tested playbooks for recurring tasks. Prefer them over improvising:

- `add-pagebuilder-block` — add a block to the Sanity page builder
- `enable-ai-assistant` — add the turbo-start-aisle AI shopping assistant
- `generate-thumbnails-agentic` — page builder block thumbnails via Playwright MCP
