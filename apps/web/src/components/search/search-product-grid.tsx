"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";

import { ProductCard } from "@/components/product/product-card";
import { collectionProductToCardProps } from "@/lib/shopify/product-card";
import type { ShopifyCollectionProduct } from "@/lib/shopify/types";
import { SearchUnavailable } from "./search-unavailable";

const DEFAULT_SKELETON_COUNT = 8;

type SearchProductGridProps = {
  products: ShopifyCollectionProduct[];
  isLoading: boolean;
  skeletonCount?: number;
  /** Forwarded to `next/link`: replace the current history entry, don't push. */
  replace?: boolean;
  /**
   * A failed read, kept distinct from an empty one. Without it an empty
   * `products` array renders "No products found." either way, which reports an
   * outage to the shopper as a search that genuinely matched nothing.
   */
  error?: Error | null;
};

/** Shared 4-col ProductCard grid used by both the empty and active states. */
export function SearchProductGrid({
  products,
  isLoading,
  skeletonCount = DEFAULT_SKELETON_COUNT,
  replace,
  error,
}: SearchProductGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-x-1 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div className="flex flex-col gap-2" key={index.toString()}>
            <Skeleton className="aspect-56/75 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  // Ahead of the empty check, and behind the loading one: a retry in flight
  // should show skeletons rather than hold a failure that may not survive it.
  if (error) {
    return <SearchUnavailable />;
  }

  if (products.length === 0) {
    return <p className="py-8 text-muted-foreground">No products found.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-1 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          {...collectionProductToCardProps(product)}
          replace={replace}
        />
      ))}
    </div>
  );
}
