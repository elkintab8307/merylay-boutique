import { describe, expect, it } from "vitest";
import { ordenarTallas } from "../ordenar-tallas";

describe("ordenarTallas", () => {
  it("ordena las tallas de letra por la secuencia real, no alfabeticamente", () => {
    expect(ordenarTallas(["L", "XS", "M", "XL", "S"])).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
    ]);
  });

  it("incluye tallas extendidas (XXL, XXXL)", () => {
    expect(ordenarTallas(["XXXL", "M", "XXL"])).toEqual(["M", "XXL", "XXXL"]);
  });

  it("ordena tallas numericas de menor a mayor", () => {
    expect(ordenarTallas(["10", "2", "8", "6"])).toEqual(["2", "6", "8", "10"]);
  });

  it("pone las tallas conocidas primero y el resto despues, alfabetico", () => {
    expect(ordenarTallas(["Única", "M", "S"])).toEqual(["S", "M", "Única"]);
  });

  it("quita duplicados respetando mayusculas/minusculas y espacios", () => {
    expect(ordenarTallas([" s ", "S", "m", "M"])).toEqual(["S", "M"]);
  });

  it("es tolerante a la caja: 'xl' y 'XL' son la misma talla", () => {
    expect(ordenarTallas(["xl", "s"])).toEqual(["S", "XL"]);
  });
});
