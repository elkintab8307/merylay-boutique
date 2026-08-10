import { describe, expect, it } from "vitest";
import { generarCodigoBarras, generarCodigoQr } from "../codigos";

describe("generarCodigoQr", () => {
  it("genera una imagen PNG en base64 a partir del SKU", async () => {
    const resultado = await generarCodigoQr("PIJ-000001");
    expect(resultado.startsWith("data:image/png;base64,")).toBe(true);
    expect(resultado.length).toBeGreaterThan(100);
  });
});

describe("generarCodigoBarras", () => {
  it("genera una imagen PNG en base64 a partir del SKU", async () => {
    const resultado = await generarCodigoBarras("PIJ-000001");
    expect(resultado.startsWith("data:image/png;base64,")).toBe(true);
    expect(resultado.length).toBeGreaterThan(100);
  });

  it("acepta SKU con letras, numeros y guiones (formato Code128)", async () => {
    const resultado = await generarCodigoBarras("GEN-000042");
    expect(resultado.startsWith("data:image/png;base64,")).toBe(true);
  });
});
