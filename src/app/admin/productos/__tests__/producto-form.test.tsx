import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProductoForm } from "../producto-form";

const routerPush = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

vi.mock("../actions", () => ({
  createProducto: vi.fn(),
  updateProducto: vi.fn(),
  deleteProductImage: vi.fn(),
  setPrimaryProductImage: vi.fn(),
  toggleImagenVendida: vi.fn(),
}));

vi.mock("@/lib/admin/upload-product-images-client", () => ({
  subirImagenesProductoCliente: vi.fn(),
}));

const defaultValuesBase = {
  name: "Pijama de prueba",
  slug: "pijama-de-prueba",
  description: "",
  categoryId: null,
  price: 10000,
  promoPrice: null,
  costPrice: null,
  stock: 5,
  isActive: true,
  isFeatured: false,
  variantes: [],
} as const;

async function subirMock() {
  const mod = await import("@/lib/admin/upload-product-images-client");
  return vi.mocked(mod.subirImagenesProductoCliente);
}

describe("ProductoForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el mensaje de error cuando dos variantes tienen la misma talla y color", async () => {
    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
            { talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Dos variantes generan el mismo código interno — revisa que la talla y el color no sean iguales o equivalentes entre ellas.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("sube las imagenes de cada variante y envia las URLs en el indice correcto al guardar", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});
    (await subirMock()).mockImplementation(async (files, opts) => {
      const urls = files.map((f) => `https://storage.test/${f.name}`);
      files.forEach((f, i) => opts?.onEstado?.(f, "ok", { url: urls[i] }));
      return { urls, fallos: [] };
    });

    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
            { talla: "L", color: "Rosa", priceOverride: null, nuevaColeccion: false },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );

    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[1], {
      target: { files: [new File(["c"], "variante-l.jpg", { type: "image/jpeg" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(createProducto).toHaveBeenCalled());

    const variantImageUrlsArg = vi.mocked(createProducto).mock.calls[0][2];
    expect(variantImageUrlsArg[0]).toEqual([]);
    expect(variantImageUrlsArg[1]).toEqual(["https://storage.test/variante-l.jpg"]);
  });

  it("sin onGuardado, navega a /admin/productos al guardar", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});
    (await subirMock()).mockResolvedValue({ urls: [], fallos: [] });

    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/admin/productos"));
  });

  it("con onGuardado, lo llama en vez de navegar al guardar", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});
    (await subirMock()).mockResolvedValue({ urls: [], fallos: [] });
    const onGuardado = vi.fn();

    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
        onGuardado={onGuardado}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("cuando falla la subida de una variante, muestra la variante, el archivo, la causa y que hacer, y no guarda", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});
    (await subirMock()).mockImplementation(async (files, opts) => {
      const mala = files.find((f) => f.name === "mala.png");
      if (mala) {
        opts?.onEstado?.(mala, "error", { motivo: "Failed to fetch" });
        return {
          urls: [],
          fallos: [
            { file: mala, nombre: "mala.png", motivo: "Failed to fetch", sePasoASegundoPlano: false },
          ],
        };
      }
      const urls = files.map((f) => `https://storage.test/${f.name}`);
      files.forEach((f, i) => opts?.onEstado?.(f, "ok", { url: urls[i] }));
      return { urls, fallos: [] };
    });

    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
            { talla: "L", color: "Rosa", priceOverride: null, nuevaColeccion: false },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );

    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[1], {
      target: { files: [new File(["x"], "mala.png", { type: "image/png" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(screen.getByText(/Variante 2 \(Talla L \/ Rosa\)/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/mala\.png/)).toBeInTheDocument();
    expect(screen.getByText(/conexión/i)).toBeInTheDocument();
    expect(screen.getByText(/señal|wifi/i)).toBeInTheDocument();
    expect(createProducto).not.toHaveBeenCalled();
  });

  it("al reintentar solo re-sube las imagenes que fallaron y conserva las que ya subieron", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});

    let llamada = 0;
    (await subirMock()).mockImplementation(async (files, opts) => {
      llamada += 1;
      const nombres = files.map((f) => f.name);
      if (llamada === 1) {
        expect(nombres).toEqual(["a.jpg", "b.jpg"]);
        const a = files[0];
        opts?.onEstado?.(a, "ok", { url: "https://storage.test/a.jpg" });
        opts?.onEstado?.(files[1], "error", { motivo: "network" });
        return {
          urls: ["https://storage.test/a.jpg"],
          fallos: [
            { file: files[1], nombre: "b.jpg", motivo: "network", sePasoASegundoPlano: false },
          ],
        };
      }
      expect(nombres).toEqual(["b.jpg"]);
      opts?.onEstado?.(files[0], "ok", { url: "https://storage.test/b.jpg" });
      return { urls: ["https://storage.test/b.jpg"], fallos: [] };
    });

    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
      />,
    );

    const inputGeneral = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(inputGeneral, {
      target: {
        files: [
          new File(["a"], "a.jpg", { type: "image/jpeg" }),
          new File(["b"], "b.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(screen.getByText(/b\.jpg/)).toBeInTheDocument());
    expect(createProducto).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(createProducto).toHaveBeenCalled());

    expect(vi.mocked(createProducto).mock.calls[0][1]).toEqual([
      "https://storage.test/a.jpg",
      "https://storage.test/b.jpg",
    ]);
  });

  it("muestra el chulo verde en la miniatura de una imagen que ya se subio", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});
    (await subirMock()).mockImplementation(async (files, opts) => {
      const buena = files.find((f) => f.name === "buena.jpg");
      const mala = files.find((f) => f.name === "mala.jpg");
      if (buena) opts?.onEstado?.(buena, "ok", { url: "https://storage.test/buena.jpg" });
      if (mala) opts?.onEstado?.(mala, "error", { motivo: "network" });
      return {
        urls: buena ? ["https://storage.test/buena.jpg"] : [],
        fallos: mala
          ? [{ file: mala, nombre: "mala.jpg", motivo: "network", sePasoASegundoPlano: false }]
          : [],
      };
    });

    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
      />,
    );

    const inputGeneral = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(inputGeneral, {
      target: {
        files: [
          new File(["1"], "buena.jpg", { type: "image/jpeg" }),
          new File(["2"], "mala.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(screen.getByRole("status", { name: /subida correcta/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("status", { name: /no se pudo subir/i })).toBeInTheDocument();
  });

  it("con variantes muestra el stock calculado de solo lectura y no el input", () => {
    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
            { talla: "L", color: "Rosa", priceOverride: null, nuevaColeccion: false },
          ],
        }}
        categoriasDisponibles={[]}
        imagenesExistentes={[
          { id: "i1", url: "u1", is_primary: true, variant_id: "v1", vendida: false },
          { id: "i2", url: "u2", is_primary: false, variant_id: "v1", vendida: true },
          { id: "i3", url: "u3", is_primary: false, variant_id: "v2", vendida: false },
        ]}
      />,
    );

    // 2 fotos no vendidas de variante => "2 unidades"
    expect(screen.getByText(/2 unidades/)).toBeInTheDocument();
    expect(screen.getByText(/se calcula solo/i)).toBeInTheDocument();
    expect(document.querySelector("#stock")).not.toBeInTheDocument();
  });

  it("sin variantes muestra el input de stock editable", () => {
    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
      />,
    );
    expect(document.querySelector("#stock")).toBeInTheDocument();
  });

  it("con una variante en Nueva Coleccion activa, el checkbox aparece marcado", () => {
    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: /nueva colección/i });
    expect(checkbox).toBeChecked();
  });

  it("muestra el texto de expiracion para una variante que ya vencio", () => {
    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { id: "v1", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
          ],
        }}
        categoriasDisponibles={[]}
        nuevaColeccionInfoPorVariante={{ v1: { expiroHaceDias: 3 } }}
      />,
    );
    expect(screen.getByText(/expiró hace 3 días/i)).toBeInTheDocument();
  });
});
