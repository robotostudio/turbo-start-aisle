"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { useCartActions } from "@/components/cart/cart-context";
import type { CardVariant } from "@/components/product/product-card";
import { buildLineMetadata } from "@/lib/cart/metadata";
import { fetchProduct } from "@/lib/shopify/fetch-product";
import { formatMoney } from "@/lib/shopify/money";
import { collectionProductToCardProps } from "@/lib/shopify/product-card";
import type { ShopifyCollectionProduct } from "@/lib/shopify/types";

type LayersShowcaseProps = {
  _key: string;
  _type: "layersShowcase";
  heading?: string | null;
  description?: string | null;
  productHandle?: string | null;
  productTitle?: string | null;
  /**
   * The product, resolved server-side by the page and injected by
   * `pagebuilder.tsx` keyed on this block's `_key`. It seeds the query below,
   * so the images, link and price are in the server HTML rather than behind a
   * browser fetch — which is what a visitor with JavaScript off keeps. `null`
   * is a read that failed, or a route that resolves nothing; the browser fetch
   * then takes over exactly as before.
   */
  product?: ShopifyCollectionProduct | null;
};

const COLLAGE_CELLS = 4;

/** Finds the variant matching the selected color and size values. */
function resolveVariant(
  variants: CardVariant[] | undefined,
  color: string | undefined,
  size: string | undefined
): CardVariant | undefined {
  if (!variants || variants.length === 0) return undefined;
  return variants.find((variant) => {
    const values = variant.selectedOptions.map((option) => option.value);
    return (
      (!color || values.includes(color)) && (!size || values.includes(size))
    );
  });
}

/** Ordered, de-duplicated list of the product's image URLs (featured first). */
function productImageUrls(product: ShopifyCollectionProduct): string[] {
  const urls = [
    product.featuredImage?.url,
    ...(product.images?.edges ?? []).map((edge) => edge.node.url),
  ].filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
}

/** Bottom bar: add-to-cart action, size selector, and price. */
function PurchaseBar({ product }: { product: ShopifyCollectionProduct }) {
  const card = collectionProductToCardProps(product);
  const { addLine, openCart } = useCartActions();
  const [selectedSize, setSelectedSize] = useState(card.selectedSize);

  const sizes = card.sizes ?? [];
  const variant = resolveVariant(
    card.variants,
    card.selectedColor,
    selectedSize
  );
  const canAdd = Boolean(variant?.availableForSale);
  const price = formatMoney({
    amount: String(card.priceRange.minVariantPrice),
    currencyCode: card.currencyCode ?? "GBP",
  });

  function handleAdd() {
    if (!variant) return;
    const metadata = buildLineMetadata({
      productTitle: product.title,
      productHandle: product.handle,
      price: variant.price,
      selectedOptions: variant.selectedOptions,
      image: product.featuredImage ?? null,
    });
    openCart();
    void addLine(variant.id, 1, metadata);
  }

  return (
    <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-3 bg-background p-3 opacity-0 transition-opacity duration-200 md:group-hover:opacity-100">
      <button
        className="cursor-pointer font-medium text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canAdd}
        onClick={handleAdd}
        type="button"
      >
        Add to cart
      </button>
      <div className="flex items-center gap-3">
        {sizes.length > 0 && (
          <div className="flex items-center gap-2.5">
            {sizes.map((size) => (
              <button
                className={cn(
                  "cursor-pointer border-b text-xs",
                  size === selectedSize
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                key={size}
                onClick={() => setSelectedSize(size)}
                type="button"
              >
                {size}
              </button>
            ))}
          </div>
        )}
        <span className="font-medium text-foreground text-sm">{price}</span>
      </div>
    </div>
  );
}

export function LayersShowcase({
  heading,
  description,
  productHandle,
  productTitle,
  product,
}: LayersShowcaseProps) {
  const { data: resolved, isLoading } = useQuery({
    queryKey: ["product", productHandle],
    queryFn: () => (productHandle ? fetchProduct(productHandle) : null),
    enabled: Boolean(productHandle),
    staleTime: 60_000,
    // A seed makes the first render a success rather than a fetch, so no
    // skeleton reaches the server HTML. It is stamped as already stale: the
    // home page is prerendered and cached until a tag revalidation, so the
    // seed can be hours old by the time it hydrates, and TanStack would
    // otherwise date it to the moment the browser created the query and let
    // `staleTime` skip the mount refetch. Stale, it refetches on mount as the
    // block always did — with the seeded product on screen meanwhile, and kept
    // there if the read fails, since `fetchProduct` throws rather than
    // resolving `null`.
    initialData: product ?? undefined,
    initialDataUpdatedAt: 0,
  });

  // The handle is null when the referenced product is archived or deleted in
  // Shopify (`queryProductByHandle` gates it), and rendering on would leave a
  // heading standing over four empty collage cells. After the hook, not before,
  // so the hook order stays stable.
  if (!productHandle) return null;

  const pool = resolved ? productImageUrls(resolved) : [];
  const collage = pool.length
    ? Array.from({ length: COLLAGE_CELLS }, (_, i) => pool[i % pool.length])
    : [];
  const largeImage = pool[0] ?? null;
  const alt = resolved?.title ?? productTitle ?? "";

  return (
    <section className="site-container py-12 md:py-20">
      <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
        {/* Left: 2×2 collage from the product's images + heading/description */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-1">
            {(collage.length ? collage : Array(COLLAGE_CELLS).fill(null)).map(
              (url, index) => (
                <div
                  className="card-surface relative aspect-square overflow-hidden"
                  key={`collage-cell-${index}`}
                >
                  {isLoading && <Skeleton className="absolute inset-0" />}
                  {url && (
                    <Image
                      alt={alt}
                      className="object-cover"
                      fill
                      sizes="(min-width: 768px) 25vw, 50vw"
                      src={url}
                    />
                  )}
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-4">
            {heading && (
              <h2 className="flex-1 whitespace-pre-wrap font-medium text-base uppercase leading-tight">
                {heading}
              </h2>
            )}
            {description && (
              <p className="flex-1 text-muted-foreground text-xs tracking-wide">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Right: large product image with live add-to-cart on hover */}
        <div className="group card-surface relative aspect-4/5 overflow-hidden md:aspect-auto md:h-full md:min-h-125">
          {isLoading && <Skeleton className="absolute inset-0" />}
          {largeImage && resolved && (
            <Link
              className="relative block size-full"
              href={`/products/${resolved.handle}`}
            >
              <Image
                alt={alt}
                className="object-cover"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                src={largeImage}
              />
            </Link>
          )}
          {resolved && <PurchaseBar product={resolved} />}
        </div>
      </div>
    </section>
  );
}
