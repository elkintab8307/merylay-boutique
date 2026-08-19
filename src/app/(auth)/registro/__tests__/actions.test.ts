// @vitest-environment node
//
// Server Action real (usa cookies() de next/headers via createClient()),
// igual patron que admin/pedidos/__tests__/actions.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/email/resend";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  enviarCorreo: vi.fn(),
}));

const datosBase = {
  fullName: "Maria Perez",
  whatsapp: "3001234567",
  address: "Calle 10 # 20-30",
  password: "secreta1",
  confirmPassword: "secreta1",
};

describe("registro", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(enviarCorreo).mockReset();
    vi.mocked(enviarCorreo).mockResolvedValue({ id: "email-test-id" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con email real: usa auth.signUp y envia el correo de bienvenida", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "t" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado).toEqual({ success: true });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "maria@example.com",
        password: "secreta1",
        options: {
          data: {
            full_name: "Maria Perez",
            address: "Calle 10 # 20-30",
            whatsapp: "3001234567",
          },
        },
      }),
    );
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({ to: "maria@example.com" }),
    );
  });

  it("sin email: crea el usuario con el admin client y lo deja con sesion iniciada, sin enviar correo", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { createUser } },
    } as never);

    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: "user-2" }, session: { access_token: "t" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro(datosBase);

    expect(resultado).toEqual({ success: true });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "3001234567@merylay.local",
        password: "secreta1",
        email_confirm: true,
        user_metadata: {
          full_name: "Maria Perez",
          address: "Calle 10 # 20-30",
          whatsapp: "3001234567",
        },
      }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "3001234567@merylay.local",
      password: "secreta1",
    });
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("sin email, whatsapp ya registrado: retorna error legible", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { createUser } },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro(datosBase);

    expect(resultado.error).toBe("Ya existe una cuenta con ese WhatsApp.");
  });

  it("con email ya registrado: retorna error legible", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado.error).toBe("Ya existe una cuenta con ese correo electrónico.");
  });

  it("un fallo al preparar el correo de bienvenida no rompe el registro", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "t" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);
    vi.mocked(enviarCorreo).mockRejectedValue(new Error("fallo de red"));

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado).toEqual({ success: true });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[email]"),
      expect.any(Error),
    );
  });

  it("con email, registro pendiente de confirmacion (sin sesion): tambien envia el correo de bienvenida", async () => {
    // Con confirmacion de email activada, `signUp` no devuelve sesion. La
    // cuenta igualmente se creo, asi que la bienvenida debe salir.
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado.message).toEqual(expect.any(String));
    expect(resultado.success).toBeUndefined();
    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({ to: "maria@example.com" }),
    );
  });

  it("con email, otro error de signUp (no relacionado con 'already registered'): NO envia correo", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Database connection failed" },
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado.error).toBe("No pudimos crear tu cuenta. Intenta de nuevo.");
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("datos invalidos: no llama a signUp/createUser ni envia correo", async () => {
    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, confirmPassword: "otra123" });

    expect(resultado.error).toEqual(expect.any(String));
    expect(createClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });
});
