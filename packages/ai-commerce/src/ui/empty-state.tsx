"use client";

import { useQuery } from "@tanstack/react-query";
import { client } from "@workspace/sanity/client";
import { SparklesIcon } from "lucide-react";

interface EmptyStateProps {
  onSuggestion: (text: string) => void;
}

interface AiAssistantSettings {
  welcomeHeading: string | null;
  welcomeSubtitle: string | null;
  suggestions: string[] | null;
}

const SETTINGS_QUERY = /* groq */ `
  *[_type == "aiAssistantSettings" && _id == "aiAssistantSettings"][0]{
    welcomeHeading,
    welcomeSubtitle,
    suggestions
  }
`;

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
  const { data } = useQuery({
    queryKey: ["ai-commerce", "ai-assistant-settings"],
    queryFn: () => client.fetch<AiAssistantSettings | null>(SETTINGS_QUERY),
    staleTime: 5 * 60 * 1000,
  });

  const heading = data?.welcomeHeading?.trim() || FALLBACK.heading;
  const subtitle = data?.welcomeSubtitle?.trim() || FALLBACK.subtitle;
  const suggestions = (data?.suggestions ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  const finalSuggestions =
    suggestions.length > 0 ? suggestions : FALLBACK.suggestions;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-6 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "#0B0F19", color: "#B8FF3C" }}
      >
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
