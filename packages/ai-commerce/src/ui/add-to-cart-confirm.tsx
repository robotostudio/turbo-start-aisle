"use client";

import Link from "next/link";

import {
  type AddToCartConfirmation,
  dispatchAddToCart,
} from "../lib/add-to-cart";
import { formatPrice, thumbnailUrl } from "./product";

/**
 * What the add_to_cart tool renders. The model only proposes the line; the
 * cart changes when the shopper presses the button, so text the model picked
 * up from a page or a tool result can never add anything on its own.
 *
 * Markup mirrors the <Product /> card so the two read as one component.
 */
export function AddToCartConfirm({ detail }: AddToCartConfirmation) {
  const total = Number(detail.price.amount) * detail.quantity;

  return (
    <div className="not-prose group flex items-center gap-3 border border-border bg-card p-2 transition-colors hover:border-primary/40 hover:bg-accent">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3 no-underline"
        href={`/products/${detail.productHandle}`}
      >
        <div className="card-surface relative size-14 shrink-0 overflow-hidden border border-border/50">
          {detail.image ? (
            // biome-ignore lint/performance/noImgElement: external Shopify CDN URL, and next/image's loader lives behind the app's `@/` alias
            <img
              alt={detail.productTitle}
              className="size-full object-contain"
              loading="lazy"
              src={thumbnailUrl(detail.image.url, 112)}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground text-sm">
            {detail.productTitle}
          </span>
          <span className="truncate text-muted-foreground text-xs">
            {detail.variantTitle} · Qty {detail.quantity}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatPrice(total, total, detail.price.currencyCode)}
          </span>
        </div>
      </Link>
      <button
        className="shrink-0 self-stretch border border-border bg-primary px-3 font-medium text-primary-foreground text-xs uppercase tracking-wide transition-colors hover:bg-primary/90"
        type="button"
        // No "Added" state: the cart answers later and may refuse the line.
        // The drawer opening (or the cart's error toast) is the feedback.
        onClick={() => dispatchAddToCart(detail)}
      >
        Add to cart
      </button>
    </div>
  );
}
