"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import {
  capturePageContext,
  captureScreenshot,
  captureUserContext,
} from "../lib/capture-context";
import {
  CLIENT_TOOLS,
  type ProductFiltersInput,
  productFiltersSchema,
} from "../types";
import { EmptyState } from "./empty-state";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";

interface ChatPanelProps {
  onClose: () => void;
  currencyCode: string;
}

/** Build a turbo-start-shopify collection URL with filter.* keys from the AI's input. */
function buildCollectionUrl(input: ProductFiltersInput): {
  href: string;
  applied: string[];
} {
  const params = new URLSearchParams();
  const applied: string[] = [];

  if (input.available !== undefined) {
    params.set("filter.available", String(input.available));
    applied.push(`available=${input.available}`);
  }
  if (input.priceMin !== undefined) {
    params.set("filter.price.min", String(input.priceMin));
    applied.push(`min=$${input.priceMin}`);
  }
  if (input.priceMax !== undefined) {
    params.set("filter.price.max", String(input.priceMax));
    applied.push(`max=$${input.priceMax}`);
  }
  for (const v of input.vendor ?? []) {
    params.append("filter.vendor", v);
    applied.push(`vendor=${v}`);
  }
  for (const t of input.type ?? []) {
    params.append("filter.type", t);
    applied.push(`type=${t}`);
  }
  for (const tag of input.tag ?? []) {
    params.append("filter.tag", tag);
    applied.push(`tag=${tag}`);
  }
  if (input.sort) {
    params.set("sort", input.sort);
    applied.push(`sort=${input.sort}`);
  }
  if (input.reverse !== undefined) {
    params.set("reverse", String(input.reverse));
    applied.push(`reverse=${input.reverse}`);
  }
  const qs = params.toString();
  return {
    href: `/collections/${input.collection}${qs ? `?${qs}` : ""}`,
    applied,
  };
}

export function ChatPanel({ onClose, currencyCode }: ChatPanelProps) {
  const router = useRouter();
  const pendingScreenshotRef = useRef<string | null>(null);

  const { messages, sendMessage, status, addToolOutput, error, regenerate } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ userContext: captureUserContext(), currencyCode }),
      }),
      sendAutomaticallyWhen: ({ messages }: { messages: UIMessage[] }) =>
        pendingScreenshotRef.current === null &&
        messages.length > 0 &&
        messages[messages.length - 1]?.role === "user",
      onToolCall: async ({ toolCall }) => {
        switch (toolCall.toolName) {
          case CLIENT_TOOLS.PAGE_CONTEXT: {
            try {
              const ctx = capturePageContext();
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
