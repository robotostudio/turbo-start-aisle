"use client";

import { SendIcon } from "lucide-react";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const MAX_HEIGHT_PX = 160;

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize: reset to single-line, then grow to scrollHeight up to a cap.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is the resize trigger; biome can't see DOM-side reads.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter (or any modifier) inserts a newline.
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about products…"
        disabled={disabled}
        className="flex-1 resize-none overflow-y-auto rounded-md border border-border bg-background px-2 py-1 text-sm outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <SendIcon className="h-4 w-4" />
      </button>
    </form>
  );
}
