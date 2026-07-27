/**
 * Seeds FAQ documents and attaches a faqCategories block to the home page and
 * the /faq page.
 *
 * Run with: pnpm --filter studio seed:faq
 *
 * Idempotent — FAQ docs use createOrReplace, and the page block is keyed so
 * re-running replaces it in place rather than stacking duplicates.
 *
 * Document _ids use hyphens, never dots: a dot marks a Sanity document private,
 * so it resolves in the Studio but comes back empty on the storefront's
 * unauthenticated reads.
 */

import { getCliClient } from "sanity/cli";

const client = getCliClient();

/** Stable key so re-runs replace the seeded block instead of duplicating it. */
const BLOCK_KEY = "faqCategoriesSection";
const TARGET_PAGES = ["homePage", "page-faq"];

type Faq = { id: string; question: string; answer: string[] };
type Category = { title: string; faqs: Faq[] };

const CATEGORIES: Category[] = [
  {
    title: "Orders & Shipping",
    faqs: [
      {
        id: "faq-shipping-times",
        question: "How long will my order take to arrive?",
        answer: [
          "Orders are picked and packed within one working day. Standard delivery then takes 3–5 working days, and express is next working day if you order before 2pm.",
          "You'll get a dispatch email with tracking as soon as the parcel leaves us — that's the point the clock really starts.",
        ],
      },
      {
        id: "faq-shipping-cost",
        question: "How much does shipping cost?",
        answer: [
          "Standard delivery is free on orders over £50. Below that it's £3.95, and express is £6.95 flat.",
          "The exact cost for your basket is shown at checkout before you pay, so there's nothing added at the last step.",
        ],
      },
      {
        id: "faq-track-order",
        question: "How do I track my order?",
        answer: [
          "Your dispatch email contains a tracking link that updates as the parcel moves through the courier network.",
          "If the link still shows no movement 24 hours after dispatch, that usually means the courier hasn't scanned it yet rather than anything being wrong. Get in touch if it hasn't updated after 48 hours.",
        ],
      },
      {
        id: "faq-international",
        question: "Do you ship internationally?",
        answer: [
          "Yes — we ship across the EU, the US, Canada and Australia. Delivery is typically 7–14 working days depending on the destination.",
          "Duties and import taxes aren't included in the price you pay us. Your local customs office collects those separately before the parcel is released.",
        ],
      },
    ],
  },
  {
    title: "Returns & Exchanges",
    faqs: [
      {
        id: "faq-return-window",
        question: "What is your returns policy?",
        answer: [
          "You have 30 days from delivery to return anything unworn, with tags still attached and in its original packaging.",
          "Underwear, swimwear and pierced jewellery can't be returned for hygiene reasons unless they arrived faulty.",
        ],
      },
      {
        id: "faq-start-return",
        question: "How do I start a return?",
        answer: [
          "Use the returns link in your order confirmation email to print a prepaid label, then drop the parcel at any post office.",
          "Keep your proof of postage until the refund lands. It's the only way to trace a parcel that goes missing on the way back to us.",
        ],
      },
      {
        id: "faq-exchange",
        question: "Can I exchange an item for a different size?",
        answer: [
          "We don't process direct exchanges, because the size you want can sell out while your original item is in transit back to us.",
          "Place a new order for the size you want and return the original for a refund. That way you're guaranteed the stock.",
        ],
      },
      {
        id: "faq-refund-time",
        question: "When will I get my refund?",
        answer: [
          "Refunds are issued within 3 working days of your return reaching our warehouse, back to the original payment method.",
          "Your bank then takes another 3–5 working days to show it. If it's been longer than that, send us your proof of postage and we'll chase it.",
        ],
      },
    ],
  },
  {
    title: "Products & Sizing",
    faqs: [
      {
        id: "faq-size-guide",
        question: "How do I find the right size?",
        answer: [
          "Every product page has a size guide with garment measurements taken flat, plus the height and size of the model in the photos.",
          "If you're between sizes, size up on outerwear and knitwear and stay true to size on jersey. Anything cut deliberately loose or slim says so in the description.",
        ],
      },
      {
        id: "faq-materials",
        question: "What are your products made from?",
        answer: [
          "The full fabric composition and country of manufacture are listed on each product page under Details.",
          "Where a fabric is certified — organic cotton, recycled polyester, responsible wool — the certification is named rather than left as a vague claim.",
        ],
      },
      {
        id: "faq-restock",
        question: "Will sold-out items be restocked?",
        answer: [
          "Core pieces are usually restocked within a few weeks. Seasonal and limited runs generally aren't repeated once they're gone.",
          "Use the notify-me option on the product page and we'll email you the moment that specific size is back. It doesn't reserve stock, so it's worth ordering promptly.",
        ],
      },
    ],
  },
  {
    title: "Payment & Account",
    faqs: [
      {
        id: "faq-payment-methods",
        question: "What payment methods do you accept?",
        answer: [
          "All major credit and debit cards, plus Apple Pay, Google Pay, PayPal and Shop Pay.",
          "Payments are handled by Shopify's checkout, so your card details never touch our servers.",
        ],
      },
      {
        id: "faq-order-change",
        question: "Can I change or cancel my order?",
        answer: [
          "If the order hasn't been dispatched, email us with your order number and we'll amend or cancel it.",
          "Once it's with the courier we can't recall it — you'd need to return it for a refund once it arrives.",
        ],
      },
      {
        id: "faq-account-needed",
        question: "Do I need an account to place an order?",
        answer: [
          "No, you can check out as a guest. You'll still get order confirmation and tracking by email.",
          "An account saves your addresses and keeps your order history in one place, which makes returns quicker to start.",
        ],
      },
    ],
  },
];

