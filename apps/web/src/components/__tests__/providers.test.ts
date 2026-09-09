import { useQueryClient } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The inner providers reach the cart's server module and the browser's
// storage; only the query client is under test here, so they pass through.
vi.mock("@/components/cart/cart-context", () => ({
  CartProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/saved-items/saved-items-context", () => ({
  SavedItemsProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
}));

const { Providers } = await import("@/components/providers");

// A module-scope QueryClient is one cache for every request a server process
// renders. `useQuery` writes into it during SSR, and `initialData` is applied
// only when the key holds nothing — so the second request for a page carrying
// a seeded block painted the first request's product and discarded its own
// fresh read. One client per render keeps requests apart.
describe("Providers", () => {
  it("gives each render its own QueryClient", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useQueryClient());
      return null;
    }
    const render = () =>
      renderToStaticMarkup(
        createElement(Providers, null, createElement(Probe))
      );

    render();
    render();

    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
