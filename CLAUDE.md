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
pnpm test             # vitest (apps/web only)

# Studio schema tooling
pnpm --filter studio type           # schema extract + typegen → packages/sanity/src/sanity.types.ts
pnpm --filter studio schema:deploy  # clean + extract + deploy (required for the Agent Context MCP)
pnpm --filter studio seed:shopify
pnpm --filter studio seed:ai-assistant
pnpm --filter studio seed:faq    # 14 FAQs + a faqCategories block on home and /faq
pnpm --filter studio seed:blog   # author, categories, 6 posts, blogIndex
```

> `apps/studio/seed-data.tar.gz` is upstream's full dataset export
> (`sanity dataset import seed-data.tar.gz`) and already covers `homePage`,
> pages, navbar and footer — so there is no home-page seed script. It is a
> staging export that predates the UI overhaul, though: it carries no
> `category` documents and uses the old page-builder blocks, which is what
> `seed:faq` and `seed:blog` exist to fill in.

Tests are colocated in `src/**/__tests__/*.test.ts` (`apps/web/vitest.config.ts`,
node environment, pure-logic only — no DOM/RTL).

## Architecture

```
apps/
  web/          → Next.js 16 (App Router, Turbopack, React Compiler, RSC)
  studio/       → Sanity Studio v5 (custom structure, plugins, blueprints)
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
3. **Page Builder** (`apps/web/src/components/pagebuilder.tsx`) — client component mapping `_type` → React section component via `BLOCK_COMPONENTS`. Uses `useOptimistic` from `@sanity/visual-editing`
4. **Types** auto-generated: run `pnpm --filter studio type` → writes `packages/sanity/src/sanity.types.ts`

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
2. Register it in `apps/studio/schemaTypes/blocks/index.ts`
3. Add a thumbnail at `apps/studio/static/thumbnails/<typeName>.webp` and place it in an insert-menu group in `apps/studio/schemaTypes/definitions/pagebuilder.ts`
4. Add GROQ fragment in `packages/sanity/src/query.ts` and include in `pageBuilderFragment`
5. Run `pnpm --filter studio type` to regenerate types
6. Create React component in `apps/web/src/components/sections/`
7. Register in `BLOCK_COMPONENTS` in `apps/web/src/components/pagebuilder.tsx`

Current blocks: `collectionBanner`, `cta`, `editorialTwoUp`, `exploreCategories`,
`faqAccordion`, `faqCategories`, `featuredProducts`, `hero`, `featureCardsIcon`,
`layersShowcase`, `subscribeNewsletter`, `imageLinkCards`.

### Sanity Studio Structure

- **Documents**: `blog`, `page`, `faq`, `author`, `category`, `product`, `collection`, `productVariant`, `redirect`, `colorTheme`
- **Singletons**: `homePage`, `blogIndex`, `collectionsIndex`, `settings`, `footer`, `navbar`, `promoBanner`, `aiAssistantSettings`
- **Shopify objects**: `shopifyProduct`, `shopifyProductVariant`, `shopifyCollection`, `inventory`, `option`, `priceRange`, etc.

> `apps/studio/scripts/cleanup-stale-sanity.ts` and `scripts/migrate-handoff/`
> are upstream's demo-store tooling — `cleanup-stale-sanity` **deletes** product
> docs whose GID isn't live in Shopify. Treat both as reference only.

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

## Tooling

- **Node**: >=22
- **Package manager**: pnpm 10.28.0 (workspace protocol, catalog in `pnpm-workspace.yaml`)
- **Formatter/Linter**: Biome 2.3.8 (config in `biome.jsonc`) — double quotes, semicolons, 2-space indent, 80 char width, trailing commas es5
- **Import order** (Biome): URL/Node → packages → blank line → aliases/paths
- **TypeScript**: strict, `noUncheckedIndexedAccess`, module NodeNext, target ES2022
- **Tailwind CSS v4**: CSS-first config via `@import "tailwindcss"`, OKLCH tokens, `--radius: 0rem`, `@tailwindcss/typography` enabled
- **React Compiler**: enabled via `babel-plugin-react-compiler`

## Environment Variables

**Web** (`apps/web/.env`) — see `apps/web/.env.example`:
- `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION`, `NEXT_PUBLIC_SANITY_STUDIO_URL`
- `NEXT_PUBLIC_STORE_CURRENCY` — must match the Shopify store's currency; seeds the optimistic cart line
- `SANITY_API_READ_TOKEN`, `SANITY_API_WRITE_TOKEN`
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`
- `AI_GATEWAY_API_KEY`, `SANITY_CONTEXT_MCP_URL` — `/api/chat` returns 503 until both are set (on Vercel, OIDC covers the gateway key)

**Studio** (`apps/studio/.env`):
- `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`, `SANITY_STUDIO_TITLE`, `SANITY_STUDIO_PRESENTATION_URL`
