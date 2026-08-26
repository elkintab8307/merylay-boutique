import type { LocalCartItem } from "./local-cart";

// Clave dedicada, distinta de "merylay-cart" (el carrito de la tienda
// publica): un mismo navegador puede tener abierta la tienda (un cliente
// invitado navegando) y el POS (un vendedor autenticado) a la vez, y no
// deben mezclarse.
const STORAGE_KEY = "merylay-pos-venta-actual";

export function getVentaEnCurso(): LocalCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalCartItem[]) : [];
  } catch {
    return [];
  }
}

export function guardarVentaEnCurso(items: LocalCartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function limpiarVentaEnCurso(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
