"use client";

import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";

import { useCartActions } from "@/components/cart/cart-context";
import { ShopifyImage as Image } from "@/components/product/shopify-image";
import { SavedItemButton } from "@/components/saved-items/saved-item-button";
import { buildLineMetadata } from "@/lib/cart/metadata";
import {
  cardPricing,
  findCardVariant,
  resolveCardImages,
} from "@/lib/shopify/product-card";
import type { CardImageFields, MoneyV2 } from "@/lib/shopify/types";
import { buildVariantUrl } from "@/lib/shopify/variant-utils";

export type MerchBadge = "new" | "exclusive";
export type StockStatus = "low" | "out" | null;
export type CardColor = { name: string; hex: string | null };
export type CardVariant = {
  id: string;
  availableForSale: boolean;
  price: MoneyV2;
  selectedOptions: { name: string; value: string }[];
  /** Per-variant photo; drives the card's image swap on color select. */
  image?: CardImageFields | null;
};

export type ProductCardProps = {
  slug: string;
  title: string;
  priceRange: { minVariantPrice: number; maxVariantPrice: number };
  currencyCode?: string;
  imageUrl: string | null;
  /** Second image, cross-faded in on hover. */
  secondaryImageUrl?: string | null;
  vendor?: string | null;
  /** Color/variant name shown under the title (e.g. "Navy"). */
  variantName?: string | null;
  /** Merch flag rendered as a badge over the image. */
  badge?: MerchBadge | null;
  /** Original price; strikethrough when higher than current. */
  compareAtPrice?: number | null;
  stockStatus?: StockStatus;
  /** Size labels shown in the hover bar. */
  sizes?: string[];
  /** Initially selected size (underlined in the hover bar). */
  selectedSize?: string;
  /** Color swatches shown on the info row. */
  colors?: CardColor[];
  /** Initially selected color name (rendered as the taller, underlined swatch). */
  selectedColor?: string;
  /** Shopify's own name for the color option, used to link into the PDP. */
  colorOptionName?: string;
  /** Variants for resolving the color+size selection to a cart line. */
  variants?: CardVariant[];
  /** Ordered gallery URLs; locates the hover partner for a color's photo. */
  galleryUrls?: string[];
  mini?: boolean;
};

const BADGE_LABEL: Record<MerchBadge, string> = {
  new: "New",
  exclusive: "Online exclusive",
};

const MERCH_BADGE_CLASS = "px-1.5 py-0.5";

