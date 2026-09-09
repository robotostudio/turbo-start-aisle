"use client";

import type { QueryAllCollectionsResult } from "@workspace/sanity/types";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CollectionCard } from "@/components/collection/collection-card";
import {
  CollectionsSortSelector,
  type SortOption,
  sortCollections,
} from "@/components/collections/collections-sort";
import { sanityCollectionToCardProps } from "@/lib/collection-card";

const DEFAULT_SORT: SortOption = "a-z";

type CollectionsContentProps = {
  title: string;
  collections: QueryAllCollectionsResult;
};

function CollectionGrid({
  collections,
}: {
  collections: QueryAllCollectionsResult;
}) {
  if (collections.length === 0) {
    return <p className="text-muted-foreground">No collections found.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-1 gap-y-10 md:grid-cols-3">
      {collections.map((collection) => (
        <CollectionCard
          key={collection._id}
          {...sanityCollectionToCardProps(collection)}
        />
      ))}
    </div>
  );
}

function SortedGrid({
  collections,
}: {
  collections: QueryAllCollectionsResult;
}) {
  const sort =
    (useSearchParams().get("sort") as SortOption | null) ?? DEFAULT_SORT;
  return <CollectionGrid collections={sortCollections(collections, sort)} />;
}

export function CollectionsContent({
  title,
  collections,
}: CollectionsContentProps) {
  return (
    <main className="site-container py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-medium text-2xl tracking-tight md:text-[32px]">
          {title}
        </h1>
        <Suspense fallback={null}>
          <CollectionsSortSelector />
        </Suspense>
      </div>
      <Suspense
        fallback={
          <CollectionGrid
            collections={sortCollections(collections, DEFAULT_SORT)}
          />
        }
      >
        <SortedGrid collections={collections} />
      </Suspense>
    </main>
  );
}
