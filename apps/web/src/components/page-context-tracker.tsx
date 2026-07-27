"use client";

import type { PageSurface } from "@workspace/ai-commerce";
import { useSetPageContext } from "@workspace/ai-commerce";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Derive a coarse PageSurface from the pathname. Page components may override with richer data. */
function surfaceFromPathname(pathname: string): PageSurface {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/products/")) return "pdp";
  // Includes the /collections index, not just /collections/<handle>.
  if (pathname === "/collections" || pathname.startsWith("/collections/"))
    return "collection";
  if (pathname.startsWith("/cart")) return "cart";
  // The search modal is an intercepted route, so the pathname is still /search.
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/blog")) return "content";
  // Everything else is a CMS page served by the [...slug] catch-all.
  return "content";
}

/**
 * Mounts once in the root layout. Updates the page-context React Query entry
 * whenever the pathname changes. Page-level components can refine with
 * useSetPageContext({ surface: 'pdp', product: {...} }).
 */
export function PageContextTracker() {
  const setPageContext = useSetPageContext();
  const pathname = usePathname();

  useEffect(() => {
    setPageContext({
      route: pathname,
      surface: surfaceFromPathname(pathname),
    });
  }, [pathname, setPageContext]);

  return null;
}
