// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

function crearSupabaseMock(venta: { id: string } | null) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: venta, error: null }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, _spies: { select, eq, order, limit, maybeSingle } };
}

describe("reimprimirUltimoRecibo", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(getCurrentProfile).mockReset();
    vi.mocked(redirect).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesion activa: retorna error sin consultar la base de datos", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const supabase = crearSupabaseMock(null);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reimprimirUltimoRecibo } = await import("../reimprimir-action");
    const resultado = await reimprimirUltimoRecibo();

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("vendedor sin ventas registradas: retorna error", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: "staff-1",
      email: "a@b.com",
      profile: { id: "staff-1", role: "staff" } as never,
    });
    const supabase = crearSupabaseMock(null);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reimprimirUltimoRecibo } = await import("../reimprimir-action");
    const resultado = await reimprimirUltimoRecibo();

    expect(resultado).toEqual({ error: expect.any(String) });
  });

  it("vendedor con ventas: filtra por su staff_id y redirige al recibo con ?print=1", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: "staff-1",
      email: "a@b.com",
      profile: { id: "staff-1", role: "staff" } as never,
    });
    const supabase = crearSupabaseMock({ id: "sale-uuid-9" });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reimprimirUltimoRecibo } = await import("../reimprimir-action");
    await expect(reimprimirUltimoRecibo()).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.from).toHaveBeenCalledWith("pos_sales");
    expect(supabase._spies.eq).toHaveBeenCalledWith("staff_id", "staff-1");
    expect(redirect).toHaveBeenCalledWith("/pos/venta/sale-uuid-9?print=1");
  });
});