/** Portable Text paragraphs. Keys derive from the id so re-runs stay stable. */
function toRichText(id: string, paragraphs: string[]) {
  return paragraphs.map((text, i) => ({
    _type: "block",
    _key: `${id}-b${i}`,
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: `${id}-s${i}`, text, marks: [] }],
  }));
}

const faqDocs = CATEGORIES.flatMap((category) =>
  category.faqs.map((faq) => ({
    _id: faq.id,
    _type: "faq",
    title: faq.question,
    richText: toRichText(faq.id, faq.answer),
  }))
);

const faqBlock = {
  _type: "faqCategories",
  _key: BLOCK_KEY,
  title: "Frequently asked questions",
  categories: CATEGORIES.map((category) => ({
    _type: "faqCategory",
    _key: `cat-${category.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: category.title,
    faqs: category.faqs.map((faq) => ({
      _type: "reference",
      _ref: faq.id,
      _key: `ref-${faq.id}`,
    })),
  })),
};

async function attachBlock(pageId: string) {
  const page = await client.getDocument(pageId);
  if (!page) {
    console.warn(`  skipped ${pageId} — document does not exist`);
    return;
  }

  const blocks: { _key?: string }[] = Array.isArray(page.pageBuilder)
    ? page.pageBuilder
    : [];

  if (blocks.some((b) => b?._key === BLOCK_KEY)) {
    await client
      .patch(pageId)
      .set({ [`pageBuilder[_key=="${BLOCK_KEY}"]`]: faqBlock })
      .commit();
    console.log(`  updated block on ${pageId}`);
    return;
  }

  await client
    .patch(pageId)
    .setIfMissing({ pageBuilder: [] })
    .append("pageBuilder", [faqBlock])
    .commit();
  console.log(`  appended block to ${pageId}`);
}

async function main() {
  await faqDocs
    .reduce((tx, doc) => tx.createOrReplace(doc), client.transaction())
    .commit();
  console.log(`Seeded ${faqDocs.length} FAQ documents`);

  for (const pageId of TARGET_PAGES) {
    await attachBlock(pageId);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
});
