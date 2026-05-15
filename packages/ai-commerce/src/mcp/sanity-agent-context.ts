import { createMCPClient } from "@ai-sdk/mcp";

export interface SanityAgentContextConfig {
  url: string;
  token: string;
}

/**
 * Creates an MCP client connected to the Sanity Agent Context HTTP endpoint.
 * Caller is responsible for calling .close() in the streamText onFinish callback
 * (and on error paths) to release resources.
 */
export async function createSanityAgentContextClient(
  config: SanityAgentContextConfig
) {
  return createMCPClient({
    transport: {
      type: "http",
      url: config.url,
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    },
  });
}
