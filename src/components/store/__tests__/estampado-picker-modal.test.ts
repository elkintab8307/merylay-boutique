import { describe, expect, it } from "vitest";
import { toggleSeleccion } from "../estampado-picker-modal";

describe("toggleSeleccion", () => {
  it("modo multiple: agrega la imagen si no estaba seleccionada", () => {
    const result = toggleSeleccion([], "img-a", false);
    expect(result).toEqual(["img-a"]);
  });

  it("modo multiple: quita la imagen si ya estaba seleccionada", () => {
    const result = toggleSeleccion(["img-a", "img-b"], "img-a", false);
    expect(result).toEqual(["img-b"]);
  });

  it("modo multiple: puede tener varias imagenes seleccionadas a la vez", () => {
    const result = toggleSeleccion(["img-a"], "img-b", false);
    expect(result).toEqual(["img-a", "img-b"]);
  });

  it("modo unico: seleccionar una imagen reemplaza cualquier seleccion anterior", () => {
    const result = toggleSeleccion(["img-a"], "img-b", true);
    expect(result).toEqual(["img-b"]);
  });

  it("modo unico: click en la ya seleccionada la deja seleccionada (no se puede deseleccionar todo)", () => {
    const result = toggleSeleccion(["img-a"], "img-a", true);
    expect(result).toEqual(["img-a"]);
  });
});
