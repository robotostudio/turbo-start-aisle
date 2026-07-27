"use client";

import Image, { type ImageProps } from "next/image";

import {
  shopifyBlurDataURL,
  shopifyImageLoader,
} from "@/lib/shopify/image-loader";

/**
 * `next/image` wrapper for Shopify CDN images. Applies the Shopify loader (so
 * the CDN resizes instead of the Vercel optimizer downloading masters) and a
 * blur-up placeholder by default. Non-Shopify `src` values fall through to the
 * default optimizer and whatever placeholder the caller passed.
 */
export function ShopifyImage({
  src,
  placeholder,
  blurDataURL,
  ...props
}: ImageProps) {
  const isShopify = typeof src === "string" && src.includes("cdn.shopify.com");

  return (
    <Image
      blurDataURL={isShopify ? shopifyBlurDataURL(src) : blurDataURL}
      loader={isShopify ? shopifyImageLoader : undefined}
      placeholder={isShopify ? "blur" : placeholder}
      src={src}
      {...props}
    />
  );
}
