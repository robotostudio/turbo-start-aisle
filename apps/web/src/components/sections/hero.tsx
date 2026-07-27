import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { stegaClean } from "next-sanity";

import type {
  SanityButtonProps,
  SanityImageProps,
  SanityRichTextProps,
} from "@/types";
import { RichText } from "../elements/rich-text";
import { SanityButtons } from "../elements/sanity-buttons";
import { SanityImage } from "../elements/sanity-image";

type HeroContentPosition = "bottomLeft" | "bottomCenter" | "bottomRight";

type HeroBlockProps = {
  _key: string;
  _type: "hero";
  style?: "classic" | "fullBleed" | null;
  contentPosition?: HeroContentPosition | null;
  badge?: string | null;
  title?: string | null;
  richText?: SanityRichTextProps | null;
  image?: SanityImageProps | null;
  buttons?: SanityButtonProps[] | null;
};

/**
 * Maps the Sanity content-position choice to alignment classes. `text` aligns
 * the actual text lines; `selfX` (auto margins) positions the block and the
 * w-fit buttons, which text-align alone can't move.
 */
const CONTENT_POSITION: Record<
  HeroContentPosition,
  { text: string; selfX: string }
> = {
  bottomLeft: { text: "text-left", selfX: "mr-auto" },
  bottomCenter: { text: "text-center", selfX: "mx-auto" },
  bottomRight: { text: "text-right", selfX: "ml-auto" },
};

export function HeroBlock(props: HeroBlockProps) {
  return stegaClean(props.style) === "fullBleed" ? (
    <FullBleedHero {...props} />
  ) : (
    <ClassicHero {...props} />
  );
}

function ClassicHero({
  title,
  buttons,
  badge,
  image,
  richText,
}: HeroBlockProps) {
  return (
    <section className="mt-4 md:my-16" id="hero">
      <div className="site-container">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="grid h-full grid-rows-[auto_1fr_auto] items-center justify-items-center gap-4 text-center lg:items-start lg:justify-items-start lg:text-left">
            {badge && <Badge variant="secondary">{badge}</Badge>}
            <div className="grid gap-4">
              <h1 className="text-balance font-bold text-4xl lg:text-6xl">
                {title}
              </h1>
              <RichText
                className="font-normal text-base md:text-lg"
                richText={richText}
              />
            </div>
            <SanityButtons
              buttonClassName="w-full sm:w-auto"
              buttons={buttons ?? null}
              className="mb-8 grid w-full gap-2 sm:w-fit sm:grid-flow-col lg:justify-start"
            />
          </div>

          {image && (
            <div className="h-96 w-full">
              <SanityImage
                className="max-h-96 w-full rounded-none object-cover"
                fetchPriority="high"
                height={800}
                image={image}
                loading="eager"
                width={800}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FullBleedHero({
  title,
  buttons,
  image,
  richText,
  contentPosition,
}: HeroBlockProps) {
  const pos =
    CONTENT_POSITION[stegaClean(contentPosition) ?? "bottomLeft"] ??
    CONTENT_POSITION.bottomLeft;
  return (
    <section className="relative" id="hero">
      <div className="card-surface relative h-[92dvh] min-h-125 w-full overflow-hidden">
        {image && (
          <SanityImage
            className="absolute inset-0 h-full min-h-full w-full rounded-none object-cover"
            fetchPriority="high"
            image={image}
            loading="eager"
            sizes="100vw"
            width={2000}
          />
        )}

        {/* Bottom scrim so dark promo text stays legible over light imagery */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-white/90 via-white/60 to-transparent lg:hidden"
        />

        {/* Promo text overlaid along the bottom (position set in Sanity) */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="site-container pb-8 md:pb-12">
            <div
              className={cn(
                "flex w-full max-w-md flex-col gap-2 font-medium text-zinc-900",
                pos.text,
                pos.selfX
              )}
            >
              <div className="text-2xl leading-tight">
                {title && <p>{title}</p>}
                {buttons?.map((button) =>
                  button.href ? (
                    <Link
                      className={cn("block w-fit hover:underline", pos.selfX)}
                      href={button.href}
                      key={button._key}
                      target={button.openInNewTab ? "_blank" : "_self"}
                    >
                      {button.text}
                    </Link>
                  ) : null
                )}
              </div>
              {richText && (
                <RichText
                  className="text-sm [&_p]:text-zinc-800!"
                  richText={richText}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
