import { describe, expect, it } from "vitest";
import { plantillaTarjetas } from "./plantilla-tarjetas";

const DATOS_BASE = {
  titulo: "INFORME DE PRODUCTOS",
  subtitulo: "CATÁLOGO MERYLAY BOUTIQUE",
  fotoHeroUrl: null,
  logoUrl: null,
  estadisticas: [{ valor: "2", etiqueta: "PRODUCTOS" }],
};

describe("plantillaTarjetas", () => {
  it("incluye el titulo, subtitulo, estadisticas y una tarjeta por producto", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [
        { fotoUrl: "https://x/a.jpg", nombre: "Camiseta Mariposa", pills: [{ etiqueta: "Tallas", valores: ["S", "M", "L", "XL"] }], precio: 40000, nota: "stock: 12" },
        { fotoUrl: null, nombre: "Camiseta Sin Foto", pills: [], precio: null, nota: "stock: 2" },
      ],
    });

    expect(html).toContain("INFORME DE PRODUCTOS");
    expect(html).toContain("CATÁLOGO MERYLAY BOUTIQUE");
    expect(html).toContain("PRODUCTOS");
    expect(html).toContain("Camiseta Mariposa");
    expect(html).toContain("Camiseta Sin Foto");
    expect(html).toContain("$40.000");
    expect(html).toContain("https://x/a.jpg");
    expect((html.match(/class="tarjeta"/g) ?? []).length).toBe(2);
  });

  it("sin fotoUrl en una tarjeta, muestra un placeholder 'Sin foto' en vez de una img", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [{ fotoUrl: null, nombre: "Producto X", pills: [], precio: 1000 }],
    });

    expect(html).toContain("Sin foto");
  });

  it("escapa el nombre del producto (nunca rompe el HTML con < o &)", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [{ fotoUrl: null, nombre: "Camiseta <Edición> & Co", pills: [], precio: 1000 }],
    });

    expect(html).toContain("Camiseta &lt;Edición&gt; &amp; Co");
    expect(html).not.toContain("<Edición>");
  });

  it("cada grupo de pills dibuja un span por valor", () => {
    const html = plantillaTarjetas({
      ...DATOS_BASE,
      tarjetas: [{ fotoUrl: null, nombre: "Producto X", pills: [{ etiqueta: "Tallas", valores: ["S", "M", "L"] }], precio: null }],
    });

    expect((html.match(/class="pill"/g) ?? []).length).toBe(3);
  });

  it("precio null sin nota, no revienta y no muestra un precio", () => {
    const html = plantillaTarjetas({ ...DATOS_BASE, tarjetas: [{ fotoUrl: null, nombre: "Producto X", pills: [], precio: null }] });
    expect(html).not.toContain("class=\"precio\"");
  });

  it("sin tarjetas, renderiza la cuadricula vacia sin lanzar", () => {
    expect(() => plantillaTarjetas({ ...DATOS_BASE, tarjetas: [] })).not.toThrow();
  });

  it("con fotoHeroUrl y logoUrl, los incluye en el encabezado", () => {
    const html = plantillaTarjetas({ ...DATOS_BASE, fotoHeroUrl: "https://x/hero.jpg", logoUrl: "https://x/logo.png", tarjetas: [] });
    expect(html).toContain("https://x/hero.jpg");
    expect(html).toContain("https://x/logo.png");
  });
});
