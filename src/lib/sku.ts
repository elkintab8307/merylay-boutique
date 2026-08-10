function normalizarParteSku(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generarSkuVariante(
  skuProducto: string,
  talla: string | null,
  color: string | null,
): string {
  const partes = [talla, color]
    .filter((valor): valor is string => Boolean(valor))
    .map(normalizarParteSku)
    .filter(Boolean);
  return [skuProducto, ...partes].join("-");
}
