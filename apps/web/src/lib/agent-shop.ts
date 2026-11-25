import { z } from "zod";

import { buildLineMetadata } from "@/lib/cart/metadata";
import type { LineMetadata } from "@/lib/cart/types";
import type {
  MoneyV2,
  SelectedOption,
  ShopifyCollectionLite,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";

/**
 * What the shop tells an agent, shared by the in-page WebMCP tools
 * (`components/webmcp-shop-tools.ts`) and the remote server (`app/mcp`), so
 * both answer in the same words. `base` is "" in the page and the site origin
 * on `/mcp`, where a path means nothing to the caller.
 */

export const productHandle = z
  .string()
  .regex(/^[\w-]{1,255}$/)
  .describe("Product handle: the last part of a /products/<handle> URL");

/** One variant and how many: what every add-to-cart tool takes. */
/** The most of one item an agent tool, a link, or the page it opens will add. */
export const MAX_LINK_QUANTITY = 10;

export const cartLineInput = z.object({
  handle: productHandle,
  variantGid: z
    .string()
    .regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/)
    .describe(
      "The variant's variantGid from get_product, as given: gid://shopify/ProductVariant/<digits>"
    ),
  quantity: z.number().int().min(1).max(MAX_LINK_QUANTITY).default(1),
});

export const money = ({ amount, currencyCode }: MoneyV2) =>
  `${amount} ${currencyCode}`;

export const noProduct = (handle: string) =>
  `No product has the handle "${handle}". Find the handle with search_products.`;

export const productsSummary = (
  products: ShopifyCollectionProduct[],
  base = ""
) =>
  products.map((product) => ({
    handle: product.handle,
    title: product.title,
    vendor: product.vendor,
    from: money(product.priceRange.minVariantPrice),
    url: `${base}/products/${product.handle}`,
  }));

export const collectionsSummary = (
  collections: Pick<ShopifyCollectionLite, "handle" | "title">[],
  base = ""
) =>
  collections.map((collection) => ({
    handle: collection.handle,
    title: collection.title,
    url: `${base}/collections/${collection.handle}`,
  }));

export const productSummary = (
  product: ShopifyCollectionProduct,
  base = ""
) => ({
  handle: product.handle,
  title: product.title,
  vendor: product.vendor,
  url: `${base}/products/${product.handle}`,
  options: product.options.map(({ name, values }) => ({ name, values })),
  variants: product.variants.edges.map(({ node }) => ({
    variantGid: node.id,
    options: node.selectedOptions,
    price: money(node.price),
    available: node.availableForSale,
  })),
});

export type CartLineChoice =
  | { ok: true; variantId: string; metadata: LineMetadata; named: string }
  | { ok: false; reason: string };

/**
 * The cart line for `quantity` of one variant, or why it can't be added. Price
 * and title come from the product Shopify returned, never from the caller.
 */
export function cartLineFor(
  product: ShopifyCollectionProduct,
  variantGid: string,
  quantity: number
): CartLineChoice {
  const variant = product.variants.edges.find(
    ({ node }) => node.id === variantGid
  )?.node;
  if (!variant) {
    return {
      ok: false,
      reason: `${product.title} has no variant ${variantGid}. Call get_product for its variants.`,
    };
  }
  const metadata = buildLineMetadata({
    productTitle: product.title,
    productHandle: product.handle,
    price: variant.price,
    selectedOptions: variant.selectedOptions,
    image: product.featuredImage,
  });
  if (!variant.availableForSale) {
    return {
      ok: false,
      reason: `${product.title} (${metadata.variantTitle}) is out of stock. Nothing was added.`,
    };
  }
  return {
    ok: true,
    variantId: variant.id,
    metadata,
    named: `${quantity} x ${product.title} (${metadata.variantTitle}) at ${money(variant.price)} each`,
  };
}

const VARIANT_GID = "gid://shopify/ProductVariant/";

/** The query of an add-to-cart link: what `/cart/add` reads back. */
export const cartLinkQuery = z.object({
  handle: productHandle,
  variant: z.string().regex(/^\d{1,20}$/),
  quantity: z.coerce.number().int().min(1).max(MAX_LINK_QUANTITY).default(1),
});

