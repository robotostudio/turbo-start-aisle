"use client";

import html2canvas from "html2canvas-pro";
import TurndownService from "turndown";

import type { UserContext } from "../types";

/** Marker attribute — elements with this attribute are stripped from page-context capture and screenshots. */
export const AGENT_CHAT_HIDDEN_ATTRIBUTE = "data-agent-chat-hidden";

/**
 * Chrome that isn't page content. The chat's own UI carries the marker
 * attribute, but sonner and Radix render their portals at the end of <body>
 * without it — so the toast stack, cart drawer, saved-items drawer and search
 * modal would otherwise leak into both the scrape and the screenshot.
 */
const OVERLAY_SELECTORS = [
  `[${AGENT_CHAT_HIDDEN_ATTRIBUTE}]`,
  "[data-sonner-toaster]",
  "[data-radix-popper-content-wrapper]",
  '[role="dialog"]',
];

/** Lightweight per-turn context: title, meta description, pathname. Sent on every chat request. */
export function captureUserContext(): UserContext {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { documentTitle: "", documentLocation: "/" };
  }
  const metaDescription =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ||
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content");
  return {
    documentTitle: document.title,
    documentDescription: metaDescription || undefined,
    documentLocation: window.location.pathname,
  };
}

/**
 * Mirrors toMarkdownHref in apps/web/src/lib/markdown/shared.ts. Duplicated
 * because this package cannot import from the web app's `@/` alias.
 */
function toMarkdownHref(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return "/index.md";
  return `${normalized}.md`;
}

/**
 * Routes the Markdown surface can serve. /cart and /search are client state
 * with no Sanity document behind them, so they must stay on the DOM path.
 */
function hasMarkdownTwin(pathname: string): boolean {
  if (pathname === "/cart" || pathname.startsWith("/search")) return false;
  return true;
}

const PAGE_CONTEXT_LIMIT_DOM = 4000;
// Markdown from the server is far denser than a DOM scrape — no navbar, footer
// or promo banner — so it can afford a larger budget before truncating.
const PAGE_CONTEXT_LIMIT_MARKDOWN = 8000;

function withTruncation(full: string, limit: number) {
  const truncated = full.length > limit;
  return {
    content: truncated
      ? `${full.slice(0, limit)}\n\n[truncated: page content was ${full.length} chars; only the first ${limit} are shown above]`
      : full,
    truncated,
    fullLength: full.length,
  };
}

/**
 * Deep page context for the page_context tool.
 *
 * Prefers the site's server-rendered Markdown view, which covers every route
 * type — including PDP and collection pages, which render no <main> for the DOM
 * scrape to find. Falls back to scraping the DOM when there is no Markdown twin
 * (cart, search), when the URL carries query params (the Markdown route ignores
 * them, so a filtered collection would silently describe the unfiltered one),
 * or when the fetch fails.
 */
export async function capturePageContext() {
  const { pathname, search, href } = window.location;

  if (search === "" && hasMarkdownTwin(pathname)) {
    try {
      const res = await fetch(toMarkdownHref(pathname), {
        headers: { Accept: "text/markdown" },
      });
      if (
        res.ok &&
        res.headers.get("content-type")?.startsWith("text/markdown")
      ) {
        const full = await res.text();
        return {
          url: href,
          title: document.title,
          source: "markdown" as const,
          ...withTruncation(full, PAGE_CONTEXT_LIMIT_MARKDOWN),
        };
      }
    } catch {
      // Fall through to the DOM scrape below.
    }
  }

  return capturePageContextFromDom();
}

/** DOM-scraping fallback — markdown of <main>, or <body> when there is none. */
function capturePageContextFromDom() {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
  });

  turndown.addRule("removeNoise", {
    filter: (node: HTMLElement) =>
      [
        "SCRIPT",
        "STYLE",
        "SVG",
        "VIDEO",
        "AUDIO",
        "IFRAME",
        "NOSCRIPT",
      ].includes(node.nodeName),
    replacement: () => "",
  });

  const main = document.querySelector("main") || document.body;
  const clone = main.cloneNode(true) as Element;
  for (const el of clone.querySelectorAll(OVERLAY_SELECTORS.join(","))) {
    el.remove();
  }

  // Cap markdown so the model isn't drowned in noise on long pages. The
  // explicit marker makes truncation visible — without it, the model can
  // confidently claim "the page doesn't mention X" when X sat just below the
  // cutoff. The system prompt's page_context section tells the model how to
  // react when it sees this marker.
  const full = turndown.turndown(clone.innerHTML);

  return {
    url: window.location.href,
    title: document.title,
    source: "dom" as const,
    ...withTruncation(full, PAGE_CONTEXT_LIMIT_DOM),
  };
}

/**
 * JPEG screenshot of the body (excluding [data-agent-chat-hidden] elements).
 * Returns a data URL. Clamped to 1600px on the long axis at quality 0.6 so the
 * follow-up sendMessage payload fits inside the /api/chat request size cap.
 */
export async function captureScreenshot(): Promise<string> {
  const canvas = await html2canvas(document.body, {
    // ignoreElements tests each element itself, not its ancestors, so matching
    // the portal roots is enough to drop their whole subtree.
    ignoreElements: (el) => OVERLAY_SELECTORS.some((sel) => el.matches(sel)),
  });

  const MAX_DIMENSION = 1600;
  const QUALITY = 0.6;
  let finalCanvas = canvas;

  if (canvas.width > MAX_DIMENSION || canvas.height > MAX_DIMENSION) {
    const scale = Math.min(
      MAX_DIMENSION / canvas.width,
      MAX_DIMENSION / canvas.height
    );
    const resizedCanvas = document.createElement("canvas");
    resizedCanvas.width = Math.floor(canvas.width * scale);
    resizedCanvas.height = Math.floor(canvas.height * scale);
    const ctx = resizedCanvas.getContext("2d");
    ctx?.drawImage(canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
    finalCanvas = resizedCanvas;
  }

  return finalCanvas.toDataURL("image/jpeg", QUALITY);
}
