export function calcularDescuento(
  precio: number,
  compareAtPrice: number | null,
): number | null {
  if (compareAtPrice === null || compareAtPrice <= precio) {
    return null;
  }
  return Math.round((1 - precio / compareAtPrice) * 100);
}
