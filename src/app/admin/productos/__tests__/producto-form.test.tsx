import { describe, expect, it, vi } from "vitest";
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
}));

vi.mock("@/lib/admin/upload-product-images-client", () => ({
  subirImagenesProductoCliente: vi.fn(),
}));

describe("ProductoForm", () => {
  it("muestra el mensaje de error cuando dos variantes tienen la misma talla y color", async () => {
    render(
      <ProductoForm
        defaultValues={{
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
    vi.mocked(subirImagenesProductoCliente).mockImplementation(async (files) =>
      files.length === 0
        ? { urls: [] }
        : { urls: files.map((f) => `https://storage.test/${f.name}`) },
    );

    render(
      <ProductoForm
        defaultValues={{
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
    vi.mocked(subirImagenesProductoCliente).mockResolvedValue({ urls: [] });

    render(
      <ProductoForm
        defaultValues={{
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
        }}
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
    vi.mocked(subirImagenesProductoCliente).mockResolvedValue({ urls: [] });

    const onGuardado = vi.fn();

    render(
      <ProductoForm
        defaultValues={{
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
        }}
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
});
