# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shopify + Sanity headless commerce starter with an AI shopping assistant — pnpm
monorepo with Turborepo orchestration.

The storefront foundation tracks
[`robotostudio/turbo-start-shopify`](https://github.com/robotostudio/turbo-start-shopify),
which is configured as the `upstream` git remote. The Aisle-specific layer is the
AI chat assistant in `packages/ai-commerce` plus a small number of integration
points (see **AI Commerce layer** below).

## Commands

```bash
# Development (web :3000, studio :3333)
pnpm dev              # all apps
pnpm dev:web          # Next.js only
pnpm dev:studio       # Sanity Studio only

# Build
pnpm build            # all
pnpm build:web        # web only
pnpm build:studio     # studio only

# Quality
pnpm lint             # biome lint
pnpm format           # biome format --write
pnpm format:check     # biome format (check only)
pnpm check-types      # tsc --noEmit across all packages

# Studio schema tooling (run from apps/studio)
npx sanity schema extract --enforce-required-fields --force
npx sanity typegen generate
npx sanity deploy

# Seed data (run from apps/studio)
npx sanity dataset import ./seed-data.tar.gz production --replace
```

Tests run with Vitest in `apps/web` (`pnpm test`, or `pnpm --filter web test`).
Specs live in `__tests__/` directories and are `.test.ts` — components are
exercised with `createElement` + `renderToStaticMarkup`, not JSX, because the
config's include glob matches `.ts` only.

## Architecture

```
apps/
  web/          → Next.js 16 (App Router, Turbopack, React Compiler, RSC)
  studio/       → Sanity Studio v6 (custom structure, plugins, blueprints)
packages/
  ai-commerce/  → @workspace/ai-commerce — AI chat widget, tools, system prompt, MCP client
  env/          → @workspace/env — T3 env validation (Zod v4), client.ts + server.ts
  sanity/       → @workspace/sanity — Sanity client, GROQ queries, live preview, generated types
  ui/           → @workspace/ui — Shadcn (new-york style) + Tailwind v4 primitives
  logger/       → @workspace/logger — Logger class wrapping console.*
  typescript-config/ → shared tsconfig presets
```

### Data Flow

1. **GROQ queries** defined with `defineQuery` in `packages/sanity/src/query.ts` — composable fragments for images, links, rich text, page builder blocks
2. **`sanityFetch()`** from `packages/sanity/src/live.ts` (via `next-sanity/defineLive`) — used in RSC pages for data fetching with live preview support
3. **Page Builder** (`apps/web/src/components/pagebuilder.tsx`) — client component mapping `_type` → React section component via `BLOCK_COMPONENTS` record. Uses `useOptimistic` from `@sanity/visual-editing` for live editing
4. **Section components** in `apps/web/src/components/sections/` — `hero`, `cta`, `faq-accordion`, `feature-cards-with-icon`, `subscribe-newsletter`, `image-link-cards`
5. **Types** auto-generated: run `pnpm --filter studio type` → outputs to `packages/sanity/src/sanity.types.ts`

### Cart

Client cart state is a state machine, not a context reducer:

- `apps/web/src/lib/cart/engine.ts` — pure optimistic reducer (`applyIntent`, `fold`)
- `apps/web/src/lib/cart/controller.ts` — `CartController`: external store, debounced adds/updates, sequence-numbered server truth, retry
- `apps/web/src/lib/cart/classify.ts` — maps Shopify failures to the app's error/warning taxonomy
- `apps/web/src/components/cart/cart-context.tsx` — `useCartActions()` (writes, stable identity), `useCartState()` (reads), `useCart()` (both)

`addLine(variantId, quantity, metadata)` requires a full `LineMetadata` so the
optimistic line can render before Shopify responds — build it with
`buildLineMetadata()` from `apps/web/src/lib/cart/metadata.ts`. Errors and
warnings surface globally via `components/cart/cart-toasts.tsx` → sonner.

### Collection filters and search

Filters live entirely in the **URL** — there is no filter store. Parsed by
`apps/web/src/components/collection/filter-utils.ts`:
`filter.available`, `filter.price=<bucket>` (see `PRICE_BUCKETS`),
`filter.vendor`, `filter.type`, `filter.tag`, `filter.option.<Name>`,
`filter.category`; plus top-level `sort` / `reverse` (`sort-utils.ts`).

Search is one shared `search-panel.tsx` behind three surfaces: the `/search`
page, an intercepted `@modal/(.)search` drawer, and the navbar toggle. Backed by
`api/search`, `api/search/full`, `api/search/defaults`.

### Agent-facing content surface

- `apps/web/src/proxy.ts` — Next 16 middleware. Rewrites `*.md` paths and `Accept: text/markdown` requests to `/api/markdown`
- `apps/web/src/lib/markdown/` — Portable Text and page-builder → Markdown serializers
- `apps/web/src/app/llms.txt/route.ts` — index of every page's `.md` twin

### AI Commerce layer

`packages/ai-commerce` is standalone — it may import `@workspace/*` but **never**
the web app's `@/` alias. Shapes shared with the app (`MoneyV2`, `ShopifyImage`,
`SelectedOption`, `PRICE_BUCKETS`) are structurally duplicated in
`packages/ai-commerce/src/types.ts` with pointer comments; keep them in sync.

Integration points in the web app:

