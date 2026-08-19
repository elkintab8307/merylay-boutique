// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function crearSupabaseMock(opts: {
  usuario?: { id: string } | null;
  perfilResultado?: { data: unknown; error?: unknown };
  updateResultado?: { error: unknown };
  upsertResultado?: { error: unknown };
}) {
  const usuario = "usuario" in opts ? opts.usuario : { id: "user-1" };
  const getUser = vi.fn().mockResolvedValue({
    data: { user: usuario },
  });

  // profiles: actualizarPerfil usa .update().eq(); guardarResena usa
  // .select().eq().single() para leer el full_name antes del upsert.
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(opts.updateResultado ?? { error: null }),
  });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        opts.perfilResultado ?? { data: { full_name: "Maria Perez" }, error: null },
      ),
    }),
  });
  const upsert = vi.fn().mockResolvedValue(opts.upsertResultado ?? { error: null });

  const from = vi.fn((tabla: string) => {
    if (tabla === "profiles") return { update, select };
    if (tabla === "reviews") return { upsert };
    throw new Error(`Tabla no mockeada: ${tabla}`);
  });

  return { auth: { getUser }, from, update, select, upsert };
}

describe("actualizarPerfil", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(revalidatePath).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  const datos = {
    fullName: "Maria Perez",
    whatsapp: "3001234567",
    address: "Calle 10 # 20-30",
  };

  it("sin sesion: retorna error y no toca la base", async () => {
    const supabase = crearSupabaseMock({ usuario: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { actualizarPerfil } = await import("../actions");
    const resultado = await actualizarPerfil(datos);

    expect(resultado.error).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("con sesion: actualiza el perfil del usuario actual", async () => {
    const supabase = crearSupabaseMock({});
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { actualizarPerfil } = await import("../actions");
    const resultado = await actualizarPerfil(datos);

    expect(resultado.error).toBeUndefined();
    expect(supabase.update).toHaveBeenCalledWith({
      full_name: "Maria Perez",
      whatsapp: "3001234567",
      address: "Calle 10 # 20-30",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/cuenta");
  });

  it("datos invalidos: retorna error sin tocar la base", async () => {
    const supabase = crearSupabaseMock({});
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { actualizarPerfil } = await import("../actions");
    const resultado = await actualizarPerfil({ ...datos, fullName: "A" });

    expect(resultado.error).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("guardarResena", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(revalidatePath).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  const datos = { rating: 5, body: "Excelente atencion y productos." };

  it("sin sesion: retorna error y no toca la base", async () => {
    const supabase = crearSupabaseMock({ usuario: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { guardarResena } = await import("../actions");
    const resultado = await guardarResena(datos);

    expect(resultado.error).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("con sesion: hace upsert con is_active en false, sin importar si es nueva o edicion", async () => {
    const supabase = crearSupabaseMock({});
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { guardarResena } = await import("../actions");
    const resultado = await guardarResena(datos);

    expect(resultado.error).toBeUndefined();
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        rating: 5,
        body: "Excelente atencion y productos.",
        is_active: false,
      }),
      { onConflict: "user_id" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/cuenta");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("error de la base: retorna error legible", async () => {
    const supabase = crearSupabaseMock({
      upsertResultado: { error: { message: "constraint violation" } },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { guardarResena } = await import("../actions");
    const resultado = await guardarResena(datos);

    expect(resultado.error).toBe("No se pudo guardar tu reseña.");
  });
});
