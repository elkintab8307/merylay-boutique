import { describe, expect, it } from "vitest";
import { compraSchema } from "../compra";

describe("compraSchema", () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const base = {
    supplierId: "11111111-1111-4111-8111-111111111111",
    purchaseDate: hoy,
    items: [
      { productId: "22222222-2222-4222-8222-222222222222", qty: 10, unitCost: 5000 },
    ],
  };

  it("acepta datos validos", () => {
    expect(compraSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza un arreglo de items vacio", () => {
    expect(compraSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  it("rechaza una cantidad no positiva", () => {
    expect(
      compraSchema.safeParse({
        ...base,
        items: [{ ...base.items[0], qty: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rechaza un costo unitario no positivo", () => {
    expect(
      compraSchema.safeParse({
        ...base,
        items: [{ ...base.items[0], unitCost: -1 }],
      }).success,
    ).toBe(false);
  });

  it("rechaza una fecha vacia", () => {
    expect(compraSchema.safeParse({ ...base, purchaseDate: "" }).success).toBe(false);
  });

  it("rechaza una fecha futura", () => {
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(compraSchema.safeParse({ ...base, purchaseDate: manana }).success).toBe(
      false,
    );
  });
});