/** A variant's options as the `/cart/add` slip words them: "Size S · Color pink". */
export const optionsLine = (options: SelectedOption[]) =>
  options
    // A product with no options has one stand-in option, which says nothing.
    .filter(({ value }) => value !== "Default Title")
    .map(({ name, value }) => `${name} ${value}`)
    .join(" · ");

/**
 * What `quantity` of one item costs, for the slip's total. Not rounded here:
 * the formatter rounds to the currency's own digits, which are not always two.
 */
export const lineTotal = (price: MoneyV2, quantity: number): MoneyV2 => ({
  amount: String(Number.parseFloat(price.amount) * quantity),
  currencyCode: price.currencyCode,
});

/**
 * A link to the page that offers one line; the shopper adds it there. The cart
 * lives in the shopper's browser, so this is how a chat app elsewhere fills it.
 */
export function cartLink(
  base: string,
  handle: string,
  variantGid: string,
  quantity: number
): string {
  const query = new URLSearchParams({
    handle,
    variant: variantGid.replace(VARIANT_GID, ""),
    quantity: String(quantity),
  });
  return `${base}/cart/add?${query}`;
}

export const variantGidFromLink = (variant: string) =>
  `${VARIANT_GID}${variant}`;

/** The guide a chat agent reads when its user pastes the shop prompt. */
export const SHOP_GUIDE_PATH = "/shop-for-agents";

export const SHOP_GUIDE_TITLE = "Shop here, for AI agents";

export const SHOP_GUIDE_DESCRIPTION =
  "How an AI agent finds a product in this shop for its user and gives them a link that adds it to their cart.";

/**
 * The sentence a shopper pastes into a chat app. The address comes last with
 * no full stop after it: ChatGPT read a trailing full stop as part of it.
 */
export const shopPrompt = (siteTitle: string, base: string) =>
  `Shop ${siteTitle} for me. Ask me for anything you need first. The steps are at ${base}${SHOP_GUIDE_PATH}`;

/** A product as the guide lists it. */
export type GuideProduct = {
  handle: string;
  title: string;
  featuredImage: { url: string } | null;
  variants: {
    edges: {
      node: {
        id: string;
        title: string;
        availableForSale: boolean;
        price: MoneyV2;
      };
    }[];
  };
};

/** The products the guide lists, and whether Shopify had more than fit. */
export type GuideCatalogue = { products: GuideProduct[]; partial: boolean };

/**
 * One guide line. The link, when there is one, always ends the line. `photoOf`
 * marks the link as a picture and names the product in it.
 */
export type GuideLine = {
  text: string;
  url?: string;
  photoOf?: string;
  /** Set on an item line: the same words as `text`, in parts, for the page. */
  item?: { product: string; variant?: string; price: string };
};

/** One product's lines, as the page lays them out. */
export type GuideGroup = {
  product: string;
  photo?: string;
  items: { variant?: string; price: string; url: string }[];
};

/**
 * Splits a step's lines into its notes and, for the item list, one group per
 * product. A group is a run of lines that name the same product.
 */
export function groupGuideLines(lines: GuideLine[]): {
  notes: GuideLine[];
  groups: GuideGroup[];
} {
  const notes: GuideLine[] = [];
  const groups: GuideGroup[] = [];
  for (const line of lines) {
    const product = line.photoOf ?? line.item?.product;
    if (!(product && line.url)) {
      notes.push(line);
      continue;
    }
    let group = groups.at(-1);
    if (group?.product !== product) {
      group = { product, items: [] };
      groups.push(group);
    }
    if (line.item) {
      group.items.push({
        variant: line.item.variant,
        price: line.item.price,
        url: line.url,
      });
    } else {
      group.photo = line.url;
    }
  }
  return { notes, groups };
}

/** Shopify's name for the only variant of a product that has no options. */
const NO_OPTIONS = "Default Title";

