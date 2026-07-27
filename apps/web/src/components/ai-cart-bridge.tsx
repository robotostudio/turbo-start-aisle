"use client";

import {
  ADD_TO_CART_EVENT,
  type AddToCartEventDetail,
} from "@workspace/ai-commerce";
import { useEffect } from "react";

import { useCartActions } from "@/components/cart/cart-context";
import { buildLineMetadata } from "@/lib/cart/metadata";

/**
 * Bridges the chat widget's "Add to cart" to the app's cart.
 *
 * The chat lives in @workspace/ai-commerce, which cannot import from `@/`, so
 * it dispatches a window CustomEvent carrying everything the optimistic cart
 * line needs. This component is the only place that knows about both sides.
 *
 * Renders nothing. Errors and warnings surface globally via <CartToasts />.
 */
export function AiCartBridge() {
  const { addLine, openCart } = useCartActions();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AddToCartEventDetail>).detail;
      if (!(detail?.variantGid && detail.price?.currencyCode)) return;

      const metadata = buildLineMetadata({
        productTitle: detail.productTitle,
        productHandle: detail.productHandle,
        variantTitle: detail.variantTitle,
        price: detail.price,
        image: detail.image,
        selectedOptions: detail.selectedOptions ?? [],
      });

      // Open first, matching the PDP's add-to-cart, so the drawer is already
      // on screen when the optimistic line lands.
      openCart();
      void addLine(detail.variantGid, detail.quantity ?? 1, metadata);
    };

    window.addEventListener(ADD_TO_CART_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(ADD_TO_CART_EVENT, handler as EventListener);
  }, [addLine, openCart]);

  return null;
}
