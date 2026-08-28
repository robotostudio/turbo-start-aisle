"use server";

import { Logger } from "@workspace/logger";
import { draftMode } from "next/headers";

import { emailSchema } from "@/lib/newsletter/email";
import { deliverSubscription } from "@/lib/newsletter/provider";
import type { NewsletterState } from "@/lib/newsletter/state";

const logger = new Logger("AppActions");

const DISABLE_DELAY = 1000;

export async function disableDraftMode() {
  const disable = (await draftMode()).disable();
  const delay = new Promise((resolve) => setTimeout(resolve, DISABLE_DELAY));
  await Promise.allSettled([disable, delay]);
}

// `NewsletterState` and `newsletterInitialState` live in
// `@/lib/newsletter/state` rather than here: Next rewrites *every* export of a
// `"use server"` module into a server reference, so a constant exported from
// this file would reach the forms as a callable proxy instead of its value.

/**
 * Subscribes an address to the newsletter.
 *
 * Deliberately a server action rather than a fetch from a click handler: bound
 * to `<form action>`, Next ships a hidden action-id field in the server HTML,
 * so the form posts and this runs even with JavaScript disabled. The returned
 * state comes back through the re-render either way, which is what lets both
 * newsletter forms report success or failure without hydration.
 */
export async function subscribeToNewsletter(
  _prevState: NewsletterState,
  formData: FormData
): Promise<NewsletterState> {
  const raw = formData.get("email");
  const submitted = typeof raw === "string" ? raw : "";
  const parsed = emailSchema.safeParse(submitted);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a valid email address",
      email: submitted,
    };
  }

  const delivery = await deliverSubscription(parsed.data);

  // A missing provider is this starter's own gap, not something the visitor
  // did wrong, so it is not surfaced as an error to them. A provider that is
  // wired but failing is, since retrying may well work.
  if (!(delivery.ok || delivery.code === "NOT_CONFIGURED")) {
    logger.error(`Newsletter delivery failed: ${delivery.message}`);
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
      email: submitted,
    };
  }

  // Deliberately not "you're subscribed" — with no provider wired that would
  // be a lie. This says only what actually happened.
  return {
    status: "success",
    message: "Thanks — we've got your email address.",
  };
}
