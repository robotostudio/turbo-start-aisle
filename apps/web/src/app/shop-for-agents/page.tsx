import { ShopPrompt } from "@/components/shop-prompt";
import { guideCatalogue } from "@/lib/agent-guide-products";
import {
  SHOP_GUIDE_DESCRIPTION,
  SHOP_GUIDE_PATH,
  SHOP_GUIDE_TITLE,
  shopGuide,
} from "@/lib/agent-shop";
import { getSEOMetadata } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

export async function generateMetadata() {
  return await getSEOMetadata({
    title: SHOP_GUIDE_TITLE,
    description: SHOP_GUIDE_DESCRIPTION,
    slug: SHOP_GUIDE_PATH,
    seoNoIndex: true,
  });
}

/** Prices and the product list go stale, so the page is rebuilt every 5 minutes. */
export const revalidate = 300;

export default async function ShopForAgentsPage() {
  // A failed Shopify read throws, so Next keeps serving the last good page.
  const { intro, steps } = shopGuide(getBaseUrl(), await guideCatalogue());
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-4 font-semibold text-3xl">{SHOP_GUIDE_TITLE}</h1>
      <p className="text-lg text-muted-foreground">{intro}</p>
      {/* For a person who lands here: the guide itself is written to agents. */}
      <aside aria-label="For shoppers" className="mt-6">
        <ShopPrompt />
      </aside>
      {steps.map(({ title, lines }) => (
        <section className="mt-10" key={title}>
          <h2 className="mb-3 font-semibold text-xl">{title}</h2>
          <ul className="list-disc space-y-2 pl-5">
            {lines.map(({ text, url, photoOf }) => (
              <li key={`${text} ${url ?? ""}`}>
                {text}
                {/* A real anchor: a chat agent opens links, not URLs in text. */}
                {url ? (
                  <>
                    {" "}
                    <a className="underline" href={url}>
                      {url}
                    </a>
                  </>
                ) : null}
                {/* An <img>, so an agent that shows page images has the real one. Not lazy: a reader that never scrolls must still load it. */}
                {url && photoOf ? (
                  // biome-ignore lint/performance/noImgElement: next/image would rewrite the Shopify address the agent is told to show
                  <img
                    alt={photoOf}
                    className="mt-2 rounded"
                    height={160}
                    src={url}
                    width={160}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
