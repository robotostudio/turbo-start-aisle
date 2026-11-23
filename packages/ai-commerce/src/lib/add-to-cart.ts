import type { AddToCartEventDetail, AiSelectedOption } from "../types";

/** A variant plus the parent-product fields the cart line needs. */
export interface CartVariantData {
  gid: string;
  title: string;
  available: boolean;
  price: number;
  optionValues: (string | null)[] | null;
  product: {
    title: string;
    slug: string;
    imageUrl: string | null;
    isActive: boolean;
    optionNames: (string | null)[] | null;
  } | null;
}

/** Variant by Shopify GID, with the product that lists it in store.variants. */
export const VARIANT_QUERY = /* groq */ `
  *[_type == "productVariant" && store.gid == $gid][0]{
    "gid": store.gid,
    "title": store.title,
    "available": store.inventory.isAvailable,
    "price": store.price,
    "optionValues": [store.option1, store.option2, store.option3],
    "product": *[_type == "product" && references(^._id)][0]{
      "title": store.title,
      "slug": store.slug.current,
      "imageUrl": store.previewImageUrl,
      "isActive": store.status == "active" && !store.isDeleted,
      "optionNames": store.options[].name
    }
  }
`;

/**
 * Zips the product's option names against a variant's option1/2/3 values into
 * the {name, value}[] shape the cart's LineMetadata expects.
 */
export function selectedOptionsFor(
  optionNames: (string | null)[] | null,
  optionValues: (string | null)[] | null
): AiSelectedOption[] {
  return (optionNames ?? [])
    .map((name, index) => ({ name, value: optionValues?.[index] }))
    .filter(
      (option): option is AiSelectedOption =>
        Boolean(option.name) && Boolean(option.value)
    );
}

/**
 * Builds the ADD_TO_CART_EVENT payload for a fetched variant, or returns the
 * reason it cannot be added as a string the model and the user can both read.
 */
export function toAddToCartDetail(
  variant: CartVariantData | null,
  quantity: number,
  currencyCode: string
): AddToCartEventDetail | string {
  if (!variant?.product) return "That variant doesn't exist in the catalog.";
  const { product } = variant;
  if (!product.isActive) return `${product.title} is no longer for sale.`;
  if (!variant.available) {
    return `${product.title} (${variant.title}) is out of stock.`;
  }
  return {
    variantGid: variant.gid,
    quantity,
    productHandle: product.slug,
    productTitle: product.title,
    variantTitle: variant.title,
    price: { amount: String(variant.price), currencyCode },
    image: product.imageUrl
      ? { url: product.imageUrl, altText: product.title, width: 0, height: 0 }
      : null,
    selectedOptions: selectedOptionsFor(
      product.optionNames,
      variant.optionValues
    ),
  };
}
