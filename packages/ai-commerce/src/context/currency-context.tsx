"use client";

import { createContext, useContext } from "react";

/**
 * The storefront's display currency, threaded from <ChatWidget currencyCode>
 * down to the product card renderer (which lives behind a markdown directive,
 * so it can't receive props directly). Defaults to "GBP" to match the
 * fallback in `apps/web/src/components/product/product-card.tsx`.
 */
const CurrencyContext = createContext<string>("GBP");

export const CurrencyProvider = CurrencyContext.Provider;

export function useCurrencyCode(): string {
  return useContext(CurrencyContext);
}
