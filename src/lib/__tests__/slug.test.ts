import { describe, expect, it } from "vitest";
import { slugify } from "../slug";

describe("slugify", () => {
  it("convierte a minusculas y reemplaza espacios por guiones", () => {
    expect(slugify("Pijama Rosa Elegante")).toBe("pijama-rosa-elegante");
  });

  it("elimina acentos y caracteres especiales", () => {
    expect(slugify("Piñata & Más!!")).toBe("pinata-mas");
  });

  it("recorta guiones al inicio y al final", () => {
    expect(slugify("  Espacios  ")).toBe("espacios");
  });

  it("devuelve cadena vacia para entrada vacia", () => {
    expect(slugify("")).toBe("");
  });
});
