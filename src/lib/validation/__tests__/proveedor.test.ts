import { describe, expect, it } from "vitest";
import { proveedorSchema } from "../proveedor";

describe("proveedorSchema", () => {
  const base = { name: "Textiles del Valle", phone: "3001234567", isActive: true };

  it("acepta datos validos", () => {
    expect(proveedorSchema.safeParse(base).success).toBe(true);
  });

  it("acepta sin telefono", () => {
    expect(proveedorSchema.safeParse({ ...base, phone: "" }).success).toBe(true);
  });

  it("rechaza un nombre muy corto", () => {
    expect(proveedorSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });
});
