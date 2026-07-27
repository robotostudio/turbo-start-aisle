import type { ImageLoaderProps } from "next/image";

const SHOPIFY_CDN_HOST = "cdn.shopify.com";

function isShopifyUrl(src: string): boolean {
  return src.includes(SHOPIFY_CDN_HOST);
}

/**
 * A custom `next/image` loader for Shopify CDN images.
 *
 * Shopify's CDN resizes and reformats images on the fly via URL params
 * (`?width=`, `&height=`, `&crop=`). By mapping Next's requested width onto
 * Shopify's `width` param we let Shopify's global CDN do the resizing — fast,
 * cached, and free — instead of forcing the Vercel optimizer to first download
 * the full-resolution master. Next still calls this once per `deviceSizes`
 * width, so we keep a correct responsive `srcset`.
 *
 * Non-Shopify URLs are returned untouched so this loader is safe to attach to
 * any image.
 */
export function shopifyImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  if (!isShopifyUrl(src)) {
    return src;
  }

  const url = new URL(src);
  url.searchParams.set("width", String(width));
  url.searchParams.set("quality", String(quality ?? 75));
  return url.toString();
}

/**
 * A tiny, low-quality Shopify variant of the same image, used as the
 * `blurDataURL` for `placeholder="blur"`. This renders a blurry preview
 * instantly and sharpens to the full image as it loads (the "blur-up" effect).
 * Returns the original `src` unchanged for non-Shopify URLs.
 */
export function shopifyBlurDataURL(src: string): string {
  if (!isShopifyUrl(src)) {
    return src;
  }

  const url = new URL(src);
  url.searchParams.set("width", "24");
  url.searchParams.set("quality", "30");
  return url.toString();
}
