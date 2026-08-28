"use client";

import Link from "next/link";
import { useActionState } from "react";

import { subscribeToNewsletter } from "@/app/actions";
import { newsletterInitialState } from "@/lib/newsletter/state";

export function NewsletterForm() {
  // The action is bound through `useActionState` rather than a submit handler
  // so the form works unhydrated: Next posts it to the server action and the
  // result below is rendered by the server on the way back.
  const [state, formAction] = useActionState(
    subscribeToNewsletter,
    newsletterInitialState
  );
  const failed = state.status === "error";

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex items-end gap-2">
        <div className="flex w-full max-w-md flex-col gap-2">
          <label className="text-foreground text-sm" htmlFor="newsletter-email">
            Sign up to our newsletter
          </label>
          <input
            aria-invalid={failed}
            className="w-full border-border border-b bg-transparent pb-1 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none aria-invalid:border-destructive"
            defaultValue={failed ? (state.email ?? "") : ""}
            id="newsletter-email"
            name="email"
            placeholder="Email address"
            required
            type="email"
          />
        </div>
        <button
          className="cursor-pointer bg-foreground px-3 py-1.5 text-background text-sm transition-opacity hover:opacity-90"
          type="submit"
        >
          Submit
        </button>
      </form>
      {/* Rendered unconditionally, empty until there is something to say. A
          polite live region has to be in the accessibility tree *before* its
          content changes — one created holding its message is generally not
          announced, which silently hid every error and confirmation from
          screen readers. */}
      <output
        className={
          failed
            ? "block text-destructive text-xs"
            : "block text-muted-foreground text-xs"
        }
      >
        {state.status === "idle" ? "" : state.message}
      </output>
      <p className="max-w-84 text-muted-foreground text-xs">
        By submitting, you agree to the{" "}
        <Link className="underline" href="/terms">
          Terms &amp; Conditions
        </Link>{" "}
        and{" "}
        <Link className="underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
