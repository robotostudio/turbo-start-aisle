"use client";

import { Button } from "@workspace/ui/components/button";

import { useCartActions } from "@/components/cart/cart-context";
import type { LineMetadata } from "@/lib/cart/types";

type AddToCartProps = {
  variantId: string;
  availableForSale: boolean;
  metadata: LineMetadata;
  optionsSelected?: boolean;
  quantity?: number;
};

export function AddToCart({
  variantId,
  availableForSale,
  metadata,
  optionsSelected = true,
  quantity = 1,
}: AddToCartProps) {
  const { addLine, openCart } = useCartActions();

  if (!availableForSale) {
    return (
      <Button
        className="h-9 w-full rounded-none text-base uppercase"
        disabled
        variant="default"
      >
        Sold Out
      </Button>
    );
  }

  if (!optionsSelected) {
    return (
      <Button
        className="h-9 w-full rounded-none text-base uppercase"
        disabled
        variant="default"
      >
        Select Options
      </Button>
    );
  }

  return (
    <Button
      className="h-9 w-full rounded-none border-none bg-zinc-900 text-base text-zinc-100 tracking-wide transition-colors hover:bg-zinc-800 hover:text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:hover:text-zinc-900"
      onClick={() => {
        openCart();
        void addLine(variantId, quantity, metadata);
      }}
    >
      Add to cart
    </Button>
  );
}
