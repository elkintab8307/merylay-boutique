export type LocalCartItem = {
  productId: string;
  variantId: string | null;
  imageId: string | null;
  slug: string;
  name: string;
  unitPrice: number;
  qty: number;
  imageUrl: string | null;
  stock: number;
};

const STORAGE_KEY = "merylay-cart";

export const CART_UPDATED_EVENT = "merylay-cart-updated";

function sameItem(
  a: LocalCartItem,
  b: { productId: string; variantId: string | null; imageId: string | null },
): boolean {
  return a.productId === b.productId && a.variantId === b.variantId && a.imageId === b.imageId;
}

export function stockUsadoPorVariante(items: LocalCartItem[], variantId: string): number {
  return items
    .filter((i) => i.variantId === variantId)
    .reduce((sum, i) => sum + i.qty, 0);
}

export function mergeCartItem(items: LocalCartItem[], newItem: LocalCartItem): LocalCartItem[] {
  const index = items.findIndex((i) => sameItem(i, newItem));

  if (index === -1) {
    const usadoPorOtrasLineas = newItem.variantId
      ? stockUsadoPorVariante(items, newItem.variantId)
      : 0;
    const cupoDisponible = Math.max(newItem.stock - usadoPorOtrasLineas, 0);
    // Sin cupo restante no se agrega una linea vacia: una linea con qty 0
    // es invisible para el usuario pero rompe create_pos_sale/create_order,
    // que exigen qty > 0.
    if (cupoDisponible <= 0) return items;
    return [...items, { ...newItem, qty: Math.min(newItem.qty, cupoDisponible) }];
  }

  const updated = [...items];
  const usadoPorOtrasLineas = newItem.variantId
    ? stockUsadoPorVariante(items, newItem.variantId) - updated[index].qty
    : 0;
  const stockDisponible = Math.max(updated[index].stock, newItem.stock);
  const cupoDisponible = Math.max(stockDisponible - usadoPorOtrasLineas, 0);
  const combinedQty = Math.min(updated[index].qty + newItem.qty, cupoDisponible);
  updated[index] = { ...updated[index], qty: combinedQty };
  return updated;
}

export function updateItemQty(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
  imageId: string | null,
  qty: number,
): LocalCartItem[] {
  return items
    .map((i) => {
      if (!sameItem(i, { productId, variantId, imageId })) return i;
      const usadoPorOtrasLineas = variantId ? stockUsadoPorVariante(items, variantId) - i.qty : 0;
      const maximoDisponible = Math.max(i.stock - usadoPorOtrasLineas, 0);
      return { ...i, qty: Math.min(Math.max(qty, 0), maximoDisponible) };
    })
    .filter((i) => i.qty > 0);
}

export function removeItem(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
  imageId: string | null,
): LocalCartItem[] {
  return items.filter((i) => !sameItem(i, { productId, variantId, imageId }));
}

export function computeSubtotal(items: LocalCartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
}

export function getLocalCart(): LocalCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // Un carrito guardado antes de esta funcionalidad no trae la clave
    // imageId (queda `undefined` al leerlo), mientras que toda linea nueva
    // o actualizada ahora guarda explicitamente `null`. Normalizar aqui
    // evita que ambos valores convivan: `undefined !== null` los trataria
    // como lineas distintas (sameItem) y, ademas, `?? "sin-estampado"` en
    // la key de React colapsa `undefined` y `null` al mismo sufijo, asi
    // que sin esto una linea heredada y una nueva podrian compartir key.
    return (JSON.parse(raw) as LocalCartItem[]).map((item) => ({
      ...item,
      imageId: item.imageId ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveLocalCart(items: LocalCartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function clearLocalCart(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}
