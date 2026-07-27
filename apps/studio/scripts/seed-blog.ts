/**
 * Seeds demo blog content: one author, four categories, six posts and the
 * blogIndex singleton. Bodies are lorem, but structured to exercise the blog
 * templates — headings (so the table of contents fills), both list types, text
 * decorators, a link annotation and an inline captioned image.
 *
 * Run with: pnpm --filter studio seed:blog
 *
 * Idempotent — everything uses createOrReplace with stable _ids and keys.
 *
 * Cover images are resolved from whatever image assets already exist in the
 * dataset rather than hardcoded, so this still works on a fresh project. The
 * blog schema requires an image, so if the dataset has no assets the script
 * stops and tells you to upload one first.
 *
 * Document _ids use hyphens, never dots: a dot marks a Sanity document private,
 * so it resolves in the Studio but comes back empty on the storefront's
 * unauthenticated reads.
 */

import { getCliClient } from "sanity/cli";

const client = getCliClient();

const AUTHOR_ID = "author-avery-lane";

let keyCounter = 0;
const nextKey = (prefix = "k") => `${prefix}${(keyCounter++).toString(36)}`;

// --- Portable Text helpers -------------------------------------------------

type Span = { _type: "span"; _key: string; text: string; marks: string[] };

const span = (text: string, marks: string[] = []): Span => ({
  _type: "span",
  _key: nextKey("s"),
  text,
  marks,
});

function block(
  children: Span[],
  opts: { style?: string; listItem?: string; markDefs?: unknown[] } = {}
) {
  const node: Record<string, unknown> = {
    _type: "block",
    _key: nextKey("b"),
    style: opts.style ?? "normal",
    markDefs: opts.markDefs ?? [],
    children,
  };
  if (opts.listItem) {
    node.listItem = opts.listItem;
    node.level = 1;
  }
  return node;
}

const para = (text: string) => block([span(text)]);
const heading = (style: "h2" | "h3", text: string) => block([span(text)], { style });
const bullet = (text: string) => block([span(text)], { listItem: "bullet" });
const numbered = (text: string) => block([span(text)], { listItem: "number" });

/** Paragraph exercising the strong and code decorators. */
const decoratedPara = () =>
  block([
    span("The part that trips people up is "),
    span("consistency", ["strong"]),
    span(
      ". Once a pattern exists in two places it belongs in a shared module — reach for "
    ),
    span("defineQuery", ["code"]),
    span(" and let the generated types keep everything honest."),
  ]);

/** Paragraph carrying a customLink annotation. */
function linkPara() {
  const markKey = nextKey("link");
  return block(
    [
      span("There is a fuller write-up of this approach in the "),
      span("project documentation", [markKey]),
      span(", which covers the edge cases in more depth."),
    ],
    {
      markDefs: [
        {
          _type: "customLink",
          _key: markKey,
          customLink: {
            _type: "customUrl",
            type: "external",
            external: "https://www.sanity.io/docs",
            openInNewTab: true,
          },
        },
      ],
    }
  );
}

const inlineImage = (assetId: string) => ({
  _type: "image",
  _key: nextKey("img"),
  asset: { _type: "reference", _ref: assetId },
  caption: "Lorem ipsum dolor sit amet — an inline figure with a caption.",
});

const L1 =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";
const L2 =
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
const L3 =
  "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.";
const L4 =
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.";
const L5 =
  "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.";

/** Full-length article — headings, both list types, marks, link, inline image. */
const longBody = (assetId: string) => [
  para(L1),
  para(L2),
  heading("h2", "Where most teams start"),
  para(L3),
  bullet("Agree the content model before anyone opens a code editor."),
  bullet("Keep components small enough to reason about in one sitting."),
  bullet("Generate types from the schema so the frontend cannot drift."),
  bullet("Write down the decisions your future self will forget."),
  para(L4),
  inlineImage(assetId),
  heading("h2", "Putting it into practice"),
  decoratedPara(),
  heading("h3", "A short checklist"),
  numbered("Draft the schema and preview it in the Studio."),
  numbered("Wire the GROQ query and regenerate types."),
  numbered("Build the section component and register it."),
  numbered("Verify the result end to end before shipping."),
  para(L5),
  heading("h3", "Common pitfalls"),
  bullet("Modelling the layout instead of the content."),
  bullet("Letting one-off fields accumulate on shared documents."),
  bullet("Skipping the preview step and finding out in production."),
  linkPara(),
  para(L2),
];

/** Deliberately light — shows the template with a short post next to long ones. */
const shortBody = () => [
  para(L4),
  heading("h2", "The short version"),
  bullet("Start with the smallest thing that could work."),
  bullet("Measure before optimising anything."),
  bullet("Delete more than you add."),
  para(L1),
];

// --- Content ---------------------------------------------------------------

