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

// Which route the user is on, written by <PageContextTracker /> on every
// navigation. Lets the model answer "what's on this page?" without a tool call.
const pageContextSchema = z
  .object({
    route: z.string().max(2000),
    surface: z.enum([
      "home",
      "pdp",
      "collection",
      "search",
      "cart",
      "content",
      "other",
    ]),
  })
  .nullable()
  .optional();

const requestSchema = z.object({
  messages: z.array(z.unknown()).max(200),
  userContext: userContextSchema,
  pageContext: pageContextSchema,
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
      typeof call.input === "string" ? call.input : JSON.stringify(call.input);
    console.log(`[chat] tool=${call.toolName} input=${input.slice(0, 500)}`);
  }
  for (const result of step.toolResults ?? []) {
    const output =
      typeof result.output === "string"
        ? result.output
        : JSON.stringify(result.output);
    console.log(
      `[chat] tool=${result.toolName} result=${output.slice(0, 500)}`
    );
  }
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Map a streaming failure to a message that is safe to show the user.
 *
 * Errors thrown mid-stream (gateway 402/429, provider outages) are the ones a
 * user is most likely to hit, and the AI SDK masks them all as "An error
 * occurred" by default — which leaves a retry button that can only fail the
 * same way. We map the status code to a fixed string rather than echoing the
 * upstream message, because AI SDK / MCP errors can carry request headers
 * including the SANITY_API_READ_TOKEN and AI_GATEWAY_API_KEY bearer tokens.
 */
function streamErrorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;

  switch (status) {
    case 402:
      return "The AI Gateway needs a positive credit balance before it will serve requests. Top up at vercel.com/dashboard/ai-gateway.";
    case 401:
    case 403:
      return "The AI Gateway rejected our credentials. Check AI_GATEWAY_API_KEY.";
    case 429:
      return "The AI Gateway is rate-limiting us. Wait a moment and try again.";
    default:
      return "The chat service didn't respond.";
  }
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
  const { messages, userContext, pageContext, currencyCode } = result.data;

  const mcpClient = await createSanityAgentContextClient({
    url: env.SANITY_CONTEXT_MCP_URL,
    token: env.SANITY_API_READ_TOKEN,
  });

  // onFinish and onError are mutually exclusive but both can race a thrown
  // error in the catch below, so close exactly once.
  let mcpClosed = false;
  const closeMcp = async () => {
    if (mcpClosed) return;
    mcpClosed = true;
    await mcpClient.close();
  };

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
        pageContext: pageContext ?? null,
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
      onFinish: closeMcp,
      // The model call happens lazily while the response streams, so a gateway
      // failure lands here rather than in the catch below. Without this the MCP
      // client would leak a connection on every failed request.
      onError: async ({ error }) => {
        console.error("/api/chat stream error", error);
        await closeMcp();
      },
    });
    return result.toUIMessageStreamResponse({
      onError: streamErrorMessage,
    });
  } catch (error) {
    await closeMcp();
    // Log server-side; do not echo the raw error to the client because upstream
    // errors from the AI SDK / MCP client / gateway may include header values
    // like the SANITY_API_READ_TOKEN or AI_GATEWAY_API_KEY Bearer tokens.
    console.error("/api/chat handler error", error);
    return jsonError(500, "Chat handler error.");
  }
}
