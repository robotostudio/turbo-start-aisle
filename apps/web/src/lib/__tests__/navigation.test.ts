import { describe, expect, it, vi } from "vitest";

/**
 * The root layout awaits every one of these reads before it returns any JSX, so
 * whatever this loader does on failure is what a Content Lake outage does to the
 * whole site.
 *
 * It propagates, deliberately. `collections/page.tsx` made and documented the
 * same call: a degraded render is a 200 nobody can tell apart from a legitimately
 * empty store, production caches at `revalidate: false` so a bad one sticks, and
 * Next keeps serving the last good page when a background re-render throws. A
 * review suggested wrapping these in a null fallback; these cases are here so
 * that change cannot be made silently. `app/global-error.tsx` is what makes the
 * resulting throw land decently.
 *
 * `environment: "node"` means there is no status code to assert — resolve versus
 * reject is the honest assertion at this level.
 */

const { read } = vi.hoisted(() => ({ read: vi.fn() }));

// The module reaches `@workspace/env/*`, which validates with Zod at import time
// and has nothing to validate in the runner.
vi.mock("@workspace/sanity/live", () => ({
  sanityFetch: read,
}));

vi.mock("@workspace/sanity/query", () => ({
  queryNavbarData: "navbar",
  queryGlobalSeoSettings: "settings",
  queryPromoBannerData: "promo",
  queryFooterData: "footer",
}));

const { getLayoutData } = await import("@/lib/navigation");

describe("getLayoutData", () => {
  it("propagates a failed read rather than degrading the chrome", async () => {
    read.mockRejectedValue(new Error("sanity 503"));
    await expect(getLayoutData()).rejects.toThrow(/sanity 503/);
  });

  it("propagates even when only one of the four reads fails", async () => {
    read.mockImplementation(({ query }: { query: string }) =>
      query === "footer"
        ? Promise.reject(new Error("sanity 503"))
        : Promise.resolve({ data: {} })
    );
    await expect(getLayoutData()).rejects.toThrow(/sanity 503/);
  });

  // A missing document is not a failed read. The footer renders nothing for it,
  // which is a different and legitimate branch.
  it("passes null data through for documents that do not exist", async () => {
    read.mockResolvedValue({ data: null });
    await expect(getLayoutData()).resolves.toEqual({
      navbarData: null,
      settingsData: null,
      promoBannerData: null,
      footerData: null,
    });
  });

  // The whole point of the consolidation: one round trip, not two.
  it("issues all four reads together", async () => {
    read.mockResolvedValue({ data: {} });
    read.mockClear();
    await getLayoutData();
    expect(read).toHaveBeenCalledTimes(4);
    expect(read.mock.calls.map(([arg]) => arg.query).sort()).toEqual([
      "footer",
      "navbar",
      "promo",
      "settings",
    ]);
  });
});
