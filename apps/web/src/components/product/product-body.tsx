import { PortableText, type PortableTextReactComponents } from "next-sanity";
import Link from "next/link";

import type { QueryProductByHandleResult } from "@workspace/sanity/types";

import { sharedPortableTextTypes } from "@/components/elements/portable-text-types";
import { SanityImage } from "@/components/elements/sanity-image";

type ProductBody = NonNullable<NonNullable<QueryProductByHandleResult>["body"]>;

const productBodyComponents: Partial<PortableTextReactComponents> = {
  block: {
    h2: ({ children }) => (
      <h2 className="font-semibold text-2xl">{children}</h2>
    ),
    h3: ({ children }) => <h3 className="font-semibold text-xl">{children}</h3>,
    normal: ({ children }) => (
      <p className="text-muted-foreground leading-relaxed">{children}</p>
    ),
  },
  marks: {
    customLink: ({ children, value }) => {
      if (!value?.href || value.href === "#") return <span>{children}</span>;
      return (
        <Link
          className="underline decoration-dotted underline-offset-2"
          href={value.href}
          target={value.openInNewTab ? "_blank" : "_self"}
        >
          {children}
        </Link>
      );
    },
    linkInternal: ({ children, value }) => {
      if (!value?.href) return <span>{children}</span>;
      return (
        <Link
          className="underline decoration-dotted underline-offset-2"
          href={value.href}
        >
          {children}
        </Link>
      );
    },
    linkExternal: ({ children, value }) => {
      if (!value?.href) return <span>{children}</span>;
      return (
        <Link
          className="underline decoration-dotted underline-offset-2"
          href={value.href}
          rel={value.openInNewTab ? "noopener noreferrer" : undefined}
          target={value.openInNewTab ? "_blank" : "_self"}
        >
          {children}
        </Link>
      );
    },
  },
  types: {
    ...sharedPortableTextTypes,
    image: ({ value }) => {
      if (!value?.id) return null;
      return (
        <figure className="my-4">
          <SanityImage
            className="h-auto w-full"
            height={900}
            image={value}
            width={1600}
          />
        </figure>
      );
    },
  },
};

export function ProductBody({ body }: { body: ProductBody }) {
  if (!body || body.length === 0) return null;

  return (
    <div className="space-y-4">
      <PortableText components={productBodyComponents} value={body} />
    </div>
  );
}
