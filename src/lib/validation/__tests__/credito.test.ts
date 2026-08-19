import { describe, expect, it } from "vitest";
import { abonoSchema, creditoVentaSchema } from "../credito";

const BASE = {
  clienteNombre: "Ana Ruiz",
  clienteTelefono: "3001234567",
  numCuotas: 3,
  abonoInicial: 0,
  abonoInicialMetodo: null,
};

describe("creditoVentaSchema", () => {
  it("acepta datos validos sin abono inicial", () => {
    expect(creditoVentaSchema.safeParse(BASE).success).toBe(true);
  });

  it("acepta datos validos con abono inicial y su metodo", () => {
    const resultado = creditoVentaSchema.safeParse({
      ...BASE,
      abonoInicial: 20000,
      abonoInicialMetodo: "efectivo",
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza nombre de cliente vacio", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, clienteNombre: "" }).success).toBe(false);
  });

  it("rechaza telefono vacio", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, clienteTelefono: "" }).success).toBe(false);
  });

  it("rechaza menos de 1 cuota", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, numCuotas: 0 }).success).toBe(false);
  });

  it("rechaza abono inicial negativo", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, abonoInicial: -1 }).success).toBe(false);
  });

  it("rechaza abono inicial mayor a cero sin metodo de pago", () => {
    const resultado = creditoVentaSchema.safeParse({
      ...BASE,
      abonoInicial: 20000,
      abonoInicialMetodo: null,
    });
    expect(resultado.success).toBe(false);
  });
});

describe("abonoSchema", () => {
  it("acepta un monto positivo con metodo valido", () => {
    expect(abonoSchema.safeParse({ amount: 50000, paymentMethod: "efectivo" }).success).toBe(true);
  });

  it("rechaza un monto de cero o negativo", () => {
    expect(abonoSchema.safeParse({ amount: 0, paymentMethod: "efectivo" }).success).toBe(false);
    expect(abonoSchema.safeParse({ amount: -1, paymentMethod: "efectivo" }).success).toBe(false);
  });

  it("rechaza 'credito' como metodo de pago del abono", () => {
    expect(abonoSchema.safeParse({ amount: 50000, paymentMethod: "credito" }).success).toBe(false);
  });
});
