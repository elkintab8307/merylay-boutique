import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProductoForm } from "../producto-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  createProducto: vi.fn(),
  updateProducto: vi.fn(),
  deleteProductImage: vi.fn(),
  setPrimaryProductImage: vi.fn(),
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
          compareAtPrice: null,
          costPrice: null,
          stock: 5,
          isActive: true,
          isFeatured: false,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, stock: 1 },
            { talla: "M", color: "Rosa", priceOverride: null, stock: 2 },
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

  it("envia las imagenes de cada variante en el indice correcto al guardar", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});

    render(
      <ProductoForm
        defaultValues={{
          name: "Pijama de prueba",
          slug: "pijama-de-prueba",
          description: "",
          categoryId: null,
          price: 10000,
          compareAtPrice: null,
          costPrice: null,
          stock: 5,
          isActive: true,
          isFeatured: false,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, stock: 1 },
            { talla: "L", color: "Rosa", priceOverride: null, stock: 2 },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );

    const inputsDeVariante = screen.getAllByLabelText(/imágenes de esta variante/i);
    const archivoVarianteL = new File(["contenido"], "variante-l.jpg", { type: "image/jpeg" });
    fireEvent.change(inputsDeVariante[1], { target: { files: [archivoVarianteL] } });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(createProducto).toHaveBeenCalled();
    });

    const llamada = vi.mocked(createProducto).mock.calls[0];
    const variantImageFilesArg = llamada[2];
    expect(variantImageFilesArg[0]).toEqual([]);
    expect(variantImageFilesArg[1]).toEqual([archivoVarianteL]);
  });
});
