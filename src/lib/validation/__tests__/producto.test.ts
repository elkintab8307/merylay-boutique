import { describe, expect, it } from "vitest";
import { productoSchema, varianteSchema } from "../producto";

describe("varianteSchema", () => {
  it("acepta variante con solo talla", () => {
    expect(
      varianteSchema.safeParse({
        talla: "M",
        color: "",
        sku: "SKU-1",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(true);
  });

  it("acepta variante con solo color", () => {
    expect(
      varianteSchema.safeParse({
        talla: "",
        color: "Rosa",
        sku: "SKU-1",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(true);
  });

  it("rechaza variante sin talla ni color", () => {
    expect(
      varianteSchema.safeParse({
        talla: "",
        color: "",
        sku: "SKU-1",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(false);
  });

  it("rechaza variante sin sku", () => {
    expect(
      varianteSchema.safeParse({
        talla: "M",
        color: "Rosa",
        sku: "",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(false);
  });
});

describe("productoSchema", () => {
  const base = {
    name: "Pijama Rosa",
    slug: "pijama-rosa",
    description: "",
    categoryId: null,
    price: 89900,
    compareAtPrice: null,
    sku: "PJ-001",
    stock: 10,
    isActive: true,
    isFeatured: false,
    variantes: [] as const,
  };

  it("acepta un producto sin variantes", () => {
    expect(productoSchema.safeParse(base).success).toBe(true);
  });

  it("acepta un producto con variantes validas", () => {
    expect(
      productoSchema.safeParse({
        ...base,
        variantes: [
          { talla: "M", color: "Rosa", sku: "PJ-001-M-ROSA", priceOverride: null, stock: 3 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rechaza precio negativo", () => {
    expect(productoSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
  });

  it("rechaza sku vacio", () => {
    expect(productoSchema.safeParse({ ...base, sku: "" }).success).toBe(false);
  });
});
