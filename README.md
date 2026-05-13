# Turbo Start Aisle

![Turbo Start Aisle](og.jpg)

> **Aisle** — a starter for headless Shopify with an AI shopping assistant baked in. Built on top of `turbo-start-shopify`, with a floating chat widget, page-context capture, AI-controlled filters, and inline product cards powered by **Vercel AI Gateway** (Claude Haiku 4.5 by default, with cross-provider failover) + Sanity Agent Context MCP.

The "AI" lives inside the word — and inside the chat bubble.

## Why Vercel AI Gateway

The chat route runs through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), not a direct provider SDK. That's the pitch of this starter:

- **One key, every provider.** Swap models by changing one string — `"anthropic/claude-haiku-4.5"` → `"openai/gpt-5-mini"` → `"google/gemini-3-flash"`. No new SDKs, no new keys, no code refactor.
- **Cross-provider failover built in.** The route configures a fallback chain (Anthropic → OpenAI → Google). If one provider is having a bad day, the gateway retries the next one automatically — the demo doesn't 503.
- **Unified observability + billing.** Every call shows up in one dashboard with latency, token usage, and cost across providers.
- **OIDC auth on Vercel.** No API key in production environments — Vercel deployments authenticate the gateway via OIDC token automatically. The `AI_GATEWAY_API_KEY` is only needed for local dev.

## What's added on top of turbo-start-shopify

- `packages/ai-commerce/` — chat widget UI, AI tool definitions, page-context React Query hooks, system prompt, Sanity Agent Context MCP wrapper.
- `apps/web/src/app/api/chat/route.ts` — Vercel AI Gateway route handler (multi-provider with failover + MCP tools + client tools).
- `apps/web/src/components/page-context-tracker.tsx` — keeps the chat aware of the current route.
- `apps/web/src/components/ai-cart-bridge.tsx` — bridges chat product cards' "Add to cart" event into the Shopify-backed cart context.
- New env entries (`AI_GATEWAY_API_KEY`, `SANITY_CONTEXT_MCP_URL`) — both optional; the chat route returns 503 until both are set (or, on Vercel, until `SANITY_CONTEXT_MCP_URL` is set — OIDC handles the gateway).

## Setup

### 1. Configure environment

Copy `apps/web/.env.example` → `apps/web/.env.local` and fill in values. **Always copy to `.env.local`** (not `.env`) — Next.js's `.env.local` overrides `.env`, and keeping both around leads to silent overrides during debugging.

You'll also need `apps/studio/.env` for the Sanity Studio. Both files are gitignored.

> **Note:** `pnpm build` resolves Sanity content (redirects, navigation) at compile time. Stub credentials pass env-schema validation but the build fails with `Dataset not found`. Use real Sanity creds, or run `pnpm dev` for development.

### 2. Deploy the schema & Studio

This has to happen **before** Sanity Connect for Shopify can sync products — Connect needs the `product` / `productVariant` schemas to exist in your dataset, and the AI assistant needs the deployed Studio (Studio v5.1.0+) before it can host an Agent Context document.

```bash
# Deploy schema and Studio (Studio hostname will be prompted on first run).
# Use `run deploy` — bare `pnpm --filter studio deploy` collides with pnpm's
# built-in `pnpm deploy` subcommand.
pnpm --filter studio run schema:deploy
pnpm --filter studio run deploy
```

> **First time?** Both commands need a Sanity account that has the `sanity.project/deployStudio` grant on the target project. If you see `Unauthorized - User is missing required grant sanity.project/deployStudio`, see the troubleshooting section below — you're logged in as the wrong user.

The CLI prints an Application ID after a successful first deploy and suggests pasting it into `sanity.cli.ts`. **Ignore that suggestion** — Application IDs are per-account, so a hardcoded id would break every fork of this starter. The current config resolves the right Application by `studioHost` on each deploy; you may see a one-time CLI prompt if you have multiple Applications under the same project, which is fine.

### 3. Sync Shopify products into Sanity

