import { describe, expect, it } from "vitest";
import {
  mergeCartItem,
  updateItemQty,
  removeItem,
  computeSubtotal,
  stockUsadoPorVariante,
} from "../local-cart";
import type { LocalCartItem } from "../local-cart";

const baseItem: LocalCartItem = {
  productId: "p1",
  variantId: null,
  imageId: null,
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

  it("suma la cantidad si el producto/variante/imagen ya existe", () => {
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

  it("trata la misma variante con distinto estampado (imageId) como lineas distintas", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1", imageId: "img-a" }],
      { ...baseItem, variantId: "v1", imageId: "img-b" },
    );
    expect(result).toHaveLength(2);
  });

  it("al agregar una linea nueva de una variante que ya tiene otra linea, capa la cantidad al cupo restante del stock compartido", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1", imageId: "img-a", qty: 4, stock: 5 }],
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 3, stock: 5 },
    );
    // Cupo restante = 5 (stock total) - 4 (ya usado por img-a) = 1
    expect(result).toHaveLength(2);
    expect(result[1].qty).toBe(1);
  });

  it("al fusionar en una linea existente, tambien respeta lo que ocupan otras lineas de la misma variante", () => {
    const result = mergeCartItem(
      [
        { ...baseItem, variantId: "v1", imageId: "img-a", qty: 2, stock: 5 },
        { ...baseItem, variantId: "v1", imageId: "img-b", qty: 2, stock: 5 },
      ],
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 5, stock: 5 },
    );
    // img-a: 2 + 5 pedidos, pero cupo = 5 (total) - 2 (usado por img-b) = 3
    const lineaA = result.find((i) => i.imageId === "img-a");
    expect(lineaA?.qty).toBe(3);
  });
});

describe("stockUsadoPorVariante", () => {
  it("suma la cantidad de todas las lineas de esa variante", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 2 },
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 3 },
      { ...baseItem, variantId: "v2", imageId: "img-c", qty: 10 },
    ];
    expect(stockUsadoPorVariante(items, "v1")).toBe(5);
  });

  it("devuelve 0 si no hay lineas de esa variante", () => {
    expect(stockUsadoPorVariante([baseItem], "v9")).toBe(0);
  });
});

describe("updateItemQty", () => {
  it("actualiza la cantidad de un item existente", () => {
    const result = updateItemQty([baseItem], "p1", null, null, 3);
    expect(result[0].qty).toBe(3);
  });

  it("capa al stock disponible", () => {
    const result = updateItemQty([baseItem], "p1", null, null, 99);
    expect(result[0].qty).toBe(5);
  });

  it("elimina el item si la cantidad es 0", () => {
    const result = updateItemQty([baseItem], "p1", null, null, 0);
    expect(result).toHaveLength(0);
  });

  it("distingue lineas por imageId: solo actualiza la que coincide", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1 },
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 1 },
    ];
    const result = updateItemQty(items, "p1", "v1", "img-a", 3);
    expect(result.find((i) => i.imageId === "img-a")?.qty).toBe(3);
    expect(result.find((i) => i.imageId === "img-b")?.qty).toBe(1);
  });

  it("capa la cantidad de una linea considerando lo que ya ocupan otras lineas de la misma variante", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 },
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 3, stock: 5 },
    ];
    // img-a quiere subir a 10, pero cupo = 5 (total) - 3 (usado por img-b) = 2
    const result = updateItemQty(items, "p1", "v1", "img-a", 10);
    expect(result.find((i) => i.imageId === "img-a")?.qty).toBe(2);
  });
});

describe("removeItem", () => {
  it("quita el item indicado", () => {
    const result = removeItem([baseItem], "p1", null, null);
    expect(result).toHaveLength(0);
  });

  it("no afecta otros items", () => {
    const other: LocalCartItem = { ...baseItem, productId: "p2" };
    const result = removeItem([baseItem, other], "p1", null, null);
    expect(result).toEqual([other]);
  });

  it("distingue lineas por imageId", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a" },
      { ...baseItem, variantId: "v1", imageId: "img-b" },
    ];
    const result = removeItem(items, "p1", "v1", "img-a");
    expect(result).toEqual([items[1]]);
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
