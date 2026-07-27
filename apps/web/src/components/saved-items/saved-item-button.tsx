"use client";

import { cn } from "@workspace/ui/lib/utils";

import { BookmarkIcon } from "../icons";
import { useSavedItems } from "./saved-items-context";

type SavedItemButtonProps = {
  handle: string;
  className?: string;
};

export function SavedItemButton({ handle, className }: SavedItemButtonProps) {
  const { toggle, isInSavedItems } = useSavedItems();
  const isSaved = isInSavedItems(handle);

  return (
    <button
      aria-label={isSaved ? "Remove from saved items" : "Save for later"}
      aria-pressed={isSaved}
      className={cn(
        "flex size-8 items-center justify-center text-foreground transition-transform hover:scale-110 active:scale-95",
        className
      )}
      data-saved={isSaved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(handle);
      }}
      type="button"
    >
      <BookmarkIcon
        className={cn(
          "size-[18px] transition-colors",
          isSaved ? "fill-foreground text-foreground" : "fill-transparent"
        )}
      />
    </button>
  );
}
