import type { ToolSet } from "ai";

import { CLIENT_TOOLS } from "../types";
import { addToCartTool } from "./add-to-cart";
import { pageContextTool } from "./page-context";
import { screenshotTool } from "./screenshot";
import { setCollectionFiltersTool } from "./set-collection-filters";

/**
 * Tool definitions consumed by the API route's streamText() call.
 * Execution is split: there is no `execute` here — the chat panel's
 * useChat.onToolCall handler runs each tool in the browser.
 */
export const clientTools: ToolSet = {
  [CLIENT_TOOLS.PAGE_CONTEXT]: pageContextTool,
  [CLIENT_TOOLS.SCREENSHOT]: screenshotTool,
  [CLIENT_TOOLS.SET_FILTERS]: setCollectionFiltersTool,
  [CLIENT_TOOLS.ADD_TO_CART]: addToCartTool,
};
