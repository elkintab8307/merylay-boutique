import { describe, expect, it } from "vitest";
import { parseHeroStored } from "../home-contenido";

describe("parseHeroStored", () => {
  it("parsea el hero ya guardado en el formato nuevo", () => {
    const result = parseHeroStored({
      imagenesDesktop: ["https://x/a.jpg", "https://x/b.jpg"],
      imagenesMobile: ["https://x/c.jpg"],
    });
    expect(result).toEqual({
      imagenesDesktop: ["https://x/a.jpg", "https://x/b.jpg"],
      imagenesMobile: ["https://x/c.jpg"],
    });
  });

  it("migra un hero guardado en el formato anterior (imageUrl/imageUrlMobile)", () => {
    const result = parseHeroStored({
      imageUrl: "https://x/desktop.jpg",
      imageUrlMobile: "https://x/movil.jpg",
      titulo: "Bienvenida",
      subtitulo: "Texto viejo",
      textoBoton: "Ver mas",
      linkBoton: "/categoria/pijamas",
    });
    expect(result).toEqual({
      imagenesDesktop: ["https://x/desktop.jpg"],
      imagenesMobile: ["https://x/movil.jpg"],
    });
  });

  it("migra un hero anterior que solo tenia imagen de PC", () => {
    const result = parseHeroStored({
      imageUrl: "https://x/desktop.jpg",
      imageUrlMobile: null,
      titulo: "",
      subtitulo: "",
      textoBoton: "",
      linkBoton: "",
    });
    expect(result).toEqual({
      imagenesDesktop: ["https://x/desktop.jpg"],
      imagenesMobile: [],
    });
  });

  it("retorna null si no hay nada guardado", () => {
    expect(parseHeroStored(undefined)).toBeNull();
    expect(parseHeroStored(null)).toBeNull();
  });

  it("retorna null si el valor legado no tiene ninguna imagen", () => {
    expect(parseHeroStored({ titulo: "", subtitulo: "" })).toBeNull();
  });
});
