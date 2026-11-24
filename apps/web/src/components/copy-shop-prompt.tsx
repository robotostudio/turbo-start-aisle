"use client";

import { Button } from "@workspace/ui/components/button";
import { useEffect, useRef, useState } from "react";

const COPIED_MS = 2000;

const STATUS = {
  idle: "",
  copied: "Copied. Paste it into ChatGPT or Claude.",
  failed: "Could not copy. The sentence is selected: copy it by hand.",
} as const;

/**
 * The shop prompt with a button that copies it. The sentence is plain text,
 * so a shopper can select it by hand before hydration, with JavaScript off or
 * when the browser blocks the clipboard.
 */
export function CopyShopPrompt({ prompt }: { prompt: string }) {
  const [state, setState] = useState<keyof typeof STATUS>("idle");
  const sentence = useRef<HTMLParagraphElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(prompt);
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), COPIED_MS);
    } catch {
      // No clipboard (http, an old browser, a denied permission): select the
      // sentence so the shopper's own copy shortcut takes it.
      if (sentence.current) {
        window.getSelection()?.selectAllChildren(sentence.current);
      }
      setState("failed");
    }
  };

  return (
    <div className="flex max-w-md flex-col gap-2">
      <p className="text-foreground text-sm">Shop with your AI assistant</p>
      <p className="text-muted-foreground text-xs">
        Paste this sentence into ChatGPT or Claude. It asks what you want and
        gives you a link that adds it to your cart.
      </p>
      <div className="flex items-start gap-2">
        <p
          className="wrap-anywhere min-w-0 flex-1 select-all border border-border px-3 py-1.5 text-foreground text-sm"
          ref={sentence}
        >
          {prompt}
        </p>
        <Button
          className="min-w-18 cursor-pointer"
          onClick={() => {
            void copy();
          }}
          size="sm"
          variant="outline"
        >
          {state === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      {/* Always rendered: a live region must exist before its text changes. */}
      <output
        aria-live="polite"
        className="block text-muted-foreground text-xs"
      >
        {STATUS[state]}
      </output>
    </div>
  );
}
