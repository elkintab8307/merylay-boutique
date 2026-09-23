import { beforeEach, describe, expect, it, vi } from "vitest";
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
const actualizarVenta = vi.fn();
vi.mock("../actions", () => ({
  actualizarVenta: (...args: unknown[]) => actualizarVenta(...args),
}));

import { EditarVentaForm } from "../editar-venta-form";

const base = {
  saleId: "venta-1",
  itemsIniciales: [],
  discountInicial: 0,
  clienteInicial: null,
};

beforeEach(() => {
  editorProps.mockClear();
  actualizarVenta.mockClear();
});

describe("EditarVentaForm", () => {
  it("en una venta normal no muestra aviso de credito y deja el editor como siempre", () => {
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

  it("en ambos casos el resumen va primero en movil (venta normal y credito)", () => {
    const { unmount } = render(<EditarVentaForm {...base} paymentMethodInicial="efectivo" />);
    expect(editorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ resumenPrimeroEnMovil: true }),
    );
    unmount();

    render(
      <EditarVentaForm
        {...base}
        paymentMethodInicial="credito"
        credito={{ abonado: 0, saldo: 100 }}
      />,
    );
    expect(editorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ resumenPrimeroEnMovil: true }),
    );
  });

  it("al guardar manda el destino elegido a actualizarVenta (recibo por defecto)", () => {
    render(<EditarVentaForm {...base} paymentMethodInicial="efectivo" />);
    const { onGuardar } = editorProps.mock.calls[0][0] as {
      onGuardar: (...args: unknown[]) => unknown;
    };

    onGuardar([], "efectivo", 0, null, "c1");

    expect(actualizarVenta).toHaveBeenCalledWith("venta-1", [], "efectivo", 0, "c1", "recibo");
  });

  it("con destino 'credito' vuelve al credito al guardar", () => {
    render(
      <EditarVentaForm
        {...base}
        paymentMethodInicial="credito"
        credito={{ abonado: 0, saldo: 100 }}
        destino="credito"
      />,
    );
    const { onGuardar } = editorProps.mock.calls[0][0] as {
      onGuardar: (...args: unknown[]) => unknown;
    };

    onGuardar([], "credito", 0, null, "c1");

    expect(actualizarVenta).toHaveBeenCalledWith("venta-1", [], "credito", 0, "c1", "credito");
  });
});
