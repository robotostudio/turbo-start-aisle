import { PortableText, type PortableTextReactComponents } from "next-sanity";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hotspot image reaches `@workspace/env/client`, which validates the Sanity
// env at import time, and pulls in the image pipeline. The renderer's job is to
// hand it the projected data, so a spy is enough to assert that.
const { productHotspotsImage } = vi.hoisted(() => ({
  productHotspotsImage: vi.fn((_props: Record<string, unknown>) => null),
}));

vi.mock("@/components/product/product-hotspots", () => ({
  ProductHotspotsImage: productHotspotsImage,
}));

// Radix keeps a closed panel out of the markup entirely, so the group body
// would never appear. The shell is not what is under test — the content of the
// nested render is.
vi.mock("@workspace/ui/components/accordion", () => ({
  Accordion: ({ children }: { children?: unknown }) =>
    createElement("div", null, children as never),
  AccordionItem: ({ children }: { children?: unknown }) =>
    createElement("div", null, children as never),
  AccordionTrigger: ({ children }: { children?: unknown }) =>
    createElement("div", null, children as never),
  AccordionContent: ({ children }: { children?: unknown }) =>
    createElement("div", null, children as never),
}));

import { createSharedPortableTextTypes } from "@/components/elements/portable-text-types";

/**
 * A link inside an accordion group is rendered by a second, nested
 * `<PortableText>`. `@portabletext/react` resolves components per render call,
 * so a nested render that is passed nothing inherits nothing and the mark falls
 * back to plain text.
 */
const accordionWithLink = [
  {
    _type: "accordion",
    _key: "acc",
    groups: [
      {
        _key: "group",
        title: "Shipping",
        body: [
          {
            _type: "block",
            _key: "block",
            style: "normal",
            markDefs: [
              {
                _type: "customLink",
                _key: "link",
                href: "/collections/shirts",
              },
            ],
            children: [
              {
                _type: "span",
                _key: "span",
                text: "See shirts",
                marks: ["link"],
              },
            ],
          },
        ],
      },
    ],
  },
];

// Stands in for the real link components, which pull in `next/link`. The
// assertion is about whether the nested render receives any marks at all.
const components: Partial<PortableTextReactComponents> = {
  marks: {
    customLink: ({ children, value }) =>
      createElement("a", { href: value?.href }, children),
  },
  types: {},
};
components.types = createSharedPortableTextTypes(() => components);

describe("createSharedPortableTextTypes", () => {
  it("renders a link inside an accordion group with its href", () => {
    const html = renderToStaticMarkup(
      createElement(PortableText, { components, value: accordionWithLink })
    );

    expect(html).toContain('href="/collections/shirts"');
    expect(html).toContain("See shirts");
  });

  it("keeps the group title", () => {
    const html = renderToStaticMarkup(
      createElement(PortableText, { components, value: accordionWithLink })
    );

    expect(html).toContain("Shipping");
  });
});

/**
 * The member that rendered nothing at all before the projection was fixed: an
 * unhandled branch left `productWithVariant` as a bare `_ref`, so this is the
 * shape only the resolved projection produces.
 */
const hotspotImage = [
  {
    _type: "imageWithProductHotspots",
    _key: "hotspot-block",
    image: { id: "image-abc-1440x600-jpg", alt: "Rail of shirts" },
    showHotspots: true,
    productHotspots: [
      {
        _key: "spot",
        x: 40,
        y: 60,
        productWithVariant: {
          product: { _id: "product-1", slug: "oxford-shirt" },
          variant: { _id: "variant-1" },
        },
      },
    ],
  },
];

describe("imageWithProductHotspots in rich text", () => {
  it("hands the projected image and hotspots to the renderer", () => {
    productHotspotsImage.mockClear();

    renderToStaticMarkup(
      createElement(PortableText, { components, value: hotspotImage })
    );

    expect(productHotspotsImage).toHaveBeenCalledTimes(1);
    expect(productHotspotsImage.mock.calls[0]?.[0]).toMatchObject({
      image: { id: "image-abc-1440x600-jpg" },
      showHotspots: true,
      productHotspots: [
        {
          _key: "spot",
          productWithVariant: { product: { slug: "oxford-shirt" } },
        },
      ],
    });
  });

  it("renders nothing when the image never resolved", () => {
    productHotspotsImage.mockClear();

    const html = renderToStaticMarkup(
      createElement(PortableText, {
        components,
        value: [{ _type: "imageWithProductHotspots", _key: "empty" }],
      })
    );

    expect(productHotspotsImage).not.toHaveBeenCalled();
    expect(html).toBe("");
  });
});
