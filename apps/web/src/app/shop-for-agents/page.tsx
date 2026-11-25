import { ShopPrompt } from "@/components/shop-prompt";
import { guideCatalogue } from "@/lib/agent-guide-products";
import {
  type GuideGroup,
  type GuideLine,
  groupGuideLines,
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

// A real anchor whose text is the whole address: a chat agent opens links and
// copies what it reads, so the address is cut off by CSS, never in the text.
const linkClass =
  "font-mono text-[13px] decoration-foreground/25 underline-offset-4 transition-colors duration-150 ease-out hover:decoration-foreground";

/** A note in a step: plain text, with its link when it has one. */
function Note({ text, url }: GuideLine) {
  return (
    <li className="relative pl-4.5 before:absolute before:top-2.5 before:left-0.5 before:size-1 before:bg-foreground/40">
      {text}
      {url ? (
        <>
          {" "}
          <a className={`${linkClass} break-all underline`} href={url}>
            {url}
          </a>
        </>
      ) : null}
    </li>
  );
}

/**
 * One product: its photo and name, then a row per item in stock. The sr-only
 * pieces keep each row's text the sentence the `.md` twin has ("Tee, S, 20.0
 * GBP: <link>"), so an agent reading the page as text loses nothing.
 */
function Product({ product, photo, items }: GuideGroup) {
  return (
    <li>
      <div className="flex items-center gap-4 pb-4">
        {photo ? (
          // An <img>, so an agent that shows page images has the real one. Not lazy: a reader that never scrolls must still load it.
          // biome-ignore lint/performance/noImgElement: next/image would rewrite the Shopify address the agent is told to show
          <img
            alt={product}
            className="size-16! shrink-0 bg-muted object-cover"
            height={64}
            src={photo}
            width={64}
          />
        ) : null}
        <div className="min-w-0">
          <h3 className="font-medium">{product}</h3>
          {photo ? (
            <p className="flex gap-2.5 text-[13px] text-muted-foreground">
              <span className="sr-only">{product}, </span>
              <span className="shrink-0">
                Photo<span className="sr-only">:</span>
              </span>
              <a
                className={`${linkClass} min-w-0 truncate underline`}
                href={photo}
                title={photo}
              >
                {photo}
              </a>
            </p>
          ) : null}
        </div>
      </div>
      <ul>
        {items.map(({ variant, price, url }) => (
          <li
            className="flex flex-wrap items-baseline gap-x-4 border-foreground/20 border-t border-dashed py-2.5 text-sm"
            key={url}
          >
            <span className="w-30 shrink-0">
              {variant ? (
                <>
                  <span className="sr-only">{product}, </span>
                  {variant}
                </>
              ) : (
                product
              )}
              <span className="sr-only">, </span>
            </span>
            <span className="w-24 shrink-0 font-mono text-[13px] tabular-nums">
              {price}
              <span className="sr-only">: </span>
            </span>
            {/* The row is 43px tall, so the link has the height to press. */}
            <a
              className={`${linkClass} min-w-0 basis-full truncate hover:underline sm:flex-1 sm:basis-0`}
              href={url}
              title={url}
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}

const stepId = (index: number) => `step-${index + 1}`;

export default async function ShopForAgentsPage() {
  // A failed Shopify read throws, so Next keeps serving the last good page.
  const { intro, steps } = shopGuide(getBaseUrl(), await guideCatalogue());
  return (
    <main>
      <div className="site-container border-b py-12 md:py-16">
        <h1 className="max-w-3xl text-balance text-3xl tracking-tight md:text-4xl">
          {SHOP_GUIDE_TITLE}
        </h1>
        <p className="mt-4 max-w-3xl text-pretty text-lg text-muted-foreground leading-relaxed">
          {intro}
        </p>
        {/* For a person who lands here: the guide itself is written to agents. */}
        <aside aria-label="For shoppers" className="mt-6 lg:hidden">
          <ShopPrompt />
        </aside>
      </div>
      <div className="site-container grid grid-cols-1 gap-12 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-24">
        <div className="min-w-0 max-w-4xl space-y-14">
          {steps.map(({ title, lines }, index) => {
            const { notes, groups } = groupGuideLines(lines);
            return (
              <section
                aria-labelledby={stepId(index)}
                className="space-y-4"
                key={title}
              >
                <h2
                  className="scroll-mt-24 text-[22px] leading-[30px] tracking-[-0.01em]"
                  id={stepId(index)}
                >
                  {title}
                </h2>
                <ul className="max-w-2xl space-y-2.5 text-[15px] text-foreground/80 leading-6">
                  {notes.map((note) => (
                    <Note key={`${note.text} ${note.url ?? ""}`} {...note} />
                  ))}
                </ul>
                {groups.length > 0 ? (
                  <ul className="space-y-10 pt-4">
                    {groups.map((group) => (
                      <Product
                        key={`${group.product} ${group.items[0]?.url ?? ""}`}
                        {...group}
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <nav aria-labelledby="on-this-page">
              <p className="pb-2 font-medium text-sm" id="on-this-page">
                On this page
              </p>
              <ul className="text-sm">
                {steps.map(({ title }, index) => (
                  <li key={title}>
                    {/* py-2.5 on a 20px line: a 40px target. */}
                    <a
                      className="block py-2.5 text-muted-foreground leading-5 transition-colors duration-150 ease-out hover:text-foreground"
                      href={`#${stepId(index)}`}
                    >
                      {title.replace(/^\d+\.\s+/u, "")}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-4">
              <ShopPrompt />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
