import { describe, expect, it } from "vitest";
import { productoSchema, varianteSchema } from "../producto";

describe("varianteSchema", () => {
  it("acepta variante con solo talla", () => {
    expect(
      varianteSchema.safeParse({
        talla: "M",
        color: "",
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
    costPrice: null,
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
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, stock: 3 }],
      }).success,
    ).toBe(true);
  });

  it("rechaza precio negativo", () => {
    expect(productoSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
  });

  it("rechaza dos variantes con la misma talla y color", () => {
    const result = productoSchema.safeParse({
      ...base,
      variantes: [
        { talla: "M", color: "Rosa", priceOverride: null, stock: 3 },
        { talla: "M", color: "Rosa", priceOverride: null, stock: 5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza dos variantes con la misma combinacion aunque cambien mayusculas o espacios", () => {
    const result = productoSchema.safeParse({
      ...base,
      variantes: [
        { talla: "M", color: "Rosa", priceOverride: null, stock: 3 },
        { talla: " m ", color: "ROSA", priceOverride: null, stock: 5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("acepta variantes con talla o color distintos", () => {
    const result = productoSchema.safeParse({
      ...base,
      variantes: [
        { talla: "M", color: "Rosa", priceOverride: null, stock: 3 },
        { talla: "L", color: "Rosa", priceOverride: null, stock: 5 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza variantes con talla distinta que generan el mismo SKU normalizado", () => {
    const result = productoSchema.safeParse({
      ...base,
      variantes: [
        { talla: "S", color: "", priceOverride: null, stock: 3 },
        { talla: "S!", color: "", priceOverride: null, stock: 5 },
      ],
    });
    expect(result.success).toBe(false);
  });
});
