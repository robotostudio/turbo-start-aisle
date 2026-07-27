"use client";

import { MessageCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { CurrencyProvider } from "../context/currency-context";
import { ChatPanel } from "./chat-panel";

interface ChatWidgetProps {
  /** Storefront display currency (ISO 4217). Defaults to "GBP" to match the
   *  fallback in apps/web's ProductCard. Override for stores in other currencies. */
  currencyCode?: string;
}

// The launcher sits above the sonner Toaster, which the root layout offsets by
// 5.5rem to clear it. Keep the two in sync if this height changes.
const PANEL_CLASS =
  "fixed right-4 bottom-22 z-50 h-125 w-95 max-w-[calc(100vw-2rem)]";

const LAUNCHER_CLASS =
  "fixed right-4 bottom-4 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none bg-primary text-primary-foreground shadow-lg transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

function iconClass(visible: boolean): string {
  return `absolute inset-0 h-6 w-6 transition-[transform,opacity] duration-300 ${
    visible ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
  }`;
}

export function ChatWidget({ currencyCode = "GBP" }: ChatWidgetProps = {}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <CurrencyProvider value={currencyCode}>
      {/* ChatPanel stays mounted across open/close so its message history and
          input draft survive — conditional rendering would tear down useChat
          and wipe everything every toggle. Visibility is CSS-only. */}
      <div
        className={`${PANEL_CLASS} ${isOpen ? "block" : "hidden"}`}
        data-agent-chat-hidden
      >
        <ChatPanel
          currencyCode={currencyCode}
          onClose={() => setIsOpen(false)}
        />
      </div>

      <button
        aria-label={isOpen ? "Close chat" : "Open chat"}
        className={LAUNCHER_CLASS}
        data-agent-chat-hidden
        onClick={() => setIsOpen((v) => !v)}
        type="button"
      >
        <span className="relative h-6 w-6">
          <MessageCircleIcon className={iconClass(!isOpen)} />
          <XIcon className={iconClass(isOpen)} />
        </span>
      </button>
    </CurrencyProvider>
  );
}
