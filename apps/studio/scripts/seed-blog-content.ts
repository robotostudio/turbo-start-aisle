/**
 * One-off seed: gives the demo blog posts long lorem content (headings +
 * bullet lists so the TOC and bullets render), assigns categories, creates the
 * category documents, and sets the blog index to a single featured post.
 *
 * Run from apps/studio:  npx tsx scripts/seed-blog-content.ts
 * Reads SANITY_API_WRITE_TOKEN from ../web/.env.local (falls back to .env.local).
 */

import { config } from "dotenv";

config({ path: "../web/.env.local" });
config({ path: ".env.local" });

import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "ztcucp3r";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!token) {
  throw new Error(
    "Missing SANITY_API_WRITE_TOKEN (expected in ../web/.env.local)"
  );
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2025-05-08",
  token,
  useCdn: false,
});

// --- Portable text helpers -------------------------------------------------

let keyCounter = 0;
const nextKey = () => `seed${(keyCounter++).toString(36)}`;

const span = (text: string) => ({
  _type: "span",
  _key: nextKey(),
  text,
  marks: [] as string[],
});

const para = (text: string) => ({
  _type: "block",
  _key: nextKey(),
  style: "normal",
  markDefs: [],
  children: [span(text)],
});

const heading = (style: "h2" | "h3", text: string) => ({
  _type: "block",
  _key: nextKey(),
  style,
  markDefs: [],
  children: [span(text)],
});

const bullet = (text: string) => ({
  _type: "block",
  _key: nextKey(),
  style: "normal",
  listItem: "bullet",
  level: 1,
  markDefs: [],
  children: [span(text)],
});

const LOREM_1 =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";
const LOREM_2 =
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
const LOREM_3 =
  "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.";
const LOREM_4 =
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est qui dolorem ipsum quia dolor sit amet.";

/** Build a long article body with two H2 sections, an H3, and bullet lists. */
function buildRichText() {
  return [
    para(LOREM_1),
    para(LOREM_2),
    heading("h2", "Why this matters"),
    para(LOREM_3),
    bullet("Establish a clear content model before you build."),
    bullet("Keep components small, composable, and easy to reason about."),
    bullet("Lean on generated types so the frontend stays in sync."),
    bullet("Document the decisions your future self will forget."),
    para(LOREM_4),
    heading("h2", "Putting it into practice"),
    para(LOREM_1),
    heading("h3", "A short checklist"),
    bullet("Draft the schema and preview it in the Studio."),
    bullet("Wire the GROQ query and regenerate types."),
    bullet("Build the section component and register it."),
    bullet("Verify the result end to end before shipping."),
    para(LOREM_2),
  ];
}

// --- Rich helpers (marks, links, numbered lists, inline images) ------------

const AUTHOR_ID = "author-alex-smith";
const IMAGE_A = "image-2111f438e66fa92c17862afb5e911de0fc760ad2-2880x1200-jpg";
const IMAGE_B = "image-3130eb29751c758fac04e49720ed285494053f96-1424x1200-jpg";
const IMAGE_C = "image-022efcd94693b602798145f1add0322eef22bf25-1440x617-png";

const markSpan = (text: string, marks: string[]) => ({
  _type: "span",
  _key: nextKey(),
  text,
  marks,
});

const numbered = (text: string) => ({
  _type: "block",
  _key: nextKey(),
  style: "normal",
  listItem: "number",
  level: 1,
  markDefs: [],
  children: [span(text)],
});

const inlineImage = (ref: string, alt: string, caption: string) => ({
  _type: "image",
  _key: nextKey(),
  asset: { _type: "reference", _ref: ref },
  alt,
  caption,
});

/** Paragraph mixing bold / italic / inline-code marks and an external link. */
function richParagraph() {
  const linkKey = nextKey();
  return {
    _type: "block",
    _key: nextKey(),
    style: "normal",
    markDefs: [
      {
        _type: "customLink",
        _key: linkKey,
        customLink: {
          _type: "customUrl",
          type: "external",
          external: "https://www.sanity.io/docs",
          openInNewTab: true,
        },
      },
    ],
    children: [
      span("You can format copy with "),
      markSpan("bold", ["strong"]),
      span(", "),
      markSpan("italic", ["em"]),
      span(", "),
      markSpan("inline code", ["code"]),
      span(", and an "),
      markSpan("external link", [linkKey]),
      span(" — all rendered by the same portable-text pipeline."),
    ],
  };
}

