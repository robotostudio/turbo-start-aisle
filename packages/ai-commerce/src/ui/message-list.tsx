"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";

import { TextPart } from "./text-part";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
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

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  // Show the typing indicator only while we're waiting for the assistant
  // to start streaming. Once the assistant message exists in the list,
  // the streaming text itself is the visible feedback.
  const lastMessage = messages[messages.length - 1];
  const showTyping = isStreaming && lastMessage?.role === "user";

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
      {messages.map((m) => {
        const isUser = m.role === "user";
        return (
          <div
            key={m.id}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                isUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.parts.map((part, idx) => {
                if (part.type === "text") {
                  return (
                    <TextPart
                      key={`${m.id}-${idx}`}
                      text={part.text}
                      isUser={isUser}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      })}
      {showTyping ? <TypingIndicator /> : null}
      <div ref={endRef} />
    </div>
  );
}
