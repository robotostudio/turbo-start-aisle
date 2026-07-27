"use client";

import { BookmarkIcon } from "../icons";
import { useSavedItems } from "./saved-items-context";

type SavedItemsToggleProps = {
  variant?: "icon" | "text";
};

export function SavedItemsToggle({ variant = "icon" }: SavedItemsToggleProps) {
  const { count, openSaved } = useSavedItems();

  if (variant === "text") {
    return (
      <button
        aria-label={`Wishlist${count > 0 ? ` (${count} items)` : ""}`}
        className="text-foreground font-medium text-sm transition-colors hover:text-foreground/70"
        onClick={openSaved}
        type="button"
      >
        Wishlist{count > 0 && ` (${count > 99 ? "99+" : count})`}
      </button>
    );
  }

  return (
    <button
      aria-label={`Saved items${count > 0 ? ` (${count} items)` : ""}`}
      className="relative inline-flex items-center justify-center transition-colors hover:text-foreground"
      onClick={openSaved}
      type="button"
    >
      <BookmarkIcon className="size-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-medium text-primary-foreground text-xs">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
