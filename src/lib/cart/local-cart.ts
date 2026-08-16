export type LocalCartItem = {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  unitPrice: number;
  qty: number;
  imageUrl: string | null;
  stock: number;
};

const STORAGE_KEY = "merylay-cart";

export const CART_UPDATED_EVENT = "merylay-cart-updated";

function sameItem(a: LocalCartItem, b: { productId: string; variantId: string | null }): boolean {
  return a.productId === b.productId && a.variantId === b.variantId;
}

export function mergeCartItem(items: LocalCartItem[], newItem: LocalCartItem): LocalCartItem[] {
  const index = items.findIndex((i) => sameItem(i, newItem));
  if (index === -1) {
    return [...items, { ...newItem, qty: Math.min(newItem.qty, newItem.stock) }];
  }
  const updated = [...items];
  const stockDisponible = Math.max(updated[index].stock, newItem.stock);
  const combinedQty = Math.min(updated[index].qty + newItem.qty, stockDisponible);
  updated[index] = { ...updated[index], qty: combinedQty };
  return updated;
}

export function updateItemQty(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
  qty: number,
): LocalCartItem[] {
  return items
    .map((i) =>
      sameItem(i, { productId, variantId }) ? { ...i, qty: Math.min(Math.max(qty, 0), i.stock) } : i,
    )
    .filter((i) => i.qty > 0);
}

export function removeItem(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
): LocalCartItem[] {
  return items.filter((i) => !sameItem(i, { productId, variantId }));
}

export function computeSubtotal(items: LocalCartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
}

export function getLocalCart(): LocalCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalCartItem[]) : [];
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