const CATEGORIES = [
  {
    id: "category-design",
    title: "Design",
    description:
      "Craft, visual systems and the details that make a storefront feel considered.",
  },
  {
    id: "category-engineering",
    title: "Engineering",
    description:
      "Architecture, performance and the tooling behind the storefront.",
  },
  {
    id: "category-commerce",
    title: "Commerce",
    description: "Merchandising, conversion and how people actually shop.",
  },
  {
    id: "category-guides",
    title: "Guides",
    description: "Step-by-step walkthroughs for getting things done.",
  },
];

const POSTS = [
  {
    id: "blog-design-system-that-scales",
    title: "Building a Design System That Scales",
    description:
      "How to grow a component library past its first dozen pieces without it collapsing into a pile of one-off variants nobody wants to touch.",
    category: "category-design",
    publishedAt: "2026-07-20",
    short: false,
  },
  {
    id: "blog-headless-commerce-intro",
    title: "Headless Commerce: A Practical Introduction",
    description:
      "What actually changes when you decouple the storefront from the platform, which problems it solves, and the ones it quietly hands to you instead.",
    category: "category-commerce",
    publishedAt: "2026-07-08",
    short: false,
  },
  {
    id: "blog-structured-content-wins",
    title: "Structured Content and Why It Wins",
    description:
      "Modelling content as data rather than pages takes longer up front and pays for itself the first time you need it somewhere new.",
    category: "category-engineering",
    publishedAt: "2026-06-24",
    short: false,
  },
  {
    id: "blog-product-photography-guide",
    title: "A Guide to Product Photography",
    description:
      "Lighting, angles and consistency — a practical walkthrough for shooting a catalogue that looks like it belongs to a single brand.",
    category: "category-guides",
    publishedAt: "2026-06-11",
    short: false,
  },
  {
    id: "blog-performance-budgets",
    title: "Performance Budgets for Storefronts",
    description:
      "A budget is only useful if something breaks when you exceed it. Here is how to set one and wire it into the pipeline so it holds.",
    category: "category-engineering",
    publishedAt: "2026-05-27",
    short: true,
  },
  {
    id: "blog-typography-in-ecommerce",
    title: "Typography in Ecommerce",
    description:
      "Type does most of the work on a product page and gets a fraction of the attention. A look at scale, rhythm and where storefronts go wrong.",
    category: "category-design",
    publishedAt: "2026-05-09",
    short: false,
  },
];

/**
 * Cover images come from the dataset's existing assets, widest first so blog
 * cards get landscape crops. Hardcoding ids would break on a fresh project.
 */
async function resolveImageAssets(): Promise<string[]> {
  const ids: string[] = await client.fetch(
    `*[_type == "sanity.imageAsset"] | order(metadata.dimensions.aspectRatio desc) [0...6]._id`
  );
  if (ids.length === 0) {
    throw new Error(
      "No image assets in this dataset. Blog posts require a cover image — upload at least one image in the Studio, then re-run."
    );
  }
  return ids;
}

async function main() {
  const assets = await resolveImageAssets();
  const pick = (i: number) => assets[i % assets.length] as string;

  let tx = client.transaction();

  tx = tx.createOrReplace({
    _id: AUTHOR_ID,
    _type: "author",
    name: "Avery Lane",
    position: "Editor",
    bio: "Writes about design systems, storefront performance and the unglamorous work of keeping a content model tidy.",
    image: {
      _type: "image",
      asset: { _type: "reference", _ref: pick(0) },
      alt: "Portrait of Avery Lane",
    },
  });

  CATEGORIES.forEach((category, i) => {
    tx = tx.createOrReplace({
      _id: category.id,
      _type: "category",
      title: category.title,
      slug: { _type: "slug", current: category.title.toLowerCase() },
      description: category.description,
      orderRank: `0|c${String(i).padStart(5, "0")}:`,
    });
  });

  POSTS.forEach((post, i) => {
    const asset = pick(i);
    tx = tx.createOrReplace({
      _id: post.id,
      _type: "blog",
      title: post.title,
      description: post.description,
      slug: {
        _type: "slug",
        current: `/blog/${post.id.replace(/^blog-/, "")}`,
      },
      authors: [{ _type: "reference", _ref: AUTHOR_ID, _key: `author-${i}` }],
      category: { _type: "reference", _ref: post.category },
      publishedAt: post.publishedAt,
      image: {
        _type: "image",
        asset: { _type: "reference", _ref: asset },
        alt: `Cover image for ${post.title}`,
      },
      richText: post.short ? shortBody() : longBody(asset),
      orderRank: `0|b${String(i).padStart(5, "0")}:`,
    });
  });

  tx = tx.createOrReplace({
    _id: "blogIndex",
    _type: "blogIndex",
    title: "Journal",
    description:
      "Notes on design, engineering and commerce from the team building this storefront.",
    slug: { _type: "slug", current: "/blog" },
    displayFeaturedBlogs: "yes",
    featuredBlogsCount: "1",
  });

  await tx.commit();
  console.log(
    `Seeded 1 author, ${CATEGORIES.length} categories, ${POSTS.length} blog posts and the blogIndex singleton`
  );
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
});
