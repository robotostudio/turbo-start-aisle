"use client";

import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Check } from "lucide-react";
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
  /** The most the stepper allows: the link's limit, or the stock if lower. */
  max: number;
  /** The variant's own photo when it has one, else the product's. */
  imageUrl?: string;
};

type Status =
  | { kind: "loading" }
  | { kind: "offer"; offer: Offer; adding: boolean }
  // `offer` is the line as added. It is left out when Shopify changed the
  // line, because the slip would then show a count the cart does not hold.
  | { kind: "added"; message: string; offer?: Offer }
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
  const chosen = product.variants.edges.find(
    ({ node }) => node.id === variantGid
  )?.node;
  const stock = chosen?.quantityAvailable ?? 0;
  const max =
    stock > 0 ? Math.min(MAX_LINK_QUANTITY, stock) : MAX_LINK_QUANTITY;
  const imageUrl = chosen?.image?.url ?? product.featuredImage?.url;
  return line.ok
    ? {
        kind: "offer",
        offer: { ...line, quantity: Math.min(quantity, max), max, imageUrl },
        adding: false,
      }
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
  const { addLine } = useCartActions();
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
    // The cart drawer stays shut: the slip is the confirmation, and an open
    // drawer would cover it and hide the status line from screen readers.
    const { ok, warnings } = await addLine(
      offer.variantId,
      offer.quantity,
      offer.metadata
    );
    const { productTitle, productHandle, selectedOptions } = offer.metadata;
    const options = optionsLine(selectedOptions);
    const added = `${offer.quantity} × ${productTitle}${options ? ` (${options})` : ""}`;
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
    setStatus(
      warnings.length > 0
        ? {
            kind: "added",
            message: `Added ${productTitle}. ${warnings.map((warning) => warning.message).join(" ")}`,
          }
        : { kind: "added", message: `Added ${added}.`, offer }
    );
  }

  // One status line for every state, so a screen reader hears each change.
  const message =
    status.kind === "loading"
      ? "Looking up your item…"
      : status.kind === "offer"
        ? `${status.offer.metadata.productTitle} is ready to add.`
        : status.message;

  // One slip in one place for both states, so the press swaps its rows and
  // button without rebuilding the photo or the total.
  let slip: SlipProps | undefined;
  if (status.kind === "offer") {
    slip = {
      // The cart must be read first: adding before that starts a new cart.
      busy: isLoading || status.adding,
      label: status.adding ? "Adding…" : "Add to cart",
      offer: status.offer,
      onAdd: () => add(status.offer),
      onQuantity: (quantity) =>
        setStatus((now) =>
          now.kind === "offer"
            ? { ...now, offer: { ...now.offer, quantity } }
            : now
        ),
    };
  } else if (status.kind === "added" && status.offer) {
    slip = { added: true, offer: status.offer };
  }

  return (
    <main className="flex flex-col items-center px-4 py-16 md:py-24">
      <h1 className="sr-only">Add to cart</h1>
      <div className="flex w-full max-w-100 flex-col border border-border">
        {slip && <Slip {...slip} />}
        {status.kind === "loading" && <SlipSkeleton />}
        <Notice message={message} status={status} />
      </div>
    </main>
  );
}

/**
 * The status line, always mounted so a screen reader hears each change. It is
 * only shown when there is no slip to show: a stopped link, or an add Shopify
 * changed. Then it carries the one way on.
 */
function Notice({ status, message }: { status: Status; message: string }) {
  const changed = status.kind === "added" && !status.offer;
  return (
    <div
      className={
        status.kind === "stopped" || changed
          ? "flex flex-col items-center gap-5 px-6 py-10 text-center"
          : "sr-only"
      }
    >
      <p className="font-medium text-lg" role="status">
        {message}
      </p>
      {changed && (
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
  );
}

/**
 * The slip while the item is looked up: the same blocks at the same sizes, so
 * nothing moves when the item arrives. The status line says what is happening.
 */
function SlipSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex items-center gap-4 p-6 pb-5">
        <Skeleton className="h-22 w-18 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col px-6">
        <div className="flex h-13 items-center justify-between border-foreground/20 border-t border-dashed">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="flex items-center justify-between border-foreground/20 border-t border-dashed pt-4.5 pb-5.5">
          <Skeleton className="h-4 w-10" />
          {/* 44px: the animated total renders taller than its line height. */}
          <Skeleton className="h-11 w-28" />
        </div>
      </div>
      <div className="px-6 pb-6">
        <Skeleton className="h-13 w-full" />
      </div>
    </div>
  );
}

type SlipProps =
  | {
      added?: false;
      offer: Offer;
      busy: boolean;
      label: string;
      onAdd: () => void;
      onQuantity: (quantity: number) => void;
    }
  | { added: true; offer: Offer };

/** Moves focus to the link that replaced the pressed button. */
const focusOnMount = (node: HTMLAnchorElement | null) => node?.focus();

/**
 * The line as a till slip: the item and its price, how many, the total, one
 * button. Nothing else: the name links to the product, and the dashed rules
 * and mono figures are the slip's only decoration.
 *
 * Before the add it offers the line; after, the same slip is the receipt, at
 * the same size, with the count fixed and the button leading to the cart.
 */
function Slip(props: SlipProps) {
  const { offer } = props;
  const { productTitle, productHandle, price, selectedOptions } =
    offer.metadata;
  const options = optionsLine(selectedOptions);
  return (
    <>
      <div className="flex items-center gap-4 p-6 pb-5">
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
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium text-lg leading-6 tracking-[-0.01em]">
              <Link
                className="underline-offset-3 hover:underline"
                href={`/products/${productHandle}`}
              >
                {productTitle}
              </Link>
            </h2>
            <p className="shrink-0 font-mono text-sm tabular-nums">
              <span className="sr-only">Price each: </span>
              {formatMoney(price)}
            </p>
          </div>
          {options && (
            <p className="text-muted-foreground text-sm">{options}</p>
          )}
        </div>
      </div>
      <dl className="flex flex-col px-6 text-sm">
        <div className="flex h-13 items-center justify-between border-foreground/20 border-t border-dashed">
          {props.added ? (
            <>
              <dt className="flex items-center gap-2">
                <Check aria-hidden="true" className="size-4" />
                Added to your cart
              </dt>
              <dd className="font-mono text-base tabular-nums">
                <span className="sr-only">Quantity: </span>
                {offer.quantity}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-muted-foreground">Quantity</dt>
              <dd>
                <QuantitySelector
                  disabled={props.busy}
                  max={offer.max}
                  onChange={props.onQuantity}
                  value={offer.quantity}
                />
              </dd>
            </>
          )}
        </div>
        <div className="flex items-baseline justify-between border-foreground/20 border-t border-dashed pt-4.5 pb-5.5">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-mono text-[28px] leading-8 tracking-[-0.02em]">
            <AnimatedMoney money={lineTotal(price, offer.quantity)} />
          </dd>
        </div>
      </dl>
      <div className="px-6 pb-6">
        {props.added ? (
          <Button asChild className="h-13 w-full text-base">
            <Link href="/cart" ref={focusOnMount}>
              View cart
            </Link>
          </Button>
        ) : (
          <Button
            className="h-13 w-full text-base"
            disabled={props.busy}
            onClick={props.onAdd}
          >
            {props.label}
          </Button>
        )}
      </div>
    </>
  );
}