function ProductCardMini({
  slug,
  title,
  imageUrl,
  price,
  strikePrice,
  rangePrice,
}: {
  slug: string;
  title: string;
  imageUrl: string | null;
  price: string;
  strikePrice: string | null;
  rangePrice: string | null;
}) {
  return (
    <Link
      className="flex items-center gap-3 p-2 transition-colors hover:bg-accent"
      href={`/products/${slug}`}
    >
      {imageUrl ? (
        <div className="card-surface relative size-12 shrink-0 overflow-hidden border">
          <Image
            alt={title}
            className="object-cover"
            fill
            sizes="48px"
            src={imageUrl}
          />
        </div>
      ) : (
        <div className="card-surface size-12 shrink-0 border" />
      )}
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">
          {price}
          {rangePrice && <span className="ml-1">– {rangePrice}</span>}
          {strikePrice && (
            <span className="ml-1 line-through">{strikePrice}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

function CardFlags({
  badge,
  salePercent,
  stockStatus,
}: {
  badge: MerchBadge | null | undefined;
  salePercent: number;
  stockStatus: StockStatus | undefined;
}) {
  return (
    <>
      <div className="pointer-events-none absolute top-2 left-2 z-10 flex flex-row items-start gap-1">
        {badge && (
          <Badge className={MERCH_BADGE_CLASS} variant={badge}>
            {BADGE_LABEL[badge]}
          </Badge>
        )}
        {salePercent > 0 && (
          <Badge className={MERCH_BADGE_CLASS} variant="discount">
            -{salePercent}%
          </Badge>
        )}
      </div>
      {stockStatus === "low" && (
        <Badge
          className={cn(
            "pointer-events-none absolute right-2 bottom-2 z-10",
            MERCH_BADGE_CLASS
          )}
          variant="low-stock"
        >
          Low stock
        </Badge>
      )}
      {stockStatus === "out" && (
        <Badge
          className={cn(
            "pointer-events-none absolute right-2 bottom-2 z-10",
            MERCH_BADGE_CLASS
          )}
          variant="sold-out"
        >
          Sold out
        </Badge>
      )}
    </>
  );
}

function SizeRow({
  sizes,
  selectedSize,
  onSelect,
}: {
  sizes: string[];
  selectedSize: string | undefined;
  onSelect: (size: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {sizes.map((size) => (
        <button
          className={cn(
            "cursor-pointer border-b text-xs",
            size === selectedSize
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          key={size}
          onClick={() => onSelect(size)}
          type="button"
        >
          {size}
        </button>
      ))}
    </div>
  );
}

function CardSwatches({
  colors,
  selectedColor,
  onSelect,
}: {
  colors: CardColor[];
  selectedColor: string | undefined;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-start gap-0.5 py-1">
      {colors.map((color) => {
        const swatch = cn(
          "block",
          !color.hex && "border border-border bg-muted"
        );
        const style = color.hex ? { backgroundColor: color.hex } : undefined;
        const selected = color.name === selectedColor;

        return (
          <button
            aria-label={color.name}
            aria-pressed={selected}
            className="flex cursor-pointer flex-col gap-0.5"
            key={color.name}
            onClick={() => onSelect(color.name)}
            title={color.name}
            type="button"
          >
            <span
              className={cn(swatch, selected ? "h-2.5 w-5" : "h-2 w-4")}
              style={style}
            />
            {selected && (
              <span className="block h-px w-full bg-muted-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Hover bar with the "Add to cart" action and size selector. */
function AddToCartBar({
  variants,
  selectedColor,
  selectedSize,
  sizes,
  onSelectSize,
  productTitle,
  productHandle,
  imageUrl,
}: {
  variants: CardVariant[] | undefined;
  selectedColor: string | undefined;
  selectedSize: string | undefined;
  sizes: string[] | undefined;
  onSelectSize: (size: string) => void;
  productTitle: string;
  productHandle: string;
  imageUrl: string | null;
}) {
  const { addLine, openCart } = useCartActions();

  const variant = findCardVariant(variants, selectedColor, selectedSize);
  const canAdd = Boolean(variant?.availableForSale);

  function handleAdd() {
    if (!variant) return;
    const metadata = buildLineMetadata({
      productTitle,
      productHandle,
      price: variant.price,
      selectedOptions: variant.selectedOptions,
      image: imageUrl
        ? { url: imageUrl, altText: productTitle, width: 0, height: 0 }
        : null,
    });
    openCart();
    void addLine(variant.id, 1, metadata);
  }

  return (
    <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-2 bg-background p-2 opacity-0 transition-opacity duration-200 md:group-hover:opacity-100">
      <button
        className="cursor-pointer font-medium text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canAdd}
        onClick={handleAdd}
        type="button"
      >
        Add to cart
      </button>
      {sizes && sizes.length > 0 && (
        <SizeRow
          onSelect={onSelectSize}
          selectedSize={selectedSize}
          sizes={sizes}
        />
      )}
    </div>
  );
}

const CARD_IMAGE_SIZES =
  "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";

/** Card image with an optional second image cross-faded in on hover. */
function CardImage({
  imageUrl,
  secondaryImageUrl,
  title,
}: {
  imageUrl: string | null;
  secondaryImageUrl?: string | null;
  title: string;
}) {
  if (!imageUrl) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No image
      </div>
    );
  }

  return (
    <>
      <Image
        alt={title}
        className={cn(
          "object-cover",
          // Morph on hover: outgoing image zooms in (1 → 1.05) as it fades out.
          // Broad `transition` so Tailwind v4's `scale` property animates too.
          secondaryImageUrl &&
            "transition duration-200 ease-in-out group-hover:scale-105 group-hover:opacity-0"
        )}
        fill
        sizes={CARD_IMAGE_SIZES}
        src={imageUrl}
      />
      {secondaryImageUrl && (
        <Image
          alt={title}
          // Incoming image settles from 1.05 → 1 as it fades in.
          className="scale-105 object-cover opacity-0 transition duration-200 ease-in-out group-hover:scale-100 group-hover:opacity-100"
          fill
          sizes={CARD_IMAGE_SIZES}
          src={secondaryImageUrl}
        />
      )}
    </>
  );
}

export function ProductCard({
  slug,
  title,
  priceRange,
  currencyCode,
  imageUrl,
  secondaryImageUrl,
  vendor,
  variantName,
  badge,
  compareAtPrice,
  stockStatus,
  sizes,
  selectedSize: initialSize,
  colors,
  selectedColor: initialColor,
  colorOptionName,
  variants,
  galleryUrls,
  mini,
}: ProductCardProps) {
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [selectedSize, setSelectedSize] = useState(initialSize);

  const code = currencyCode ?? "GBP";
  const { price, salePercent, strikePrice, rangePrice } = cardPricing(
    priceRange,
    compareAtPrice,
    code
  );

  if (mini) {
    return (
      <ProductCardMini
        imageUrl={imageUrl}
        price={price}
        rangePrice={rangePrice}
        slug={slug}
        strikePrice={strikePrice}
        title={title}
      />
    );
  }

  const subtitle = selectedColor ?? variantName ?? vendor;
  // Carry the chosen color into the PDP so the selection survives navigation.
  const href =
    selectedColor && colorOptionName
      ? buildVariantUrl(slug, { [colorOptionName]: selectedColor })
      : `/products/${slug}`;
  const { primary, secondary } = resolveCardImages({
    selectedColor,
    variants,
    galleryUrls,
    imageUrl,
    secondaryImageUrl,
  });

  return (
    <div className="group relative">
      <div className="card-surface relative aspect-56/75 overflow-hidden">
        <Link
          aria-label={title}
          className="relative block size-full"
          href={href}
        >
          <CardImage
            imageUrl={primary}
            secondaryImageUrl={secondary}
            title={title}
          />
        </Link>

        <CardFlags
          badge={badge}
          salePercent={salePercent}
          stockStatus={stockStatus}
        />

        {/* Hover add-to-cart bar — inset 8px on the image */}
        {stockStatus !== "out" && variants && variants.length > 0 && (
          <AddToCartBar
            imageUrl={primary}
            onSelectSize={setSelectedSize}
            productHandle={slug}
            productTitle={title}
            selectedColor={selectedColor}
            selectedSize={selectedSize}
            sizes={sizes}
            variants={variants}
          />
        )}

        <SavedItemButton
          className="absolute top-2 right-2 z-10 transition-opacity md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100 md:data-[saved=true]:pointer-events-auto md:data-[saved=true]:opacity-100"
          handle={slug}
        />
      </div>

      <div className="mt-2 px-1 flex items-start justify-between gap-2">
        <Link className="flex flex-col gap-2" href={href}>
          <div className="flex flex-col gap-0.5">
            <h3 className="font-medium text-base text-foreground leading-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-base text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <p className="font-medium text-base text-foreground">
            {price}
            {rangePrice && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                – {rangePrice}
              </span>
            )}
            {strikePrice && (
              <span className="ml-1.5 font-normal text-muted-foreground line-through">
                {strikePrice}
              </span>
            )}
          </p>
        </Link>
        {colors && colors.length > 0 && (
          <CardSwatches
            colors={colors}
            onSelect={setSelectedColor}
            selectedColor={selectedColor}
          />
        )}
      </div>
    </div>
  );
}
