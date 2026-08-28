import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The JSON-LD script reaches `@workspace/env/client`, which validates the
// Sanity env at import time. It is emitted from the same component but is not
// what these assertions are about.
vi.mock("@/components/json-ld", () => ({
  FaqJsonLd: () => null,
}));

// Likewise the rich-text renderer pulls in the image pipeline. A plain <p> is
// enough to assert the answer body reaches the markup.
vi.mock("@/components/elements/rich-text", () => ({
  RichText: ({ richText }: { richText?: { text?: string }[] | null }) =>
    createElement("p", null, richText?.[0]?.text ?? ""),
}));

const { FaqCategories } = await import("@/components/sections/faq-categories");

function answer(text: string) {
  return [{ _type: "block", _key: "b", children: [], text }];
}

const block = {
  _key: "abc123",
  _type: "faqCategories" as const,
  title: "Frequently asked questions",
  categories: [
    {
      _key: "cat-orders",
      title: "Orders & Shipping",
      faqs: [
        {
          _id: "faq-1",
          title: "When will my order ship?",
          richText: answer("Within two days."),
        },
        {
          _id: "faq-1b",
          title: "Do you ship internationally?",
          richText: answer("To most countries."),
        },
      ],
    },
    {
      _key: "cat-returns",
      title: "Returns",
      faqs: [
        {
          _id: "faq-2",
          title: "How do I return something?",
          richText: answer("Start a return online."),
        },
        {
          _id: "faq-2b",
          title: "When am I refunded?",
          richText: answer("Within five working days."),
        },
      ],
    },
  ],
};

type FaqCategoriesBlock = Parameters<typeof FaqCategories>[0];

// The fixture carries only the fields these assertions read; the GROQ-projected
// block type is much wider.
const render = (overrides: Partial<FaqCategoriesBlock> = {}) =>
  renderToStaticMarkup(
    createElement(FaqCategories, {
      ...block,
      ...overrides,
    } as unknown as FaqCategoriesBlock)
  );

describe("FaqCategories server markup", () => {
  // The regression this block was rewritten for. Motion resolves a variant's
  // initial styles into an inline `style` at render time, on the server
  // included, so leaving the variants ungated shipped `opacity:0` on every row
  // and the whole section rendered blank with JavaScript disabled.
  it("ships no inline opacity:0", () => {
    expect(render()).not.toContain("opacity:0");
  });

  it("ships no initial transform either", () => {
    expect(render()).not.toContain("translateY");
  });

  // The companion to the above, and the one that was missed: `FaqEntry` renders
  // the answer inside a motion div with `initial={false}`, so a *closed* row
  // serialises `height:0` next to `overflow-hidden`. The native <details> then
  // opens onto a zero-height container and the answer is unreachable with
  // JavaScript off.
  it("ships no inline height:0 on closed answers", () => {
    expect(render()).not.toContain("height:0");
  });

  it("renders every category's questions and answers, not just the first", () => {
    const html = render();
    for (const text of [
      "Orders &amp; Shipping",
      "When will my order ship?",
      "Within two days.",
      "Returns",
      "How do I return something?",
      "Start a return online.",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("drives the switcher from a radio group with the first category checked", () => {
    const html = render();
    expect(html).toContain('type="radio"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('id="faq-abc123-input-0"');
    // Anchored to the element: the generated stylesheet contains `:checked` in
    // every reveal rule, so a bare `toContain("checked")` passes even when no
    // radio carries the attribute.
    expect(html).toMatch(/<input[^>]*id="faq-abc123-input-0"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*id="faq-abc123-input-1"[^>]*checked/);
    // A tablist asserts keyboard behaviour that only exists once JS lands.
    expect(html).not.toContain('role="tablist"');
  });

  it("names the group so it is not an anonymous set of radios", () => {
    const html = render();
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain("Frequently asked questions");
  });

  it("emits a reveal rule for each category, scoped to the block key", () => {
    const html = render();
    expect(html).toContain(
      '#faq-abc123-input-0:checked ~ * [data-faq-panel="0"]{display:block}'
    );
    expect(html).toContain(
      '#faq-abc123-input-1:checked ~ * [data-faq-panel="1"]{display:block}'
    );
  });

  // `--color-ring` lives in globals.css's `@theme inline` block, so it is never
  // emitted as a runtime custom property and the outline it fed was invalid.
  it("resolves the focus ring against a runtime token", () => {
    const html = render();
    expect(html).toContain("outline:2px solid var(--ring)");
    expect(html).not.toContain("var(--color-ring)");
  });

  // `_key` is interpolated into selectors, ids and the radio `name`. Studio
  // mints alphanumeric keys, but a programmatic import can put anything there.
  it("escapes a CSS-unsafe _key rather than stripping it", () => {
    const html = render({ _key: "a#b" });
    expect(html).not.toContain("faq-a#b");
    expect(html).toContain("faq-a_23_b");
  });

  it("gives distinct scopes to keys that would collide if stripped", () => {
    const one = render({ _key: "a#b" });
    const two = render({ _key: "ab" });
    const scope = (html: string) => html.match(/id="(faq-[^"]*)-input-0"/)?.[1];
    expect(scope(one)).not.toBe(scope(two));
  });
});
