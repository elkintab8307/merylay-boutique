export function precioEfectivo(price: number, promoPrice: number | null): number {
  if (promoPrice === null || promoPrice <= 0 || promoPrice >= price) {
    return price;
  }
  return promoPrice;
}

export function calcularDescuento(
  price: number,
  promoPrice: number | null,
): number | null {
  if (promoPrice === null || promoPrice <= 0 || promoPrice >= price) {
    return null;
  }
  return Math.round((1 - promoPrice / price) * 100);
}
