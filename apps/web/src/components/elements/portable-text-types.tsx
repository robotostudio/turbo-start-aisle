import type { QueryBlogSlugPageDataResult } from "@workspace/sanity/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { PortableText, type PortableTextReactComponents } from "next-sanity";

import { ProductHotspotsImage } from "@/components/product/product-hotspots";

/**
 * The shape the renderer actually receives, taken from the generated query
 * result rather than the raw schema type, because the projection resolves
 * `markDefs` into hrefs. Blog and product body share one fragment
 * (`portableTextMembersFragment`), so either result type describes both.
 */
type RichTextMember = NonNullable<
  NonNullable<QueryBlogSlugPageDataResult>["richText"]
>[number];
type AccordionGroup = NonNullable<
  Extract<RichTextMember, { _type: "accordion" }>["groups"]
>[number];

/**
 * Instagram's share button includes the username, so `/p/<id>` and
 * `/<username>/p/<id>` are both valid; reels and IGTV embed the same way.
 * Mirrors the validation on the `instagram` schema
 * (apps/studio/schemaTypes/objects/module/instagram.ts).
 */
const INSTAGRAM_POST_ID =
  /instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|tv)\/([^/?#&]+)/;

export function InstagramEmbed({ url }: { url?: string | null }) {
  const postId = url?.match(INSTAGRAM_POST_ID)?.[1];
  if (!postId) return null;

  return (
    <div className="my-8 flex justify-center">
      <iframe
        className="aspect-[4/5] w-full max-w-[540px] border-0"
        loading="lazy"
        src={`https://www.instagram.com/p/${postId}/embed`}
        title="Instagram post"
      />
    </div>
  );
}

/**
 * Portable Text blocks shared by the product body and blog rich text. Both
 * fields permit these types, so both need to render them — an unhandled type
 * falls back to a `display: none` div and vanishes silently.
 *
 * `getComponents` returns the caller's own component set, which the accordion
 * hands to its nested render. It is a thunk rather than a value because that
 * set contains these types, so the reference has to resolve at render time
 * rather than while the caller is still building its object. Blog and product
 * body style their links differently, so the nested render has to inherit the
 * caller's marks rather than a shared default.
 */
export function createSharedPortableTextTypes(
  getComponents: () => Partial<PortableTextReactComponents>
): NonNullable<Partial<PortableTextReactComponents>["types"]> {
  return {
    imageWithProductHotspots: ({ value }) => {
      if (!value?.image) return null;
      return (
        <div className="my-6">
          <ProductHotspotsImage
            image={value.image}
            productHotspots={value.productHotspots}
            showHotspots={value.showHotspots}
          />
        </div>
      );
    },
    accordion: ({ value }) => {
      if (!value?.groups?.length) return null;
      return (
        <Accordion className="my-4" collapsible type="single">
          {value.groups.map((group: AccordionGroup) => (
            <AccordionItem key={group._key} value={group._key}>
              <AccordionTrigger>{group.title}</AccordionTrigger>
              <AccordionContent>
                {group.body && (
                  <div className="prose prose-sm dark:prose-invert">
                    <PortableText
                      components={getComponents()}
                      value={group.body}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      );
    },
    callout: ({ value }) => {
      if (!value?.text) return null;
      return (
        <div className="my-4 border bg-muted/50 p-4">
          <p className="text-sm">{value.text}</p>
        </div>
      );
    },
    instagram: ({ value }) => <InstagramEmbed url={value?.url} />,
  };
}
