import "@workspace/ui/globals.css";

import { ChatWidget } from "@workspace/ai-commerce";
import { env } from "@workspace/env/client";
import { SanityLive } from "@workspace/sanity/live";
import { Toaster } from "@workspace/ui/components/sonner";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { preconnect, prefetchDNS } from "react-dom";

import { AiCartBridge } from "@/components/ai-cart-bridge";
import { CartToasts } from "@/components/cart/cart-toasts";
import { Footer } from "@/components/footer";
import { CombinedJsonLd } from "@/components/json-ld";
import { Navbar } from "@/components/navbar";
import { PreviewBar } from "@/components/preview-bar";
import { PageContextTracker } from "@/components/page-context-tracker";
import { PromoBanner } from "@/components/promo-banner";
import { Providers } from "@/components/providers";
import { getLayoutData } from "@/lib/navigation";

const fontSans = GeistSans;
const fontMono = GeistMono;

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  preconnect("https://cdn.sanity.io");
  prefetchDNS("https://cdn.sanity.io");
  const layoutData = await getLayoutData();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        <Providers>
          <div className="flex min-h-screen flex-col">
            <PromoBanner data={layoutData.promoBannerData} />
            <Navbar
              navbarData={layoutData.navbarData}
              settingsData={layoutData.settingsData}
            />
            <div className="flex-1">{children}</div>
            {/* Deliberately not wrapped in Suspense. A boundary here streams
             * the resolved footer into a trailing `<div hidden>` and swaps it
             * in with an inline script, so with JavaScript off every page on
             * the site ended in a permanent skeleton. Blocking on it puts the
             * real footer in the initial HTML instead — and its data rides
             * along in the single `getLayoutData()` round trip above, so it
             * adds no round trip of its own. */}
            <Footer
              data={layoutData.footerData}
              settingsData={layoutData.settingsData}
            />
          </div>
          {modal}
          <CartToasts />
          {/* Offset clears the AI chat launcher (fixed bottom-right, 3.5rem). */}
          <Toaster
            offset={{ bottom: "5.5rem", right: "1rem" }}
            position="bottom-right"
            richColors
          />
          <SanityLive />
          <CombinedJsonLd includeOrganization includeWebsite />
          {(await draftMode()).isEnabled && (
            <>
              <PreviewBar />
              <VisualEditing />
            </>
          )}

          {/* AI Commerce — inside Providers: PageContextTracker needs
              QueryClientProvider, AiCartBridge needs CartProvider, and
              ChatWidget's product cards query Sanity via react-query. */}
          <PageContextTracker />
          <AiCartBridge />
          <ChatWidget currencyCode={env.NEXT_PUBLIC_STORE_CURRENCY} />
        </Providers>
      </body>
    </html>
  );
}
