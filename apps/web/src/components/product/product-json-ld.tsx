import type { AggregateOffer, Offer, Product, WithContext } from "schema-dts";

import { JsonLdScript } from "@/components/json-ld";
import type { ShopifyProduct } from "@/lib/shopify/types";
import { getBaseUrl } from "@/utils";

type ProductJsonLdProps = {
  product: ShopifyProduct;
  handle: string;
};

// Prices are considered valid until the end of next year — Google requires
// priceValidUntil for price-drop rich results. Computed from a static base so
// it stays a sensible future date without depending on request time.
const PRICE_VALID_UNTIL = `${new Date().getFullYear() + 1}-12-31`;

type ProductVariant = ShopifyProduct["variants"]["edges"][number]["node"];

function toOffer(v: ProductVariant, url: string): Offer {
  return {
    "@type": "Offer",
    price: v.price.amount,
    priceCurrency: v.price.currencyCode,
    priceValidUntil: PRICE_VALID_UNTIL,
    availability: v.availableForSale
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    url,
    sku: v.sku ?? undefined,
  };
}

/**
 * One `Offer` for a single variant, `AggregateOffer` above that. Mapping every
 * variant gave up to 250 `Offer`s sharing one `url` with nothing to tell them
 * apart — Google reads that as many offers at one address, not a price range.
 */
function buildOffers(
  variants: ProductVariant[],
  url: string
): Offer | AggregateOffer | undefined {
  if (variants.length === 0) {
    return;
  }
  const first = variants[0];
  if (variants.length === 1 && first) {
    return toOffer(first, url);
  }

  const prices = variants.map((v) => Number(v.price.amount));
  return {
    "@type": "AggregateOffer",
    offerCount: variants.length,
    lowPrice: Math.min(...prices).toFixed(2),
    highPrice: Math.max(...prices).toFixed(2),
    priceCurrency: first?.price.currencyCode,
    availability: variants.some((v) => v.availableForSale)
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    url,
  };
}

export function ProductJsonLd({ product, handle }: ProductJsonLdProps) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/products/${handle}`;
  const variants = product.variants.edges.map((e) => e.node);

  // `images` can be empty while `featuredImage` is set; no `image` drops the
  // Product from rich results entirely.
  const image = product.images.edges[0]?.node.url ?? product.featuredImage?.url;

  const jsonLd: WithContext<Product> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image,
    brand: product.vendor
      ? { "@type": "Brand", name: product.vendor }
      : undefined,
    // Omitted, not `[]` — an empty offers array is invalid.
    offers: buildOffers(variants, url),
  };

  return <JsonLdScript data={jsonLd} id={`product-json-ld-${handle}`} />;
}
