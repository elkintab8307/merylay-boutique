import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("cargarMemoria", () => {
  it("devuelve los hechos del cliente, pidiendo los mas recientes primero", async () => {
    const order = vi.fn(async () => ({
      data: [
        { categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" },
        { categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" },
      ],
      error: null,
    }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { cargarMemoria } = await import("./memory.ts");
    const resultado = await cargarMemoria("perfil-1");

    expect(eq).toHaveBeenCalledWith("customer_id", "perfil-1");
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(resultado).toEqual([
      { categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" },
      { categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" },
    ]);
  });

  it("devuelve una lista vacia (sin lanzar) si la consulta falla", async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: "fallo" } }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { cargarMemoria } = await import("./memory.ts");
    expect(await cargarMemoria("perfil-1")).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("guardarMemoria", () => {
  function mockUpsert() {
    const upsert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ upsert })) };
    return { supabase, upsert };
  }

  it("hace upsert de los hechos validos, con onConflict customer_id,clave", async () => {
    const { supabase, upsert } = mockUpsert();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }]);

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ customer_id: "perfil-1", categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" })],
      { onConflict: "customer_id,clave" },
    );
  });

  it("descarta hechos con una clave fuera del vocabulario conocido", async () => {
    const { supabase, upsert } = mockUpsert();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", [
      { categoria: "preferencia", clave: "talla", valor: "M" },
      { categoria: "preferencia", clave: "talla_preferida", valor: "M" },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ clave: "talla_preferida" })],
      { onConflict: "customer_id,clave" },
    );
  });

  it("descarta hechos con valor vacio o solo espacios", async () => {
    const { supabase, upsert } = mockUpsert();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "   " }]);

    expect(upsert).not.toHaveBeenCalled();
  });

  it("no llama a la base de datos si no queda ningun hecho valido", async () => {
    const { getSupabase } = await import("../_shared/db.ts");
    const getSupabaseMock = getSupabase as unknown as ReturnType<typeof vi.fn>;
    getSupabaseMock.mockClear();

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", []);

    expect(getSupabaseMock).not.toHaveBeenCalled();
  });

  it("registra el error en consola si el upsert falla, sin lanzar", async () => {
    const upsert = vi.fn(async () => ({ error: { message: "fallo" } }));
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { guardarMemoria } = await import("./memory.ts");
    await expect(guardarMemoria("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }])).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("guardarNota", () => {
  it("inserta una fila con categoria nota, origen dueño, y una clave nueva", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarNota } = await import("./memory.ts");
    await guardarNota("perfil-1", "es mayorista, paga con transferencia");

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: "perfil-1",
      categoria: "nota",
      origen: "dueño",
      valor: "es mayorista, paga con transferencia",
      clave: expect.stringMatching(/^nota_\d+$/),
    }));
  });

  it("lanza un error si la insercion falla (a diferencia de guardarMemoria, esta SI debe fallar visiblemente)", async () => {
    const insert = vi.fn(async () => ({ error: { message: "fallo de red" } }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarNota } = await import("./memory.ts");
    await expect(guardarNota("perfil-1", "nota")).rejects.toThrow(/fallo de red/);
  });
});
