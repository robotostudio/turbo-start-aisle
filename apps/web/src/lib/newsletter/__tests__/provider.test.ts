import { describe, expect, it, vi } from "vitest";

// `server-only` throws on import outside a React Server Component, and vitest
// resolves its client entry. The guard is doing its job in the app; here it
// just has to not fire.
vi.mock("server-only", () => ({}));

import { deliverSubscription } from "@/lib/newsletter/provider";

// The seam ships as a no-op — this starter deliberately wires no provider. The
// contract matters anyway: the action branches on it, and whoever wires a real
// provider needs to know which shape means "my fault" and which means "not set
// up yet".
describe("deliverSubscription", () => {
  it("reports NOT_CONFIGURED while no provider is wired", async () => {
    const result = await deliverSubscription("tope@robotostudio.com");
    expect(result).toEqual({
      ok: false,
      code: "NOT_CONFIGURED",
      message: expect.any(String),
    });
  });

  it("never logs the address — it is PII", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {
      // swallow
    });
    await deliverSubscription("tope@robotostudio.com");
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).not.toContain("tope@robotostudio.com");
    expect(logged).not.toContain("robotostudio.com");
    log.mockRestore();
  });
});
