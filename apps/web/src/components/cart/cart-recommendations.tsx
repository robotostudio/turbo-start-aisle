"use client";

import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

import { ProductCard } from "@/components/product/product-card";
import { collectionProductToCardProps } from "@/lib/shopify/product-card";
import type { FeaturedProduct } from "@/lib/shopify/types";

// One card (w-[340px]) plus the row's gap-4.
const CARD_STEP = 356;

async function fetchFeaturedProducts(): Promise<FeaturedProduct[]> {
  const res = await fetch("/api/featured-products");
  if (!res.ok) return [];
  const data: { products: FeaturedProduct[] } = await res.json();
  return data.products;
}

export function CartRecommendations() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: fetchFeaturedProducts,
    staleTime: 5 * 60 * 1000,
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateArrows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  };

  const scroll = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({
      behavior: "smooth",
      left: direction * CARD_STEP,
    });
  };

  if (!isLoading && products.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground text-xl tracking-[0.24px]">
          Must haves
        </h3>
        <div className="flex items-center">
          <Button
            aria-label="Previous products"
            disabled={atStart}
            onClick={() => scroll(-1)}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            aria-label="Next products"
            disabled={isLoading || atEnd}
            onClick={() => scroll(1)}
            size="icon"
            variant="ghost"
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="-mr-8 flex gap-4 overflow-hidden">
          {["a", "b"].map((key) => (
            <div className="w-[340px] shrink-0" key={key}>
              <Skeleton className="aspect-56/75 w-full" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="-mr-8 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={updateArrows}
          // Measure once on mount too: a row that doesn't overflow never
          // fires onScroll, so this is what disables the right arrow then.
          ref={(el) => {
            scrollerRef.current = el;
            if (el) updateArrows();
          }}
        >
          {products.map((product) => (
            <div className="w-[340px] shrink-0" key={product.id}>
              <ProductCard {...collectionProductToCardProps(product)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
