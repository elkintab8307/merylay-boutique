// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function crearSupabaseMock(profileId: string | null = null) {
  const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const or = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ or }));
  const single = vi.fn(() =>
    Promise.resolve({ data: { id: "cust-1", nombre: "Ana", telefono: "3001234567" }, error: null }),
  );
  const insertSelect = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  const from = vi.fn((table: string) => {
    if (table === "pos_customers") return { select, insert };
    return { select };
  });
  const rpc = vi.fn(() => Promise.resolve({ data: profileId, error: null }));
  return { from, rpc, _spies: { select, or, limit, insert, insertSelect, single, rpc } };
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
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("busca por nombre o telefono con ilike", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarClientes } = await import("../customer-actions");
    await buscarClientes("Ana");

    expect(supabase.from).toHaveBeenCalledWith("pos_customers");
    expect(supabase._spies.or).toHaveBeenCalledWith(
      expect.stringContaining("nombre.ilike.%Ana%"),
    );
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
