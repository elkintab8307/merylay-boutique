import { describe, expect, it, vi, afterEach } from "vitest";
import { calcularDimensiones, comprimirImagen } from "../comprimir-imagen";

describe("calcularDimensiones", () => {
  it("no cambia una imagen que ya cabe dentro del maximo", () => {
    expect(calcularDimensiones(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("reduce una imagen horizontal para que el lado largo sea el maximo", () => {
    expect(calcularDimensiones(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("reduce una imagen vertical para que el lado largo sea el maximo", () => {
    expect(calcularDimensiones(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("redondea a enteros el lado que no es el maximo", () => {
    expect(calcularDimensiones(2000, 1333, 1600)).toEqual({ width: 1600, height: 1066 });
  });
});

describe("comprimirImagen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mockCanvas(blob: Blob | null) {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      cb: BlobCallback,
    ) {
      cb(blob);
    });
  }

  it("devuelve un File JPEG redimensionado cuando el navegador puede procesar la imagen", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }),
    );
    mockCanvas(new Blob(["x".repeat(1000)], { type: "image/jpeg" }));

    const original = new File(["y".repeat(2_000_000)], "IMG_0001.PNG", {
      type: "image/png",
    });
    const resultado = await comprimirImagen(original, { ladoMaximo: 1280 });

    expect(resultado.type).toBe("image/jpeg");
    expect(resultado.name).toBe("IMG_0001.jpg");
    expect(resultado.size).toBeLessThan(original.size);
  });

  it("NO lanza: devuelve el archivo original si el navegador no puede decodificar la imagen", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported")),
    );

    const original = new File(["z".repeat(2_000_000)], "foto.heic", {
      type: "image/heic",
    });
    const resultado = await comprimirImagen(original);

    expect(resultado).toBe(original);
  });

  it("devuelve el archivo original si toBlob no produce nada (memoria insuficiente)", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }),
    );
    mockCanvas(null);

    const original = new File(["z".repeat(2_000_000)], "captura.png", {
      type: "image/png",
    });
    const resultado = await comprimirImagen(original);

    expect(resultado).toBe(original);
  });

  it("devuelve el archivo original sin tocar el decodificador si ya es pequeno", async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    const original = new File(["chico"], "mini.jpg", { type: "image/jpeg" });
    const resultado = await comprimirImagen(original, { omitirDebajoDeBytes: 100_000 });

    expect(resultado).toBe(original);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("devuelve el original si la version comprimida terminaria pesando mas", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }),
    );
    mockCanvas(new Blob(["x".repeat(5_000_000)], { type: "image/jpeg" }));

    const original = new File(["y".repeat(1_000_000)], "grande.png", {
      type: "image/png",
    });
    const resultado = await comprimirImagen(original);

    expect(resultado).toBe(original);
  });
});
