import type { WebMCP } from "webmcp-types";

/** Registers the tools with the browser's WebMCP until `signal` aborts. */
export function registerWebMcpTools(
  modelContext: WebMCP.ModelContext,
  tools: WebMCP.ModelContextTool[],
  signal: AbortSignal
) {
  for (const tool of tools) {
    // Chrome rejects this promise when the tool is unregistered before it
    // settles (a quick unmount, StrictMode) or refused (a name already
    // taken): neither is anything for the visitor to see or fix.
    modelContext.registerTool(tool, { signal }).catch(() => undefined);
  }
}
