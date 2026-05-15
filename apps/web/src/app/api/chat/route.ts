import {
  buildSystemPrompt,
  clientTools,
  createSanityAgentContextClient,
} from "@workspace/ai-commerce";
import { env } from "@workspace/env/server";
import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
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
  // ISO 4217 currency code from the ChatWidget. Defaults to GBP if absent;
  // the regex blocks anything that isn't a 3-letter A-Z code so the value is
  // safe to splice into the system prompt as text.
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

interface StepTraceCall {
  toolName: string;
  input: unknown;
}
interface StepTraceResult {
  toolName: string;
  output: unknown;
}
interface StepTrace {
  toolCalls?: StepTraceCall[];
  toolResults?: StepTraceResult[];
}

/** Dev-only trace of model tool calls — see why the chat said "no sales" when the data has sales. */
function logStepTrace(step: StepTrace) {
  for (const call of step.toolCalls ?? []) {
    const input =
      typeof call.input === "string"
        ? call.input
        : JSON.stringify(call.input);
    console.log(`[chat] tool=${call.toolName} input=${input.slice(0, 500)}`);
  }
  for (const result of step.toolResults ?? []) {
    const output =
      typeof result.output === "string"
        ? result.output
        : JSON.stringify(result.output);
    console.log(
      `[chat] tool=${result.toolName} result=${output.slice(0, 500)}`,
    );
  }
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  // Auth gate: locally we need AI_GATEWAY_API_KEY. On Vercel, the gateway
  // uses OIDC tokens automatically, so the key is optional — presence of
  // VERCEL_OIDC_TOKEN (not just VERCEL) is the real signal that OIDC has
  // actually issued a token for this request.
  const hasGatewayAuth =
    Boolean(env.AI_GATEWAY_API_KEY) || Boolean(process.env.VERCEL_OIDC_TOKEN);
  if (!hasGatewayAuth || !env.SANITY_CONTEXT_MCP_URL) {
    return jsonError(
      503,
      "AI assistant requires configuration. Set AI_GATEWAY_API_KEY (locally) and SANITY_CONTEXT_MCP_URL — see README."
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
  const { messages, userContext, currencyCode } = result.data;

  const mcpClient = await createSanityAgentContextClient({
    url: env.SANITY_CONTEXT_MCP_URL,
    token: env.SANITY_API_READ_TOKEN,
  });

  try {
    const mcpTools = await mcpClient.tools();
    const result = streamText({
      // Routes through Vercel AI Gateway via the "creator/model" string form.
      // Swap providers by changing this string; the gateway handles the rest.
      model: "google/gemini-3-flash",
      providerOptions: {
        gateway: {
          // Cross-provider failover: if the primary errors or rate-limits,
          // the gateway retries each fallback in order. Three providers means
          // the chat survives any single-provider outage.
          // https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
          models: ["anthropic/claude-haiku-4.5", "openai/gpt-5-mini"],
        },
      },
      system: buildSystemPrompt({
        userContext: userContext ?? null,
        currencyCode,
      }),
      messages: await convertToModelMessages(messages as never),
      tools: { ...mcpTools, ...clientTools },
      // 8-step cap as a safety belt against runaway tool loops. Realistic
      // budget: page_context + screenshot + 2–3 GROQ refinements + answer can
      // easily hit 6 — 5 cut investigations short and surfaced the empty-bubble
      // fallback mid-flow. Gateway rate limits are configurable per key in the
      // Vercel dashboard.
      stopWhen: stepCountIs(8),
      // Smooth bursty token chunks into a steady word-at-a-time cadence so
      // the UI doesn't render in visible spurts.
      experimental_transform: smoothStream({ chunking: "word" }),
      // Dev-only trace so we can see which tools the model invoked and with
      // what input — invaluable when the chat says "no sales" but the dataset
      // has sales (root-cause is usually a wrong GROQ shape or a tool that
      // returned empty for a different reason). Disabled in production to
      // avoid leaking content into platform logs.
      onStepFinish:
        process.env.NODE_ENV === "development" ? logStepTrace : undefined,
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
