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

  it("devuelve un File JPEG redimensionado a partir de la foto original", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(["jpeg-bytes"], { type: "image/jpeg" }));
    });

    const original = new File(["png-bytes"], "IMG_0001.PNG", { type: "image/png" });
    const resultado = await comprimirImagen(original, { ladoMaximo: 1600 });

    expect(resultado).toBeInstanceOf(File);
    expect(resultado.type).toBe("image/jpeg");
    expect(resultado.name).toBe("IMG_0001.jpg");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
  });

  it("lanza un error claro con el nombre del archivo cuando el navegador no puede decodificar la imagen", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported")),
    );

    const original = new File(["heic-bytes"], "foto.heic", { type: "image/heic" });

    await expect(comprimirImagen(original)).rejects.toThrow(/foto\.heic/);
  });
});
