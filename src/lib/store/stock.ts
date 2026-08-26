// Una vez que un producto tiene variantes, product.stock deja de ser
// confiable: cada variante mantiene su propio stock y el del producto no
// se recalcula automaticamente. Por eso, si hay variantes, la
// disponibilidad depende exclusivamente de ellas.
export function productoAgotado(stockProducto: number, stocksVariantes: number[]): boolean {
  if (stocksVariantes.length > 0) {
    return stocksVariantes.every((stock) => stock <= 0);
  }
  return stockProducto <= 0;
}
