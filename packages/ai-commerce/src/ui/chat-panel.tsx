"use client";

import { useChat } from "@ai-sdk/react";
import { client } from "@workspace/sanity/client";
import { DefaultChatTransport, type UIMessage } from "ai";
import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { usePageContext } from "../context/page-context";
import {
  type CartVariantData,
  toAddToCartDetail,
  VARIANT_QUERY,
} from "../lib/add-to-cart";
import {
  capturePageContext,
  captureScreenshot,
  captureUserContext,
} from "../lib/capture-context";
import { buildCollectionUrl } from "../lib/collection-url";
import { addToCartSchema, CLIENT_TOOLS, productFiltersSchema } from "../types";
import { EmptyState } from "./empty-state";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";

interface ChatPanelProps {
  onClose: () => void;
  currencyCode: string;
}

export function ChatPanel({ onClose, currencyCode }: ChatPanelProps) {
  const router = useRouter();
  const pendingScreenshotRef = useRef<string | null>(null);

  // DefaultChatTransport's `body` callback is created once, so it would close
  // over the first render's page context. Mirror it into a ref that each
  // navigation updates, and read the ref at request time instead.
  const pageContext = usePageContext();
  const pageContextRef = useRef(pageContext);
  pageContextRef.current = pageContext;

  const { messages, sendMessage, status, addToolOutput, error, regenerate } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          userContext: captureUserContext(),
          pageContext: pageContextRef.current,
          currencyCode,
        }),
      }),
      sendAutomaticallyWhen: ({ messages }: { messages: UIMessage[] }) =>
        pendingScreenshotRef.current === null &&
        messages.length > 0 &&
        messages[messages.length - 1]?.role === "user",
      onToolCall: async ({ toolCall }) => {
        switch (toolCall.toolName) {
          case CLIENT_TOOLS.PAGE_CONTEXT: {
            try {
              const ctx = await capturePageContext();
              addToolOutput({
                tool: CLIENT_TOOLS.PAGE_CONTEXT,
                toolCallId: toolCall.toolCallId,
                output: JSON.stringify(ctx),
              });
            } catch (err) {
              addToolOutput({
                tool: CLIENT_TOOLS.PAGE_CONTEXT,
                toolCallId: toolCall.toolCallId,
                output: `Failed to capture page context: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            return;
          }

          case CLIENT_TOOLS.SCREENSHOT: {
            try {
              const file = await captureScreenshot();
              pendingScreenshotRef.current = file;
              addToolOutput({
                tool: CLIENT_TOOLS.SCREENSHOT,
                toolCallId: toolCall.toolCallId,
                output: "Screenshot captured (sent as follow-up message).",
              });
            } catch (err) {
              addToolOutput({
                tool: CLIENT_TOOLS.SCREENSHOT,
                toolCallId: toolCall.toolCallId,
                output: `Failed to capture screenshot: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            return;
          }

          case CLIENT_TOOLS.SET_FILTERS: {
            const result = productFiltersSchema.safeParse(toolCall.input);
            if (!result.success) {
              addToolOutput({
                tool: CLIENT_TOOLS.SET_FILTERS,
                toolCallId: toolCall.toolCallId,
                output: `Invalid filter input: ${result.error.message}`,
              });
              return;
            }
            const { href, applied } = buildCollectionUrl(result.data);
            router.push(href, { scroll: false });
            addToolOutput({
              tool: CLIENT_TOOLS.SET_FILTERS,
              toolCallId: toolCall.toolCallId,
              output: `Applied filters (${
                applied.join(", ") || "none"
              }). Navigated to ${href}.`,
            });
            return;
          }

          case CLIENT_TOOLS.ADD_TO_CART: {
            const reply = (output: string) =>
              addToolOutput({
                tool: CLIENT_TOOLS.ADD_TO_CART,
                toolCallId: toolCall.toolCallId,
                output,
              });
            const result = addToCartSchema.safeParse(toolCall.input);
            if (!result.success) {
              // The output is the shopper's chat bubble, so no zod text here.
              reply(
                "I couldn't work out which item to add. Tell me the product, size and colour and I'll try again."
              );
              return;
            }
            try {
              const variant = await client.fetch<CartVariantData | null>(
                VARIANT_QUERY,
                { gid: result.data.variantGid }
              );
              const detail = toAddToCartDetail(
                variant,
                result.data.quantity,
                currencyCode
              );
              if (typeof detail === "string") {
                reply(detail);
                return;
              }
              // Not added yet: MessageList renders this as a confirm card and
              // the shopper's click on it is what reaches the cart.
              addToolOutput({
                tool: CLIENT_TOOLS.ADD_TO_CART,
                toolCallId: toolCall.toolCallId,
                output: {
                  status:
                    "Shown to the shopper with an Add to cart button. Not in the cart until they press it.",
                  detail,
                },
              });
            } catch (err) {
              console.error("add_to_cart failed", err);
              reply("I couldn't look that item up. Please try again.");
            }
            return;
          }

          default:
            return;
        }
      },
    });

  // After a screenshot tool result lands and the stream is ready,
  // send the queued screenshot as a follow-up file message.
  useEffect(() => {
    if (status !== "ready") return;
    const screenshot = pendingScreenshotRef.current;
    if (!screenshot) return;
    pendingScreenshotRef.current = null;
    sendMessage({
      role: "user",
      parts: [
        {
          type: "file" as const,
          filename: "screenshot.jpg",
          mediaType: "image/jpeg",
          url: screenshot,
        },
      ],
    } as never);
  }, [status, sendMessage]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage]
  );

  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <div
      data-agent-chat-hidden
      className="flex h-full w-full flex-col rounded-lg border border-border bg-background shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Shopping assistant</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 hover:bg-muted"
          aria-label="Close chat"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </header>
      {messages.length === 0 ? (
        <EmptyState onSuggestion={handleSend} />
      ) : (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          error={error ?? null}
          onRetry={() => regenerate()}
        />
      )}
      <MessageInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
