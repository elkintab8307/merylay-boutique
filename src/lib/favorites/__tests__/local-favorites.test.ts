import { describe, expect, it } from "vitest";
import { isFavorite, toggleLocalFavorite } from "../local-favorites";
import type { LocalFavoriteItem } from "../local-favorites";

const baseItem: LocalFavoriteItem = {
  productId: "p1",
  slug: "producto-1",
  name: "Producto 1",
  price: 10000,
  imageUrl: null,
};

describe("isFavorite", () => {
  it("devuelve true si el producto esta en la lista", () => {
    expect(isFavorite([baseItem], "p1")).toBe(true);
  });

  it("devuelve false si el producto no esta en la lista", () => {
    expect(isFavorite([baseItem], "p2")).toBe(false);
  });

  it("devuelve false para una lista vacia", () => {
    expect(isFavorite([], "p1")).toBe(false);
  });
});

describe("toggleLocalFavorite", () => {
  it("agrega el producto si no estaba marcado", () => {
    const result = toggleLocalFavorite([], baseItem);
    expect(result).toEqual([baseItem]);
  });

  it("quita el producto si ya estaba marcado", () => {
    const result = toggleLocalFavorite([baseItem], baseItem);
    expect(result).toEqual([]);
  });

  it("no afecta otros productos favoritos", () => {
    const other: LocalFavoriteItem = { ...baseItem, productId: "p2" };
    const result = toggleLocalFavorite([baseItem, other], baseItem);
    expect(result).toEqual([other]);
  });
});
