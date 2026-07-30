"use client";

import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { ArrowUpIcon } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");

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
      {/* py-1 (not the base py-2) keeps the collapsed content height under 36px
          so min-h-9 governs, making the box exactly size-9 — the same height as
          the send button. With py-2 the field-sizing height lands at 42px and
          the two no longer line up. */}
      <Textarea
        className="max-h-40 min-h-9 resize-none py-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about products…"
        rows={1}
        value={value}
      />
      {/* size="icon" is size-9, matching the textarea's collapsed min-h-9 so the
          two line up; `items-end` on the form keeps them aligned as it grows. */}
      <Button
        aria-label="Send message"
        className="shrink-0"
        disabled={disabled || !value.trim()}
        size="icon"
        type="submit"
      >
        <ArrowUpIcon className="size-4" />
      </Button>
    </form>
  );
}
