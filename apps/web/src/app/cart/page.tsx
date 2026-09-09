import { CartPageContent } from "@/components/cart/cart-page-content";
import { getSEOMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return await getSEOMetadata({
    title: "Cart",
    description: "Review the items in your cart before checking out.",
    slug: "/cart",
    seoNoIndex: true,
  });
}

export default function CartPage() {
  return <CartPageContent />;
}
