import { describe, expect, it } from "vitest";

import {
  type FeaturedProductsBlock,
  resolveFeaturedPicks,
} from "@/lib/featured-blocks";

/**
 * "The editor picked nothing" and "every product the editor picked is gone"
 * reach the resolver as the same thing — an empty handle list — because the
 * GROQ compacts a pick away once its product is deleted, archived or
 * soft-deleted. An empty handle list is exactly what makes `getFeaturedProducts`
 * answer with best-sellers, so a curated row silently became whatever sells
 * best under the editor's own heading.
 *
 * The second case is the guard rail rather than the bug: the automatic row is a
 * documented feature of this block, and a fix that killed it would be worse than
 * the fault it replaced.
 *
 * The shapes below are what `groq-js` actually returns for the projection in
 * `query.ts` — `null` handles when the field is absent, `[]` when every pick was
 * filtered out.
 */

function block(
  productHandles: string[] | null,
  pickCount: number
): FeaturedProductsBlock {
  return {
    _key: "block-1",
    _type: "featuredProducts",
    heading: "Editor's picks",
    products: Array.from({ length: pickCount }, (_, i) => ({
      _key: `pick-${i}`,
      _ref: `product-${i}`,
      _type: "reference" as const,
    })),
    productHandles,
  } as FeaturedProductsBlock;
}

describe("resolveFeaturedPicks", () => {
  it("flags a block whose every pick was filtered away", () => {
    // Four dead references compacted down to nothing; the raw picks are the
    // only remaining evidence the editor ever chose anything.
    expect(resolveFeaturedPicks(block([], 4))).toMatchObject({
      handles: [],
      pickedCount: 4,
      droppedCount: 4,
      allDropped: true,
    });
  });

  it("leaves the best-seller fallback alone when the editor picked none", () => {
    // `products: []` in the document still projects `productHandles: []`.
    expect(resolveFeaturedPicks(block([], 0))).toMatchObject({
      handles: [],
      pickedCount: 0,
      droppedCount: 0,
      allDropped: false,
    });
  });

  it("leaves the fallback alone when the field was never projected", () => {
    // The absent-`products` shape: handles come back `null`, not `[]`.
    expect(resolveFeaturedPicks(block(null, 0))).toMatchObject({
      handles: [],
      allDropped: false,
    });
  });

  it("keeps the survivors, and counts the losses, on a partial drop", () => {
    expect(resolveFeaturedPicks(block(["wren-washed-cap"], 3))).toMatchObject({
      handles: ["wren-washed-cap"],
      pickedCount: 3,
      droppedCount: 2,
      allDropped: false,
    });
  });

  it("reports a fully intact block as untouched", () => {
    expect(resolveFeaturedPicks(block(["a", "b"], 2))).toMatchObject({
      handles: ["a", "b"],
      droppedCount: 0,
      allDropped: false,
    });
  });
});
