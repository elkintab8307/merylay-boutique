import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function peticion(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://merylay.shop/api/pdf/render", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("POST /api/pdf/render", () => {
  it("sin PDF_RENDER_SECRET configurado, rechaza con 500 sin intentar renderizar", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "");
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }));

    expect(respuesta.status).toBe(500);
  });

  it("con un secreto incorrecto, rechaza con 403", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }, { "x-pdf-render-secret": "incorrecto" }));

    expect(respuesta.status).toBe(403);
  });

  it("con tipo desconocido, rechaza con 400 sin intentar renderizar", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "otra-cosa" }, { "x-pdf-render-secret": "secreto-real" }));

    expect(respuesta.status).toBe(400);
  });

  it("con tipo 'tabla' y secreto correcto, renderiza y devuelve el PDF", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const paginaMock = { setContent: vi.fn(async () => {}), evaluate: vi.fn(async () => 1000), pdf: vi.fn(async () => new Uint8Array([1, 2, 3])) };
    const navegadorMock = { newPage: vi.fn(async () => paginaMock), close: vi.fn(async () => {}) };
    vi.doMock("puppeteer", () => ({ default: { launch: vi.fn(async () => navegadorMock) } }));
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "Informe", encabezados: ["A"], filas: [["1"]] }, { "x-pdf-render-secret": "secreto-real" }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Type")).toBe("application/pdf");
    expect(paginaMock.setContent).toHaveBeenCalledWith(expect.stringContaining("Informe"), expect.anything());
    expect(navegadorMock.close).toHaveBeenCalled();
  });

  it("el logo se arma con el origen de la propia peticion, sin depender de SITE_URL", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    vi.stubEnv("SITE_URL", "");
    const paginaMock = { setContent: vi.fn(async () => {}), evaluate: vi.fn(async () => 1000), pdf: vi.fn(async () => new Uint8Array([1])) };
    const navegadorMock = { newPage: vi.fn(async () => paginaMock), close: vi.fn(async () => {}) };
    vi.doMock("puppeteer", () => ({ default: { launch: vi.fn(async () => navegadorMock) } }));
    const { POST } = await import("./route");

    await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }, { "x-pdf-render-secret": "secreto-real" }));

    expect(paginaMock.setContent).toHaveBeenCalledWith(
      expect.stringContaining("https://merylay.shop/brand/logo-principal.png"),
      expect.anything(),
    );
  });

  it("con tipo 'tarjetas', renderiza usando plantillaTarjetas", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const paginaMock = { setContent: vi.fn(async () => {}), evaluate: vi.fn(async () => 1000), pdf: vi.fn(async () => new Uint8Array([1])) };
    const navegadorMock = { newPage: vi.fn(async () => paginaMock), close: vi.fn(async () => {}) };
    vi.doMock("puppeteer", () => ({ default: { launch: vi.fn(async () => navegadorMock) } }));
    const { POST } = await import("./route");

    const respuesta = await POST(
      peticion({ tipo: "tarjetas", titulo: "INFORME", subtitulo: "SUB", fotoHeroUrl: null, estadisticas: [], tarjetas: [] }, { "x-pdf-render-secret": "secreto-real" }),
    );

    expect(respuesta.status).toBe(200);
    expect(paginaMock.setContent).toHaveBeenCalledWith(expect.stringContaining("INFORME"), expect.anything());
  });

  it("en Vercel, lanza puppeteer-core con @sparticuz/chromium usando el preset 'shell' recomendado por el paquete", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    vi.stubEnv("VERCEL", "1");
    const paginaMock = { setContent: vi.fn(async () => {}), evaluate: vi.fn(async () => 1000), pdf: vi.fn(async () => new Uint8Array([1])) };
    const navegadorMock = { newPage: vi.fn(async () => paginaMock), close: vi.fn(async () => {}) };
    const launchMock = vi.fn(async () => navegadorMock);
    const defaultArgsMock = vi.fn(() => ["--arg-por-defecto"]);
    vi.doMock("puppeteer-core", () => ({ launch: launchMock, defaultArgs: defaultArgsMock }));
    vi.doMock("@sparticuz/chromium", () => ({
      default: { args: ["--chromium-arg"], executablePath: vi.fn(async () => "/tmp/chromium") },
    }));
    const { POST } = await import("./route");

    await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }, { "x-pdf-render-secret": "secreto-real" }));

    expect(defaultArgsMock).toHaveBeenCalledWith(expect.objectContaining({ args: ["--chromium-arg"], headless: "shell" }));
    expect(launchMock).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["--arg-por-defecto"], executablePath: "/tmp/chromium", headless: "shell" }),
    );
  });

  it("si Puppeteer lanza, devuelve 500 y cierra el navegador si llego a abrirse", async () => {
    vi.stubEnv("PDF_RENDER_SECRET", "secreto-real");
    const navegadorMock = { newPage: vi.fn(async () => { throw new Error("fallo de renderizado"); }), close: vi.fn(async () => {}) };
    vi.doMock("puppeteer", () => ({ default: { launch: vi.fn(async () => navegadorMock) } }));
    const { POST } = await import("./route");

    const respuesta = await POST(peticion({ tipo: "tabla", titulo: "x", encabezados: [], filas: [] }, { "x-pdf-render-secret": "secreto-real" }));

    expect(respuesta.status).toBe(500);
    expect(navegadorMock.close).toHaveBeenCalled();
  });
});
