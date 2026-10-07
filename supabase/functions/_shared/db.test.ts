import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getSupabase", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        SUPABASE_URL: "https://proyecto.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba",
      } as Record<string, string>)[key]) },
    });
  });

  it("devuelve la misma instancia en llamadas sucesivas (memoizado)", async () => {
    const { getSupabase } = await import("./db.ts");
    const a = getSupabase();
    const b = getSupabase();
    expect(a).toBe(b);
  });

  it("lanza un error claro si falta SUPABASE_SERVICE_ROLE_KEY", async () => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => (key === "SUPABASE_URL" ? "https://proyecto.supabase.co" : undefined)) },
    });
    const { getSupabase } = await import("./db.ts");
    expect(() => getSupabase()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
