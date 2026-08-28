import type { PageBuilderBlock, PagebuilderType } from "@/types";

export type FeaturedProductsBlock = PagebuilderType<"featuredProducts">;

/**
 * Narrows a page builder block to the Featured Products one. A plain boolean
 * predicate in `filter` does not narrow, which is why the call site used to cast.
 */
export function isFeaturedProductsBlock(
  block: PageBuilderBlock
): block is FeaturedProductsBlock {
  return block._type === "featuredProducts";
}

export type FeaturedPicks = {
  /** Handles that resolved, in the editor's chosen order. */
  handles: string[];
  /** How many products the editor actually picked. */
  pickedCount: number;
  /** Picks whose product is gone, archived, or soft-deleted. */
  droppedCount: number;
  /** The editor picked products and not one of them survived. */
  allDropped: boolean;
};

/**
 * Separates "the editor picked nothing" from "every product the editor picked
 * is gone". Both reach the resolver as an empty handle list, and an empty handle
 * list is exactly what makes `getFeaturedProducts` answer with best-sellers — so
 * a curated row silently became whatever sells best, under the editor's own
 * heading, with nothing anywhere saying so.
 *
 * The block carries both halves of the answer. `query.ts` projects
 * `"productHandles": array::compact(products[<visible>]->store.slug.current)`
 * beside a `...` spread, so the raw `products` references survive alongside the
 * compacted handles. Evaluated against the real predicate with `groq-js`:
 *
 * | document state                      | productHandles | products |
 * | ----------------------------------- | -------------- | -------- |
 * | `products` absent                   | `null`         | absent   |
 * | `products: []`                      | `[]`           | `[]`     |
 * | picks all deleted / archived / soft-deleted | `[]`   | n refs   |
 * | 1 of 2 survives                     | `["alive"]`    | 2 refs   |
 *
 * So `pickedCount` is what separates row 2 from row 3 — both project `[]`. The
 * `Array.isArray` check guards a document where the field was never projected at
 * all (`undefined`, not `[]`): there `pickedCount > 0` alone would suppress a
 * block that is perfectly fine. That does not arise on the current render path —
 * `useOptimistic` in `pagebuilder.tsx` only reorders GROQ-projected blocks and
 * never swaps a raw draft document in — but the reducer is the kind of thing
 * that gets rewritten, and the check costs nothing.
 */
export function resolveFeaturedPicks(
  block: FeaturedProductsBlock
): FeaturedPicks {
  const handles = (block.productHandles ?? []).filter(
    (handle): handle is string => Boolean(handle)
  );
  const pickedCount = block.products?.length ?? 0;

  return {
    handles,
    pickedCount,
    droppedCount: Math.max(0, pickedCount - handles.length),
    allDropped:
      Array.isArray(block.productHandles) &&
      handles.length === 0 &&
      pickedCount > 0,
  };
}
