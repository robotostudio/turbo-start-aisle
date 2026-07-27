"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { SearchPanel } from "./search-panel";

export function SearchModal({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  // Drive the close through local state so the Sheet's slide-out animation
  // plays immediately (instant feedback). The intercepted route is only popped
  // once the exit animation finishes, via onAnimationEnd below.
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          handleClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="h-dvh w-full gap-0 border-none p-0 data-[state=open]:duration-300 sm:max-w-none"
        onAnimationEnd={() => {
          if (!open) {
            router.back();
          }
        }}
        showCloseButton={false}
        side="bottom"
      >
        <SheetTitle className="sr-only">Search</SheetTitle>
        <SheetDescription className="sr-only">
          Search products and collections
        </SheetDescription>

        <SearchPanel
          initialQuery={initialQuery}
          onClose={handleClose}
          scrollable
        />
      </SheetContent>
    </Sheet>
  );
}
