"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useCartActions, useCartState } from "@/components/cart/cart-context";
import { useSavedItems } from "@/components/saved-items/saved-items-context";
import { registerWebMcpTools } from "@/lib/webmcp";

/**
 * Registers the shopping tools with WebMCP (ROB-6902), so a visitor's own
 * browser agent can search, fill the cart and reach checkout by calling tools
 * instead of reading the page. The tools file loads only in a browser with
 * WebMCP, so the page weighs what it did for every other visitor.
 */
export function WebMcpTools() {
  const { cart, isLoading } = useCartState();
  const actions = useCartActions();
  const { items, add, remove } = useSavedItems();
  const router = useRouter();

  // The tools are registered once and read whatever is current through this.
  const page = { cart, isLoading, items, add, remove, router, ...actions };
  const live = useRef(page);
  useEffect(() => {
    live.current = page;
  });

  useEffect(() => {
    const { modelContext } = document;
    if (!modelContext) {
      return undefined;
    }
    const controller = new AbortController();
    import("./webmcp-shop-tools")
      .then(({ shopTools }) => {
        if (controller.signal.aborted) {
          return;
        }
        const tools = shopTools({
          getCart: () => live.current.cart,
          isCartLoading: () => live.current.isLoading,
          getSaved: () => live.current.items,
          setSaved: (handle, saved) =>
            saved ? live.current.add(handle) : live.current.remove(handle),
          addLine: (...line) => live.current.addLine(...line),
          updateLine: (...line) => live.current.updateLine(...line),
          removeLine: (lineId) => live.current.removeLine(lineId),
          openCart: () => live.current.openCart(),
          settle: () => live.current.settle(),
          push: (href, keepScroll) =>
            live.current.router.push(href, { scroll: !keepScroll }),
          leave: (url) => window.location.assign(url),
        });
        registerWebMcpTools(modelContext, tools, controller.signal);
      })
      // A chunk that fails to load leaves the page as it is for people.
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return null;
}
