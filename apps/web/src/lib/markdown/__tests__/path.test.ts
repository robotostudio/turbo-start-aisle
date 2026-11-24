import { describe, expect, it } from "vitest";

import {
  normalizeMarkdownPath,
  prefersMarkdown,
  stripTrailingPunctuation,
} from "@/lib/markdown/path";

describe("normalizeMarkdownPath", () => {
  it("strips a trailing .md suffix", () => {
    expect(normalizeMarkdownPath("/products/tee.md")).toBe("/products/tee");
  });

  it("maps /index to /", () => {
    expect(normalizeMarkdownPath("/index")).toBe("/");
    expect(normalizeMarkdownPath("/index.md")).toBe("/");
  });

  it("drops a trailing slash (but keeps root)", () => {
    expect(normalizeMarkdownPath("/blog/")).toBe("/blog");
    expect(normalizeMarkdownPath("/")).toBe("/");
  });

  it("adds a leading slash when missing", () => {
    expect(normalizeMarkdownPath("about")).toBe("/about");
  });

  it("passes nested paths through untouched", () => {
    expect(normalizeMarkdownPath("/foo/bar")).toBe("/foo/bar");
  });
});

describe("stripTrailingPunctuation", () => {
  it("drops trailing full stops and commas", () => {
    expect(stripTrailingPunctuation("/shop-for-agents.")).toBe(
      "/shop-for-agents"
    );
    expect(stripTrailingPunctuation("/shop-for-agents.md.")).toBe(
      "/shop-for-agents.md"
    );
    expect(stripTrailingPunctuation("/a..")).toBe("/a");
    expect(stripTrailingPunctuation("/a,")).toBe("/a");
    expect(stripTrailingPunctuation("/a.,")).toBe("/a");
  });

  it("leaves real paths alone", () => {
    for (const path of ["/", "/file.png", "/x.md", "/api/search", "/a.b/c"]) {
      expect(stripTrailingPunctuation(path)).toBe(path);
    }
  });

  it("never returns an empty path", () => {
    expect(stripTrailingPunctuation("/.")).toBe("/");
  });
});

describe("prefersMarkdown", () => {
  it("is true for a bare text/markdown Accept", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
  });

  it("prefers html when it has the higher q-value", () => {
    expect(prefersMarkdown("text/markdown;q=0.9, text/html")).toBe(false);
  });

  it("is true on a q-value tie (markdown >= others)", () => {
    expect(prefersMarkdown("text/markdown, text/html")).toBe(true);
  });

  it("is false when markdown is absent", () => {
    expect(prefersMarkdown("text/html")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("")).toBe(false);
  });

  it("is false when markdown is explicitly refused (q=0)", () => {
    expect(prefersMarkdown("text/markdown;q=0, text/html")).toBe(false);
  });
});
