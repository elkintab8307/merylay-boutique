import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSupabaseClientForTests } from "../_shared/db.ts";

function mockSupabase(overrides: Record<string, unknown> = {}) {
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: "perfil-nuevo-123" } }, error: null })),
        updateUserById: vi.fn(async () => ({ data: {}, error: null })),
        getUserById: vi.fn(async () => ({ data: { user: { email: "573001234567@merylay.local" } } })),
      },
    },
    ...overrides,
  };
}

vi.mock("../_shared/db.ts", () => ({
  getSupabase: vi.fn(),
  resetSupabaseClientForTests: vi.fn(),
}));

describe("normalizarTelefono", () => {
  it("deja solo los digitos, sin importar el formato de entrada", async () => {
    const { normalizarTelefono } = await import("./customers.ts");
    expect(normalizarTelefono("+57 300 123 4567")).toBe("573001234567");
    expect(normalizarTelefono("573001234567")).toBe("573001234567");
  });
});

describe("buscarOCrearCliente", () => {
  beforeEach(() => {
    resetSupabaseClientForTests();
  });

  it("reusa el perfil si buscar_profile_por_telefono ya encuentra uno", async () => {
    const supabase = mockSupabase({ rpc: vi.fn(async () => ({ data: "perfil-existente-456", error: null })) });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarOCrearCliente } = await import("./customers.ts");
    const resultado = await buscarOCrearCliente("573001234567");

    expect(resultado).toEqual({ profileId: "perfil-existente-456", esNuevo: false });
    expect(supabase.rpc).toHaveBeenCalledWith("buscar_profile_por_telefono", { p_telefono: "573001234567" });
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("crea una cuenta con el email sintetico si no existe ningun perfil", async () => {
    const supabase = mockSupabase();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarOCrearCliente } = await import("./customers.ts");
    const resultado = await buscarOCrearCliente("573001234567");

    expect(resultado).toEqual({ profileId: "perfil-nuevo-123", esNuevo: true });
    expect(supabase.auth.admin.createUser).toHaveBeenCalledWith({
      email: "573001234567@merylay.local",
      email_confirm: true,
      user_metadata: { whatsapp: "573001234567" },
    });
  });
});

describe("generarAccesoWeb", () => {
  it("genera una contrasena nueva y la devuelve junto al email sintetico como usuario", async () => {
    const supabase = mockSupabase();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarAccesoWeb } = await import("./customers.ts");
    const resultado = await generarAccesoWeb("573001234567@merylay.local".split("@")[0] as string);

    expect(resultado.usuario).toBe("573001234567");
    expect(resultado.contrasena).toHaveLength(10);
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalled();
  });
});
