import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FuentesMarca } from "./pdf-render.ts";

// pdf-lib se mockea por completo (igual que en reports.test.ts): estos tests
// verifican la logica de descarga/cache/fallback/recorte de texto de
// pdf-render.ts, no el renderizado real de pdf-lib (eso ya lo prueba
// catalog.test.ts, que SI usa pdf-lib real).
const pdfLibCapturado = vi.hoisted(() => ({
  registerFontkitLlamadas: 0,
  embedFontArgs: [] as unknown[],
}));
vi.mock("pdf-lib", () => ({
  StandardFonts: { Helvetica: "Helvetica", HelveticaBold: "HelveticaBold" },
  rgb: (r: number, g: number, b: number) => ({ r, g, b }),
}));

function crearPdfMock() {
  return {
    registerFontkit: vi.fn(() => {
      pdfLibCapturado.registerFontkitLlamadas += 1;
    }),
    embedFont: vi.fn(async (arg: unknown) => {
      pdfLibCapturado.embedFontArgs.push(arg);
      return { __fontArg: arg };
    }),
    embedPng: vi.fn(async (bytes: Uint8Array) => ({ __pngBytes: bytes, width: 200, height: 100 })),
  };
}

// Fuente falsa con ancho monoespaciado predecible (10 por caracter a tamaño
// 10) -- evita depender de metricas reales de una fuente de pdf-lib para
// probar la logica pura de recorte/envoltura.
function crearFuenteMonoespaciada(anchoPorCaracter = 10) {
  return { widthOfTextAtSize: (texto: string) => texto.length * anchoPorCaracter } as never;
}

beforeEach(() => {
  pdfLibCapturado.registerFontkitLlamadas = 0;
  pdfLibCapturado.embedFontArgs = [];
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "SITE_URL" ? "https://merylay.shop" : undefined)) } });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("clipTexto", () => {
  it("si el texto ya cabe, lo devuelve sin cambios", async () => {
    const { clipTexto } = await import("./pdf-render.ts");
    const fuente = crearFuenteMonoespaciada();

    expect(clipTexto("Corto", 1000, fuente, 10)).toBe("Corto");
  });

  it("si no cabe, recorta caracteres y agrega elipsis sin exceder el ancho", async () => {
    const { clipTexto } = await import("./pdf-render.ts");
    const fuente = crearFuenteMonoespaciada(); // 10 por caracter

    const resultado = clipTexto("Camiseta algodón licrado manga larga", 100, fuente, 10);

    expect(resultado.endsWith("…")).toBe(true);
    expect(fuente.widthOfTextAtSize(resultado, 10)).toBeLessThanOrEqual(100);
  });
});

describe("envolverTexto", () => {
  it("si el texto cabe en una sola linea, devuelve un arreglo de una linea sin elipsis", async () => {
    const { envolverTexto } = await import("./pdf-render.ts");
    const fuente = crearFuenteMonoespaciada();

    const lineas = envolverTexto("Camiseta rosa", 2, 1000, fuente, 10);

    expect(lineas).toEqual(["Camiseta rosa"]);
  });

  it("si no cabe en una linea pero si en dos, reparte las palabras entre ambas", async () => {
    const { envolverTexto } = await import("./pdf-render.ts");
    const fuente = crearFuenteMonoespaciada(); // 10 por caracter

    // "Camiseta algodón" = 17 chars = 170 > 100; cada palabra sola cabe en 100.
    const lineas = envolverTexto("Camiseta algodón", 2, 100, fuente, 10);

    expect(lineas).toEqual(["Camiseta", "algodón"]);
    for (const linea of lineas) {
      expect(fuente.widthOfTextAtSize(linea, 10)).toBeLessThanOrEqual(100);
    }
  });

  it("si el nombre es muy largo para 2 lineas, la segunda linea termina en elipsis (bug original: nombre se desbordaba sobre la tarjeta vecina)", async () => {
    const { envolverTexto } = await import("./pdf-render.ts");
    const fuente = crearFuenteMonoespaciada();

    const lineas = envolverTexto(
      "Camiseta algodón licrado manga doblada con pedrería y cuello redondo talla M",
      2,
      100,
      fuente,
      10,
    );

    expect(lineas.length).toBe(2);
    expect(lineas[1].endsWith("…")).toBe(true);
    for (const linea of lineas) {
      expect(fuente.widthOfTextAtSize(linea, 10)).toBeLessThanOrEqual(100);
    }
  });

  it("nunca devuelve mas lineas que maxLineas", async () => {
    const { envolverTexto } = await import("./pdf-render.ts");
    const fuente = crearFuenteMonoespaciada();

    const lineas = envolverTexto("una palabra muy larga que definitivamente no cabe en una sola linea corta", 2, 50, fuente, 10);

    expect(lineas.length).toBeLessThanOrEqual(2);
  });
});

