// @vitest-environment jsdom
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CopyShopPrompt } from "../copy-shop-prompt";

const PROMPT =
  "Shop Aisle for me. Ask me for anything you need first. The steps are at https://shop.test/shop-for-agents";

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/** Server HTML first, then hydrate, the way a browser gets it. */
async function mount() {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    createElement(CopyShopPrompt, { prompt: PROMPT })
  );
  document.body.append(container);
  await act(async () => {
    hydrateRoot(container, createElement(CopyShopPrompt, { prompt: PROMPT }));
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("no button");
  return { container, button };
}

const stubClipboard = (writeText: (text: string) => Promise<void>) =>
  vi.stubGlobal("navigator", { clipboard: { writeText } });

describe("CopyShopPrompt", () => {
  it("renders the sentence as plain text before any script runs", () => {
    const html = renderToString(
      createElement(CopyShopPrompt, { prompt: PROMPT })
    );
    expect(html).toContain(PROMPT);
    expect(html).toContain('aria-live="polite"');
  });

  it("copies exactly the sentence and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    const { container, button } = await mount();

    await act(async () => button.click());

    expect(writeText).toHaveBeenCalledWith(PROMPT);
    expect(button.textContent).toBe("Copied");
    expect(container.querySelector("output")?.textContent).toMatch(/^Copied/);
  });

  it("selects the sentence when the clipboard is blocked", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    const { container, button } = await mount();

    await act(async () => button.click());

    expect(button.textContent).toBe("Copy");
    expect(container.querySelector("output")?.textContent).toMatch(
      /^Could not copy/
    );
    expect(window.getSelection()?.toString()).toBe(PROMPT);
  });
});