/** A richer article showing inline images, links, and numbered lists. */
function buildRichArticle(imageRef: string) {
  return [
    para(LOREM_1),
    richParagraph(),
    heading("h2", "Working with imagery"),
    para(LOREM_3),
    inlineImage(
      imageRef,
      "Illustrative inline image",
      "An inline image dropped straight into the article body, with a caption."
    ),
    para(LOREM_2),
    heading("h2", "A repeatable workflow"),
    heading("h3", "Steps, in order"),
    numbered("Model the content in the Studio schema."),
    numbered("Project it with a GROQ fragment and regenerate types."),
    numbered("Render it with the shared RichText component."),
    numbered("Review the result on the page before publishing."),
    para(LOREM_4),
    heading("h3", "Things to remember"),
    bullet("Keep headings meaningful — they power the table of contents."),
    bullet("Add alt text and a caption to every image."),
    bullet("Prefer generated types over manual casting."),
    para(LOREM_1),
  ];
}

// New demo posts (created fresh, published directly).
const newBlogs = [
  {
    id: "blog-headless-cms-guide",
    slug: "a-practical-guide-to-headless-cms",
    title: "A Practical Guide to Headless CMS",
    description:
      "How a headless CMS keeps content and presentation independent, why generated types matter, and a repeatable workflow for shipping content-driven pages fast.",
    category: "category-sanity",
    publishedAt: "2026-03-12",
    image: IMAGE_A,
    imageRef: IMAGE_B,
  },
  {
    id: "blog-designing-with-portable-text",
    slug: "designing-with-portable-text",
    title: "Designing with Portable Text",
    description:
      "Portable Text turns rich content into structured data you can render anywhere. Here is how marks, blocks, and inline images map cleanly onto React components.",
    category: "category-nextjs",
    publishedAt: "2026-04-08",
    image: IMAGE_B,
    imageRef: IMAGE_C,
  },
  {
    id: "blog-shipping-content-fast",
    slug: "shipping-content-fast",
    title: "Shipping Content Fast",
    description:
      "A pragmatic look at how small teams move from an empty schema to a polished, SEO-ready article — covering imagery, links, lists, and the details that matter.",
    category: "category-seo",
    publishedAt: "2026-05-21",
    image: IMAGE_C,
    imageRef: IMAGE_A,
  },
];

// --- Categories ------------------------------------------------------------

const categories = [
  { id: "category-sanity", title: "Sanity", slug: "sanity" },
  { id: "category-skills", title: "Skills", slug: "skills" },
  { id: "category-nextjs", title: "Next.js", slug: "nextjs" },
  { id: "category-seo", title: "SEO", slug: "seo" },
  { id: "category-aeo", title: "AEO", slug: "aeo" },
  { id: "category-changelog", title: "Changelog", slug: "changelog" },
];

// Which category each existing blog gets.
const blogCategoryMap: Record<string, string> = {
  "blog-design-trends": "category-skills",
  "blog-getting-started": "category-sanity",
  "blog-sustainable-shopping": "category-seo",
};

async function main() {
  // 1. Categories (createOrReplace = idempotent, writes published docs).
  for (const [index, cat] of categories.entries()) {
    await client.createOrReplace({
      _id: cat.id,
      _type: "category",
      title: cat.title,
      slug: { _type: "slug", current: cat.slug },
      orderRank: `0|${(index + 1).toString().padStart(6, "0")}:`,
    });
    console.log(`✓ category: ${cat.title}`);
  }

  // 2. Single featured post on the blog index.
  await client.patch("blogIndex").set({ featuredBlogsCount: "1" }).commit();
  console.log("✓ blogIndex.featuredBlogsCount = 1");

  // 3. Long content + category for each existing demo blog.
  for (const [blogId, categoryId] of Object.entries(blogCategoryMap)) {
    await client
      .patch(blogId)
      .set({
        richText: buildRichText(),
        category: { _type: "reference", _ref: categoryId },
      })
      .commit();
    console.log(`✓ blog seeded: ${blogId} -> ${categoryId}`);
  }

  // 4. Fresh demo posts with inline images, links, and numbered lists.
  for (const [index, blog] of newBlogs.entries()) {
    await client.createOrReplace({
      _id: blog.id,
      _type: "blog",
      title: blog.title,
      description: blog.description,
      slug: { _type: "slug", current: `/blog/${blog.slug}` },
      authors: [{ _type: "reference", _key: nextKey(), _ref: AUTHOR_ID }],
      category: { _type: "reference", _ref: blog.category },
      publishedAt: blog.publishedAt,
      image: {
        _type: "image",
        asset: { _type: "reference", _ref: blog.image },
        alt: blog.title,
      },
      richText: buildRichArticle(blog.imageRef),
      orderRank: `0|00${(index + 1).toString().padStart(4, "0")}:`,
    });
    console.log(`✓ new blog: ${blog.title}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
