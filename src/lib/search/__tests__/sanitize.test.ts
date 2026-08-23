import { describe, expect, it } from "vitest";
import { sanitizarQueryBusqueda } from "../sanitize";

describe("sanitizarQueryBusqueda", () => {
  it("despoja %, comas y parentesis de la query", () => {
    expect(sanitizarQueryBusqueda("pi%ja,ma()")).toBe("pijama");
  });

  it("recorta espacios al inicio y al final", () => {
    expect(sanitizarQueryBusqueda("  pijama  ")).toBe("pijama");
  });

  it("recorta y sanitiza a la vez", () => {
    expect(sanitizarQueryBusqueda("  pi%ja,ma()  ")).toBe("pijama");
  });

  it("deja intacta una query que ya es segura", () => {
    expect(sanitizarQueryBusqueda("pijama rosa M")).toBe("pijama rosa M");
  });

  it("retorna cadena vacia si la query es solo espacios o caracteres especiales", () => {
    expect(sanitizarQueryBusqueda("   ")).toBe("");
    expect(sanitizarQueryBusqueda("%,()")).toBe("");
  });
});
