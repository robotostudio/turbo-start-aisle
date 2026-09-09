"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type PropsWithChildren, useState } from "react";

import type { Cart } from "@/lib/shopify/types";
import { CartProvider } from "./cart/cart-context";
import { SavedItemsProvider } from "./saved-items/saved-items-context";

export function Providers({
  children,
  initialCart,
}: PropsWithChildren<{ initialCart?: Cart | null }>) {
  // One client per render, not one per module. A module-scope client is one
  // cache for every request a server process renders: `useQuery` writes into
  // it during SSR, and `initialData` applies only when the key holds nothing,
  // so the second request for a page carrying a seeded block painted the first
  // request's product and discarded its own fresh read. On the client this
  // still runs once for the life of the page.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider initialCart={initialCart}>
        <SavedItemsProvider>
          <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            disableTransitionOnChange
            enableColorScheme
            enableSystem
          >
            {children}
          </NextThemesProvider>
        </SavedItemsProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}
