import { describe, expect, it } from "vitest";
import { expenseCategoriaSchema, gastoSchema } from "../gasto";

describe("gastoSchema", () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const base = {
    categoryId: "11111111-1111-4111-8111-111111111111",
    description: "Compra de bolsas para empaque",
    amount: 50000,
    expenseDate: hoy,
  };

  it("acepta datos validos", () => {
    expect(gastoSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza un monto negativo", () => {
    expect(gastoSchema.safeParse({ ...base, amount: -100 }).success).toBe(false);
  });

  it("rechaza un monto igual a cero", () => {
    expect(gastoSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
  });

  it("rechaza una descripcion muy corta", () => {
    expect(gastoSchema.safeParse({ ...base, description: "ab" }).success).toBe(false);
  });

  it("rechaza una fecha futura", () => {
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(gastoSchema.safeParse({ ...base, expenseDate: manana }).success).toBe(false);
  });

  it("rechaza una fecha vacia", () => {
    const result = gastoSchema.safeParse({ ...base, expenseDate: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Ingresa una fecha válida");
    }
  });

  it("rechaza una fecha con formato no ISO", () => {
    const result = gastoSchema.safeParse({ ...base, expenseDate: "12/31/2020" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Ingresa una fecha válida");
    }
  });

  it("rechaza una fecha ISO inexistente", () => {
    expect(gastoSchema.safeParse({ ...base, expenseDate: "2020-13-45" }).success).toBe(
      false,
    );
  });

  it("rechaza un categoryId que no es uuid", () => {
    expect(gastoSchema.safeParse({ ...base, categoryId: "no-es-uuid" }).success).toBe(
      false,
    );
  });
});

describe("expenseCategoriaSchema", () => {
  it("acepta datos validos", () => {
    expect(
      expenseCategoriaSchema.safeParse({ name: "Renta", isActive: true }).success,
    ).toBe(true);
  });

  it("rechaza un nombre muy corto", () => {
    expect(
      expenseCategoriaSchema.safeParse({ name: "R", isActive: true }).success,
    ).toBe(false);
  });
});
