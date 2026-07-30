"use client";

import { useQuery } from "@tanstack/react-query";
import { client } from "@workspace/sanity/client";
import { queryAiAssistantSettings } from "@workspace/sanity/query";
import type { QueryAiAssistantSettingsResult } from "@workspace/sanity/types";
import { SparklesIcon } from "lucide-react";
import { useEffect } from "react";

interface EmptyStateProps {
  onSuggestion: (text: string) => void;
}

const FALLBACK = {
  heading: "Welcome to Aisle",
  subtitle:
    "Ask about products, brands, prices, or what's in stock — I'll search the catalog and pull up matching items.",
  suggestions: [
    "What brands do you carry?",
    "Show me products under $50",
    "What's on sale right now?",
    "Pick something for me",
  ],
};

export function EmptyState({ onSuggestion }: EmptyStateProps) {
  const { data, error } = useQuery({
    queryKey: ["ai-commerce", "ai-assistant-settings"],
    queryFn: () =>
      client.fetch<QueryAiAssistantSettingsResult>(queryAiAssistantSettings),
    staleTime: 5 * 60 * 1000,
  });

  // Falling back to the hardcoded copy is the right UX for a welcome panel, but
  // doing it silently is not: a Sanity CORS rejection here is indistinguishable
  // from an unseeded singleton. Surface it in the console so it's diagnosable.
  useEffect(() => {
    if (error) {
      console.error("[ai-commerce] aiAssistantSettings fetch failed", error);
    }
  }, [error]);

  const heading = data?.welcomeHeading?.trim() || FALLBACK.heading;
  const subtitle = data?.welcomeSubtitle?.trim() || FALLBACK.subtitle;
  const suggestions = (data?.suggestions ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  const finalSuggestions =
    suggestions.length > 0 ? suggestions : FALLBACK.suggestions;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-6 text-center">
      {/* shrink-0: this is a flex item in a column that can overflow the 500px
          panel, and without it flexbox squashes the circle into an oval. */}
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <SparklesIcon className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Try asking
        </p>
        {finalSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
