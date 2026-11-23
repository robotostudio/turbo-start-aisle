import { PRICE_BUCKETS, type ProductFiltersInput } from "../types";

/**
 * Snap a numeric range onto a `filter.price` value.
 *
 * An exact preset match emits the preset so the collection page's Price column
 * highlights that row. Anything else emits the same `<min>-<max>` grammar,
 * which filter-utils.readPrice() parses identically and ActiveFilters labels as
 * a range. Open-ended sides are empty strings ("-50", "150-").
 */
function toPriceParam(min?: number, max?: number): string | null {
  if (min === undefined && max === undefined) return null;
  const preset = PRICE_BUCKETS.find((b) => b.min === min && b.max === max);
  if (preset) return preset.value;
  return `${min ?? ""}-${max ?? ""}`;
}

/** Build a turbo-start-shopify collection URL with filter.* keys from the AI's input. */
export function buildCollectionUrl(input: ProductFiltersInput): {
  href: string;
  applied: string[];
} {
  const params = new URLSearchParams();
  const applied: string[] = [];

  if (input.available !== undefined) {
    params.set("filter.available", String(input.available));
    applied.push(`available=${input.available}`);
  }
  const price = toPriceParam(input.priceMin, input.priceMax);
  if (price) {
    params.set("filter.price", price);
    applied.push(`price=${price}`);
  }
  for (const v of input.vendor ?? []) {
    params.append("filter.vendor", v);
    applied.push(`vendor=${v}`);
  }
  for (const t of input.type ?? []) {
    params.append("filter.type", t);
    applied.push(`type=${t}`);
  }
  for (const tag of input.tag ?? []) {
    params.append("filter.tag", tag);
    applied.push(`tag=${tag}`);
  }
  for (const option of input.option ?? []) {
    params.append(`filter.option.${option.name}`, option.value);
    applied.push(`${option.name}=${option.value}`);
  }
  if (input.sort) {
    params.set("sort", input.sort);
    applied.push(`sort=${input.sort}`);
  }
  if (input.reverse !== undefined) {
    params.set("reverse", String(input.reverse));
    applied.push(`reverse=${input.reverse}`);
  }
  const qs = params.toString();
  return {
    href: `/collections/${input.collection}${qs ? `?${qs}` : ""}`,
    applied,
  };
}
