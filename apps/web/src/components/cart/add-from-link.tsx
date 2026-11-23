"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  cartLineFor,
  cartLinkQuery,
  variantGidFromLink,
} from "@/lib/agent-shop";
import type { ProductByHandleResponse } from "@/lib/shopify/types";
import { useCartActions, useCartState } from "./cart-context";

type Status =
  | { kind: "working" }
  | { kind: "added"; message: string }
  | { kind: "stopped"; message: string; handle?: string };

const NOTHING: Status = {
  kind: "stopped",
  message: "This link has nothing to add.",
};

/**
 * Adds the line an add-to-cart link names (ROB-6903): the `/mcp` server hands
 * these links to chat apps, which cannot reach the shopper's cart themselves.
 * Stock and price are read again here, so an old link never adds a stale line.
 */
export function AddFromLink() {
  const { isLoading } = useCartState();
  const { addLine, openCart } = useCartActions();
  const [status, setStatus] = useState<Status>({ kind: "working" });
  const started = useRef(false);

  useEffect(() => {
    // The cart must be read first: adding before that would start a new cart.
    if (isLoading || started.current) {
      return;
    }
    started.current = true;

    const link = cartLinkQuery.safeParse(
      Object.fromEntries(new URLSearchParams(window.location.search))
    );
    // Taken out of the address bar first, so a reload never adds twice.
    window.history.replaceState(null, "", window.location.pathname);
    if (!link.success) {
      setStatus(NOTHING);
      return;
    }
    const { handle, variant, quantity } = link.data;

    const add = async (): Promise<Status> => {
      const response = await fetch(`/api/products/${handle}`);
      if (!response.ok) {
        throw new Error(`Product lookup answered ${response.status}`);
      }
      const { product } = (await response.json()) as ProductByHandleResponse;
      if (!product) {
        return { kind: "stopped", message: "We couldn't find that product." };
      }
      const line = cartLineFor(product, variantGidFromLink(variant), quantity);
      if (!line.ok) {
        return {
          kind: "stopped",
          message: `${product.title} can't be added in that option right now.`,
          handle,
        };
      }
      openCart();
      const { ok } = await addLine(line.variantId, quantity, line.metadata);
      return ok
        ? {
            kind: "added",
            message: `Added ${quantity} x ${product.title} (${line.metadata.variantTitle}) to your cart.`,
          }
        : {
            kind: "stopped",
            message: `${product.title} couldn't be added to your cart.`,
            handle,
          };
    };

    add()
      .then(setStatus)
      .catch(() =>
        setStatus({
          kind: "stopped",
          message: "We couldn't reach the shop. Open the product to add it.",
          handle,
        })
      );
  }, [isLoading, addLine, openCart]);

  return (
    <main className="px-4 py-16">
      <h1 className="mb-8 font-semibold text-3xl">Add to cart</h1>
      <div className="flex flex-col items-center justify-center gap-6 py-16">
        <p aria-live="polite" className="font-medium text-lg" role="status">
          {status.kind === "working" ? "Adding to your cart…" : status.message}
        </p>
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
