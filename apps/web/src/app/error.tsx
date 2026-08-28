"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

/**
 * The boundary every route falls back to when nothing closer catches a throw.
 *
 * The collections index throws on purpose now, and this repo had no
 * `error.tsx` anywhere, so that decision reached a shopper as Next's built-in
 * error page: white, chrome-less, "Application error: a server-side exception
 * has occurred" and a digest hash.
 *
 * The digest is kept. In production Next redacts the thrown message from the
 * client, so that hash is the only handle tying a shopper's report back to the
 * server log line for the throw — dropping it while replacing the built-in page
 * would cost support the one identifier worth asking for. It is absent in
 * development, where the message reaches the overlay unredacted, hence the
 * conditional.
 *
 * Rendered inside the root layout, so the navbar and footer stay on screen.
 * The flip side is that it cannot catch a throw from the root layout itself —
 * `global-error.tsx` is the boundary for that.
 *
 * `reset()` re-renders the segment, which is the whole fix for the transient
 * read failure this mostly catches. The secondary link goes home rather than to
 * `/collections`, since the collections index is the route most likely to have
 * sent a shopper here and that CTA would loop them back into it.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="site-container grid min-h-[60vh] content-center justify-items-center gap-4 py-16 text-center">
      <h1 className="font-light text-3xl tracking-tight md:text-4xl">
        This page couldn&apos;t be loaded
      </h1>
      <p className="max-w-prose text-muted-foreground text-sm tracking-wide">
        Something went wrong at our end. Nothing is missing — try again in a
        moment.
      </p>
      <div className="mt-4 flex gap-3">
        <Button
          className="uppercase tracking-wider"
          onClick={reset}
          size="lg"
          type="button"
        >
          Try again
        </Button>
        <Button
          asChild
          className="uppercase tracking-wider"
          size="lg"
          variant="secondary"
        >
          <Link href="/">Go Home</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="text-muted-foreground text-xs tracking-wide">
          Reference:{" "}
          <code className="select-all font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