/** Step 2: every item in stock, or the plain truth when there is none. */
function itemLines(
  base: string,
  { products, partial }: GuideCatalogue
): GuideLine[] {
  const items = products.flatMap(
    ({ handle, title, featuredImage, variants }) => {
      const inStock = variants.edges
        .filter(({ node }) => node.availableForSale)
        .map(({ node }) => ({
          text: `${node.title === NO_OPTIONS ? title : `${title}, ${node.title}`}, ${money(node.price)}:`,
          url: cartLink(base, handle, node.id, 1),
          item: {
            product: title,
            variant: node.title === NO_OPTIONS ? undefined : node.title,
            price: money(node.price),
          },
        }));
      // The photo leads its product's items; a sold-out product lists neither.
      return inStock.length > 0 && featuredImage
        ? [
            {
              text: `${title}, photo:`,
              url: featuredImage.url,
              photoOf: title,
            },
            ...inStock,
          ]
        : inStock;
    }
  );
  const elsewhere = {
    text: "This list has the best sellers only. For an item that is not listed, tell your user you cannot see it here and give them the shop's search:",
    url: `${base}/search`,
  };
  if (items.length === 0) {
    return [
      {
        text: "Nothing in this list is in stock right now. Tell your user: do not guess.",
      },
      ...(partial ? [elsewhere] : []),
    ];
  }
  return [
    {
      text: "Below, each product starts with a photo line, then has one line per item in stock: the product, its variant, the price, then its add-to-cart link.",
    },
    {
      text: "The photo line is the product's own picture, not a link to buy. It is the only picture you may show for that product. If you cannot display it, show no picture and give your user the photo link: a picture from a search or another site is the wrong product.",
    },
    partial
      ? elsewhere
      : {
          text: "An item that is not listed is sold out or not sold here. Say so: do not guess.",
        },
    ...items,
  ];
}

/**
 * The guide's steps. Everything an agent needs is on this one page, down to
 * the add-to-cart link of each item: ChatGPT read the guide but opened no
 * product page after it, not even one its user pasted.
 */
export function shopGuide(
  base: string,
  catalogue: GuideCatalogue
): { intro: string; steps: { title: string; lines: GuideLine[] }[] } {
  return {
    intro:
      "Use this page when your user asks you to find or buy something in this shop. Everything you need is on this page: you do not have to open any other. You need no API key, account or connector. You cannot change a cart or pay: your user does both.",
    steps: [
      {
        title: "1. Ask your user",
        lines: [
          {
            text: "What they are looking for, and any size, colour or budget.",
          },
          {
            text: `How many they want. One link adds up to ${MAX_LINK_QUANTITY}.`,
          },
        ],
      },
      { title: "2. Find the item", lines: itemLines(base, catalogue) },
      {
        title: "3. Confirm with your user",
        lines: [
          {
            text: "Tell them the product, the variant and the price, then wait for their answer.",
          },
          { text: "Never pick a size or colour they did not choose." },
        ],
      },
      {
        title: "4. Give your user the link",
        lines: [
          {
            text: "Copy the item's add-to-cart link exactly as listed. For more than one, change quantity=1 to the number they want.",
          },
          {
            text: 'Tell them the link opens a page that shows the item, and nothing is added until they press "Add to cart". They check out and pay themselves.',
          },
        ],
      },
      {
        title: "Using tools instead",
        lines: [
          {
            text: "For agents that can connect to tools, the MCP server and the WebMCP tools are listed at",
            url: `${base}/llms.txt`,
          },
        ],
      },
    ],
  };
}

/** The guide as Markdown: the `.md` twin of the page. */
export function shopGuideMarkdown(
  base: string,
  catalogue: GuideCatalogue
): string {
  const { intro, steps } = shopGuide(base, catalogue);
  return [
    `# ${SHOP_GUIDE_TITLE}`,
    intro,
    ...steps.map(
      ({ title, lines }) =>
        `## ${title}\n\n${lines
          .map(({ text, url }) => (url ? `- ${text} <${url}>` : `- ${text}`))
          .join("\n")}`
    ),
  ].join("\n\n");
}
