/**
 * Form state for the newsletter forms, shared by the server action that
 * produces it and the client components that render it.
 *
 * It deliberately does not live beside the action in `@/app/actions`: Next
 * rewrites *every* export of a `"use server"` module into a server reference,
 * so `newsletterInitialState` exported from there would reach the forms as a
 * callable proxy instead of its value.
 *
 * This is a `status` discriminator rather than the cart's
 * `{ ok, error: { code, message } }` union (`@/lib/cart/types`) because the two
 * model different things: the cart's shape is an imperative result a controller
 * branches on, this is view state a form renders, and it needs the `idle` that
 * the cart shape has no room for.
 */
export type NewsletterState =
  | { status: "idle" }
  | { status: "error"; message: string; email?: string }
  | { status: "success"; message: string };

export const newsletterInitialState: NewsletterState = { status: "idle" };
