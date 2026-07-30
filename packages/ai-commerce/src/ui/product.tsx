"use client";

import { useQuery } from "@tanstack/react-query";
import { client } from "@workspace/sanity/client";
import Link from "next/link";

import { useCurrencyCode } from "../context/currency-context";
import {
  ADD_TO_CART_EVENT,
  type AddToCartEventDetail,
  type AiSelectedOption,
} from "../types";

interface ProductProps {
  id: string;
  isInline?: boolean;
}

interface ProductVariantData {
  _id: string;
  gid: string;
  title: string;
  available: boolean;
  price: number;
  optionValues: (string | null)[] | null;
}

interface ProductData {
  _id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  isActive: boolean;
  optionNames: (string | null)[] | null;
  variants: ProductVariantData[];
}

const PRODUCT_QUERY = /* groq */ `
  *[_id == $id][0]{
    _id,
    "title": store.title,
    "slug": store.slug.current,
    "imageUrl": store.previewImageUrl,
    "minPrice": store.priceRange.minVariantPrice,
    "maxPrice": store.priceRange.maxVariantPrice,
    "isActive": store.status == "active" && !store.isDeleted,
    "optionNames": store.options[].name,
    "variants": store.variants[]->{
      _id,
      "gid": store.gid,
      "title": store.title,
      "available": store.inventory.isAvailable,
      "price": store.price,
      "optionValues": [store.option1, store.option2, store.option3]
    }
  }
`;

/**
 * Zips the product's option names against a variant's option1/2/3 values into
 * the {name, value}[] shape the cart's LineMetadata expects.
 */
function selectedOptionsFor(
  product: ProductData,
  variant: ProductVariantData
): AiSelectedOption[] {
  return (product.optionNames ?? [])
    .map((name, index) => ({ name, value: variant.optionValues?.[index] }))
    .filter(
      (option): option is AiSelectedOption =>
        Boolean(option.name) && Boolean(option.value)
    );
}

/**
 * Ask the Shopify CDN for a thumbnail-sized image instead of the master.
 * `previewImageUrl` already carries a `?v=` cache-buster, so append rather than
 * assume we own the query string. Mirrors what `shopifyImageLoader` does in
 * apps/web/src/lib/shopify/image-loader.ts, which this package cannot import.
 */
function thumbnailUrl(url: string, width: number): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

function formatPrice(
  min: number | null,
  max: number | null,
  currencyCode: string
): string {
  if (min == null) return "";
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }).format(n);
    } catch {
      return `${currencyCode} ${n.toFixed(2)}`;
    }
  };
  if (max == null || min === max) return fmt(min);
  return `${fmt(min)}–${fmt(max)}`;
}

export function Product({ id, isInline }: ProductProps) {
  const currencyCode = useCurrencyCode();
  const {
    data: product,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["ai-commerce", "product", id],
    queryFn: () => client.fetch<ProductData | null>(PRODUCT_QUERY, { id }),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    if (isInline) return null;
    return (
      <div className="not-prose flex animate-pulse items-center gap-3 border border-border bg-card p-2">
        <div className="size-12 shrink-0 bg-muted" />
        <div className="h-5 w-32 bg-muted" />
      </div>
    );
  }

  // A failed fetch and a missing document both leave `data` undefined, so they
  // must be told apart. Conflating them is how a Sanity CORS rejection once
  // presented as "product not found" against a document id that existed —
  // pointing the investigation at the data layer, which was fine.
  if (isError) {
    if (isInline) {
      return (
        <span className="text-destructive italic" title={String(error)}>
          [product unavailable]
        </span>
      );
    }
    return (
      <div className="not-prose flex flex-col gap-0.5 border border-destructive/40 bg-destructive/10 p-2 text-destructive text-xs">
        <span className="font-medium">Couldn't load this product</span>
        <span className="text-[10px] opacity-80">
          {error instanceof Error ? error.message : "Request failed"}
        </span>
      </div>
    );
  }

  // The model can emit a `::document{id="…"}` with a hallucinated _id (no
  // matching Sanity doc). Silently rendering null hides that failure — the
  // user just sees a gap. Render an explicit placeholder so the breakage is
  // visible and the user can call it out.
  if (!product) {
    if (isInline) {
      return (
        <span
          className="text-muted-foreground italic"
          title={`Missing product ${id}`}
        >
          [unavailable product]
        </span>
      );
    }
    return (
      <div className="not-prose flex items-center gap-3 border border-dashed border-border bg-muted/30 p-2 text-muted-foreground text-xs">
        <div className="size-12 shrink-0 bg-muted" />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">Product not found</span>
          <span className="text-[10px] opacity-70">id: {id}</span>
        </div>
      </div>
    );
  }

  if (isInline) {
    return (
      <Link
        href={`/products/${product.slug}`}
        className="text-primary underline-offset-4 hover:underline"
      >
        {product.title}
      </Link>
    );
  }

  const purchasable =
    product.isActive &&
    product.variants.length === 1 &&
    product.variants[0]?.available === true;

  return (
    <div className="not-prose group flex items-center gap-3 border border-border bg-card p-2 transition-colors hover:border-primary/40 hover:bg-accent">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3 no-underline"
        href={`/products/${product.slug}`}
      >
        {/* card-surface matches the storefront's product cards: transparent
            product shots float on a soft gradient rather than a flat grey box. */}
        <div className="card-surface relative size-14 shrink-0 overflow-hidden border border-border/50">
          {product.imageUrl ? (
            // biome-ignore lint/performance/noImgElement: external Shopify CDN URL, and next/image's loader lives behind the app's `@/` alias
            <img
              alt={product.title}
              className="size-full object-contain"
              loading="lazy"
              src={thumbnailUrl(product.imageUrl, 112)}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground text-sm">
            {product.title}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatPrice(product.minPrice, product.maxPrice, currencyCode)}
          </span>
          {purchasable ? null : (
            <span className="shrink-0 text-primary text-xs transition-colors group-hover:text-primary/70">
              View options →
            </span>
          )}
        </div>
      </Link>
      {purchasable && product.variants[0] ? (
        <AddToCartButton
          detail={{
            variantGid: product.variants[0].gid,
            productHandle: product.slug,
            productTitle: product.title,
            variantTitle: product.variants[0].title,
            price: {
              amount: String(product.variants[0].price),
              currencyCode,
            },
            image: product.imageUrl
              ? {
                  url: product.imageUrl,
                  altText: product.title,
                  width: 0,
                  height: 0,
                }
              : null,
            selectedOptions: selectedOptionsFor(product, product.variants[0]),
          }}
        />
      ) : null}
    </div>
  );
}

function AddToCartButton({
  detail,
}: {
  detail: Omit<AddToCartEventDetail, "quantity">;
}) {
  return (
    <button
      className="shrink-0 self-stretch border border-border bg-primary px-3 font-medium text-primary-foreground text-xs uppercase tracking-wide transition-colors hover:bg-primary/90"
      type="button"
      onClick={() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
          new CustomEvent<AddToCartEventDetail>(ADD_TO_CART_EVENT, {
            detail: { ...detail, quantity: 1 },
          })
        );
      }}
    >
      Add to cart
    </button>
  );
}
