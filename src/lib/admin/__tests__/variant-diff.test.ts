import { describe, expect, it } from "vitest";
import { diffVariantes } from "../variant-diff";

describe("diffVariantes", () => {
  it("marca como 'crear' todas las variantes sin id", () => {
    const resultado = diffVariantes<{ id?: string; talla: string; color: string }>(
      [{ talla: "M", color: "Rosa" }, { talla: "L", color: "Rosa" }],
      [],
    );
    expect(resultado.items).toEqual([
      { tipo: "crear", index: 0, variante: { talla: "M", color: "Rosa" } },
      { tipo: "crear", index: 1, variante: { talla: "L", color: "Rosa" } },
    ]);
    expect(resultado.borrarIds).toEqual([]);
  });

  it("marca como 'actualizar' las variantes cuyo id ya existe", () => {
    const resultado = diffVariantes(
      [{ id: "v1", talla: "M", color: "Rosa" }],
      ["v1"],
    );
    expect(resultado.items).toEqual([
      { tipo: "actualizar", index: 0, id: "v1", variante: { id: "v1", talla: "M", color: "Rosa" } },
    ]);
    expect(resultado.borrarIds).toEqual([]);
  });

  it("mezcla actualizar, crear y borrar en un mismo diff", () => {
    const resultado = diffVariantes(
      [
        { id: "v1", talla: "M", color: "Rosa" },
        { talla: "XL", color: "Rosa" },
      ],
      ["v1", "v2"],
    );
    expect(resultado.items).toEqual([
      { tipo: "actualizar", index: 0, id: "v1", variante: { id: "v1", talla: "M", color: "Rosa" } },
      { tipo: "crear", index: 1, variante: { talla: "XL", color: "Rosa" } },
    ]);
    expect(resultado.borrarIds).toEqual(["v2"]);
  });

  it("trata un id que ya no existe en la base como 'crear'", () => {
    const resultado = diffVariantes(
      [{ id: "borrado-por-fuera", talla: "M", color: "Rosa" }],
      [],
    );
    expect(resultado.items).toEqual([
      {
        tipo: "crear",
        index: 0,
        variante: { id: "borrado-por-fuera", talla: "M", color: "Rosa" },
      },
    ]);
  });
});
