"use client";

import html2canvas from "html2canvas-pro";
import TurndownService from "turndown";

import type { UserContext } from "../types";

/** Marker attribute — elements with this attribute are stripped from page-context capture and screenshots. */
export const AGENT_CHAT_HIDDEN_ATTRIBUTE = "data-agent-chat-hidden";

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

/** Deep page context — markdown of <main>, used by the page_context tool. */
export function capturePageContext() {
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
  for (const el of clone.querySelectorAll(`[${AGENT_CHAT_HIDDEN_ATTRIBUTE}]`)) {
    el.remove();
  }

  // Cap markdown so the model isn't drowned in noise on long pages. The
  // explicit marker makes truncation visible — without it, the model can
  // confidently claim "the page doesn't mention X" when X sat just below the
  // cutoff. The system prompt's page_context section tells the model how to
  // react when it sees this marker.
  const PAGE_CONTEXT_LIMIT = 4000;
  const full = turndown.turndown(clone.innerHTML);
  const truncated = full.length > PAGE_CONTEXT_LIMIT;
  const content = truncated
    ? `${full.slice(0, PAGE_CONTEXT_LIMIT)}\n\n[truncated: page content was ${full.length} chars; only the first ${PAGE_CONTEXT_LIMIT} are shown above]`
    : full;

  return {
    url: window.location.href,
    title: document.title,
    content,
    truncated,
    fullLength: full.length,
  };
}

/**
 * JPEG screenshot of the body (excluding [data-agent-chat-hidden] elements).
 * Returns a data URL. Clamped to 1600px on the long axis at quality 0.6 so the
 * follow-up sendMessage payload fits inside the /api/chat request size cap.
 */
export async function captureScreenshot(): Promise<string> {
  const canvas = await html2canvas(document.body, {
    ignoreElements: (el) => el.hasAttribute(AGENT_CHAT_HIDDEN_ATTRIBUTE),
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
