import { describe, expect, it } from "vitest";
import { mergeCartItem, updateItemQty, removeItem, computeSubtotal } from "../local-cart";
import type { LocalCartItem } from "../local-cart";

const baseItem: LocalCartItem = {
  productId: "p1",
  variantId: null,
  slug: "producto-1",
  name: "Producto 1",
  unitPrice: 10000,
  qty: 1,
  imageUrl: null,
  stock: 5,
};

describe("mergeCartItem", () => {
  it("agrega un item nuevo si no existe", () => {
    const result = mergeCartItem([], baseItem);
    expect(result).toEqual([baseItem]);
  });

  it("suma la cantidad si el producto/variante ya existe", () => {
    const result = mergeCartItem([baseItem], { ...baseItem, qty: 2 });
    expect(result[0].qty).toBe(3);
  });

  it("capa la cantidad combinada al stock disponible", () => {
    const result = mergeCartItem([{ ...baseItem, qty: 4 }], { ...baseItem, qty: 3 });
    expect(result[0].qty).toBe(5);
  });

  it("trata productos con distinta variante como items distintos", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1" }],
      { ...baseItem, variantId: "v2" },
    );
    expect(result).toHaveLength(2);
  });

  it("usa el stock mas alto entre el item existente y el entrante al fusionar (evita que bajar el stock en vivo reduzca una cantidad ya reservada)", () => {
    const result = mergeCartItem(
      [{ ...baseItem, qty: 3, stock: 5 }],
      { ...baseItem, qty: 1, stock: 2 },
    );
    expect(result[0].qty).toBe(4);
  });
});

describe("updateItemQty", () => {
  it("actualiza la cantidad de un item existente", () => {
    const result = updateItemQty([baseItem], "p1", null, 3);
    expect(result[0].qty).toBe(3);
  });

  it("capa al stock disponible", () => {
    const result = updateItemQty([baseItem], "p1", null, 99);
    expect(result[0].qty).toBe(5);
  });

  it("elimina el item si la cantidad es 0", () => {
    const result = updateItemQty([baseItem], "p1", null, 0);
    expect(result).toHaveLength(0);
  });
});

describe("removeItem", () => {
  it("quita el item indicado", () => {
    const result = removeItem([baseItem], "p1", null);
    expect(result).toHaveLength(0);
  });

  it("no afecta otros items", () => {
    const other: LocalCartItem = { ...baseItem, productId: "p2" };
    const result = removeItem([baseItem, other], "p1", null);
    expect(result).toEqual([other]);
  });
});

describe("computeSubtotal", () => {
  it("suma precio por cantidad de todos los items", () => {
    const items = [baseItem, { ...baseItem, productId: "p2", qty: 2, unitPrice: 5000 }];
    expect(computeSubtotal(items)).toBe(10000 + 2 * 5000);
  });

  it("devuelve 0 para un carrito vacio", () => {
    expect(computeSubtotal([])).toBe(0);
  });
});
