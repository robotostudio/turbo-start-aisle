"use client";

import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AnimatedMoney } from "@/components/elements/animated-money";
import { QuantitySelector } from "@/components/product/quantity-selector";
import {
  type CartLineChoice,
  cartLineFor,
  cartLinkQuery,
  lineTotal,
  MAX_LINK_QUANTITY,
  optionsLine,
  variantGidFromLink,
} from "@/lib/agent-shop";
import { formatMoney } from "@/lib/shopify/money";
import type { ProductByHandleResponse } from "@/lib/shopify/types";
import { useCartActions, useCartState } from "./cart-context";

type Offer = Extract<CartLineChoice, { ok: true }> & {
  quantity: number;
  /** The variant's own photo when it has one, else the product's. */
  imageUrl?: string;
};

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
  const variantGid = variantGidFromLink(variant);
  const line = cartLineFor(product, variantGid, quantity);
  const imageUrl =
    product.variants.edges.find(({ node }) => node.id === variantGid)?.node
      .image?.url ?? product.featuredImage?.url;
  return line.ok
    ? { kind: "offer", offer: { ...line, quantity, imageUrl }, adding: false }
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
    const { productTitle, productHandle, variantTitle } = offer.metadata;
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
          : `Added ${offer.quantity} × ${productTitle} (${variantTitle}).`,
    });
  }

  // One status line for every state, so a screen reader hears each change.
  const message =
    status.kind === "loading"
      ? "Looking up your item…"
      : status.kind === "offer"
        ? `${status.offer.metadata.productTitle} is ready to add.`
        : status.message;

  return (
    <main className="flex flex-col items-center gap-5 px-4 py-16 md:py-24">
      <h1 className="sr-only">Add to cart</h1>
      <p className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
        <span aria-hidden="true" className="size-1.5 bg-foreground" />
        Picked with your assistant
      </p>
      <div className="flex w-full max-w-100 flex-col border border-border bg-card">
        {status.kind === "offer" ? (
          <Slip
            // The cart must be read first: adding before that starts a new cart.
            busy={isLoading || status.adding}
            label={status.adding ? "Adding…" : "Add to cart"}
            offer={status.offer}
            onAdd={() => add(status.offer)}
            onQuantity={(quantity) =>
              setStatus({ ...status, offer: { ...status.offer, quantity } })
            }
          />
        ) : null}
        <div
          className={
            status.kind === "offer"
              ? "sr-only"
              : "flex flex-col items-center gap-5 px-6 py-10 text-center"
          }
        >
          <p className="font-medium text-lg" role="status">
            {message}
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
      </div>
      {status.kind === "offer" && (
        <p className="max-w-100 text-center text-muted-foreground text-sm">
          Nothing is in your cart until you press the button.
        </p>
      )}
    </main>
  );
}

/** The offer as a till slip: the item, how many, what it costs, one button. */
function Slip({
  offer,
  busy,
  label,
  onAdd,
  onQuantity,
}: {
  offer: Offer;
  busy: boolean;
  label: string;
  onAdd: () => void;
  onQuantity: (quantity: number) => void;
}) {
  const { productTitle, productHandle, price, selectedOptions } =
    offer.metadata;
  const options = optionsLine(selectedOptions);
  return (
    <>
      <div className="flex items-center gap-4 px-6 pt-6 pb-5">
        <div className="card-surface relative h-22 w-18 shrink-0 overflow-hidden">
          {offer.imageUrl && (
            // Decorative: the name beside it says what it is.
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="72px"
              src={offer.imageUrl}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-medium text-lg leading-6 tracking-[-0.01em]">
            {productTitle}
          </h2>
          {options && (
            <p className="text-muted-foreground text-sm">{options}</p>
          )}
        </div>
      </div>
      <dl className="flex flex-col px-6 text-sm">
        <div className="flex h-13 items-center justify-between border-foreground/20 border-t border-dashed">
          <dt className="text-muted-foreground">Quantity</dt>
          <dd>
            <QuantitySelector
              disabled={busy}
              max={MAX_LINK_QUANTITY}
              onChange={onQuantity}
              value={offer.quantity}
            />
          </dd>
        </div>
        <div className="flex h-11 items-center justify-between">
          <dt className="text-muted-foreground">Each</dt>
          <dd className="font-mono tabular-nums">{formatMoney(price)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-foreground/20 border-t border-dashed pt-4.5 pb-5.5">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-mono text-[28px] leading-8 tracking-[-0.02em]">
            <AnimatedMoney money={lineTotal(price, offer.quantity)} />
          </dd>
        </div>
      </dl>
      <div className="flex flex-col items-center gap-3.5 px-6 pb-6">
        <Button
          className="h-13 w-full text-base"
          disabled={busy}
          onClick={onAdd}
        >
          {label}
        </Button>
        <Link
          className="text-muted-foreground text-sm underline underline-offset-3 transition-colors duration-150 ease-out hover:text-foreground"
          href={`/products/${productHandle}`}
        >
          See the product first
        </Link>
      </div>
    </>
  );
}
