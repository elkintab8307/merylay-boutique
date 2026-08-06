import { describe, expect, it } from "vitest";
import { getVariantOptions, findMatchingVariant } from "../variants";

describe("getVariantOptions", () => {
  it("extrae tallas y colores unicos y ordenados", () => {
    const variants = [
      { id: "1", talla: "L", color: "Rosa", sku: "1", stock: 1, priceOverride: null },
      { id: "2", talla: "M", color: "Rosa", sku: "2", stock: 1, priceOverride: null },
      { id: "3", talla: "M", color: "Azul", sku: "3", stock: 1, priceOverride: null },
    ];
    expect(getVariantOptions(variants)).toEqual({
      tallas: ["L", "M"],
      colores: ["Azul", "Rosa"],
    });
  });

  it("ignora variantes sin talla o sin color", () => {
    const variants = [
      { id: "1", talla: "M", color: null, sku: "1", stock: 1, priceOverride: null },
      { id: "2", talla: null, color: "Rosa", sku: "2", stock: 1, priceOverride: null },
    ];
    expect(getVariantOptions(variants)).toEqual({ tallas: ["M"], colores: ["Rosa"] });
  });
});

describe("findMatchingVariant", () => {
  const variants = [
    { id: "1", talla: "M", color: "Rosa", sku: "1", stock: 3, priceOverride: null },
    { id: "2", talla: "L", color: "Azul", sku: "2", stock: 5, priceOverride: null },
  ];

  it("encuentra la variante exacta", () => {
    expect(findMatchingVariant(variants, "M", "Rosa")?.sku).toBe("1");
  });

  it("devuelve null si no hay coincidencia", () => {
    expect(findMatchingVariant(variants, "M", "Azul")).toBeNull();
  });
});
