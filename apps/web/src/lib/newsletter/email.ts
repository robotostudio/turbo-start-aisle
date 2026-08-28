import { z } from "zod";

/**
 * Validates a submitted newsletter address.
 *
 * Lives here rather than beside the action so it can be unit-tested: every
 * export of a `"use server"` module is rewritten into a server reference, so a
 * schema exported from there would reach a test as a callable proxy.
 *
 * `type="email"` and `required` on the input are a hint to the browser, not a
 * guarantee — a no-JS POST, a scripted client or an older browser can all put
 * anything in the field — so the server re-checks before the address goes
 * anywhere. 254 is the practical maximum length of an address (RFC 5321's
 * 256-octet path, less the angle brackets).
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .max(254, "That email address is too long")
  .pipe(z.email("Enter a valid email address"));
