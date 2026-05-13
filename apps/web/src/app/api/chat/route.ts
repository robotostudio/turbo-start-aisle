import {
  buildSystemPrompt,
  clientTools,
  createSanityAgentContextClient,
} from "@workspace/ai-commerce";
import { env } from "@workspace/env/server";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * SECURITY NOTE: this endpoint is unauthenticated and consumes paid AI Gateway
 * + MCP resources. Before deploying publicly, add auth (Clerk/Auth.js/etc.)
 * and rate-limiting (e.g. Upstash Ratelimit, Vercel Web Application Firewall)
 * — both are out of scope for this demo.
 */

// 4 MB cap — accommodates the screenshot follow-up flow (data-URL JPEGs typically
// 200-800 KB after the 1600px / 0.6 quality clamp in capture-context.ts) plus
// long message histories. Larger values risk wasting gateway quota on accidents.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

const userContextSchema = z
  .object({
    documentTitle: z.string().max(500),
    documentDescription: z.string().max(2000).optional(),
    documentLocation: z.string().max(2000),
  })
  .nullable()
  .optional();

const requestSchema = z.object({
  messages: z.array(z.unknown()).max(200),
  userContext: userContextSchema,
});

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  // Auth gate: locally we need AI_GATEWAY_API_KEY. On Vercel, the gateway
  // uses OIDC tokens automatically, so the key is optional — presence of the
  // VERCEL env var is the signal that OIDC will handle auth.
  const hasGatewayAuth =
    Boolean(env.AI_GATEWAY_API_KEY) || Boolean(process.env.VERCEL);
  if (!hasGatewayAuth || !env.SANITY_CONTEXT_MCP_URL) {
    return jsonError(
      503,
      "AI assistant requires configuration. Set AI_GATEWAY_API_KEY (locally) and SANITY_CONTEXT_MCP_URL — see README.",
    );
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonError(413, "Request body too large.");
  }

  const raw = await req.text();
  if (raw.length > MAX_REQUEST_BYTES) {
    return jsonError(413, "Request body too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const result = requestSchema.safeParse(parsed);
  if (!result.success) {
    return jsonError(400, "Invalid request shape.");
  }
  const { messages, userContext } = result.data;

  const mcpClient = await createSanityAgentContextClient({
    url: env.SANITY_CONTEXT_MCP_URL,
    token: env.SANITY_API_READ_TOKEN,
  });

  try {
    const mcpTools = await mcpClient.tools();
    const result = streamText({
      // Routes through Vercel AI Gateway via the "creator/model" string form.
      // Swap providers by changing this string; the gateway handles the rest.
      model: "anthropic/claude-haiku-4.5",
      providerOptions: {
        gateway: {
          // Cross-provider failover: if the primary errors or rate-limits,
          // the gateway retries each fallback in order. Three providers means
          // the chat survives any single-provider outage.
          // https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
          models: ["openai/gpt-5-mini", "google/gemini-2.5-flash"],
        },
      },
      system: buildSystemPrompt({ userContext: userContext ?? null }),
      messages: await convertToModelMessages(messages as never),
      tools: { ...mcpTools, ...clientTools },
      // 5-step cap as a safety belt against runaway tool loops. Bump higher
      // for richer multi-step tool use; gateway rate limits are configurable
      // per key in the Vercel dashboard.
      stopWhen: stepCountIs(5),
      onFinish: async () => {
        await mcpClient.close();
      },
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    await mcpClient.close();
    // Log server-side; do not echo the raw error to the client because upstream
    // errors from the AI SDK / MCP client / gateway may include header values
    // like the SANITY_API_READ_TOKEN or AI_GATEWAY_API_KEY Bearer tokens.
    console.error("/api/chat handler error", error);
    return jsonError(500, "Chat handler error.");
  }
}
