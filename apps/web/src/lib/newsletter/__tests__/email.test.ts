import { describe, expect, it } from "vitest";

import { emailSchema } from "@/lib/newsletter/email";

// The browser's `type="email"` check is not a guarantee — a no-JS POST or a
// scripted client can put anything in the field — so these are the cases the
// server is the last line of defence against.
describe("emailSchema", () => {
  it("accepts an ordinary address", () => {
    const result = emailSchema.safeParse("tope@robotostudio.com");
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    const result = emailSchema.safeParse("  tope@robotostudio.com  ");
    expect(result.success).toBe(true);
    expect(result.data).toBe("tope@robotostudio.com");
  });

  it("rejects an empty submission with a distinct message", () => {
    const result = emailSchema.safeParse("");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter your email address");
  });

  it("treats whitespace-only as empty rather than malformed", () => {
    const result = emailSchema.safeParse("   ");
    expect(result.error?.issues[0]?.message).toBe("Enter your email address");
  });

  it.each(["not-an-email", "no@tld", "@robotostudio.com", "two@@at.com"])(
    "rejects %s",
    (input) => {
      const result = emailSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        "Enter a valid email address"
      );
    }
  );

  it("rejects an address past the 254-character limit", () => {
    const local = "a".repeat(250);
    const result = emailSchema.safeParse(`${local}@robotostudio.com`);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "That email address is too long"
    );
  });

  it("always surfaces a message the form can render", () => {
    for (const input of ["", "   ", "nope", "a".repeat(300)]) {
      const result = emailSchema.safeParse(input);
      expect(result.error?.issues[0]?.message).toBeTruthy();
    }
  });
});
