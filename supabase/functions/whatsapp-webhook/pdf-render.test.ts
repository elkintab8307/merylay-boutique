import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubEnv(valores: Record<string, string | undefined>) {
  vi.stubGlobal("Deno", { env: { get: (k: string) => valores[k] } });
}

describe("generarPdfTabla", () => {
  it("sin SITE_URL o PDF_RENDER_SECRET, lanza sin intentar la peticion", async () => {
    stubEnv({ SITE_URL: undefined, PDF_RENDER_SECRET: "x" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    await expect(generarPdfTabla("Informe", ["A"], [["1"]])).rejects.toThrow(/SITE_URL|PDF_RENDER_SECRET/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con las variables configuradas, llama al endpoint con el cuerpo y el header correctos", async () => {
    stubEnv({ SITE_URL: "https://merylay.shop", PDF_RENDER_SECRET: "secreto-real" });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const bytes = await generarPdfTabla("Informe de ventas", ["Fecha", "Total"], [["2026-10-01", "$1.000"]]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://merylay.shop/api/pdf/render",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-pdf-render-secret": "secreto-real" }),
      }),
    );
    const cuerpoEnviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpoEnviado).toEqual({ tipo: "tabla", titulo: "Informe de ventas", encabezados: ["Fecha", "Total"], filas: [["2026-10-01", "$1.000"]] });
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("si el endpoint responde con error, lanza con el status y el cuerpo", async () => {
    stubEnv({ SITE_URL: "https://merylay.shop", PDF_RENDER_SECRET: "secreto-real" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("mensaje de error", { status: 500 })));
    const { generarPdfTabla } = await import("./pdf-render.ts");

    await expect(generarPdfTabla("Informe", [], [])).rejects.toThrow(/500/);
  });
});

describe("generarPdfTarjetas", () => {
  it("manda tipo 'tarjetas' con todos los campos", async () => {
    stubEnv({ SITE_URL: "https://merylay.shop", PDF_RENDER_SECRET: "secreto-real" });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfTarjetas } = await import("./pdf-render.ts");

    await generarPdfTarjetas("INFORME", "SUB", "https://x/hero.jpg", [{ valor: "1", etiqueta: "PRODUCTOS" }], [
      { fotoUrl: null, nombre: "Producto", pills: [], precio: 1000 },
    ]);

    const cuerpoEnviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpoEnviado.tipo).toBe("tarjetas");
    expect(cuerpoEnviado.fotoHeroUrl).toBe("https://x/hero.jpg");
    expect(cuerpoEnviado.tarjetas).toHaveLength(1);
  });
});
