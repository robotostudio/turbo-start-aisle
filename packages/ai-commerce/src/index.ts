// Types

// Page-context hooks
export { usePageContext, useSetPageContext } from "./context/page-context";
export {
  createSanityAgentContextClient,
  type SanityAgentContextConfig,
} from "./mcp/sanity-agent-context";
// System prompt + MCP wrapper
export { buildSystemPrompt } from "./system-prompt";
// Tool registry
export { clientTools } from "./tools";
export type {
  ClientToolName,
  NavigateDirective,
  PageContext,
  PageSurface,
  ProductFiltersInput,
  UserContext,
} from "./types";
export { CLIENT_TOOLS, productFiltersSchema } from "./types";
// UI
export { ChatWidget } from "./ui/chat-widget";
export { Product } from "./ui/product";
