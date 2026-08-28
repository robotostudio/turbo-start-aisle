import "server-only";

import { Logger } from "@workspace/logger";

const logger = new Logger("NewsletterProvider");

export type NewsletterDelivery =
  | { ok: true }
  | { ok: false; code: "NOT_CONFIGURED" | "PROVIDER_ERROR"; message: string };

/**
 * Hands a subscriber address to the email provider.
 *
 * This starter deliberately ships no provider integration — it is boilerplate
 * for a client to build on — so the seam exists to keep that a one-file change
 * rather than a rewrite of the action and both forms. Wire the real call here:
 *
 *   Klaviyo   POST /api/profile-subscription-bulk-create-jobs
 *   Mailchimp POST /lists/{list_id}/members
 *   Shopify   `customerCreate` with `emailMarketingConsent` — needs an Admin
 *             API token and client, since `@/lib/shopify/client` is
 *             Storefront-only.
 *
 * Whoever wires one of these in should add a rate limit at the same time: the
 * action behind this is a public, unauthenticated POST, and until there is a
 * provider there is nothing on the other side of it to abuse.
 *
 * Note the address is never logged. It is PII, and a server log is neither a
 * subscriber list nor a place to retain one.
 */
export function deliverSubscription(
  _email: string
): Promise<NewsletterDelivery> {
  logger.info("Newsletter subscription received; no provider configured");

  return Promise.resolve({
    ok: false,
    code: "NOT_CONFIGURED",
    message: "No newsletter provider is configured",
  });
}