Now that the schema is live, install the [Sanity Connect for Shopify](https://apps.shopify.com/sanity-connect) app on your Shopify dev store. Point it at your Sanity project + dataset (matching `NEXT_PUBLIC_SANITY_PROJECT_ID` / `NEXT_PUBLIC_SANITY_DATASET`) and trigger an initial sync.

### 4. Publish an Agent Context document

The AI assistant won't respond until an Agent Context document exists in your deployed Studio — the MCP endpoint resolves to a specific published context by slug.

In your deployed Studio (`https://<your-hostname>.sanity.studio`):

1. Click **Agent Context** in the left sidebar → **+ Create new**
2. Fill in name + slug (e.g., `shop-assistant`) + an instructions string
3. **Publish**
4. Copy the **MCP URL** at the top of the published document. Format:

   ```
   https://api.sanity.io/v2026-04-30/agent-context/<projectId>/<dataset>/<slug>
   ```

### 5. Vercel AI Gateway key

The chat route is wired to Vercel AI Gateway, which is the unified endpoint for Anthropic, OpenAI, Google, and a long tail of other providers. **One key gets you all of them**, with built-in failover and a single dashboard for usage + spend.

Grab a key at https://vercel.com/dashboard/ai-gateway (free credits on signup; pay-as-you-go after).

> **Local dev only.** When this app is deployed to Vercel, the gateway authenticates via OIDC token automatically — you don't set `AI_GATEWAY_API_KEY` in your Vercel project env. It's only needed in `.env.local`.

Want to use a different default model? Change the `model:` string in `apps/web/src/app/api/chat/route.ts`. Want a different failover chain? Edit the `providerOptions.gateway.models` array. That's the whole change.

### 6. Final env entries

```bash
# In apps/web/.env.local
SANITY_CONTEXT_MCP_URL=https://api.sanity.io/v2026-04-30/agent-context/<projectId>/<dataset>/<slug>
AI_GATEWAY_API_KEY=<from https://vercel.com/dashboard/ai-gateway>
```

### 7. Boot

```bash
pnpm dev
```

Open http://localhost:3000. Click the bottom-right chat bubble. Ask *"show me products under $50"* or *"what brands do you have?"*.

## Troubleshooting

### `sanity schema deploy` fails with "missing required grant"

You're logged into the wrong Sanity account. Run:

```bash
pnpm --filter studio exec sanity logout
pnpm --filter studio exec sanity login
```

Pick the auth provider you used to create the org. Verify with `pnpm --filter studio exec sanity projects list` — your project should appear in the list.

### `sanity schema deploy` keeps reading the wrong project ID

A stale `apps/studio/dist/static/create-manifest.json` is overriding the env. Run `pnpm --filter studio clean` and try again — that's also baked into the `predeploy` and `schema:deploy` scripts now.

### Storefront image requests return 500 with `ENOTFOUND cdn.shopify.com`

Some VPNs (split-tunnel configurations especially) block or intercept Shopify's CDN. If `nslookup cdn.shopify.com` succeeds but `curl https://cdn.shopify.com/` returns HTTP 000, disable the VPN or whitelist `*.shopify.com` and `*.myshopify.com`.

### `/api/chat` returns 500 with "Only datasets with deployed Studio applications are supported"

You skipped step 2 above. Run `pnpm --filter studio deploy` to register a Studio for your dataset.

### Chat 500s with a gateway / provider error

Open the [AI Gateway dashboard](https://vercel.com/dashboard/ai-gateway) → **Logs** to see what the upstream call returned. Common cases:

- **Out of credits / billing not set up** → top up at the dashboard.
- **Single provider hard down** → the route already falls through to the next model in `providerOptions.gateway.models`, but if all three providers in the chain are degraded simultaneously you'll see a 500. Add another model to the chain or wait for status to clear.
- **Model ID typo** → confirm the model slug exists in the gateway model catalog (the dashboard lists every supported `creator/model-name` string).

## Reference checkouts

`.research/turbo-start-shopify/` and `.research/context-agent-sanity-test/` are read-only reference clones of the source projects. Both are gitignored. They are useful when modifying `packages/ai-commerce/` to compare against the original implementations.

---

## Acknowledgments

Turbo Start Aisle stands on the shoulders of two excellent projects. **Big thanks to the people who built them.**

### Sanity

The entire AI-commerce experience hinges on tooling Sanity has been quietly shipping over the past year:

- **[Sanity Studio v5](https://www.sanity.io/)** — the editing surface, schema layer, and visual editing primitives that make headless feel ergonomic.
- **[Sanity Connect for Shopify](https://apps.shopify.com/sanity-connect)** — the bridge that mirrors Shopify's product catalog into Sanity so it can be enriched, queried, and exposed to AI agents.
- **[Agent Actions](https://www.sanity.io/docs/agent-actions) and the Agent Context MCP** — a schema-aware MCP endpoint that gives any AI client structured, read-only access to a dataset. The chat assistant in this project would not exist without it.
- **[`@sanity/agent-context`](https://www.npmjs.com/package/@sanity/agent-context) and [`@sanity/agent-directives`](https://www.npmjs.com/package/@sanity/agent-directives)** — the Studio plugin and directive parser that let authors define what the AI sees and let assistants reference Sanity documents inline.

The Sanity team's bet that *content + AI* deserves first-class primitives — not just a chat box bolted onto a CMS — is exactly what makes building something like Aisle possible without a custom backend.

### Roboto Studio (`turbo-start-shopify`)

The entire commerce foundation of this project is [`robotostudio/turbo-start-shopify`](https://github.com/robotostudio/turbo-start-shopify), an opinionated, production-ready Shopify + Sanity + Next.js monorepo. We didn't reinvent any of it:

- The Turborepo + pnpm workspace layout, biome config, env validation, type generation, and Tailwind v4 + Shadcn setup.
- The Sanity schemas for `product`, `productVariant`, `collection`, page builder, blog, navigation, footer, SEO, redirects.
- The Shopify Storefront API client, cart server actions, cart UI, collection filtering, and checkout handoff.
- The deployment story (Vercel + Sanity-hosted Studio).

Aisle simply layered an AI assistant on top. **Huge thanks to the Roboto Studio team** for releasing such a complete, well-documented starter — and for keeping it MIT-licensed so projects like this one can build on it.

## Foundation

Turbo Start Aisle is built on top of [`robotostudio/turbo-start-shopify`](https://github.com/robotostudio/turbo-start-shopify) — see that repository for the underlying commerce stack documentation (page builder, blog, navigation, SEO, Shopify cart, Sanity Studio, deployment, etc.). The Aisle additions are limited to `packages/ai-commerce/` and the chat-related files in `apps/web/`.

The reference checkout at `.research/turbo-start-shopify/` is the exact upstream snapshot used during this build.
