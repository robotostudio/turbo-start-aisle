"use client";

import { useQuery } from "@tanstack/react-query";
import { client } from "@workspace/sanity/client";
import Link from "next/link";

import { useCurrencyCode } from "../context/currency-context";

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
}

interface ProductData {
  _id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  isActive: boolean;
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
    "variants": store.variants[]->{
      _id,
      "gid": store.gid,
      "title": store.title,
      "available": store.inventory.isAvailable,
      "price": store.price
    }
  }
`;

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
  const { data: product, isLoading } = useQuery({
    queryKey: ["ai-commerce", "product", id],
    queryFn: () => client.fetch<ProductData | null>(PRODUCT_QUERY, { id }),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    if (isInline) return null;
    return (
      <div className="flex animate-pulse items-center gap-3 rounded-md border border-border bg-card p-2">
        <div className="h-12 w-12 shrink-0 rounded bg-muted" />
        <div className="h-5 w-32 rounded bg-muted" />
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
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
        <div className="h-12 w-12 shrink-0 rounded bg-muted" />
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
    <div className="group flex items-center gap-3 rounded-md border border-border bg-card p-2 transition-colors hover:border-primary/40 hover:bg-accent">
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 items-center gap-3"
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted">
          {product.imageUrl ? (
            // biome-ignore lint/performance/noImgElement: external Shopify CDN URL
            <img
              src={product.imageUrl}
              alt={product.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {product.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatPrice(product.minPrice, product.maxPrice, currencyCode)}
          </span>
          {!purchasable ? (
            <span className="shrink-0 text-xs text-primary transition-colors group-hover:text-primary/70">
              View options →
            </span>
          ) : null}
        </div>
      </Link>
      {purchasable && product.variants[0] ? (
        <AddToCartButton variantGid={product.variants[0].gid} />
      ) : null}
    </div>
  );
}

function AddToCartButton({ variantGid }: { variantGid: string }) {
  return (
    <button
      type="button"
      className="rounded-md border border-border bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      onClick={() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
          new CustomEvent("ai-commerce:add-to-cart", {
            detail: { variantGid, quantity: 1 },
          })
        );
      }}
    >
      Add to cart
    </button>
  );
}