describe("cargarFuentesMarca", () => {
  it("descarga e incrusta las 3 fuentes de marca cuando el CDN responde bien", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    const { cargarFuentesMarca } = await import("./pdf-render.ts");
    const pdf = crearPdfMock();

    const fuentes = await cargarFuentesMarca(pdf as never);

    expect(pdf.registerFontkit).toHaveBeenCalledTimes(1);
    expect(pdf.embedFont).toHaveBeenCalledTimes(3);
    for (const arg of pdfLibCapturado.embedFontArgs) {
      expect(arg).toBeInstanceOf(Uint8Array);
    }
    expect(fuentes.texto).toBeDefined();
    expect(fuentes.textoNegrita).toBeDefined();
    expect(fuentes.titulo).toBeDefined();
  });

  it("si el CDN falla para una fuente, usa una fuente estandar de reemplazo sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    const { cargarFuentesMarca } = await import("./pdf-render.ts");
    const pdf = crearPdfMock();

    await expect(cargarFuentesMarca(pdf as never)).resolves.not.toThrow();

    for (const arg of pdfLibCapturado.embedFontArgs) {
      expect(typeof arg).toBe("string");
    }
  });

  it("si fetch lanza una excepcion de red, tambien cae al fallback sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("red caida");
    }));
    const { cargarFuentesMarca } = await import("./pdf-render.ts");
    const pdf = crearPdfMock();

    await expect(cargarFuentesMarca(pdf as never)).resolves.not.toThrow();
  });

  it("solo descarga cada fuente una vez aunque se generen varios PDFs (cache en memoria)", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { cargarFuentesMarca } = await import("./pdf-render.ts");

    const pdf1 = crearPdfMock();
    const pdf2 = crearPdfMock();
    await cargarFuentesMarca(pdf1 as never);
    await cargarFuentesMarca(pdf2 as never);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(pdf1.embedFont).toHaveBeenCalledTimes(3);
    expect(pdf2.embedFont).toHaveBeenCalledTimes(3);
  });
});

