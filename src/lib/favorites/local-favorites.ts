export type LocalFavoriteItem = {
  productId: string;
  slug: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

const STORAGE_KEY = "merylay-favoritos";

export function isFavorite(items: LocalFavoriteItem[], productId: string): boolean {
  return items.some((i) => i.productId === productId);
}

export function toggleLocalFavorite(
  items: LocalFavoriteItem[],
  item: LocalFavoriteItem,
): LocalFavoriteItem[] {
  if (isFavorite(items, item.productId)) {
    return items.filter((i) => i.productId !== item.productId);
  }
  return [...items, item];
}

export function getLocalFavorites(): LocalFavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalFavoriteItem[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalFavorites(items: LocalFavoriteItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function clearLocalFavorites(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
