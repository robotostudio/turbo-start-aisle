# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

**Conventions, architecture rules and data flow live in [`AGENTS.md`](./AGENTS.md).** Read that first — it is the single source for how to write code here, and it is shared with Cursor and Codex. This file covers only what's specific to running the repo.

## Project Overview

Shopify + Sanity headless commerce starter with an AI shopping assistant — pnpm monorepo with Turborepo orchestration.

The storefront foundation tracks [`robotostudio/turbo-start-shopify`](https://github.com/robotostudio/turbo-start-shopify), which is configured as the `upstream` git remote. The Aisle-specific layer is the AI chat assistant in `packages/ai-commerce` plus a small number of integration points (see **AI Commerce layer** below).

```text
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
pnpm test             # vitest, via turbo

# Studio schema tooling
pnpm --filter studio type          # schema extract + typegen → packages/sanity/src/sanity.types.ts
pnpm --filter studio extract       # schema extract only
pnpm --filter studio run deploy    # publish the Studio

# Seed data
pnpm seed:shopify     # faker products → Shopify Admin API (needs SHOPIFY_ADMIN_ACCESS_TOKEN)
pnpm verify:shopify   # check store state
pnpm --filter studio exec sanity dataset import ./seed-data.tar.gz production --replace

# Aisle content seeds (Studio singletons)
pnpm --filter studio seed:settings      # site title/description/twitter — see note below
pnpm --filter studio seed:ai-assistant  # chat welcome heading, subtitle, suggestions
pnpm --filter studio seed:faq
pnpm --filter studio seed:blog
```

`seed:settings` matters more than it looks. `getSiteConfig()` in `apps/web/src/lib/seo.ts` reads the site title, description and Twitter handle from the `settings` singleton and falls back to the bare deploy hostname — so on a fresh dataset every `<title>` and OG tag reads `localhost:3000` until it runs.

`schema extract` runs with `--force` — it refuses to overwrite an existing `schema.json` without it. `pnpm --filter studio type` also runs a Biome pass over `packages/sanity` as its third step, so expect a formatting diff alongside the regenerated types.

Tests are Vitest, scoped to `apps/web`, and run from the root through Turbo (`pnpm test`) or directly (`pnpm --filter web test`). Specs live in `__tests__/` directories and are `.test.ts` — components are exercised with `createElement` + `renderToStaticMarkup`, not JSX, because the config's include glob matches `.ts` only.

## Skills

`.claude/skills/` holds tested playbooks. Prefer them over improvising:

| Skill | Use for |
|---|---|
| `add-pagebuilder-block` | Adding a block to the Sanity page builder |
| `enable-ai-assistant` | Adding the turbo-start-aisle AI shopping assistant — **inherited from upstream, and it documents _this_ repo.** Aisle already has the layer; the skill is for porting it into a plain turbo-start-shopify. Changing `packages/ai-commerce`'s public shape means opening an upstream PR to keep it true |
| `generate-thumbnails-agentic` | Page builder block thumbnails via Playwright MCP |

## Sanity Studio

- **Documents**: `blog`, `page`, `faq`, `author`, `category`, `product`, `collection`, `productVariant`, `redirect`
- **Singletons**: `homePage`, `blogIndex`, `collectionsIndex`, `settings`, `footer`, `navbar`, `promoBanner` — the `singletons` array in `apps/studio/schemaTypes/documents/index.ts` is the list. `sanity.config.ts` keeps a *second*, hardcoded list in `document.newDocumentOptions`; the two have already drifted, so a new singleton needs both
- **Page builder blocks**: defined in `apps/studio/schemaTypes/blocks/`, registered in `blocks/index.ts` — **the Studio-side registry, and the list to read before assuming which blocks exist**. Rendering needs two more registrations to agree: the GROQ fragment in `packages/sanity/src/query.ts` and `BLOCK_COMPONENTS` in `apps/web/src/components/pagebuilder.tsx`. A block present in one but not the others fails distinctly — see the `add-pagebuilder-block` skill
- **Shopify objects** (`apps/studio/schemaTypes/objects/shopify/`): synced read-only by Sanity Connect; never write to `store.*`
- **Blueprint** (`sanity.blueprint.ts`): auto-redirect function creating `redirect` documents on slug change
- **Structure**: `apps/studio/structure.ts`; presentation URL resolution in `apps/studio/location.ts`
- **Dependency pins**: `sanity`, `@sanity/vision` and the seven plugins in `apps/studio/package.json` are pinned to exact versions, not ranges. The Studio is held on the `@sanity/ui` v3 line and every package crosses to v4 at a patch bump, so a caret or tilde would put a second `@sanity/ui` in the tree. What pins the whole line is `sanity-plugin-lucide-icon-picker`: 1.0.3 is its latest and last release, and it imports `Popover`/`Menu` from the `@sanity/ui` root and `TrashIcon`/`SyncIcon`/`EllipsisHorizontalIcon` from the `@sanity/icons` root — all moved to subpaths in `@sanity/ui` v4 / `@sanity/icons` v5, so `sanity build` fails with `MISSING_EXPORT` the moment the Studio crosses. Crossing means replacing that plugin (it backs the `lucide-icon` field type used by navbar, footer and the icon cards). That migration has no ticket yet — raise one and record its ROB id here and in `.github/renovate.json` so the freeze has an owner. Do not loosen them or bump a Sanity plugin to `latest` without reading the comment in `pnpm-workspace.yaml` first; after any install, `pnpm --filter studio why @sanity/ui` must show 3.x only

## AI Commerce layer

`packages/ai-commerce` is standalone — it may import `@workspace/*` but **never** the web app's `@/` alias. Shapes shared with the app (`MoneyV2`, `ShopifyImage`, `SelectedOption`, `PRICE_BUCKETS`) are structurally duplicated in `packages/ai-commerce/src/types.ts` with pointer comments; keep them in sync.

Integration points in the web app:

| File | Role |
|---|---|
| `apps/web/src/app/api/chat/route.ts` | Streams via Vercel AI Gateway; wires MCP + client tools |
| `apps/web/src/components/ai-cart-bridge.tsx` | Listens for `ADD_TO_CART_EVENT`, maps it onto `useCartActions().addLine()` |
| `apps/web/src/components/page-context-tracker.tsx` | Writes route + surface on every navigation; read by `ChatPanel` and sent to the model |
| `apps/web/src/app/layout.tsx` | Mounts the three AI components inside `<Providers>` |

The chat cannot call app functions directly, so "add to cart" is a `window` CustomEvent (`ADD_TO_CART_EVENT`) carrying the full line metadata. `addLine(variantId, quantity, metadata)` requires a complete `LineMetadata` so the optimistic line can render before Shopify responds — build it with `buildLineMetadata()` from `apps/web/src/lib/cart/metadata.ts`. (AGENTS.md rule 3 covers the cart intent pipeline itself.)

Studio-side: `apps/studio/schemaTypes/documents/ai-assistant-settings.ts` backs the chat's empty state, seeded by `seed:ai-assistant` and read through `queryAiAssistantSettings` in `packages/sanity/src/query.ts`.

## Collection filters and search

Filters live entirely in the **URL** — there is no filter store. Parsed by `apps/web/src/components/collection/filter-utils.ts`: `filter.available`, `filter.price=<bucket>` (see `PRICE_BUCKETS`), `filter.vendor`, `filter.type`, `filter.tag`, `filter.option.<Name>`, `filter.category`; plus top-level `sort` / `reverse` (`sort-utils.ts`). The chat's `set-collection-filters` tool drives the same URL surface, which is why `PRICE_BUCKETS` is duplicated into `packages/ai-commerce`.

Search is one shared `search-panel.tsx` behind three surfaces: the `/search` page, an intercepted `@modal/(.)search` drawer, and the navbar toggle. Backed by `api/search`, `api/search/full`, `api/search/defaults`.

## Other

- **SEO**: `getSEOMetadata()` in `apps/web/src/lib/seo.ts`, OG images via `/api/og`
- **AI agent surfaces**: content negotiation serves Markdown to agents (`apps/web/src/proxy.ts`, `apps/web/src/app/api/markdown/route.ts`), plus `apps/web/src/app/llms.txt/route.ts`
- **Visual editing**: `VisualEditing` from `next-sanity` + `createDataAttribute` per block; draft mode via `/api/presentation-draft`
- **Redirects**: fetched from Sanity at Next.js build time via `queryRedirects` in `next.config.ts`
- **Node** >=24.10, **pnpm** 11.24.0 (workspace protocol, catalog in `pnpm-workspace.yaml`)
- **CI** (`.github/workflows/ci.yml`): lint, format:check, check-types, `test:coverage`, then a Studio build against `apps/studio/.env.example` — Vercel builds `apps/web` on every PR but not `apps/studio`, so that last step is the only thing catching a dependency that breaks `sanity build`

## Environment Variables

**Web** (`apps/web/.env`) — see `apps/web/.env.example`; all of these are validated in `packages/env/src/{client,server}.ts`, so a missing one fails the build rather than the request:

- `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION`, `NEXT_PUBLIC_SANITY_STUDIO_URL`
- `SANITY_API_READ_TOKEN`, `SANITY_API_WRITE_TOKEN`
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN` — required; `SHOPIFY_API_VERSION` defaults to `2026-04` (upstream still defaults to the deprecated `2025-01`)
- `NEXT_PUBLIC_STORE_CURRENCY` — ISO 4217, defaults to `GBP`
- `AI_GATEWAY_API_KEY`, `SANITY_CONTEXT_MCP_URL` — optional; `/api/chat` returns 503 until both are set. Only needed locally, since Vercel OIDC authenticates the Gateway on deployments
- `NEXT_PUBLIC_SITE_URL` — canonical origin, no trailing slash. Checked _before_ the Vercel vars, so it also overrides the generated `*.vercel.app` URL. Required off Vercel: `getBaseUrl()` otherwise falls back to `localhost:3000` and every canonical, OG URL and sitemap entry ships pointing there

**Studio** (`apps/studio/.env`): `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`, `SANITY_STUDIO_TITLE`, `SANITY_STUDIO_PRESENTATION_URL`, `SHOPIFY_ADMIN_ACCESS_TOKEN` (seed scripts only)

**Web** variables are validated via `@workspace/env` — see AGENTS.md for where a new variable must be registered.

**Studio variables are not.** `apps/studio` reads `process.env` directly in `sanity.config.ts`, `sanity.cli.ts`, `utils/helper.ts` and the scripts, with no schema validation — only a non-fatal `logger.warn` in `sanity.cli.ts` when `SANITY_STUDIO_PROJECT_ID` or `SANITY_STUDIO_DATASET` is unset. Everything else surfaces late. Add guards at the point of use, and give them a message that says which variable is missing.

The Sanity CLI loads both `.env` and `.env.local` into `process.env` before it evaluates `sanity.cli.ts`, and **`.env.local` takes precedence** — the same ranking Next.js uses on the web side. (The `import "dotenv/config"` in `sanity.cli.ts` reads `.env` only, but it is redundant under a `sanity` command for that reason.) Either file works; having both is the hazard, since `.env.local` silently wins.

## Syncing with upstream

```bash
git fetch upstream
# Substitute the "Last synced at" SHA at the foot of this section for <last-sync>.
git diff --name-only <last-sync> upstream/main   # what moved since the last sync
git diff HEAD upstream/main -- apps packages     # review before taking anything
```

The two histories are **unrelated** — `git merge-base HEAD upstream/main` returns nothing, because Aisle re-bases by copying trees rather than merging. So there is no `git merge` or `git rebase` path: port path-by-path with `git checkout upstream/main -- <path>`, driven by the diff against the last-synced SHA.

The AI layer is confined to `packages/ai-commerce`, the four integration files above, `apps/studio/schemaTypes/documents/ai-assistant-settings.ts`, the four `apps/studio/scripts/seed-*.ts`, and small deltas in `layout.tsx`, `query.ts`, `env/*`, `globals.css`, `turbo.json` and the studio config. Everything else can be taken from upstream wholesale.

Four Aisle-authored fixes upstream still lacks — check they survive every sync:

- the trailing-slash strip on `NEXT_PUBLIC_SANITY_STUDIO_URL` and the API-version regex, both in `packages/env/src/client.ts` (the one file where a blind `git checkout upstream/main --` silently drops work)
- `SHOPIFY_API_VERSION` defaulting to `2026-04` in `packages/env/src/server.ts`
- `getStudioHost()` returning `undefined` in `apps/studio/sanity.cli.ts`, so upstream's own hostname does not leak into forks

Aisle also deliberately drops upstream's `deploy-sanity.yml` workflow (needs workflow OAuth scope on first push) and its SonarQube step and `sonar-project.properties` (keyed to upstream's own Sonar project).

Last synced at upstream `0585593`.