describe("cargarLogoMarca", () => {
  it("descarga e incrusta el logo desde SITE_URL/brand/logo-principal.png", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9, 9, 9]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { cargarLogoMarca } = await import("./pdf-render.ts");
    const pdf = crearPdfMock();

    const logo = await cargarLogoMarca(pdf as never);

    expect(fetchMock).toHaveBeenCalledWith("https://merylay.shop/brand/logo-principal.png");
    expect(logo).not.toBeNull();
  });

  it("sin SITE_URL configurado, no intenta descargar nada y devuelve null", async () => {
    vi.stubGlobal("Deno", { env: { get: vi.fn(() => undefined) } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { cargarLogoMarca } = await import("./pdf-render.ts");
    const pdf = crearPdfMock();

    const logo = await cargarLogoMarca(pdf as never);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logo).toBeNull();
  });

  it("si la descarga del logo falla, devuelve null sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no encontrado", { status: 404 })));
    const { cargarLogoMarca } = await import("./pdf-render.ts");
    const pdf = crearPdfMock();

    await expect(cargarLogoMarca(pdf as never)).resolves.toBeNull();
  });

  it("cachea el logo entre llamadas (una sola descarga para varios PDFs)", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9, 9, 9]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { cargarLogoMarca } = await import("./pdf-render.ts");

    await cargarLogoMarca(crearPdfMock() as never);
    await cargarLogoMarca(crearPdfMock() as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("dibujarEncabezado", () => {
  function crearPaginaMock() {
    return { drawText: vi.fn(), drawImage: vi.fn(), drawRectangle: vi.fn() };
  }

  it("dibuja el titulo, la linea de acento dorada, y el logo cuando esta disponible", async () => {
    const { dibujarEncabezado } = await import("./pdf-render.ts");
    const pagina = crearPaginaMock();
    const fuentes = { texto: {}, textoNegrita: {}, titulo: {} } as unknown as FuentesMarca;
    const logo = { width: 200, height: 100 } as never;

    const y = dibujarEncabezado(pagina as never, { titulo: "Informe de ventas", fuentes, logo, anchoPagina: 800, altoPagina: 500 });

    expect(pagina.drawText).toHaveBeenCalledWith("Informe de ventas", expect.objectContaining({ font: fuentes.titulo }));
    expect(pagina.drawImage).toHaveBeenCalledWith(logo, expect.anything());
    expect(pagina.drawRectangle).toHaveBeenCalled();
    expect(y).toBeLessThan(500);
  });

  it("sin logo, dibuja el titulo igual (empezando mas a la izquierda) sin lanzar", async () => {
    const { dibujarEncabezado } = await import("./pdf-render.ts");
    const pagina = crearPaginaMock();
    const fuentes = { texto: {}, textoNegrita: {}, titulo: {} } as unknown as FuentesMarca;

    expect(() => dibujarEncabezado(pagina as never, { titulo: "Informe", fuentes, logo: null, anchoPagina: 800, altoPagina: 500 })).not.toThrow();
    expect(pagina.drawImage).not.toHaveBeenCalled();
    expect(pagina.drawText).toHaveBeenCalled();
  });
});

describe("dibujarPiePagina", () => {
  it("dibuja el texto de marca en el pie de pagina", async () => {
    const { dibujarPiePagina } = await import("./pdf-render.ts");
    const pagina = { drawText: vi.fn() };
    const fuentes = { texto: {}, textoNegrita: {}, titulo: {} } as unknown as FuentesMarca;

    dibujarPiePagina(pagina as never, { fuentes, anchoPagina: 800 });

    expect(pagina.drawText).toHaveBeenCalledWith(expect.stringContaining("MeryLay"), expect.objectContaining({ font: fuentes.texto }));
  });
});

describe("generarPdfTabla", () => {
  it("genera bytes de un PDF real (pdf-lib real, sin mock) incluso con texto largo en las celdas", async () => {
    vi.doUnmock("pdf-lib");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("sin red en este test");
    }));
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const bytes = await generarPdfTabla(
      "Informe de productos",
      ["Producto", "Precio"],
      [["Camiseta algodón licrado manga doblada con pedrería y cuello redondo", "$45.000"]],
    );

    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe("generarPdfTarjetas", () => {
  it("genera bytes de un PDF real con una tarjeta de nombre muy largo sin lanzar (bug original)", async () => {
    vi.doUnmock("pdf-lib");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("sin red en este test");
    }));
    const { generarPdfTarjetas } = await import("./pdf-render.ts");

    const bytes = await generarPdfTarjetas(
      "CATÁLOGO",
      "MeryLay Boutique — Inspiración Femenina",
      null,
      [{ valor: "1", etiqueta: "PRODUCTOS" }],
      [
        {
          fotoUrl: null,
          nombre: "Camiseta algodón licrado manga doblada con pedrería y cuello redondo talla M",
          pills: [{ etiqueta: "Tallas", valores: ["S", "M", "L"] }],
          precio: 45000,
        },
      ],
    );

    expect(bytes.length).toBeGreaterThan(0);
  });
});
