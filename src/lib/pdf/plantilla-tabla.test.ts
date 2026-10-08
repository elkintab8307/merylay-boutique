import { describe, expect, it } from "vitest";
import { plantillaTabla } from "./plantilla-tabla";

describe("plantillaTabla", () => {
  it("incluye el titulo, los encabezados y una fila por dato", () => {
    const html = plantillaTabla({
      titulo: "Informe de ventas",
      encabezados: ["Fecha", "Total"],
      filas: [["2026-10-01", "$40.000"], ["2026-10-02", "$55.000"]],
      logoUrl: null,
    });

    expect(html).toContain("Informe de ventas");
    expect(html).toContain("Fecha");
    expect(html).toContain("Total");
    expect(html).toContain("$40.000");
    expect(html).toContain("$55.000");
    expect(html).toContain("<!doctype html>");
  });

  it("escapa HTML en los valores para que un nombre con < o & no rompa el documento", () => {
    const html = plantillaTabla({
      titulo: "Informe",
      encabezados: ["Producto"],
      filas: [["Camiseta <Talla> & Co"]],
      logoUrl: null,
    });

    expect(html).toContain("Camiseta &lt;Talla&gt; &amp; Co");
    expect(html).not.toContain("<Talla>");
  });

  it("sin filas, renderiza la tabla vacia sin lanzar", () => {
    expect(() => plantillaTabla({ titulo: "Informe", encabezados: ["Fecha"], filas: [], logoUrl: null })).not.toThrow();
  });

  it("con logoUrl, incluye la imagen del logo", () => {
    const html = plantillaTabla({ titulo: "Informe", encabezados: [], filas: [], logoUrl: "https://x/logo.png" });
    expect(html).toContain("https://x/logo.png");
  });

  it("sin logoUrl, no incluye ninguna etiqueta img", () => {
    const html = plantillaTabla({ titulo: "Informe", encabezados: [], filas: [], logoUrl: null });
    expect(html).not.toContain("<img");
  });
});
