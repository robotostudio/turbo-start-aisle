"use client";

import { MessageCircleIcon, XIcon } from "lucide-react";
import { type CSSProperties, useState } from "react";

import { CurrencyProvider } from "../context/currency-context";
import { ChatPanel } from "./chat-panel";

interface ChatWidgetProps {
  /** Storefront display currency (ISO 4217). Defaults to "GBP" to match the
   *  fallback in apps/web's ProductCard. Override for stores in other currencies. */
  currencyCode?: string;
}

const panelStyle: CSSProperties = {
  position: "fixed",
  bottom: "5.5rem",
  right: "1rem",
  zIndex: 50,
  height: "500px",
  width: "380px",
};

const buttonStyle: CSSProperties = {
  position: "fixed",
  bottom: "1rem",
  right: "1rem",
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "3.5rem",
  height: "3.5rem",
  borderRadius: "9999px",
  backgroundColor: "#0B0F19",
  color: "#B8FF3C",
  boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
  border: "none",
  cursor: "pointer",
  transition: "transform 200ms ease-out, box-shadow 200ms ease-out",
};

const iconWrapStyle: CSSProperties = {
  position: "relative",
  width: "1.5rem",
  height: "1.5rem",
};

function iconStyle(visible: boolean): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    width: "1.5rem",
    height: "1.5rem",
    transition: "transform 300ms, opacity 300ms",
    transform: visible ? "rotate(0) scale(1)" : "rotate(90deg) scale(0)",
    opacity: visible ? 1 : 0,
  };
}

export function ChatWidget({ currencyCode = "GBP" }: ChatWidgetProps = {}) {
  const [isOpen, setIsOpen] = useState(false);

  // ChatPanel stays mounted across open/close so its message history and
  // input draft survive — conditional rendering would tear down useChat and
  // wipe everything every toggle. Visibility is CSS-only.
  const panelVisibilityStyle: CSSProperties = {
    ...panelStyle,
    display: isOpen ? "block" : "none",
  };

  return (
    <CurrencyProvider value={currencyCode}>
      <div data-agent-chat-hidden style={panelVisibilityStyle}>
        <ChatPanel
          onClose={() => setIsOpen(false)}
          currencyCode={currencyCode}
        />
      </div>

      <button
        type="button"
        data-agent-chat-hidden
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        style={buttonStyle}
      >
        <span style={iconWrapStyle}>
          <MessageCircleIcon style={iconStyle(!isOpen)} />
          <XIcon style={iconStyle(isOpen)} />
        </span>
      </button>
    </CurrencyProvider>
  );
}
