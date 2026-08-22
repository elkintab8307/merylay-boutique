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
    const resultado = await registrarVenta([], "efectivo", 0, null, null);

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("venta normal sin cliente: envia p_customer_id null y los campos de credito en null/0", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "efectivo", 0, null, null),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "efectivo",
        p_customer_id: null,
        p_credit_num_cuotas: null,
        p_credit_abono_inicial: 0,
        p_credit_abono_metodo: null,
      }),
    );
  });

  it("venta normal con cliente: envia p_customer_id", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "efectivo", 0, null, "cust-1"),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({ p_customer_id: "cust-1" }),
    );
  });

  it("credito sin cliente: rechaza sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(
      ITEMS,
      "credito",
      0,
      { numCuotas: 3, abonoInicial: 0, abonoInicialMetodo: null },
      null,
    );

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito con abono inicial > 0 sin metodo, rechaza sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(
      ITEMS,
      "credito",
      0,
      { numCuotas: 3, abonoInicial: 20000, abonoInicialMetodo: null },
      "cust-1",
    );

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito valido: llama al RPC con customerId y los campos de credito, y redirige", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(
        ITEMS,
        "credito",
        0,
        { numCuotas: 3, abonoInicial: 20000, abonoInicialMetodo: "efectivo" },
        "cust-1",
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "credito",
        p_customer_id: "cust-1",
        p_credit_num_cuotas: 3,
        p_credit_abono_inicial: 20000,
        p_credit_abono_metodo: "efectivo",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/pos/venta/sale-uuid-1");
  });
});
