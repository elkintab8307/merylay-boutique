import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("obtenerOCrearSesion", () => {
  it("devuelve la sesion existente si ya hay una fila con ese telefono", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { id: "sesion-1", session_data: { cart: [], pendingConfirmation: null } },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      })),
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerOCrearSesion } = await import("./sessions.ts");
    const resultado = await obtenerOCrearSesion("573001234567", "perfil-1");

    expect(resultado.id).toBe("sesion-1");
    expect(resultado.sessionData).toEqual({ cart: [], pendingConfirmation: null });
  });

  it("crea una sesion nueva y vacia si no existe ninguna", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const single = vi.fn(async () => ({
      data: { id: "sesion-nueva", session_data: { cart: [], pendingConfirmation: null } },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
      })),
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerOCrearSesion } = await import("./sessions.ts");
    const resultado = await obtenerOCrearSesion("573001234567", "perfil-1");

    expect(resultado.id).toBe("sesion-nueva");
  });
});

describe("guardarSesion", () => {
  it("actualiza session_data y last_interaction de la sesion", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => ({ eq })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarSesion } = await import("./sessions.ts");
    await guardarSesion("sesion-1", { cart: [], pendingConfirmation: null });

    expect(eq).toHaveBeenCalledWith("id", "sesion-1");
  });
});
