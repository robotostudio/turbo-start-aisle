"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type CartLineChoice,
  cartLineFor,
  cartLinkQuery,
  variantGidFromLink,
} from "@/lib/agent-shop";
import type { ProductByHandleResponse } from "@/lib/shopify/types";
import { useCartActions, useCartState } from "./cart-context";

type Offer = Extract<CartLineChoice, { ok: true }> & { quantity: number };

type Status =
  | { kind: "loading" }
  | { kind: "offer"; offer: Offer; adding: boolean }
  | { kind: "added"; message: string }
  | { kind: "stopped"; message: string; handle?: string };

const NOTHING: Status = {
  kind: "stopped",
  message: "This link has nothing to add.",
};

/** What the link names, read fresh from the shop. Changes nothing. */
async function readOffer(search: string): Promise<Status> {
  const link = cartLinkQuery.safeParse(
    Object.fromEntries(new URLSearchParams(search))
  );
  if (!link.success) {
    return NOTHING;
  }
  const { handle, variant, quantity } = link.data;
  // A dropped connection or a broken reply is the shop being down, the same
  // as an error status: the shopper keeps the way to the product.
  const product = await fetch(`/api/products/${handle}`)
    .then(async (response) =>
      response.ok
        ? ((await response.json()) as ProductByHandleResponse).product
        : undefined
    )
    .catch(() => undefined);
  if (product === undefined) {
    return {
      kind: "stopped",
      message: "We couldn't reach the shop. Open the product to add it.",
      handle,
    };
  }
  if (!product) {
    return { kind: "stopped", message: "We couldn't find that product." };
  }
  const line = cartLineFor(product, variantGidFromLink(variant), quantity);
  return line.ok
    ? { kind: "offer", offer: { ...line, quantity }, adding: false }
    : {
        kind: "stopped",
        message: `${product.title} can't be added in that option right now.`,
        handle,
      };
}

/**
 * Offers the line an add-to-cart link names (ROB-6903): the `/mcp` server
 * hands these links to chat apps, which cannot reach the shopper's cart.
 *
 * Opening the link only shows the item. The shopper's press on the button is
 * what adds it, so a link on another site can never fill a cart by itself.
 */
export function AddFromLink() {
  const { isLoading } = useCartState();
  const { addLine, openCart } = useCartActions();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let current = true;
    readOffer(window.location.search).then((next) => {
      if (current) {
        setStatus(next);
      }
    });
    return () => {
      current = false;
    };
  }, []);

  async function add(offer: Offer) {
    setStatus({ kind: "offer", offer, adding: true });
    openCart();
    const { ok, warnings } = await addLine(
      offer.variantId,
      offer.quantity,
      offer.metadata
    );
    const { productTitle, productHandle } = offer.metadata;
    if (!ok) {
      setStatus({
        kind: "stopped",
        message: `${productTitle} couldn't be added to your cart.`,
        handle: productHandle,
      });
      return;
    }
    // Out of the address bar once used, so a reload offers nothing again.
    window.history.replaceState(null, "", window.location.pathname);
    // A warning means Shopify changed the line, usually to fit the stock, so
    // the count asked for is no longer what the cart holds.
    setStatus({
      kind: "added",
      message:
        warnings.length > 0
          ? `Added ${productTitle}. ${warnings.map((warning) => warning.message).join(" ")}`
          : `Added ${offer.named}.`,
    });
  }

  return (
    <main className="px-4 py-16">
      <h1 className="mb-8 font-semibold text-3xl">Add to cart</h1>
      <div className="flex flex-col items-center justify-center gap-6 py-16">
        <p className="font-medium text-lg" role="status">
          {status.kind === "loading" && "Looking up your item…"}
          {status.kind === "offer" && `Add ${status.offer.named}?`}
          {(status.kind === "added" || status.kind === "stopped") &&
            status.message}
        </p>
        {status.kind === "offer" && (
          // The cart must be read first: adding before that starts a new cart.
          <Button
            disabled={isLoading || status.adding}
            onClick={() => add(status.offer)}
          >
            {status.adding ? "Adding…" : "Add to cart"}
          </Button>
        )}
        {status.kind === "added" && (
          <Button asChild>
            <Link href="/cart">View cart</Link>
          </Button>
        )}
        {status.kind === "stopped" && (
          <Button asChild variant="outline">
            <Link href={status.handle ? `/products/${status.handle}` : "/"}>
              {status.handle ? "View product" : "Continue shopping"}
            </Link>
          </Button>
        )}
      </div>
    </main>
  );
}
