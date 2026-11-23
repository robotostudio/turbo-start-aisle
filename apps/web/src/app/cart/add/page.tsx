import { AddFromLink } from "@/components/cart/add-from-link";
import { getSEOMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return await getSEOMetadata({
    title: "Add to cart",
    description: "Adds the item from your link to your cart.",
    slug: "/cart/add",
    seoNoIndex: true,
  });
}

export default function AddToCartLinkPage() {
  return <AddFromLink />;
}
