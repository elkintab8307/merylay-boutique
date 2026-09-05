import { describe, expect, it } from "vitest";
import {
  ordenarImagenesTarjeta,
  type ImagenTarjeta,
} from "../ordenar-imagenes-tarjeta";

const img = (over: Partial<ImagenTarjeta>): ImagenTarjeta => ({
  url: "u",
  sortOrder: 0,
  isPrimary: false,
  vendida: false,
  ...over,
});

describe("ordenarImagenesTarjeta", () => {
  it("pone la primaria primero aunque tenga sort_order mayor", () => {
    const r = ordenarImagenesTarjeta([
      img({ url: "a", sortOrder: 0 }),
      img({ url: "prim", sortOrder: 9, isPrimary: true }),
      img({ url: "b", sortOrder: 1 }),
    ]);
    expect(r).toEqual(["prim", "a", "b"]);
  });

  it("ordena las no primarias por sort_order", () => {
    const r = ordenarImagenesTarjeta([
      img({ url: "c", sortOrder: 3 }),
      img({ url: "a", sortOrder: 1 }),
      img({ url: "b", sortOrder: 2 }),
    ]);
    expect(r).toEqual(["a", "b", "c"]);
  });

  it("excluye las fotos vendidas", () => {
    const r = ordenarImagenesTarjeta([
      img({ url: "viva", sortOrder: 0 }),
      img({ url: "vendida", sortOrder: 1, vendida: true }),
    ]);
    expect(r).toEqual(["viva"]);
  });

  it("recorta a 5 imagenes", () => {
    const r = ordenarImagenesTarjeta(
      Array.from({ length: 8 }, (_, i) => img({ url: `u${i}`, sortOrder: i })),
    );
    expect(r).toHaveLength(5);
    expect(r).toEqual(["u0", "u1", "u2", "u3", "u4"]);
  });

  it("lista vacia -> []", () => {
    expect(ordenarImagenesTarjeta([])).toEqual([]);
  });
});
