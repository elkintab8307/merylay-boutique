import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mergeCartItem,
  updateItemQty,
  removeItem,
  computeSubtotal,
  stockUsadoPorVariante,
  getLocalCart,
} from "../local-cart";
import type { LocalCartItem } from "../local-cart";

const STORAGE_KEY = "merylay-cart";

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

  it("al agregar una linea nueva con estampado de una variante que ya tiene otra linea, queda en qty 1 (una linea con imagen es siempre 1 unidad; no aplica cupo compartido)", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1", imageId: "img-a", qty: 4, stock: 5 }],
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 3, stock: 5 },
    );
    expect(result).toHaveLength(2);
    expect(result[1].qty).toBe(1);
  });

  it("no agrega una linea nueva sin estampado si no queda cupo de stock", () => {
    const result = mergeCartItem([], { ...baseItem, variantId: null, imageId: null, qty: 1, stock: 0 });
    // Sin cupo restante no se agrega una linea vacia: una linea con qty 0
    // es invisible para el usuario pero rompe create_pos_sale/create_order,
    // que exigen qty > 0.
    expect(result).toHaveLength(0);
  });

  it("una linea nueva con estampado elegido se agrega en qty 1 aunque la variante ya tenga todo su stock repartido entre otras lineas (las lineas con imagen no comparten cupo)", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 }],
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 1, stock: 5 },
    );
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.imageId === "img-b")?.qty).toBe(1);
  });

  it("al fusionar en una linea existente con estampado elegido, no la limita el cupo que ocupan otras lineas de la misma variante (las lineas con imagen no comparten cupo)", () => {
    const result = mergeCartItem(
      [
        { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 },
        { ...baseItem, variantId: "v1", imageId: "img-b", qty: 1, stock: 5 },
      ],
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 },
    );
    const lineaA = result.find((i) => i.imageId === "img-a");
    expect(lineaA?.qty).toBe(1);
  });

  it("una linea nueva con estampado elegido siempre queda en qty 1, sin importar la qty pedida ni el stock", () => {
    const result = mergeCartItem(
      [],
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 2, stock: 5 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(1);
  });

  it("al fusionar en una linea existente con estampado elegido, la qty combinada siempre queda en 1", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 }],
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 2, stock: 5 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(1);
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
    // qty 0 en img-a la elimina; si el codigo tocara la linea equivocada,
    // seria img-b la que desaparece.
    const result = updateItemQty(items, "p1", "v1", "img-a", 0);
    expect(result.find((i) => i.imageId === "img-a")).toBeUndefined();
    expect(result.find((i) => i.imageId === "img-b")?.qty).toBe(1);
  });

  it("una linea con estampado elegido no la limita el cupo que ocupan otras lineas de la misma variante (las lineas con imagen no comparten cupo)", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 },
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 1, stock: 5 },
    ];
    const result = updateItemQty(items, "p1", "v1", "img-a", 1);
    expect(result.find((i) => i.imageId === "img-a")?.qty).toBe(1);
  });

  it("una linea con estampado elegido siempre queda en qty 1, sin importar la qty pedida ni el stock de la variante", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 },
    ];
    const result = updateItemQty(items, "p1", "v1", "img-a", 5);
    expect(result.find((i) => i.imageId === "img-a")?.qty).toBe(1);
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

describe("getLocalCart", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("normaliza a null el imageId de un item guardado antes de esta funcionalidad (sin la clave imageId)", () => {
    // Simula un carrito guardado en localStorage antes de que existiera
    // imageId: el JSON no trae la clave en absoluto, asi que al leerlo
    // vuelve `undefined`, no `null`.
    const itemSinImageId = {
      productId: "p1",
      variantId: "v1",
      slug: "producto-1",
      name: "Producto 1",
      unitPrice: 10000,
      qty: 1,
      imageUrl: null,
      stock: 5,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([itemSinImageId]));

    const result = getLocalCart();

    expect(result[0].imageId).toBe(null);
    expect(result[0].imageId).not.toBe(undefined);
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
