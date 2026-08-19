// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LocalCartItem } from "@/lib/cart/local-cart";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const ITEMS: LocalCartItem[] = [
  {
    productId: "prod-1",
    variantId: null,
    slug: "pijama",
    name: "Pijama Rosa",
    unitPrice: 50000,
    qty: 2,
    imageUrl: null,
    stock: 10,
  },
];

function crearSupabaseMock() {
  const rpc = vi.fn(() => Promise.resolve({ data: { id: "sale-uuid-1" }, error: null }));
  return { rpc };
}

describe("registrarVenta", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(redirect).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza una venta sin productos sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta([], "efectivo", 0, null);

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("venta normal (no credito): envia los campos de credito en null/0 aunque llegue un objeto credito", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "efectivo", 0, {
        clienteNombre: "Ana",
        clienteTelefono: "3001234567",
        numCuotas: 3,
        abonoInicial: 0,
        abonoInicialMetodo: null,
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "efectivo",
        p_credit_customer_name: null,
        p_credit_customer_phone: null,
        p_credit_num_cuotas: null,
        p_credit_abono_inicial: 0,
        p_credit_abono_metodo: null,
      }),
    );
  });

  it("credito: rechaza datos invalidos (sin nombre de cliente) sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(ITEMS, "credito", 0, {
      clienteNombre: "",
      clienteTelefono: "3001234567",
      numCuotas: 3,
      abonoInicial: 0,
      abonoInicialMetodo: null,
    });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito: con abono inicial > 0 sin metodo, rechaza sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(ITEMS, "credito", 0, {
      clienteNombre: "Ana",
      clienteTelefono: "3001234567",
      numCuotas: 3,
      abonoInicial: 20000,
      abonoInicialMetodo: null,
    });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito valido: llama al RPC con los campos de credito y redirige", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "credito", 0, {
        clienteNombre: "Ana Ruiz",
        clienteTelefono: "3001234567",
        numCuotas: 3,
        abonoInicial: 20000,
        abonoInicialMetodo: "efectivo",
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "credito",
        p_credit_customer_name: "Ana Ruiz",
        p_credit_customer_phone: "3001234567",
        p_credit_num_cuotas: 3,
        p_credit_abono_inicial: 20000,
        p_credit_abono_metodo: "efectivo",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/pos/venta/sale-uuid-1");
  });
});
