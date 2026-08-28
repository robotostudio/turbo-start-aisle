import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/json-ld", () => ({
  FaqJsonLd: () => null,
}));

vi.mock("@/components/elements/rich-text", () => ({
  RichText: ({ richText }: { richText?: { text?: string }[] | null }) =>
    createElement("p", null, richText?.[0]?.text ?? ""),
}));

const { FaqAccordion } = await import("@/components/sections/faq-accordion");

type FaqAccordionBlock = Parameters<typeof FaqAccordion>[0];

function answer(text: string) {
  return [{ _type: "block", _key: "b", children: [], text }];
}

const render = () =>
  renderToStaticMarkup(
    createElement(FaqAccordion, {
      _key: "acc123",
      _type: "faqAccordion",
      title: "Questions",
      faqs: [
        {
          _id: "a1",
          title: "First question",
          richText: answer("First answer."),
        },
        {
          _id: "a2",
          title: "Second question",
          richText: answer("Second answer."),
        },
      ],
    } as unknown as FaqAccordionBlock)
  );

// This block passes no `defaultOpen`, so *every* row is closed — which makes it
// the worst case for the clipping bug and the reason it needs its own test.
// `faq-categories` at least left one row open per category; here an ungated
// motion height would have hidden the entire block's answers from anyone
// without JavaScript, while the markup still looked complete.
describe("FaqAccordion server markup", () => {
  it("ships no inline height:0, even though every row is closed", () => {
    expect(render()).not.toContain("height:0");
  });

  it("ships no inline opacity:0", () => {
    expect(render()).not.toContain("opacity:0");
  });

  it("leaves every answer in the markup for a no-JS reader to open", () => {
    const html = render();
    expect(html).toContain("First answer.");
    expect(html).toContain("Second answer.");
  });

  it("renders each row as a native disclosure", () => {
    expect(render().match(/<details/g)).toHaveLength(2);
  });
});
