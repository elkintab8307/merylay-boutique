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

describe("cargarHistorial", () => {
  function mockHistorial(filas: unknown[] | null, error: unknown = null) {
    const limit = vi.fn(async () => ({ data: filas, error }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) };
    return { supabase, select, eq, order, limit };
  }

  it("devuelve los ultimos mensajes del telefono, del mas viejo al mas nuevo, sin el mensaje entrante actual", async () => {
    // La consulta trae del mas nuevo al mas viejo (desc + limit).
    const { supabase, eq, order, limit } = mockHistorial([
      { direction: "inbound", message_body: "agrega la talla M", provider_message_id: "wamid.actual" },
      { direction: "outbound", message_body: "1. Bata [productId:p1]", provider_message_id: null },
      { direction: "inbound", message_body: "busco batas", provider_message_id: "wamid.viejo" },
    ]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { cargarHistorial } = await import("./sessions.ts");
    const historial = await cargarHistorial("573001234567", "wamid.actual");

    expect(eq).toHaveBeenCalledWith("phone_number", "573001234567");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(11);
    expect(historial).toEqual([
      { direction: "inbound", message_body: "busco batas" },
      { direction: "outbound", message_body: "1. Bata [productId:p1]" },
    ]);
  });

  it("devuelve como maximo 10 mensajes y descarta los que no tienen texto", async () => {
    const filas = Array.from({ length: 11 }, (_, i) => ({
      direction: i % 2 === 0 ? "inbound" : "outbound",
      message_body: i === 3 ? null : `m${i}`,
      provider_message_id: null,
    }));
    const { supabase } = mockHistorial(filas);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { cargarHistorial } = await import("./sessions.ts");
    const historial = await cargarHistorial("573001234567");

    expect(historial.length).toBe(9);
    expect(historial[historial.length - 1].message_body).toBe("m0");
    expect(historial.some((m) => m.message_body === "m10")).toBe(false);
  });

  it("devuelve un historial vacio (sin lanzar) si la consulta falla", async () => {
    const { supabase } = mockHistorial(null, { message: "fallo" });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { cargarHistorial } = await import("./sessions.ts");
    expect(await cargarHistorial("573001234567")).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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
