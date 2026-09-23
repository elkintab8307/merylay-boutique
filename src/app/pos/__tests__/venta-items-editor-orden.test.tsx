import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../product-browser", () => ({
  ProductBrowser: () => <div data-testid="buscador-productos" />,
}));
vi.mock("../cliente-selector", () => ({
  ClienteSelector: () => <div data-testid="cliente" />,
}));

import { VentaItemsEditor } from "../venta-items-editor";

const onGuardar = vi.fn();

function paneles() {
  const buscador = screen.getByTestId("buscador-productos").parentElement as HTMLElement;
  const resumen = screen.getByRole("heading", { name: "Venta actual" })
    .parentElement as HTMLElement;
  return { buscador, resumen };
}

describe("VentaItemsEditor — orden en movil", () => {
  it("por defecto los productos van primero y el resumen despues (como siempre)", () => {
    render(<VentaItemsEditor textoBoton="Guardar" textoBotonEnviando="..." onGuardar={onGuardar} />);
    const { buscador, resumen } = paneles();

    // \b para no confundir "order-" con la clase "border-..." del borde.
    expect(buscador.className).not.toMatch(/\border-/);
    expect(resumen.className).not.toMatch(/\border-/);
  });

  it("con resumenPrimeroEnMovil el resumen sube arriba en movil y en escritorio no cambia", () => {
    render(
      <VentaItemsEditor
        resumenPrimeroEnMovil
        textoBoton="Guardar"
        textoBotonEnviando="..."
        onGuardar={onGuardar}
      />,
    );
    const { buscador, resumen } = paneles();

    // En movil (una columna) el resumen va antes; desde md vuelve al orden
    // natural del DOM (productos a la izquierda, resumen a la derecha).
    expect(resumen.className).toMatch(/\border-1\b/);
    expect(resumen.className).toMatch(/\bmd:order-none\b/);
    expect(buscador.className).toMatch(/\border-2\b/);
    expect(buscador.className).toMatch(/\bmd:order-none\b/);
  });
});
