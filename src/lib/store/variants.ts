export type VariantOption = {
  talla: string | null;
  color: string | null;
  sku: string;
  stock: number;
  priceOverride: number | null;
};

export function getVariantOptions(variants: VariantOption[]) {
  const tallas = Array.from(
    new Set(variants.map((v) => v.talla).filter((t): t is string => Boolean(t))),
  ).sort();
  const colores = Array.from(
    new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c))),
  ).sort();
  return { tallas, colores };
}

export function findMatchingVariant(
  variants: VariantOption[],
  talla: string | null,
  color: string | null,
) {
  return (
    variants.find(
      (v) => (v.talla || null) === (talla || null) && (v.color || null) === (color || null),
    ) ?? null
  );
}
