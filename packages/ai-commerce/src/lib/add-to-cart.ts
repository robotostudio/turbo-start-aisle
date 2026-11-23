import {
  ADD_TO_CART_EVENT,
  type AddToCartEventDetail,
  type AiSelectedOption,
} from "../types";

/**
 * Output of the add_to_cart tool when the variant can be added. Nothing is in
 * the cart yet: the chat renders `detail` as a card and the shopper's click on
 * its button is what adds the line.
 */
export interface AddToCartConfirmation {
  detail: AddToCartEventDetail;
}

export function isAddToCartConfirmation(
  output: unknown
): output is AddToCartConfirmation {
  return (
    typeof output === "object" &&
    output !== null &&
    "detail" in output &&
    typeof (output as AddToCartConfirmation).detail?.variantGid === "string"
  );
}

/** Hands a line to the app's <AiCartBridge />, which owns the cart. */
export function dispatchAddToCart(detail: AddToCartEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AddToCartEventDetail>(ADD_TO_CART_EVENT, { detail })
  );
}

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
      "isActive": store.status == "active" && store.isDeleted != true,
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
