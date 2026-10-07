import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "../[orderId]/page";

const WOMPI_PUBLIC_KEY_ORIGINAL = process.env.WOMPI_PUBLIC_KEY;

// Restaura la variable de entorno tras cada test para que el valor
// asignado aqui no se filtre a otros tests (ni entre los de este archivo).
afterEach(() => {
  if (WOMPI_PUBLIC_KEY_ORIGINAL === undefined) {
    delete process.env.WOMPI_PUBLIC_KEY;
  } else {
    process.env.WOMPI_PUBLIC_KEY = WOMPI_PUBLIC_KEY_ORIGINAL;
  }
  vi.unstubAllEnvs();
});

vi.mock("../../../wompi-checkout-button", () => ({
  WompiCheckoutButton: (props: Record<string, unknown>) => (
    <div data-testid="boton-wompi">{JSON.stringify(props)}</div>
  ),
}));

describe("Pagina de pago Wompi desde WhatsApp", () => {
  it("renderiza el boton de Wompi con los datos de la URL", async () => {
    process.env.WOMPI_PUBLIC_KEY = "pub_test_123";

    const Componente = await Page({
      params: Promise.resolve({ orderId: "pedido-1" }),
      searchParams: Promise.resolve({ ref: "ML-20261006-abc123", amount: "150000", currency: "COP", sig: "firma-de-prueba" }),
    });
    render(Componente);

    const boton = screen.getByTestId("boton-wompi");
    expect(boton.textContent).toContain("pedido-1");
    expect(boton.textContent).toContain("ML-20261006-abc123");
    expect(boton.textContent).toContain("pub_test_123");
  });

  it("muestra un mensaje de error si falta algun dato en la URL", async () => {
    const Componente = await Page({
      params: Promise.resolve({ orderId: "pedido-1" }),
      searchParams: Promise.resolve({ ref: "ML-20261006-abc123" }),
    });
    render(Componente);

    expect(screen.getByText(/no está disponible/i)).toBeInTheDocument();
  });

  it("muestra un mensaje de error si amount no es numerico", async () => {
    process.env.WOMPI_PUBLIC_KEY = "pub_test_123";

    const Componente = await Page({
      params: Promise.resolve({ orderId: "pedido-1" }),
      searchParams: Promise.resolve({
        ref: "ML-20261006-abc123",
        amount: "abc",
        currency: "COP",
        sig: "firma-de-prueba",
      }),
    });
    render(Componente);

    expect(screen.getByText(/no está disponible/i)).toBeInTheDocument();
  });
});
