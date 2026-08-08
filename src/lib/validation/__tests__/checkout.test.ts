import { describe, expect, it } from "vitest";
import { checkoutSchema } from "../checkout";

describe("checkoutSchema", () => {
  const base = {
    fullName: "Maria Perez",
    phone: "3001234567",
    address: "Calle 10 # 20-30",
    city: "Bogota",
    notes: "",
    paymentMethod: "transferencia" as const,
  };

  it("acepta datos validos", () => {
    expect(checkoutSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza nombre muy corto", () => {
    expect(checkoutSchema.safeParse({ ...base, fullName: "A" }).success).toBe(false);
  });

  it("rechaza telefono muy corto", () => {
    expect(checkoutSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
  });

  it("rechaza direccion vacia", () => {
    expect(checkoutSchema.safeParse({ ...base, address: "" }).success).toBe(false);
  });

  it("rechaza un metodo de pago invalido", () => {
    expect(
      checkoutSchema.safeParse({ ...base, paymentMethod: "bitcoin" }).success,
    ).toBe(false);
  });

  it("acepta wompi como metodo de pago", () => {
    expect(
      checkoutSchema.safeParse({ ...base, paymentMethod: "wompi" }).success,
    ).toBe(true);
  });

  it("rechaza los metodos de pago manuales removidos (tarjeta, nequi, daviplata)", () => {
    expect(checkoutSchema.safeParse({ ...base, paymentMethod: "tarjeta" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, paymentMethod: "nequi" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, paymentMethod: "daviplata" }).success).toBe(false);
  });
});
