// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function crearSupabaseMock(
  profileId: string | null = null,
  rpcResults: Record<string, unknown> = {},
) {
  const single = vi.fn(() =>
    Promise.resolve({ data: { id: "cust-1", nombre: "Ana", telefono: "3001234567" }, error: null }),
  );
  const insertSelect = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  const from = vi.fn((table: string) => {
    if (table === "pos_customers") return { insert };
    return {};
  });
  const rpc = vi.fn((fnName: string) => {
    if (fnName === "buscar_profile_por_telefono") {
      return Promise.resolve({ data: profileId, error: null });
    }
    if (fnName in rpcResults) {
      return Promise.resolve(rpcResults[fnName] as { data: unknown; error: unknown });
    }
    return Promise.resolve({ data: null, error: null });
  });
  return { from, rpc, _spies: { insert, insertSelect, single, rpc } };
}

describe("buscarClientes", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con query vacio, retorna [] sin consultar la base de datos", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarClientes } = await import("../customer-actions");
    const resultado = await buscarClientes("   ");

    expect(resultado).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("busca clientes unificados (POS + portal) via listar_clientes_pos y mapea el resultado", async () => {
    const supabase = crearSupabaseMock(null, {
      listar_clientes_pos: {
        data: [
          { origen: "pos", id: "cust-1", profile_id: null, nombre: "Ana Ruiz", telefono: "3001234567" },
          { origen: "portal", id: "profile-9", profile_id: "profile-9", nombre: "Luisa Gómez", telefono: "3007654321" },
        ],
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarClientes } = await import("../customer-actions");
    const resultado = await buscarClientes("Ana");

    expect(supabase.rpc).toHaveBeenCalledWith("listar_clientes_pos", {
      p_query: "Ana",
      p_limit: 10,
    });
    expect(resultado).toEqual([
      { id: "cust-1", nombre: "Ana Ruiz", telefono: "3001234567", origen: "pos", profileId: null },
      { id: "profile-9", nombre: "Luisa Gómez", telefono: "3007654321", origen: "portal", profileId: "profile-9" },
    ]);
  });
});

describe("crearCliente", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza nombre vacio sin llamar a la base de datos", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { crearCliente } = await import("../customer-actions");
    const resultado = await crearCliente("", "3001234567");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rechaza telefono invalido (menos de 7 digitos) sin llamar a la base de datos", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { crearCliente } = await import("../customer-actions");
    const resultado = await crearCliente("Ana", "123");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("normaliza el telefono y vincula profile_id si el RPC encuentra coincidencia", async () => {
    const supabase = crearSupabaseMock("profile-9");
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { crearCliente } = await import("../customer-actions");
    await crearCliente("Ana Ruiz", "300 123 4567");

    expect(supabase.rpc).toHaveBeenCalledWith("buscar_profile_por_telefono", {
      p_telefono: "3001234567",
    });
    expect(supabase._spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Ana Ruiz",
        telefono: "3001234567",
        profile_id: "profile-9",
      }),
    );
  });

  it("sin coincidencia del RPC, crea el cliente con profile_id null", async () => {
    const supabase = crearSupabaseMock(null);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { crearCliente } = await import("../customer-actions");
    const resultado = await crearCliente("Ana Ruiz", "3001234567");

    expect(supabase._spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: null }),
    );
    expect(resultado).toEqual({
      cliente: { id: "cust-1", nombre: "Ana", telefono: "3001234567" },
    });
  });
});

describe("vincularClientePortal", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("vincula el cliente del portal via el RPC y retorna el pos_customer resultante", async () => {
    const supabase = crearSupabaseMock(null, {
      vincular_cliente_portal: {
        data: { id: "cust-9", nombre: "Luisa Gómez", telefono: "3007654321" },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { vincularClientePortal } = await import("../customer-actions");
    const resultado = await vincularClientePortal("profile-9");

    expect(supabase.rpc).toHaveBeenCalledWith("vincular_cliente_portal", {
      p_profile_id: "profile-9",
    });
    expect(resultado).toEqual({
      cliente: { id: "cust-9", nombre: "Luisa Gómez", telefono: "3007654321" },
    });
  });

  it("propaga el error si el RPC falla", async () => {
    const supabase = crearSupabaseMock(null, {
      vincular_cliente_portal: {
        data: null,
        error: { message: "Este cliente no tiene un telefono valido registrado." },
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { vincularClientePortal } = await import("../customer-actions");
    const resultado = await vincularClientePortal("profile-9");

    expect(resultado).toEqual({
      error: "Este cliente no tiene un telefono valido registrado.",
    });
  });
});
