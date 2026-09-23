import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// El editor real trae el buscador de productos y varias server actions; aqui
// solo interesa QUE props recibe segun sea una venta normal o un credito.
const editorProps = vi.fn();
vi.mock("@/app/pos/venta-items-editor", () => ({
  VentaItemsEditor: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="editor" />;
  },
}));
vi.mock("../actions", () => ({ actualizarVenta: vi.fn() }));

import { EditarVentaForm } from "../editar-venta-form";

const base = {
  saleId: "venta-1",
  itemsIniciales: [],
  discountInicial: 0,
  clienteInicial: null,
};

describe("EditarVentaForm", () => {
  it("en una venta normal no muestra aviso de credito y deja el editor como siempre", () => {
    editorProps.mockClear();
    render(<EditarVentaForm {...base} paymentMethodInicial="efectivo" />);

    expect(screen.queryByText(/abonado/i)).not.toBeInTheDocument();
    expect(editorProps).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodInicial: "efectivo",
        permitirCredito: false,
        mostrarMetodoPago: true,
        clienteObligatorio: false,
      }),
    );
  });

  it("en un credito fija el metodo, exige cliente y muestra abonado y saldo", () => {
    editorProps.mockClear();
    render(
      <EditarVentaForm
        {...base}
        paymentMethodInicial="credito"
        credito={{ abonado: 40000, saldo: 60000 }}
      />,
    );

    expect(editorProps).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodInicial: "credito",
        permitirCredito: false,
        mostrarMetodoPago: false,
        clienteObligatorio: true,
      }),
    );
    const aviso = screen.getByRole("note");
    expect(aviso).toHaveTextContent(/abonado/i);
    expect(aviso).toHaveTextContent(/40\.000/);
    expect(aviso).toHaveTextContent(/60\.000/);
    expect(aviso).toHaveTextContent(/cuotas pendientes/i);
  });
});
