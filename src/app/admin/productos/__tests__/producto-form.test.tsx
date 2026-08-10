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
        screen.getByText("Ya existe una variante con esa talla y color."),
      ).toBeInTheDocument();
    });
  });
});
