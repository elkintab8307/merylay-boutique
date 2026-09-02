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

const SIN_ESPERA = { esperaReintentoMs: 0 };

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

  it("reintenta hasta 3 veces una subida que falla por red y termina subiendola", async () => {
    upload
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: null });

    const resultado = await subirImagenesProductoCliente([foto("a.jpg")], SIN_ESPERA);

    expect(upload).toHaveBeenCalledTimes(3);
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
      { nombre: "pijama-frente.jpg", motivo: expect.stringContaining("Payload too large") },
    ]);
  });

  it("una imagen que falla no impide que las demas se suban", async () => {
    upload.mockImplementation(async (path: string, file: File) =>
      file.name === "mala.jpg"
        ? { error: { message: "boom" } }
        : { error: null },
    );

    const resultado = await subirImagenesProductoCliente(
      [foto("mala.jpg"), foto("buena.jpg")],
      SIN_ESPERA,
    );

    expect(upload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: "buena.jpg" }));
    expect(resultado.urls).toHaveLength(1);
    expect(resultado.fallos).toEqual([
      { nombre: "mala.jpg", motivo: expect.any(String) },
    ]);
  });

  it("reporta el fallo cuando la compresion lanza y no intenta subir esa imagen", async () => {
    vi.mocked(comprimirImagen).mockImplementation(async (file) => {
      if (file.name === "foto.heic") {
        throw new Error("No se pudo procesar «foto.heic» — usa una foto en formato JPG o PNG.");
      }
      return file;
    });

    const resultado = await subirImagenesProductoCliente(
      [foto("foto.heic"), foto("ok.jpg")],
      SIN_ESPERA,
    );

    expect(upload).toHaveBeenCalledTimes(1);
    expect(resultado.urls).toHaveLength(1);
    expect(resultado.fallos).toEqual([
      { nombre: "foto.heic", motivo: expect.stringContaining("No se pudo procesar") },
    ]);
  });

  it("con la lista vacia no hace nada", async () => {
    const resultado = await subirImagenesProductoCliente([], SIN_ESPERA);
    expect(upload).not.toHaveBeenCalled();
    expect(resultado).toEqual({ urls: [], fallos: [] });
  });
});
