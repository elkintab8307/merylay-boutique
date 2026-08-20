import { describe, expect, it } from "vitest";
import { construirLinkWhatsapp } from "../build-whatsapp-link";

describe("construirLinkWhatsapp", () => {
  it("agrega el mensaje como parametro text a un link que ya tiene un text vacio", () => {
    const resultado = construirLinkWhatsapp(
      "https://api.whatsapp.com/send/?phone=573135328267&text&type=phone_number&app_absent=0",
      "Hola, quiero información",
    );
    const url = new URL(resultado);
    expect(url.searchParams.get("text")).toBe("Hola, quiero información");
    expect(url.searchParams.get("phone")).toBe("573135328267");
  });

  it("agrega el mensaje como parametro text a un link sin ningun query", () => {
    const resultado = construirLinkWhatsapp("https://wa.me/573135328267", "Hola");
    const url = new URL(resultado);
    expect(url.searchParams.get("text")).toBe("Hola");
  });

  it("reemplaza un text existente en vez de duplicarlo", () => {
    const resultado = construirLinkWhatsapp(
      "https://wa.me/573135328267?text=viejo",
      "nuevo mensaje",
    );
    const url = new URL(resultado);
    expect(url.searchParams.getAll("text")).toEqual(["nuevo mensaje"]);
  });

  it("retorna la url original si no es una url valida", () => {
    expect(construirLinkWhatsapp("no-es-una-url", "Hola")).toBe("no-es-una-url");
  });
});
