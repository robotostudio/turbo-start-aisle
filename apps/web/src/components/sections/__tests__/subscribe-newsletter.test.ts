import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The action is a `"use server"` module; importing it here would drag in the
// server-reference machinery. The binding itself is exercised end-to-end in a
// browser — what these assertions cover is the markup around it.
vi.mock("@/app/actions", () => ({
  subscribeToNewsletter: vi.fn(),
}));

vi.mock("@/components/elements/rich-text", () => ({
  RichText: () => null,
}));

vi.mock("@/components/elements/sanity-image", () => ({
  SanityImage: () => null,
}));

const { SubscribeNewsletter } = await import(
  "@/components/sections/subscribe-newsletter"
);

type SubscribeBlock = Parameters<typeof SubscribeNewsletter>[0];

const render = (overrides: Partial<SubscribeBlock> = {}) =>
  renderToStaticMarkup(
    createElement(SubscribeNewsletter, {
      _key: "abc123",
      _type: "subscribeNewsletter",
      title: "Join the list",
      ...overrides,
    } as unknown as SubscribeBlock)
  );

describe("SubscribeNewsletter server markup", () => {
  // The block used to carry `onSubmit={(e) => e.preventDefault()}` and no
  // action, so every address was silently discarded — with JS as well as
  // without. That the bound action really does post is covered end-to-end in a
  // browser with scripting disabled; what is worth pinning here is the field
  // contract the action reads.
  it("submits a field named email, which is what the action reads", () => {
    const html = render();
    expect(html).toContain("<form");
    expect(html).toContain('name="email"');
    expect(html).toContain('type="submit"');
  });

  it("labels the input, which previously had only a placeholder", () => {
    const html = render();
    expect(html).toContain('for="subscribe-newsletter-abc123"');
    expect(html).toContain('id="subscribe-newsletter-abc123"');
  });

  it("scopes the input id to the block key so two instances cannot collide", () => {
    const first = render();
    const second = render({ _key: "def456" });
    const id = (html: string) =>
      html.match(/id="(subscribe-newsletter-[^"]*)"/)?.[1];
    expect(id(first)).toBe("subscribe-newsletter-abc123");
    expect(id(second)).toBe("subscribe-newsletter-def456");
  });

  // This previously asserted the region was *absent* before submission, which
  // pinned the bug: a live region created in the same commit as its text is
  // generally not announced, so neither the validation error nor the success
  // message reached a screen reader.
  it("ships the live region up front, empty, so it can announce later", () => {
    const html = render();
    // `<output>` is the semantic element for a form's result and carries an
    // implicit role="status", so no explicit role is needed.
    expect(html).toContain("<output");
    expect(html).toMatch(/<output[^>]*><\/output>/);
  });

  it("carries no message text before anything is submitted", () => {
    expect(render()).not.toContain("Thanks");
    expect(render()).not.toContain("Enter a valid email address");
  });
});
