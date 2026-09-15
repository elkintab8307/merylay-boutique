import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("../comprimir-imagen", () => ({ comprimirImagen: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { comprimirImagen } from "../comprimir-imagen";
import { subirImagenesProductoCliente } from "../upload-product-images-client";

const upload = vi.fn();
const getPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://storage.test/${path}` },
}));

const SIN_ESPERA = { esperaReintentoMs: 0, pausaEntreImagenesMs: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockReturnValue({
    storage: { from: () => ({ upload, getPublicUrl }) },
  } as unknown as ReturnType<typeof createClient>);
  vi.mocked(comprimirImagen).mockImplementation(async (file) => file);
  upload.mockResolvedValue({ error: null });
});

function foto(nombre: string) {
  return new File(["bytes"], nombre, { type: "image/jpeg" });
}

describe("subirImagenesProductoCliente", () => {
  it("comprime y sube cada imagen, devolviendo una URL por archivo y sin fallos", async () => {
    const resultado = await subirImagenesProductoCliente(
      [foto("a.jpg"), foto("b.jpg")],
      SIN_ESPERA,
    );

    expect(comprimirImagen).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(resultado.urls).toHaveLength(2);
    expect(resultado.fallos).toEqual([]);
  });

  it("reintenta hasta 5 veces una subida que falla por red y termina subiendola", async () => {
    upload
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: null });

    const resultado = await subirImagenesProductoCliente([foto("a.jpg")], SIN_ESPERA);

    expect(upload).toHaveBeenCalledTimes(5);
    expect(resultado.urls).toHaveLength(1);
    expect(resultado.fallos).toEqual([]);
  });

  it("reporta el fallo con el nombre del archivo y el motivo real cuando se agotan los reintentos", async () => {
    upload.mockResolvedValue({ error: { message: "Payload too large" } });

    const resultado = await subirImagenesProductoCliente(
      [foto("pijama-frente.jpg")],
      SIN_ESPERA,
    );

    expect(resultado.urls).toEqual([]);
    expect(resultado.fallos).toEqual([
      expect.objectContaining({
        nombre: "pijama-frente.jpg",
        motivo: expect.stringContaining("Payload too large"),
        sePasoASegundoPlano: false,
      }),
    ]);
  });

  it("marca el fallo cuando la pestana paso a segundo plano durante la subida", async () => {
    upload.mockImplementation(async () => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      return { error: { message: "Failed to fetch" } };
    });

    const resultado = await subirImagenesProductoCliente([foto("x.jpg")], SIN_ESPERA);

    expect(resultado.fallos).toEqual([
      expect.objectContaining({ nombre: "x.jpg", sePasoASegundoPlano: true }),
    ]);

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  it("una imagen que falla no impide que las demas se suban", async () => {
    upload.mockImplementation(async (_path: string, file: File) =>
      file.name === "mala.jpg" ? { error: { message: "boom" } } : { error: null },
    );

    const resultado = await subirImagenesProductoCliente(
      [foto("mala.jpg"), foto("buena.jpg")],
      SIN_ESPERA,
    );

    expect(upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "buena.jpg" }),
    );
    expect(resultado.urls).toHaveLength(1);
    expect(resultado.fallos).toEqual([
      expect.objectContaining({ nombre: "mala.jpg", motivo: expect.any(String) }),
    ]);
  });

  it("con la lista vacia no hace nada", async () => {
    const resultado = await subirImagenesProductoCliente([], SIN_ESPERA);
    expect(upload).not.toHaveBeenCalled();
    expect(resultado).toEqual({ urls: [], fallos: [] });
  });

  it("informa el progreso de cada imagen: comprimiendo -> subiendo -> ok", async () => {
    const eventos: Array<[string, string]> = [];
    const a = foto("a.jpg");

    await subirImagenesProductoCliente([a], {
      ...SIN_ESPERA,
      onEstado: (file, estado) => eventos.push([file.name, estado]),
    });

    expect(eventos).toEqual([
      ["a.jpg", "comprimiendo"],
      ["a.jpg", "subiendo"],
      ["a.jpg", "ok"],
    ]);
  });

  it("informa estado 'error' con el motivo cuando una imagen no se puede subir", async () => {
    upload.mockResolvedValue({ error: { message: "Failed to fetch" } });
    const eventos: Array<{ nombre: string; estado: string; motivo?: string }> = [];

    await subirImagenesProductoCliente([foto("x.jpg")], {
      ...SIN_ESPERA,
      onEstado: (file, estado, detalle) =>
        eventos.push({ nombre: file.name, estado, motivo: detalle?.motivo }),
    });

    expect(eventos.at(-1)).toEqual({
      nombre: "x.jpg",
      estado: "error",
      motivo: expect.stringContaining("Failed to fetch"),
    });
  });

  it("si la compresion devuelve el archivo original igual lo sube", async () => {
    const original = foto("captura.png");
    vi.mocked(comprimirImagen).mockResolvedValue(original);

    const resultado = await subirImagenesProductoCliente([original], SIN_ESPERA);

    expect(upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "captura.png" }),
    );
    expect(resultado.urls).toHaveLength(1);
  });
});
