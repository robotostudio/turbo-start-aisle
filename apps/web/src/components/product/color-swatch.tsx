"use client";

import { cn } from "@workspace/ui/lib/utils";

import { getColorHex } from "@/lib/shopify/color";

type ColorSwatchProps = {
  values: string[];
  selectedValue: string;
  availability: Record<string, boolean>;
  onSelect: (value: string) => void;
};

export function ColorSwatch({
  values,
  selectedValue,
  availability,
  onSelect,
}: ColorSwatchProps) {
  return (
    <div className="flex flex-wrap items-start gap-0.5">
      {values.map((value) => {
        const hex = getColorHex(value);
        const isAvailable = availability[value] !== false;
        const isSelected = selectedValue === value;

        if (!hex) {
          // Fallback to text button if no matching color
          return (
            <button
              className={cn(
                "mr-1.5 border-b pb-1 text-sm transition-colors",
                isSelected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                !isAvailable && "opacity-40"
              )}
              key={value}
              onClick={() => onSelect(value)}
              title={value}
              type="button"
            >
              {value}
            </button>
          );
        }

        return (
          <button
            aria-label={value}
            aria-pressed={isSelected}
            className={cn(
              "flex cursor-pointer flex-col gap-0.5",
              !isAvailable && "opacity-40"
            )}
            key={value}
            onClick={() => onSelect(value)}
            title={value}
            type="button"
          >
            <span className="block h-3 w-6" style={{ backgroundColor: hex }} />
            <span
              className={cn(
                "block h-px w-full",
                isSelected ? "bg-foreground" : "bg-transparent"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
