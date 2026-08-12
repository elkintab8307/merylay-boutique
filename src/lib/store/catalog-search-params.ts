import { resolveSort } from "./sort";

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export type CatalogSearchParams = {
  tallas: string[];
  colores: string[];
  minPrice: number | undefined;
  maxPrice: number | undefined;
  sort: ReturnType<typeof resolveSort>;
  q: string;
};

export function parseCatalogSearchParams(
  search: Record<string, string | string[] | undefined>,
): CatalogSearchParams {
  const tallas = toArray(search.talla);
  const colores = toArray(search.color);

  const minPriceStr = firstValue(search.minPrice);
  const maxPriceStr = firstValue(search.maxPrice);
  const minPriceNum = minPriceStr ? Number(minPriceStr) : undefined;
  const maxPriceNum = maxPriceStr ? Number(maxPriceStr) : undefined;

  const sort = resolveSort(firstValue(search.sort));
  const q = (firstValue(search.q) ?? "").trim();

  return {
    tallas,
    colores,
    minPrice: minPriceNum !== undefined && Number.isNaN(minPriceNum) ? undefined : minPriceNum,
    maxPrice: maxPriceNum !== undefined && Number.isNaN(maxPriceNum) ? undefined : maxPriceNum,
    sort,
    q,
  };
}
