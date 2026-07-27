import Image from "next/image";
import Link from "next/link";

type EditorialItem = {
  _key: string;
  swatchColor?: string | null;
  collectionTitle?: string | null;
  collectionImage?: string | null;
  collectionHref?: string | null;
};

type EditorialTwoUpProps = {
  _key: string;
  _type: "editorialTwoUp";
  items?: EditorialItem[] | null;
};

function Swatch({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 border border-border"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function EditorialColumn({ item }: { item: EditorialItem }) {
  const { swatchColor, collectionImage, collectionTitle, collectionHref } =
    item;

  const figure = (
    <div className="card-surface relative aspect-square overflow-hidden">
      {collectionImage ? (
        <Image
          alt={collectionTitle ?? ""}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          src={collectionImage}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          No image
        </div>
      )}

      <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-center bg-background p-2 opacity-0 transition-opacity duration-200 md:group-hover:opacity-100">
        <span className="font-medium text-foreground text-sm">
          View Collection
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {(collectionTitle || swatchColor) && (
        <div className="flex items-center gap-2">
          <Swatch color={swatchColor} />
          {collectionTitle && (
            <span className="text-foreground text-sm">{collectionTitle}</span>
          )}
        </div>
      )}
      {collectionHref ? (
        <Link className="group block" href={collectionHref}>
          {figure}
        </Link>
      ) : (
        <div className="group block">{figure}</div>
      )}
    </div>
  );
}

export function EditorialTwoUp({ items }: EditorialTwoUpProps) {
  const columns = (items ?? []).filter(Boolean);
  if (columns.length === 0) return null;

  return (
    <section className="site-container py-12 md:py-20">
      <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
        {columns.map((item) => (
          <EditorialColumn item={item} key={item._key} />
        ))}
      </div>
    </section>
  );
}
