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
            { talla: "M", color: "Rosa", priceOverride: null },
            { talla: "M", color: "Rosa", priceOverride: null },
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

  it("sube las imagenes de cada variante desde el navegador y envia las URLs en el indice correcto al guardar", async () => {
    const { createProducto } = await import("../actions");
    const { subirImagenesProductoCliente } = await import(
      "@/lib/admin/upload-product-images-client"
    );
    vi.mocked(createProducto).mockResolvedValue({});
    vi.mocked(subirImagenesProductoCliente).mockImplementation(async (files) => ({
      urls: files.map((f) => `https://storage.test/${f.name}`),
      fallos: [],
    }));

    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null },
            { talla: "L", color: "Rosa", priceOverride: null },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );

    const inputsDeVariante = document.querySelectorAll('input[type="file"]');
    const archivoVarianteL = new File(["contenido"], "variante-l.jpg", { type: "image/jpeg" });
    fireEvent.change(inputsDeVariante[1], { target: { files: [archivoVarianteL] } });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(createProducto).toHaveBeenCalled();
    });

    const llamada = vi.mocked(createProducto).mock.calls[0];
    const variantImageUrlsArg = llamada[2];
    expect(variantImageUrlsArg[0]).toEqual([]);
    expect(variantImageUrlsArg[1]).toEqual(["https://storage.test/variante-l.jpg"]);
  });

  it("sin onGuardado, navega a /admin/productos al guardar (comportamiento por defecto)", async () => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    const { createProducto } = await import("../actions");
    const { subirImagenesProductoCliente } = await import(
      "@/lib/admin/upload-product-images-client"
    );
    vi.mocked(createProducto).mockResolvedValue({});
    vi.mocked(subirImagenesProductoCliente).mockResolvedValue({ urls: [], fallos: [] });

    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith("/admin/productos");
    });
  });

  it("con onGuardado, lo llama en vez de navegar al guardar", async () => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    const { createProducto } = await import("../actions");
    const { subirImagenesProductoCliente } = await import(
      "@/lib/admin/upload-product-images-client"
    );
    vi.mocked(createProducto).mockResolvedValue({});
    vi.mocked(subirImagenesProductoCliente).mockResolvedValue({ urls: [], fallos: [] });

    const onGuardado = vi.fn();

    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
        onGuardado={onGuardado}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(onGuardado).toHaveBeenCalled();
    });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("cuando falla la subida de una variante, muestra el error con la etiqueta de la variante y el nombre del archivo, y no guarda el producto", async () => {
    const { createProducto } = await import("../actions");
    const { subirImagenesProductoCliente } = await import(
      "@/lib/admin/upload-product-images-client"
    );
    vi.mocked(createProducto).mockResolvedValue({});
    vi.mocked(subirImagenesProductoCliente).mockImplementation(async (files) =>
      files.some((f) => f.name === "mala.jpg")
        ? { urls: [], fallos: [{ nombre: "mala.jpg", motivo: "Payload too large" }] }
        : { urls: files.map((f) => `https://storage.test/${f.name}`), fallos: [] },
    );

    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null },
            { talla: "L", color: "Rosa", priceOverride: null },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );

    const inputsDeVariante = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputsDeVariante[1], {
      target: { files: [new File(["x"], "mala.jpg", { type: "image/jpeg" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Variante 2 \(Talla L \/ Rosa\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/mala\.jpg/)).toBeInTheDocument();
    expect(createProducto).not.toHaveBeenCalled();
  });

  it("al reintentar solo re-sube las imagenes que habian fallado y conserva las que ya subieron", async () => {
    const { createProducto } = await import("../actions");
    const { subirImagenesProductoCliente } = await import(
      "@/lib/admin/upload-product-images-client"
    );
    vi.mocked(createProducto).mockResolvedValue({});

    let llamada = 0;
    vi.mocked(subirImagenesProductoCliente).mockImplementation(async (files) => {
      llamada += 1;
      const nombres = files.map((f) => f.name);
      if (llamada === 1) {
        expect(nombres).toEqual(["a.jpg", "b.jpg"]);
        return {
          urls: ["https://storage.test/a.jpg"],
          fallos: [{ nombre: "b.jpg", motivo: "network" }],
        };
      }
      expect(nombres).toEqual(["b.jpg"]);
      return { urls: ["https://storage.test/b.jpg"], fallos: [] };
    });

    render(
      <ProductoForm
        defaultValues={{ ...defaultValuesBase, variantes: [] }}
        categoriasDisponibles={[]}
      />,
    );

    const inputGeneral = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(inputGeneral, {
      target: {
        files: [
          new File(["a"], "a.jpg", { type: "image/jpeg" }),
          new File(["b"], "b.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(screen.getByText(/b\.jpg/)).toBeInTheDocument();
    });
    expect(createProducto).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(createProducto).toHaveBeenCalled();
    });
    const imageUrlsArg = vi.mocked(createProducto).mock.calls[0][1];
    expect(imageUrlsArg).toEqual([
      "https://storage.test/a.jpg",
      "https://storage.test/b.jpg",
    ]);
  });
});
