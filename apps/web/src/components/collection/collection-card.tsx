import Link from "next/link";

import { ShopifyImage as Image } from "@/components/product/shopify-image";

export type CollectionCardProps = {
  handle: string;
  title: string;
  imageUrl: string | null;
};

export function CollectionCard({
  handle,
  title,
  imageUrl,
}: CollectionCardProps) {
  return (
    <Link
      className="group block overflow-hidden"
      href={`/collections/${handle}`}
    >
      <div className="card-surface relative aspect-56/75 overflow-hidden">
        {imageUrl ? (
          <Image
            alt={title}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            fill
            sizes="(min-width: 768px) 33vw, 50vw"
            src={imageUrl}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No image
          </div>
        )}

        {/* "View Collection" bar — fades in on hover (mirrors the product card's add-to-cart bar). */}
        <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-center bg-background p-2 opacity-0 transition-opacity duration-200 md:group-hover:opacity-100">
          <span className="font-medium text-foreground text-sm">
            View Collection
          </span>
        </div>
      </div>
      <div className="px-1 pt-2">
        <h2 className="font-medium text-base text-foreground">{title}</h2>
      </div>
    </Link>
  );
}
