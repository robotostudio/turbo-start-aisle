import { addToCartSchema } from "../types";

export const addToCartTool = {
  description: [
    "Add one product variant to the shopper's cart and open the cart drawer.",
    "Only use AFTER a GROQ query has given you the variant's `store.gid` and confirmed `available: true`.",
    "If the product has more than one variant and the user has not said which options they want, ask first — do not guess a size or colour.",
    "The tool's output is shown to the user as the confirmation.",
  ].join(" "),
  inputSchema: addToCartSchema,
} as const;
