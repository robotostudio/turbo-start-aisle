"use client";

import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai";
import { useEffect, useRef } from "react";

import { TextPart } from "./text-part";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

function TypingIndicator() {
  return (
    <div className="flex animate-in fade-in justify-start duration-300">
      <output
        className="flex max-w-[85%] items-center gap-1 rounded-md bg-muted px-3 py-3 text-sm text-foreground"
        aria-label="Assistant is typing"
      >
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full bg-foreground/60"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full bg-foreground/60"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full bg-foreground/60"
          style={{ animationDelay: "300ms" }}
        />
      </output>
    </div>
  );
}

type Part = UIMessagePart<UIDataTypes, UITools>;

/**
 * Returns the final assistant answer — i.e. text parts that appear AFTER the
 * last tool/reasoning/file part. Anything before that is intermediate
 * "Let me query…" narration emitted between tool steps; we hide it so the
 * user only sees the resolved answer once the tools finish.
 */
function getDisplayableText(message: UIMessage): string {
  let lastNonTextIdx = -1;
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i] as Part | undefined;
    if (!part) continue;
    if (part.type === "text" || part.type === "step-start") continue;
    lastNonTextIdx = i;
    break;
  }
  let text = "";
  for (let i = lastNonTextIdx + 1; i < message.parts.length; i++) {
    const part = message.parts[i] as Part | undefined;
    if (part?.type === "text") text += part.text;
  }
  return text;
}

/**
 * If the assistant didn't emit any text but its last tool call was a
 * navigation/action tool (set_collection_filters), surface the tool's own
 * output as the bubble content. Models sometimes stop after a successful
 * tool call — the prompt asks them to confirm in prose but some don't comply.
 * Showing the tool's user-friendly output beats showing "I couldn't find an
 * answer to that" when navigation actually succeeded.
 */
function getNavigationFallbackText(message: UIMessage): string | null {
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i] as Part | undefined;
    if (!part) continue;
    if (part.type === "text" || part.type === "step-start") continue;
    const isNavTool =
      (part.type === "tool-set_collection_filters" ||
        (part.type === "dynamic-tool" &&
          "toolName" in part &&
          part.toolName === "set_collection_filters")) &&
      "state" in part &&
      part.state === "output-available";
    if (!isNavTool) return null;
    const output = "output" in part ? part.output : null;
    return typeof output === "string" ? output : null;
  }
  return null;
}

const FALLBACK_TEXT =
  "I couldn't find an answer to that. Try rephrasing or asking about something else.";

function ErrorTile({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex animate-in fade-in slide-in-from-bottom-1 justify-start duration-300">
      <div
        role="alert"
        className="flex max-w-[85%] flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <span className="font-medium">Something went wrong</span>
        <span className="text-xs text-destructive/90">
          {error.message || "The chat service didn't respond."} Please try
          again.
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 self-start rounded border border-destructive/40 px-2 py-0.5 text-xs font-medium hover:bg-destructive/20"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  isStreaming,
  error,
  onRetry,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming, error]);

  // Keep the typing indicator visible until the assistant has produced
  // post-tool text. The previous logic hid the dots the instant the
  // assistant message slot existed — even when it only held tool calls or
  // "let me query…" narration — leaving an empty/awkward bubble on screen.
  const lastMessage = messages[messages.length - 1];
  const lastDisplayable =
    lastMessage?.role === "assistant"
      ? getDisplayableText(lastMessage).trim()
      : "";
  // An error short-circuits the typing indicator AND the empty/fallback
  // bubble — the ErrorTile carries the feedback instead.
  const showTyping =
    !error &&
    isStreaming &&
    (lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" && lastDisplayable.length === 0));

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
      {messages.map((m, idx) => {
        const isUser = m.role === "user";
        const isLast = idx === messages.length - 1;

        if (isUser) {
          return (
            <div
              key={m.id}
              className="flex animate-in fade-in slide-in-from-bottom-1 justify-end duration-300"
            >
              <div className="max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.parts.map((part, partIdx) => {
                  if (part.type === "text") {
                    return (
                      <TextPart
                        key={`${m.id}-${partIdx}`}
                        text={part.text}
                        isUser
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        }

        const displayable = getDisplayableText(m).trim();

        // Suppress the empty bubble while we're still waiting on tools or the
        // first post-tool token — the typing indicator carries the feedback.
        if (displayable.length === 0 && isStreaming && isLast) {
          return null;
        }

        // Stream ended with no final answer text. If an error is present, the
        // ErrorTile below speaks for the failure — suppress the empty bubble
        // so we don't show both "couldn't find an answer" AND "something went
        // wrong" for the same turn. Otherwise, if the model just ran a
        // navigation tool without speaking, surface the tool's confirmation
        // text. Last resort: show the friendly fallback.
        if (displayable.length === 0) {
          if (error && isLast) return null;
          const navFallback = getNavigationFallbackText(m);
          if (navFallback) {
            return (
              <div
                key={m.id}
                className="flex animate-in fade-in slide-in-from-bottom-1 justify-start duration-300"
              >
                <div className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  {navFallback}
                </div>
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className="flex animate-in fade-in slide-in-from-bottom-1 justify-start duration-300"
            >
              <div className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm italic text-muted-foreground">
                {FALLBACK_TEXT}
              </div>
            </div>
          );
        }

        return (
          <div
            key={m.id}
            className="flex animate-in fade-in slide-in-from-bottom-1 justify-start duration-300"
          >
            <div className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm text-foreground">
              <TextPart text={displayable} />
            </div>
          </div>
        );
      })}
      {showTyping ? <TypingIndicator /> : null}
      {error ? <ErrorTile error={error} onRetry={onRetry} /> : null}
      <div ref={endRef} />
    </div>
  );
}
