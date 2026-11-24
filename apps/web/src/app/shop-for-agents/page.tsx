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

export default function ShopForAgentsPage() {
  const { intro, steps } = shopGuide(getBaseUrl());
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-4 font-semibold text-3xl">{SHOP_GUIDE_TITLE}</h1>
      <p className="text-lg text-muted-foreground">{intro}</p>
      {steps.map(({ title, lines }) => (
        <section className="mt-10" key={title}>
          <h2 className="mb-3 font-semibold text-xl">{title}</h2>
          <ul className="list-disc space-y-2 pl-5">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