| File | Role |
|---|---|
| `apps/web/src/app/api/chat/route.ts` | Streams via Vercel AI Gateway; wires MCP + client tools |
| `apps/web/src/components/ai-cart-bridge.tsx` | Listens for `ADD_TO_CART_EVENT`, maps it onto `useCartActions().addLine()` |
| `apps/web/src/components/page-context-tracker.tsx` | Writes route + surface on every navigation; read by `ChatPanel` and sent to the model |
| `apps/web/src/app/layout.tsx` | Mounts the three AI components inside `<Providers>` |

The chat cannot call app functions directly, so "add to cart" is a `window`
CustomEvent (`ADD_TO_CART_EVENT`) carrying the full line metadata.

### Adding a New Page Builder Block

1. Create Sanity schema in `apps/studio/schemaTypes/blocks/`
2. Register it in `apps/studio/schemaTypes/index.ts`
3. Add GROQ fragment in `packages/sanity/src/query.ts` and include in `pageBuilderFragment`
4. Run `pnpm --filter studio type` to regenerate types
5. Create React component in `apps/web/src/components/sections/`
6. Register in `BLOCK_COMPONENTS` map in `apps/web/src/components/pagebuilder.tsx`
7. Add type to `PageBuilderBlockTypes` union in `apps/web/src/types.ts`

### Sanity Studio Structure

- **Documents**: `blog`, `page`, `faq`, `author`, `product`, `collection`, `productVariant`, `redirect`
- **Singletons**: `homePage`, `blogIndex`, `settings`, `footer`, `navbar`
- **Shopify objects**: `shopifyProduct`, `shopifyProductVariant`, `shopifyCollection`, `inventory`, `option`, `priceRange`, etc.
- **Blueprint** (`sanity.blueprint.ts`): auto-redirect function — creates redirect documents on slug change

### Key Patterns

- **Env validation**: `@workspace/env/client` and `@workspace/env/server` — validated imports, never raw `process.env`
- **Path aliases**: `@/*` → `apps/web/src/*`, `@workspace/ui/*` → `packages/ui/src/*`
- **SEO**: `getSEOMetadata()` in `apps/web/src/lib/seo.ts`, OG images via `/api/og` route
- **Visual editing**: `VisualEditing` from `next-sanity` + `createDataAttribute` per block, draft mode via `/api/presentation-draft`
- **Redirects**: fetched from Sanity at Next.js build time via `queryRedirects` in `next.config.ts`

## Syncing with upstream

```bash
git fetch upstream
git diff HEAD upstream/main -- apps packages   # review before taking anything
```

The AI layer is confined to `packages/ai-commerce`, the four integration files
above, `apps/studio/schemaTypes/documents/ai-assistant-settings.ts`,
`apps/studio/scripts/seed-ai-assistant.ts`, and small deltas in `layout.tsx`,
`seo.ts`, `query.ts`, `env/*`, `globals.css`, `turbo.json` and the studio config.
Everything else can be taken from upstream wholesale.

Last synced at upstream `4e45d2b`.

## Tooling

- **Node**: >=24.10
- **Package manager**: pnpm 11.24.0 (workspace protocol, catalog for shared versions in `pnpm-workspace.yaml`)
- **Formatter/Linter**: Biome 2.5.10 — double quotes, semicolons, 2-space indent, 80 char width, trailing commas es5
- **Import order** (Biome): URL/Node → packages → blank line → aliases/paths
- **TypeScript**: strict, `noUncheckedIndexedAccess`, module NodeNext, target ES2022
- **Tailwind CSS v4**: CSS-first config via `@import "tailwindcss"`, OKLCH color tokens, dark mode via `@custom-variant`
- **React Compiler**: enabled via `babel-plugin-react-compiler` in Next.js config
- **Sanity Studio pins**: `sanity`, `@sanity/vision` and the seven plugins in `apps/studio/package.json` are pinned to exact versions, not ranges. The Studio is held on the `@sanity/ui` v3 line and every package crosses to v4 at a patch bump, so a caret or tilde would put a second `@sanity/ui` in the tree. What pins the whole line is `sanity-plugin-lucide-icon-picker`: 1.0.3 is its latest and last release, and it imports `Popover`/`Menu` from the `@sanity/ui` root and `TrashIcon`/`SyncIcon`/`EllipsisHorizontalIcon` from the `@sanity/icons` root — all moved to subpaths in `@sanity/ui` v4 / `@sanity/icons` v5, so `sanity build` fails with `MISSING_EXPORT` the moment the Studio crosses. Crossing means replacing that plugin (it backs the `lucide-icon` field type used by navbar, footer and the icon cards). That migration has no ticket yet — raise one and record its ROB id here and in `.github/renovate.json` so the freeze has an owner. Do not loosen them or bump a Sanity plugin to `latest` without reading the comment in `pnpm-workspace.yaml` first; after any install, `pnpm --filter studio why @sanity/ui` must show 3.x only.

## Environment Variables

**Web** (`apps/web/.env`):
- `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION`, `NEXT_PUBLIC_SANITY_STUDIO_URL`
- `SANITY_API_READ_TOKEN`, `SANITY_API_WRITE_TOKEN`

**Studio** (`apps/studio/.env`):
- `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`, `SANITY_STUDIO_TITLE`, `SANITY_STUDIO_PRESENTATION_URL`
