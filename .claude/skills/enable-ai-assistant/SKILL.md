---
name: enable-ai-assistant
description: Use when adding the turbo-start-aisle AI shopping assistant to a turbo-start-shopify project — vendors packages/ai-commerce, wires the chat route and widget, adds the Sanity Agent Context schema, and guides the Sanity and AI Gateway setup. Use when the user says "add the AI assistant", "add the shopping assistant", "add aisle", or "add the chat widget".
---

# Enable the AI Shopping Assistant

## Overview

Ports the AI shopping assistant from [`robotostudio/turbo-start-aisle`](https://github.com/robotostudio/turbo-start-aisle) into a `turbo-start-shopify` project: a floating chat widget with page-context awareness, AI-driven collection filters, and inline product cards that add to the real Shopify cart.

The assistant reaches Sanity through **MCP (Agent Context)**, which is schema-aware at runtime. It does *not* query product data through `packages/sanity/src/query.ts`, so it does not drift against local GROQ fragments.

**Fallback behaviour is the point.** `AI_GATEWAY_API_KEY` and `SANITY_CONTEXT_MCP_URL` both default to an empty string, and `/api/chat` returns 503 until both are set. A project that ports the assistant but never finishes setup must still install, typecheck, build and serve normally. Never make these variables required.

**A third variable is involved but needs no changes.** The MCP client authenticates to Agent Context with `SANITY_API_READ_TOKEN` as a Bearer token — the route passes it straight through to `packages/ai-commerce/src/mcp/`. `turbo-start-shopify` already declares it as required (`z.string().min(1)` in `packages/env/src/server.ts`), so a working project always has one. Leave it exactly as it is. It is worth knowing about for one reason: it sits **outside** the 503 gate, which checks only the gateway credential and the MCP URL. It cannot be *empty* — `z.string().min(1)` rejects that at startup, before the app runs — but it can be **under-scoped**. A token without read access to the dataset the Agent Context document lives in gets past the gate and fails later as a 401 from MCP, which reads like a bad MCP URL.

## Source of truth

Aisle periodically resets its base to a `turbo-start-shopify` commit, then re-applies the AI layer on top. **Never hardcode that commit** — it goes stale within weeks. Derive it every run.

Clone aisle and find its sync point:

```bash
git clone --depth 50 https://github.com/robotostudio/turbo-start-aisle.git /tmp/aisle-src
git -C /tmp/aisle-src log --oneline -15   # look for "sync upstream <sha>" or "Reset foundation to <sha>"
git -C /tmp/aisle-src rev-parse HEAD      # record this — it goes in the vendored README
```

Then diff aisle against the local project **file by file** and apply only what is genuinely the AI layer. A full clone beats fetching raw files one at a time.

### Not every difference is the AI layer

This is the trap. The diff between aisle and this project contains three kinds of change, and only the first should be ported:

| Kind | Example | Action |
|---|---|---|
| **AI layer** | `structure.ts` AI Assistant list, `server.ts` env vars | port |
| **Aisle's branding** | `seo.ts` title/keywords/Twitter handle, `llms.txt` `SITE_TITLE` | **never port — it overwrites the user's site identity** |
| **Unrelated upstream work** | `client.ts` URL validation, `SHOPIFY_API_VERSION` bumps | don't port here; mention it to the user as a separate cherry-pick |

Before copying any shared file wholesale, read the diff and classify it. If a hunk does not mention AI, chat, agent, or the assistant, it is not this skill's business.

## Prerequisites

**STOP and check these before proceeding:**

1. **This is a `turbo-start-shopify` project.** `packages/sanity`, `packages/ui`, `packages/env` and `apps/studio` must exist. If not, stop.
2. **Working tree is clean.** `git status --short` must be empty. This skill edits shared files; the user needs a clean diff to review. If dirty, **STOP** and ask them to commit or stash.
3. **On a branch, not `main`.** If on the default branch, create one first.
4. **A working Sanity project already exists.** `apps/studio/.env` or `.env.local` must have a real `SANITY_STUDIO_PROJECT_ID`, and `pnpm --filter studio type` must pass *before* you change anything. Either file works — the Sanity CLI loads both before evaluating the config, and `.env.local` takes precedence. Use whichever exists; never create a second.

This skill adds the assistant to a project that already runs. It does not set turbo-start-shopify up from scratch. Almost every step depends on a live Sanity project: Part D deploys the Studio, and the Agent Context document can only be created inside a deployed Studio. (Typegen itself is local — it needs the project ID to build the CLI config, not to reach a server.)

If there is no project yet, stop and send the user through the template's own onboarding first — create a Sanity project, fill in both env files, import the seed dataset. Then come back. Running this skill first means failing at typegen with five new files already written.

## Before you start

Ask all of these and **wait for the user to answer before proceeding**:

1. **Do you have a Vercel AI Gateway account?** Free credits on signup at https://vercel.com/dashboard/ai-gateway. Needed for local dev; Vercel deployments authenticate via OIDC.
2. **Is your Sanity Studio deployed?** An Agent Context document cannot be created until it is. If not, Part D step 1 handles it.
3. **Which model and failover chain?** Default: Gemini 3 Flash → Claude Haiku 4.5 → GPT-5 Mini.
4. **Gate the widget behind `NEXT_PUBLIC_ENABLE_AI_ASSISTANT`?** Aisle itself does not — it ships the widget always and degrades to a 503. Recommend the flag here, so a user who ports but never configures doesn't get a dead chat bubble. Their call.
5. **How far has this project diverged from aisle's sync point?** With `<sync-sha>` from the step above, run:

   ```bash
   git log --oneline <sync-sha>..HEAD -- apps/web/src/app/layout.tsx apps/studio/structure.ts packages/sanity/src/query.ts
   ```

   Empty means the shared files can be taken wholesale. Any output means reconcile those files by hand instead.

   **In practice this is never empty for `query.ts`.** It has churned heavily upstream — portable-text members split into one fragment each, product and collection visibility gating added. Plan to reconcile it by hand and treat a wholesale copy as a bug.

## Process

```text
Part A  →  new files          (pure additions, low risk)
Part B  →  edits to existing  (the risky half — extend, never replace)
Part C  →  install + typegen
Part D  →  guided manual setup (stop at each gate)
Part E  →  verify
```

---

## Part A: New files

Pure additions. Nothing here can break existing behaviour.

**1. Vendor the package.** Copy `packages/ai-commerce/` from aisle in full:

```text
packages/ai-commerce/
  package.json
  tsconfig.json
  src/
    index.ts          system-prompt.ts    types.ts
    context/  lib/  mcp/  tools/  ui/
```

`src/ui/` is 7 components: `chat-panel`, `chat-widget`, `empty-state`, `message-input`, `message-list`, `product`, `text-part`.

Copy its `package.json` as-is. It carries `catalog:` references for `lucide-react` and `zod`, which resolve against the **local** `pnpm-workspace.yaml` catalog — `turbo-start-shopify` has both, so the specifiers resolve.

**Resolving is not the same as working.** This repo's catalog moved `lucide-react` to the v1 line and pins it there with a tree-wide `override`, while aisle's catalog is still on `^0.562.0`, so the vendored package cannot get the version it was written against. Check the icon imports before assuming the copy is clean:

```bash
grep -rn "lucide-react" packages/ai-commerce/src/
```

At the last dry run this was four icons in four files — `SparklesIcon`, `XIcon`, `ArrowUpIcon`, `MessageCircleIcon` — all still present in lucide 1.34.0, and the package typechecked clean. Re-run the grep rather than trusting that; the point is that it is a two-minute check, not that the answer is always no.

Editing `pnpm-workspace.yaml` is now hazardous in its own right: it holds the `overrides` that keep the Studio on the `@sanity/ui` v3 line, and pnpm drops the explanatory comments whenever it rewrites the file. If a variant's catalog genuinely lacks an entry, add it deliberately and check the comments survived.

**2. Record the source SHA.** Create `packages/ai-commerce/README.md` stating which aisle commit this was ported from and the date. Without it there is no way to ever diff or update the vendored copy.

Use the revision you already resolved in "Source of truth" — the clone at `/tmp/aisle-src` is what you copied from:

```bash
git -C /tmp/aisle-src rev-parse HEAD
```

**Do not re-fetch `main` separately.** It can have moved since the clone, which would record a SHA whose contents you never copied — the one thing this README exists to prevent.

If the sync commit could not be found in the shallow log, deepen it (`git -C /tmp/aisle-src fetch --deepen 50`) and look again. If it still cannot be resolved, **stop and tell the user** rather than falling back to whatever `main` points at.

**3. Add the `textarea` primitive.** It is the one shadcn component `packages/ui` lacks and `src/ui/message-input.tsx` needs:

```bash
pnpm dlx shadcn@latest add textarea -c packages/ui --yes
```

Use the CLI. Do not hand-write it. (Check first — a later `turbo-start-shopify` may already ship it.)

**3b. Install dependencies before going any further.**

Steps 1-3 are pure file additions and need nothing installed. Everything from here does: typegen loads the Studio config, which imports `agentContextPlugin`, and the vendored package imports `ai` and `@ai-sdk/*`. Installing late is the single most common way to get stuck.

```bash
pnpm --filter studio add "@sanity/agent-context@0.6.0"
pnpm --filter web add "ai@^6.0.175" "@ai-sdk/gateway@^3.0.112" "@ai-sdk/react@^3.0.0"
```

**Pin the Studio dependency exactly — no caret.** `apps/studio` pins `sanity`, `@sanity/vision` and its seven Sanity plugins at exact versions. Note this is not "pin everything from the Sanity org": `@sanity/ui`, `@sanity/icons`, `@sanity/asset-utils`, `@sanity/functions` and `@sanity/uuid` stay on carets on purpose, and `.github/renovate.json` caps the first two at `<4` rather than disabling them so patch and security fixes still land inside v3. Do not convert those caps into pins. A plugin on a range is the thing that breaks the policy, and Renovate has no rule for a package it has not seen. Add a matching entry to `.github/renovate.json` so the pin has an owner, and run the check the repo mandates:

```bash
pnpm --filter studio why @sanity/ui   # must show 3.x only
```

Then update and commit the lockfile — CI installs with `--frozen-lockfile` and will fail on a stale one.

### Read this before changing the agent-context dependency

`@sanity/agent-context` is **deprecated**. npm's notice reads *"Renamed to @sanity/context"*. Its last release is 0.6.0, which declares `peerDependencies.sanity: "^5"` while this repo is on Sanity 6. Both facts look like reasons to switch to the successor. **Do not.** Verified by dry run against this repo:

| Package | Peers `sanity` | Result here |
|---|---|---|
| `@sanity/agent-context@0.6.0` | `^5` (unmet) | **Works.** `schema extract` and `sanity build` both pass |
| `@sanity/context@1.0.0` | `^6` (correct) | **Breaks.** Extract and build fail |

`@sanity/context@1.0.0` peers `@sanity/icons: ^5`, and resolving that makes extraction fail with:

```text
Error: "./Copy" is not exported under the conditions ["module","node","development","import"]
from package .../@sanity+context@1.0.0/node_modules/@sanity/icons
```

Forcing `@sanity/icons` back to the v3 line with a pnpm `override` does not fix it — it relocates the same error onto `sanity`'s own copy. Migrating to `@sanity/context` means resolving the `@sanity/icons` freeze that CLAUDE.md documents, which is its own piece of work. **Raise a ticket; do not attempt it inside this port.**

So: install the deprecated package deliberately, and leave a comment saying why. The unmet `sanity` peer is only a warning — note that `sanity-plugin-lucide-icon-picker@1.0.3` already ships an unmet `sanity: ^3` peer in this repo and works fine, so an unmet Sanity peer is not on its own evidence of breakage here.

Two things the dry run confirmed you do **not** need to worry about:

- **The `@sanity/ui` freeze holds.** `pnpm --filter studio why @sanity/ui` reports `3.5.3` only, with or without this package. Run the check anyway, but it is not expected to fail.
- **Two `@sanity/icons` copies in the tree (3.8.0 and 5.2.1) is the normal baseline.** `sanity@6` resolves its own v5 copy while `apps/studio` holds v3 for the icon picker. That predates the port; it is not a symptom of it.

Verify the pinned `ai` / `@ai-sdk/*` versions still line up before installing — they move fast, and `@sanity/agent-context@0.6.0` peers `ai: ^6.0.175`. If aisle's `package.json` has moved to a newer line, follow aisle rather than the numbers written here.

Why each matters:
- `@sanity/agent-context` — `sanity.config.ts` imports `agentContextPlugin` from the **`/studio` subpath** (`@sanity/agent-context/studio`), not the package root. Without the dependency the Studio config throws and `sanity schema extract` fails on load.
- `ai`, `@ai-sdk/*` — `apps/web/src/app/api/chat/route.ts` imports them directly. They are dependencies of `packages/ai-commerce`, and pnpm's strict `node_modules` will **not** hoist them to `apps/web`. Symptom: `Cannot find module 'ai'`.

Also add the workspace link in `apps/web/package.json`:

```jsonc
"@workspace/ai-commerce": "workspace:*"
```

Then `pnpm install`.

**4. New app files** — copy from aisle:

| Path | Purpose |
|---|---|
| `apps/web/src/app/api/chat/route.ts` | AI Gateway handler, MCP client, failover chain |
| `apps/web/src/components/page-context-tracker.tsx` | Keeps the chat aware of the current route |
| `apps/web/src/components/ai-cart-bridge.tsx` | Bridges chat "add to cart" into `CartProvider` |
| `apps/studio/schemaTypes/documents/ai-assistant-settings.ts` | Agent Context settings document |
| `apps/studio/scripts/seed-ai-assistant.ts` | Seeds the `aiAssistantSettings` singleton — welcome copy and suggested prompts. It does **not** create the Agent Context document; Part D step 2 is manual |

---

## Part B: Edits to existing files

**This is the risky half.** Every file below already exists and is in use. **Extend it; never replace it wholesale.** Read the local file first, read aisle's version second, and apply only the delta.

**1. `apps/web/src/app/layout.tsx`** — mount the three components **inside `<Providers>`**, alongside the existing `{modal}` / `<CartToasts />` / `<Toaster />` group near the end:

```tsx
<PageContextTracker />
<AiCartBridge />
<ChatWidget currencyCode={env.NEXT_PUBLIC_STORE_CURRENCY} />
```

Ordering is not cosmetic — `PageContextTracker` needs `QueryClientProvider`, `AiCartBridge` needs `CartProvider`, and `ChatWidget` queries Sanity through react-query. All three are supplied by `Providers`. Mounting them outside it throws at runtime.

If the user chose the feature flag, wrap all three in the `env.NEXT_PUBLIC_ENABLE_AI_ASSISTANT` check.

Also offset the existing `<Toaster>` so it doesn't sit under the fixed chat launcher. Aisle uses `bottom: 5.5rem, right: 1rem`.

**Make that offset conditional on the same flag.** Aisle has no flag, so its offset is unconditional and porting it verbatim leaves toasts floating above an empty corner whenever the assistant is off. Tie the offset to the flag, not to the port.

**2. `packages/sanity/src/query.ts`** — add the `aiAssistantSettings` fetch (~8 lines). This is the *only* GROQ the assistant needs. Do not add product fragments for it; product data comes through MCP.

**3. Studio wiring:**
- `apps/studio/schemaTypes/documents/index.ts` — register `aiAssistantSettings`
- `apps/studio/structure.ts` — add the AI Assistant list (`aiAssistantSettings` singleton + `sanity.agentContext` list)
- `apps/studio/sanity.config.ts` — `agentContextPlugin()` + add `aiAssistantSettings` to the hardcoded array in `document.newDocumentOptions`. **There are two singleton lists** — the `singletons` export in `schemaTypes/documents/index.ts` (step above) and this one — and they have already drifted from each other upstream. A new singleton needs both; missing this one leaves it creatable from the global "+ Create" menu

**4. `packages/ui/src/styles/globals.css`** — add the Tailwind source glob for the vendored package:

```css
@source "../../../ai-commerce/**/*.{ts,tsx}";
```

Without it Tailwind never scans `ai-commerce`, and **the entire chat UI renders unstyled** — no error, no warning, just a broken-looking widget.

### Files that look like they need editing but do not

Verified by diffing a synced aisle against this project. Check each before assuming:

| File | Reality |
|---|---|
| `apps/web/src/lib/markdown/*.ts` | **Zero delta.** These came *from* turbo-start-shopify; once aisle syncs upstream they are identical. Do not touch them, and do not budget risk for them |
| `apps/web/src/app/api/markdown/route.ts` | Zero delta, same reason |
| `apps/web/src/lib/seo.ts` | Delta is **aisle's branding** — title, description, `@akintola4`, aisle keywords. **Porting it overwrites the user's site identity.** Skip |
| `apps/web/src/app/llms.txt/route.ts` | Delta is one line: `SITE_TITLE`. Branding. Skip |
| `packages/env/src/client.ts` | Delta is unrelated upstream work (API-version regex, Studio-URL trailing-slash strip). Not the AI layer — mention it as a separate cherry-pick. Only touch this file if the user chose the feature flag |
| `packages/env/src/server.ts` → `SHOPIFY_API_VERSION` | Aisle bumps it. Not the AI layer. **Leave the local value alone** |

If a diff in this table is non-zero in your run, re-read it before acting — aisle may have genuinely changed something. The rule is classify-then-port, not copy-then-hope.

**5. `packages/env/src/server.ts`** — add these two, and **only** these two. Both **optional**, empty-string defaults:

```ts
AI_GATEWAY_API_KEY: z.string().default(""),
SANITY_CONTEXT_MCP_URL: z.string().default(""),
```

Optional is load-bearing: `/api/chat` returns 503 until both are set, so an unconfigured project still installs, typechecks and builds. Making them required breaks the build for everyone who ports but doesn't configure.

If the user chose the flag, add `NEXT_PUBLIC_ENABLE_AI_ASSISTANT` to `packages/env/src/client.ts`:

```ts
NEXT_PUBLIC_ENABLE_AI_ASSISTANT: z
  .enum(["true", "false", ""])
  .default("false")
  .transform((value) => value === "true"),
```

Two details that both bite:
- Client vars need an `experimental__runtimeEnv` entry. Server vars don't. Omitting it means the value is always `undefined` at runtime.
- The `""` member is deliberate. Without it a bare `NEXT_PUBLIC_ENABLE_AI_ASSISTANT=` line in an env file fails the build.

**6. `turbo.json`** — add the two server variables to `globalEnv`: `AI_GATEWAY_API_KEY` and `SANITY_CONTEXT_MCP_URL`.

**The feature flag does not go there.** `globalEnv` lists no `NEXT_PUBLIC_*` at all — Turborepo's framework inference already hashes those for a Next.js app, so adding it would break the pattern for no gain. Aisle's own `turbo.json` adds only these two as well.

**7. `apps/web/.env.example`** — document them, including that the gateway key is local-dev-only because Vercel uses OIDC.

**8. `apps/studio/package.json` scripts.** Four scripts that do not exist in this repo — Part D depends on `schema:deploy`, so this is not optional:

```jsonc
"clean": "rm -rf dist schema.json .sanity",
"predeploy": "pnpm run clean",
"schema:deploy": "pnpm run clean && sanity schema extract --enforce-required-fields --force && sanity schema deploy",
"seed:ai-assistant": "sanity exec scripts/seed-ai-assistant.ts --with-user-token"
```

`--force` matches the repo's own `extract` and `type` scripts — extract refuses to overwrite an existing `schema.json` without it. `clean` includes `.sanity` because it is one of the build outputs declared in `turbo.json`.

Note `sanity schema deploy` is a different command from `sanity deploy` — the first publishes the schema so Agent Context can read it, the second publishes the Studio. Both are needed.

---

## Part C: Generate and check

Dependencies were installed in Part A step 3b. If you skipped that, go back — the first two commands here will fail.

```bash
pnpm --filter studio type    # extract + typegen + a Biome pass over packages/sanity
pnpm check-types
pnpm lint
pnpm format:check
pnpm test
```

`pnpm --filter studio type` runs three steps, not two — the third is `pnpm --filter @workspace/sanity format`, so expect a formatting diff alongside the regenerated types.

**`format:check` is not optional.** Biome's `files.includes` covers `packages/*/src/**`, so the vendored `packages/ai-commerce/src/**` is format-checked like any other package, and CI runs it. Aisle's formatting matched this repo's at the last dry run, but the two repos' Biome versions drift independently, so check rather than assume.

**Failures seen in real runs, with the messages they actually produce:**

| Symptom | Real cause |
|---|---|
| `Cannot find module 'ai'` in `api/chat/route.ts` | `ai` / `@ai-sdk/*` are deps of `packages/ai-commerce`, not `apps/web`. pnpm won't hoist them |
| `Module '"@workspace/sanity/query"' has no exported member 'queryAiAssistantSettings'` and the matching `QueryAiAssistantSettingsResult` | Ordering. Part B step 2 has not run, or typegen has not run since. Not a missing dependency |
| `Cannot find module '@workspace/ui/components/textarea'` | Part A step 3 was skipped |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Dependencies were added but `pnpm-lock.yaml` was not updated. CI installs `--frozen-lockfile` |

Those middle two are the whole of what a correctly ordered port has left to do: dry-run verified, once the textarea exists and typegen has run, `packages/ai-commerce` typechecks clean against Sanity 6 and lucide v1 with no further changes.

### `SchemaExtractionError: Failed to load configuration file`

The cause this skill introduces is **`@sanity/agent-context` not installed** — `sanity.config.ts` imports `agentContextPlugin` and throws on load. Installing the dep before typegen is why step 3b orders it that way. Unmask it to confirm:

```bash
cd apps/studio && pnpm exec tsx -e 'import("./sanity.config.ts").catch(e => console.log(e.message))'
```

A *missing env file* used to produce this same causeless message. It no longer produces any failure at all: ROB-2522 relaxed the `NODE_ENV` guard in `apps/studio/utils/helper.ts`, and extraction now completes without a project ID, warning rather than throwing. Verified on a fresh clone with no env file. So if extraction fails, the env file is not the reason — look at the plugin.

Two related claims that are **not** true, in case an older version of this skill or another agent repeats them: extraction does not reach the Sanity API (it is local; the project ID is for CLI config validation), and `apps/web`'s env file is not involved at all — `apps/studio` has no `@workspace/env` dependency and nothing in the extraction path reads it.

If unmasking points at neither, bisect against a genuinely clean `HEAD`. **`git stash` alone is not enough** — most of this port is untracked (`packages/ai-commerce/`, the new routes and components), so a plain stash leaves it all in place and the bisect proves nothing.

Use a throwaway worktree, which cannot disturb the work in progress:

```bash
git worktree add /tmp/bisect-head HEAD
cd /tmp/bisect-head && pnpm install && pnpm --filter studio type
```

Or stash including untracked files, if you prefer to stay in place:

```bash
git stash push -u -m "ai-assistant port"
```

Either way, if it still fails the cause is pre-existing and has nothing to do with this skill. Remember to `git worktree remove /tmp/bisect-head` or `git stash pop` afterwards — and check `git stash list` first, since the index shifts if other stashes exist.

**Do not blame module resolution.** `lucide-react/dynamic` is a standing suspect because the package ships no `exports` map. Check before acting on it:

```bash
cd apps/studio && node -e 'console.log(require.resolve("lucide-react/dynamic"))'
```

On 1.34.0 that **resolves** — no `exports` field means Node falls back to legacy path resolution, which finds `dynamic.js`. So there is no resolution failure to fix, and the Sanity CLI does not load the config through CJS `require` anyway. This was chased once and a `.mjs` specifier plus a `declare module` shim were shipped for it; both were reverted once the real cause was found, so `apps/studio/lucide-dynamic.d.ts` no longer exists. Do not reintroduce them.

Do not read `roboto-shopify.sanity.studio` in the CLI output as proof the Studio is deployed. That is `getStudioHost()`'s fallback for an empty project ID.

`ai-commerce` will also fail `check-types` with *"`@workspace/sanity/types` has no exported member `QueryAiAssistantSettingsResult`"* until typegen has run. That one is ordering, not a missing dep — run typegen first and it resolves.

Expected clean state: `check-types` passes, `lint` passes with a handful of warnings, `format:check` is clean, and the suite passes (24 spec files, 191 cases at time of writing — treat that as a rough floor, not an exact target; it grows).

All of them must pass before Part D.

**Then the test that matters most — run it before the happy path:**

```bash
pnpm build     # with NO AI env vars set
```

Then the gate CI runs that this list used to miss — Vercel builds `apps/web` on every PR but **not** `apps/studio`, so a Studio dependency that breaks `sanity build` merges green without it:

```bash
cp apps/studio/.env.example apps/studio/.env   # placeholders are enough
pnpm turbo run build --filter=studio
```

This is the step most likely to catch a bad `agentContextPlugin()` — it builds the Studio against placeholder credentials, which is exactly the condition a newly added plugin tends to throw under. If you already have a real `apps/studio/.env`, keep it and skip the `cp`.

Both must succeed, and the site must serve normally. A user who ports the assistant and never configures it must not end up with a broken project.

If it fails, read the error rather than assuming a cause. Required env vars are the likeliest one — check Part B step 5 has both as `.default("")` — but a missing dependency or an unrelated failure produces a failed build too. When the message doesn't clearly name env validation, bisect against a clean `HEAD` using the method above instead of guessing.

Note the widget still *renders* when unconfigured, unless the feature flag is in use; it just 503s on use. That is aisle's own behaviour and why the flag in gating question 4 is worth recommending. Part E step 2 has the full expectations table.

---

## Part D: Guided manual setup

These steps need a human. **Stop at each gate and wait — do not guess values.**

**1. Deploy the Studio**

```bash
pnpm --filter studio run schema:deploy
pnpm --filter studio run deploy
```

Needs a Sanity account with `sanity.project/deployStudio` permission. If this fails with a login error, have the user run `pnpm --filter studio exec sanity logout` then `login`.

**2. Create the Agent Context document**

**This step is manual. There is no script for it.**

`pnpm --filter studio seed:ai-assistant` seeds the `aiAssistantSettings` singleton, which holds the widget's welcome copy and suggested prompts. That is a **different document** and it does not produce an MCP URL. Run it if you want the welcome state populated, but it is not a substitute for this step.

In the deployed Studio (`https://<hostname>.sanity.studio`):
1. **AI Assistant → Agent Context → + Create new**
2. Enter a name, a slug (e.g. `shop-assistant`), and instructions for the assistant
3. **Publish** — an unpublished document will not resolve

Confirm with the user what instructions the assistant should carry. They shape its tone and what it will and won't answer, and are worth getting right rather than defaulting.

**2b. Create and publish `aiAssistantSettings` too.** Separate document, separate failure. Studio → **AI Assistant → Welcome & Suggestions**, or run `pnpm --filter studio seed:ai-assistant`. Either way it must be **published** — left as a draft, the chat opens with a bare welcome panel and no suggested prompts, which reads like a broken widget rather than missing content.

Verify both exist and neither is a draft (a `drafts.` prefix on `_id` means unpublished):

```groq
{
  "agentContexts": *[_type == "sanity.agentContext"]{_id, name, "slug": slug.current},
  "settings": *[_id == "aiAssistantSettings"][0]
}
```

**3. Copy the MCP URL**

Copy it from the Agent Context document in the deployed Studio rather than assembling it by hand — the Studio emits the URL for the document you just published, including the API version it expects. Expect this shape:

```text
https://api.sanity.io/<apiVersion>/agent-context/<projectId>/<dataset>/<slug>
```

Do not hardcode the version. It was `v2026-04-30` when this was written, and a stale one fails as an unhelpful 404.

**4. Get an AI Gateway key** from https://vercel.com/dashboard/ai-gateway.

**5. Write these into the web app's env file**

```bash
SANITY_CONTEXT_MCP_URL=<the URL copied from the Studio in step 3>
AI_GATEWAY_API_KEY=<key>
```

**If the user chose the feature flag in question 4, add it here too:**

```bash
NEXT_PUBLIC_ENABLE_AI_ASSISTANT=true
```

It defaults to `false`, so skipping this line leaves the widget unmounted no matter how correct everything else is — no bubble, no error, nothing to debug. Setting the keys is not enough on its own.

**Do not add `SANITY_API_READ_TOKEN` here — check it is already set.** The project needs it regardless (it is required in `packages/env/src/server.ts`), and Agent Context uses it as its Bearer token. If the chat returns 401 from MCP while the URL is demonstrably correct, this token is the thing to check: it must have read access to the dataset the Agent Context document lives in.

**Use whichever file the project already has, and never create both.** `CLAUDE.md` documents `apps/web/.env` as this repo's convention, and `.env` works fine on its own. The hazard is precedence: Next.js ranks `.env.local` above `.env`, so if values go in `.env` and someone later adds a `.env.local`, the assistant silently 503s with no obvious cause.

Check which one exists first — but note `ls apps/web/.env*` also lists `.env.example`, which is committed and is **not** a target. List only the ignored ones:

```bash
git status --porcelain --ignored apps/web | grep -E '\.env'
git check-ignore -v apps/web/.env apps/web/.env.local
```

Write to whichever real env file the project already has, and confirm it is gitignored before putting a key in it.

**If both exist, stop and ask which one is the source of truth.** Do not guess and do not write to both. `.env.local` outranks `.env`, so a key written to the loser is invisible and the assistant 503s with nothing to debug. Once the user picks, write only there and leave the other alone.

**If neither exists** — a fresh clone ships only `.env.example` — create exactly one, and never write secrets into the tracked example:

```bash
cp apps/web/.env.example apps/web/.env
git check-ignore -v apps/web/.env    # must print a match before you add a key
```

---

## Part E: Verify

Run these in order. Step 2 is the one that matters most.

1. `pnpm install && pnpm check-types && pnpm lint && pnpm format:check && pnpm test` — all clean. This is what CI runs; `format:check` and the Studio build (step 2) are the two gates most easily forgotten.
2. **Negative test — do this before the happy path.** With no AI env vars set, `pnpm build` must succeed and the site must serve normally. A user who ignores the assistant must not end up with a broken project.

   What you should see depends on the question-4 answer:

   | Flag | Expected |
   |---|---|
   | Not used | The chat bubble **renders**; using it returns 503. This is aisle's own behaviour |
   | Used, set to `false` | No chat bubble at all, and the `Toaster` sits in its original position |

   If the build fails, read the error before concluding anything. Required env vars are only one cause — go to Part B step 5 and confirm both are `.default("")`. A missing module, a resolution failure or an unrelated error means the cause is elsewhere; use the bisect in Part C instead of assuming.
3. `pnpm dev` → open http://localhost:3000, click the chat bubble, ask *"show me products under $50"*. Expect real products from the Sanity dataset.

   **No bubble at all?** If the flag is in use, check `NEXT_PUBLIC_ENABLE_AI_ASSISTANT=true` is actually in the env file — it defaults to `false`, and an unmounted widget looks identical to a broken port. Also confirm the `experimental__runtimeEnv` entry exists in `packages/env/src/client.ts`; without it the value reads `undefined` at runtime however you set it. Restart `pnpm dev` after either change — `NEXT_PUBLIC_` vars are inlined at build time.
4. Ask it to filter a collection. Confirm it actually drives `apps/web/src/components/collection/filter-panel.tsx`.
5. Add to cart from an inline product card. Confirm the line reaches the real Shopify cart, not a local mock.
6. Visit `/llms.txt` and a `/api/markdown` URL. Neither should have been modified — this is a regression check that they still render, and that nothing from aisle leaked into them. If either shows aisle's site title, you ported branding. See the Part B table.
7. Check https://vercel.com/dashboard/ai-gateway → Logs for the request. To test failover, set a bogus primary model and confirm it falls through.
8. Confirm `packages/ai-commerce/README.md` records the aisle SHA.

---

## Common Mistakes

- **Mounting the AI components outside `<Providers>`.** Throws at runtime — they need `QueryClientProvider` and `CartProvider`.
- **Adding a second `QueryClientProvider`.** `apps/web/src/components/providers.tsx` already has one.
- **Making the env vars required.** Breaks the build for everyone who hasn't set up the assistant. They default to `""`; the route returns 503.
- **Creating a second env file.** Both `.env` and `.env.local` work, for `apps/web` and `apps/studio` alike, and `.env.local` outranks `.env` in both. Having both means `.env.local` silently wins and the assistant 503s for no visible reason.
- **Caret-ranging a Sanity plugin.** `apps/studio` pins `sanity`, `@sanity/vision` and its seven plugins exactly; a range on one of those risks a second `@sanity/ui` in the tree. It does not pin `@sanity/ui`, `@sanity/icons`, `@sanity/asset-utils`, `@sanity/functions` or `@sanity/uuid` — those stay on carets on purpose.
- **Skipping `format:check` or the Studio build.** Both are CI gates. A port can pass every other check and still fail at merge.
- **Editing the markdown lib at all.** Its delta against a synced aisle is zero. Leave it alone.
- **Installing dependencies late.** `@sanity/agent-context` and `ai`/`@ai-sdk/*` must land before typegen, or you get two misleading errors. See Part A step 3b.
- **"Fixing" the deprecation by switching to `@sanity/context`.** It is the correctly-peered successor and it breaks this repo — `@sanity/icons` v5 makes schema extraction fail. See Part A step 3b.
- **Skipping the `globals.css` `@source` line.** Tailwind never scans the vendored package and the chat UI renders unstyled, with no error explaining it.
- **Hardcoding aisle commit SHAs.** They go stale in weeks. Derive the sync point each run.
- **Hand-editing `packages/sanity/src/sanity.types.ts`.** Generated — run `pnpm --filter studio type`.
- **Hand-writing `textarea.tsx`.** Use the shadcn CLI.
- **Adding GROQ fragments for product data.** Products come through MCP. `query.ts` changes only for the settings document.
- **Copying `SHOPIFY_API_VERSION` from aisle.** Aisle defaults to `2026-04`, this repo to `2025-01`. Not part of the AI layer — leave it alone.
- **Forgetting to publish the Agent Context document.** A draft will not resolve, and the failure looks like a bad MCP URL.
- **Adding the feature flag but never setting it to `true`.** It defaults to `false`, so every other step can be correct and the widget still never mounts. Part D step 5 sets it.
- **Running this skill on a project with no Sanity project yet.** Part D deploys the Studio and the Agent Context document can only be created inside a deployed one, so the port strands partway with files already written. Check Prerequisite 4 first.

## Red Flags — STOP If You Notice These

- **You are about to commit an env file or paste a key into source.** Never. Credentials go in the project's existing gitignored env file — whichever one it already has — and nowhere else. See Part D step 5.
- **You are about to echo a raw error from `/api/chat` to the client.** The route deliberately does not — raw errors can leak `SANITY_API_READ_TOKEN` or `AI_GATEWAY_API_KEY`.
- **You are removing the 4MB request cap or the 8-step tool ceiling.** Both exist to bound spend on an endpoint that costs real money per call. Keep them.
- **The user is about to deploy this publicly.** `/api/chat` is **unauthenticated and consumes paid AI Gateway and MCP resources** — aisle's own source carries this warning. Tell the user plainly, before they deploy, that they need auth and rate limiting first. Do not bury it in a summary.
- **You are about to copy `seo.ts` or `llms.txt/route.ts` from aisle.** Those diffs are aisle's branding — site title, description, `@akintola4`, aisle keywords. Porting them silently replaces the user's site identity. **This is the most damaging mistake available in this skill.** Verified in a real dry run.
- **You are copying a shared file wholesale without reading its diff.** Classify every hunk first: AI layer, aisle branding, or unrelated upstream work. Only the first gets ported.
- **`pnpm build` fails with no AI env vars set.** The variables were made required. Fix that before anything else — it breaks every user who ports but doesn't configure.
- **`pnpm test` fails.** Nothing in this port should touch tested code. If tests break, you edited something you shouldn't have.
- **The project has diverged from aisle's sync point.** The shared files have local changes. Reconcile by hand and tell the user which files needed judgement calls. `query.ts` in particular is effectively always divergent.
- **You are about to loosen a Studio pin or add a pnpm `override` to resolve a peer warning.** The freeze is deliberate and CLAUDE.md carries the reasoning. An unmet `sanity` peer is normal in this repo. Stop and report rather than working around it.
- **You are about to blame this port for a build failure without bisecting.** Re-run the failing command against a clean `HEAD` first — in a throwaway worktree, or after `git stash push -u`. A plain `git stash` leaves the untracked half of the port behind and tells you nothing. A masked error like `Failed to load configuration file` may be pre-existing and have nothing to do with the assistant. Check the lockfile too, to rule out an install having bumped a version.
- **You are porting a layout tweak that assumes the assistant is always on.** Aisle has no feature flag, so anything positional it does (the `Toaster` offset, spacing around the launcher) is unconditional. Under a flag, tie it to the flag.
