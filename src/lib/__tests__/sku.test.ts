import { describe, expect, it } from "vitest";
import { generarSkuVariante } from "../sku";

describe("generarSkuVariante", () => {
  it("combina talla y color cuando ambos existen", () => {
    expect(generarSkuVariante("PIJ-000001", "M", "Rosa")).toBe(
      "PIJ-000001-M-ROSA",
    );
  });

  it("usa solo la talla cuando no hay color", () => {
    expect(generarSkuVariante("PIJ-000001", "M", null)).toBe(
      "PIJ-000001-M",
    );
  });

  it("usa solo el color cuando no hay talla", () => {
    expect(generarSkuVariante("PIJ-000001", null, "Rosa")).toBe(
      "PIJ-000001-ROSA",
    );
  });

  it("normaliza tildes y espacios en el color", () => {
    expect(generarSkuVariante("PIJ-000001", null, "Azul Marino")).toBe(
      "PIJ-000001-AZUL-MARINO",
    );
  });

  it("quita tildes de la talla", () => {
    expect(generarSkuVariante("PIJ-000001", "Único", null)).toBe(
      "PIJ-000001-UNICO",
    );
  });
});
