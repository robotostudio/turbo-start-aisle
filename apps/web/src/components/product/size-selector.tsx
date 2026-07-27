"use client";

import { cn } from "@workspace/ui/lib/utils";

type SizeSelectorProps = {
  values: string[];
  selectedValue: string;
  availability: Record<string, boolean>;
  onSelect: (value: string) => void;
};

export function SizeSelector({
  values,
  selectedValue,
  availability,
  onSelect,
}: SizeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map((value) => {
        const isAvailable = availability[value] !== false;
        const isSelected = selectedValue === value;

        return (
          <button
            className={cn(
              "border-b px-1 pb-0.5 text-xs tracking-wide transition-colors",
              isSelected
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              !isAvailable && "opacity-40 line-through"
            )}
            key={value}
            onClick={() => onSelect(value)}
            type="button"
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
