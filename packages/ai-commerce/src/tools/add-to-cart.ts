import { addToCartSchema } from "../types";

export const addToCartTool = {
  description: [
    "Offer one product variant for the shopper's cart: shows them a card with an Add to cart button. Nothing is added until they press it.",
    "Only use AFTER a GROQ query has given you the variant's `store.gid` and confirmed `available: true`.",
    "If the product has more than one variant and the user has not said which options they want, ask first — do not guess a size or colour.",
  ].join(" "),
  inputSchema: addToCartSchema,
} as const;
