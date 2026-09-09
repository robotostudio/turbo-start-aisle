// @vitest-environment jsdom
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A visitor on a slow connection can open a question natively before the
 * bundle lands: the browser sets `open` on the `<details>` while React is not
 * yet running. When hydration then flipped the `hydrated` flag, the answer
 * panel was re-rendered with the motion target React *thought* was current —
 * `height: 0` — and the visibly open answer snapped shut to a clipped box.
 *
 * The assertions read the target the component hands Motion rather than any
 * animated style, so they hold in jsdom, which lays nothing out. Motion is
 * stood in for by a div that prints its `animate` prop.
 */

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      animate,
      initial: _initial,
      variants: _variants,
      transition: _transition,
      onAnimationComplete: _onAnimationComplete,
      ...rest
    }: Record<string, unknown>) =>
      createElement("div", {
        ...rest,
        "data-animate":
          animate === undefined ? undefined : JSON.stringify(animate),
      }),
  },
}));
vi.mock("@/components/elements/rich-text", () => ({
  RichText: ({
    richText,
  }: {
    richText?: { children?: { text?: string }[] }[] | null;
  }) => createElement("p", null, richText?.[0]?.children?.[0]?.text ?? ""),
}));

const { FaqEntry } = await import("@/components/sections/faq-entry");

const element = () =>
  createElement(FaqEntry, {
    title: "Do you ship abroad?",
    richText: [
      {
        _type: "block",
        _key: "b",
        markDefs: null,
        children: [{ _type: "span", _key: "s", text: "Yes.", marks: [] }],
      },
    ],
  });

let container: HTMLDivElement;

beforeAll(() => {
  // React's act() checks for this flag and otherwise warns on every update.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  container?.remove();
});

async function hydrateAfterNativeOpen() {
  container = document.createElement("div");
  container.innerHTML = renderToString(element());
  document.body.append(container);

  // The click that happened before the bundle arrived.
  const details = container.querySelector("details");
  if (!details) throw new Error("no <details> in the server markup");
  details.open = true;

  await act(async () => {
    hydrateRoot(container, element());
  });
  // Flushes the mount effect that reads the DOM and flips `hydrated`.
  await act(async () => {});

  return { details, panel: container.querySelector("[data-animate]") };
}

describe("FaqEntry hydrating over a natively opened row", () => {
  it("adopts the open state instead of animating the answer shut", async () => {
    const { details, panel } = await hydrateAfterNativeOpen();

    expect(details.open).toBe(true);
    expect(panel).not.toBeNull();
    expect(JSON.parse(panel?.getAttribute("data-animate") ?? "null")).toEqual({
      height: "auto",
    });
  });
});
