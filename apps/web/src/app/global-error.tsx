"use client";

import "@workspace/ui/globals.css";

import { Button } from "@workspace/ui/components/button";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

/**
 * The last boundary: the one that catches a throw from the root layout itself.
 *
 * `error.tsx` renders *inside* that layout, so it cannot catch its own parent —
 * and the layout awaits every Sanity read the chrome needs before it returns
 * any JSX. A Content Lake outage therefore bypassed `error.tsx` entirely and
 * reached shoppers as Next's built-in page: white, chrome-less, "Application
 * error: a server-side exception has occurred".
 *
 * Next replaces the whole document with this, so it renders its own `<html>`
 * and `<body>` and re-imports `globals.css` — without that import every
 * Tailwind class, `site-container` and the oklch tokens below resolve to
 * nothing. The font variables are re-applied for the same reason.
 *
 * Deliberately light-mode only. `Providers` is gone at this depth, so
 * `next-themes` never writes the `.dark` class and `@custom-variant dark
 * (&:is(.dark *))` can never match — a `dark:` variant here would be a
 * decoration that never fires.
 *
 * The digest is kept, matching `error.tsx`: in production Next redacts the
 * thrown message, so that hash is the only handle tying a shopper's report back
 * to the server log line.
 *
 * A plain anchor rather than `next/link` — a soft navigation out of a boundary
 * that has replaced the document is not reliable, and a full load is what is
 * wanted here anyway.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} bg-background font-sans text-foreground antialiased`}
      >
        <div className="site-container grid min-h-screen content-center justify-items-center gap-4 py-16 text-center">
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
              <a href="/">Go Home</a>
            </Button>
          </div>
          {error.digest ? (
            <p className="text-muted-foreground text-xs tracking-wide">
              Reference:{" "}
              <code className="select-all font-mono">{error.digest}</code>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
