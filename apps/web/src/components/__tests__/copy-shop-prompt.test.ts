// @vitest-environment jsdom
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CopyShopPrompt } from "../copy-shop-prompt";

const PROMPT =
  "Shop Aisle for me. Ask me for anything you need first. The steps are at https://shop.test/shop-for-agents";

const chip = () => createElement(CopyShopPrompt, { prompt: PROMPT });

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Server HTML first, then hydrate, the way a browser gets it. */
async function mount() {
  const container = document.createElement("div");
  container.innerHTML = renderToString(chip());
  document.body.append(container);
  await act(async () => {
    hydrateRoot(container, chip());
  });
  const button = container.querySelector("button");
  const status = container.querySelector("output");
  if (!(button && status)) throw new Error("the chip did not hydrate");
  return { button, status };
}

const stubClipboard = (writeText: (text: string) => Promise<void>) =>
  vi.stubGlobal("navigator", { clipboard: { writeText } });

describe("CopyShopPrompt", () => {
  it("is a plain link to the agent guide before JavaScript runs", () => {
    const html = renderToStaticMarkup(chip());

    expect(html).toContain('href="/shop-for-agents"');
    expect(html).toContain("Let your agent shop for you");
    expect(html).not.toContain("<button");
    // The sentence is copied, never shown.
    expect(html).not.toContain(PROMPT);
  });

  it("copies the prompt, says so, then goes back after 2s", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const { button, status } = await mount();
    expect(status.textContent).toBe("");
    expect(status.getAttribute("aria-live")).toBe("polite");

    button.click();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(writeText).toHaveBeenCalledWith(PROMPT);
    expect(button.dataset.copied).toBe("true");
    expect(status.textContent).toBe("Copied. Now paste it in your agent");
    // The paste line is hidden from the button's name, so a screen reader
    // hears it once, from the status.
    const named = [...button.querySelectorAll("span")]
      .filter((span) => span.children.length === 0)
      .filter((span) => !span.closest("[aria-hidden]"))
      .map((span) => span.textContent?.trim());
    expect(named).toEqual([
      "Let your agent shop for you",
      "(copies a prompt for Claude, ChatGPT or Gemini)",
    ]);

    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(button.dataset.copied).toBe("false");
    expect(status.textContent).toBe("");
  });

  it("opens the agent guide when the clipboard is unavailable", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const { button } = await mount();

    await act(async () => button.click());

    expect(assign).toHaveBeenCalledWith("/shop-for-agents");
    expect(button.dataset.copied).toBe("false");
  });
});
