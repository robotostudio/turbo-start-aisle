"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { PageContext } from "../types";

const PAGE_CONTEXT_KEY = ["ai-commerce", "page-context"] as const;

const INITIAL_CONTEXT: PageContext = { route: "/", surface: "home" };

/** Hook to set or merge into the current page context. Use in page-level useEffect. */
export function useSetPageContext() {
  const qc = useQueryClient();
  return useCallback(
    (ctx: Partial<PageContext>) => {
      qc.setQueryData<PageContext>(PAGE_CONTEXT_KEY, (prev) => ({
        ...(prev ?? INITIAL_CONTEXT),
        ...ctx,
      }));
    },
    [qc]
  );
}

/** Hook to read the current page context. Re-renders on changes. */
export function usePageContext(): PageContext {
  const { data } = useQuery<PageContext>({
    queryKey: PAGE_CONTEXT_KEY,
    queryFn: () => INITIAL_CONTEXT,
    initialData: INITIAL_CONTEXT,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return data;
}
