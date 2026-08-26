import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getVentaEnCurso,
  guardarVentaEnCurso,
  limpiarVentaEnCurso,
} from "../local-pos-sale";
import type { LocalCartItem } from "../local-cart";

const STORAGE_KEY = "merylay-pos-venta-actual";

const item: LocalCartItem = {
  productId: "p1",
  variantId: "v1",
  imageId: null,
  slug: "pijama",
  name: "Pijama Rosa",
  unitPrice: 50000,
  qty: 2,
  imageUrl: null,
  stock: 10,
};

describe("getVentaEnCurso", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("devuelve [] si no hay nada guardado", () => {
    expect(getVentaEnCurso()).toEqual([]);
  });

  it("lee lo guardado con la clave dedicada del POS (distinta del carrito de la tienda)", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([item]));
    expect(getVentaEnCurso()).toEqual([item]);
  });

  it("devuelve [] si el contenido guardado no es JSON valido", () => {
    window.localStorage.setItem(STORAGE_KEY, "esto no es json");
    expect(getVentaEnCurso()).toEqual([]);
  });
});

describe("guardarVentaEnCurso", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("guarda los items y se pueden volver a leer con getVentaEnCurso", () => {
    guardarVentaEnCurso([item]);
    expect(getVentaEnCurso()).toEqual([item]);
  });

  it("no usa la misma clave que el carrito de la tienda (merylay-cart)", () => {
    guardarVentaEnCurso([item]);
    expect(window.localStorage.getItem("merylay-cart")).toBe(null);
  });
});

describe("limpiarVentaEnCurso", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("borra lo guardado", () => {
    guardarVentaEnCurso([item]);
    limpiarVentaEnCurso();
    expect(getVentaEnCurso()).toEqual([]);
  });
});
