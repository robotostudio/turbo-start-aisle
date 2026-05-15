"use client";

import { remarkAgentDirectives } from "@sanity/agent-directives/react";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

import { Product } from "./product";

interface TextPartProps {
  text: string;
  isUser?: boolean;
}

interface DocumentDirectiveProps {
  id?: string;
  type?: string;
  isInline?: boolean;
}

function Document({ id, type, isInline }: DocumentDirectiveProps) {
  if (!id || !type) return null;
  if (type === "product") {
    return <Product id={id} isInline={isInline} />;
  }
  return null;
}

function DirectivesStack({ children }: { children?: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

type ExtendedComponents = Components & {
  Document: typeof Document;
  DirectivesStack: typeof DirectivesStack;
};

export function TextPart({ text, isUser }: TextPartProps) {
  if (!text.trim()) return null;

  const components: ExtendedComponents = {
    Document,
    DirectivesStack,
    p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-4">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-4">{children}</ol>,
  };

  return (
    <div
      className={
        isUser
          ? "prose prose-sm max-w-none text-primary-foreground"
          : "prose prose-sm max-w-none text-foreground"
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkAgentDirectives]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
