// @vitest-environment node
//
// Entorno "node": esta Server Action solo ejercita logica de servidor
// (validacion + cliente de Supabase + disparo del correo), no necesita el DOM
// de jsdom.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { enviarCorreo } from "@/lib/email/resend";
import { BienvenidaEmail } from "@/lib/email/templates/bienvenida-email";
import type { RegistroInput } from "@/lib/validation/auth";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mockeado para que las pruebas nunca disparen una llamada de red real a
// Resend (que ocurriria si `RESEND_API_KEY` esta presente en el entorno de
// pruebas) y para poder verificar a quien/con que asunto se envia el correo.
// Mismo patron que `api/webhooks/wompi/__tests__/route.test.ts`.
vi.mock("@/lib/email/resend", () => ({
  enviarCorreo: vi.fn(),
}));

const DATOS_REGISTRO: RegistroInput = {
  fullName: "Mery Lay",
  email: "cliente@example.com",
  password: "secreta123",
  confirmPassword: "secreta123",
};

function crearSupabaseMock(
  resultado: { data: { session: unknown }; error: { message: string } | null },
) {
  const signUp = vi.fn(() => Promise.resolve(resultado));
  return { auth: { signUp } };
}

describe("registro", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(enviarCorreo).mockReset();
    vi.mocked(enviarCorreo).mockResolvedValue({ id: "email-test-id" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registro con sesion inmediata: envia el correo de bienvenida a la direccion registrada", async () => {
    const supabase = crearSupabaseMock({
      data: { session: { access_token: "token" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registro } = await import("../actions");
    const resultado = await registro(DATOS_REGISTRO);

    expect(resultado).toEqual({ success: true });
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "cliente@example.com",
        subject: expect.stringContaining("Bienvenida"),
      }),
    );
    const [argumentos] = vi.mocked(enviarCorreo).mock.calls[0];
    expect(argumentos.react.type).toBe(BienvenidaEmail);
    expect(argumentos.react.props).toEqual(
      expect.objectContaining({ nombre: "Mery Lay" }),
    );
  });

  it("registro pendiente de confirmacion por correo (sin sesion): tambien envia el correo de bienvenida", async () => {
    // Con confirmacion de email activada, `signUp` no devuelve sesion. La
    // cuenta igualmente se creo, asi que la bienvenida debe salir.
    const supabase = crearSupabaseMock({ data: { session: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registro } = await import("../actions");
    const resultado = await registro(DATOS_REGISTRO);

    expect(resultado.message).toEqual(expect.any(String));
    expect(resultado.success).toBeUndefined();
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({ to: "cliente@example.com" }),
    );
  });

  it("correo ya registrado: NO envia correo de bienvenida (la cuenta no se creo en esta llamada)", async () => {
    // Sin este chequeo, quien intente registrarse con un correo existente
    // recibiria una bienvenida por una cuenta que no acaba de crear —
    // ademas de confirmarle a un tercero que esa direccion ya tiene cuenta.
    const supabase = crearSupabaseMock({
      data: { session: null },
      error: { message: "User already registered" },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registro } = await import("../actions");
    const resultado = await registro(DATOS_REGISTRO);

    expect(resultado.error).toEqual(expect.any(String));
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("otro error de signUp: NO envia correo de bienvenida", async () => {
    const supabase = crearSupabaseMock({
      data: { session: null },
      error: { message: "Database connection failed" },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registro } = await import("../actions");
    const resultado = await registro(DATOS_REGISTRO);

    expect(resultado.error).toEqual(expect.any(String));
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("datos invalidos: no llama a signUp ni envia correo", async () => {
    const supabase = crearSupabaseMock({ data: { session: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registro } = await import("../actions");
    const resultado = await registro({ ...DATOS_REGISTRO, confirmPassword: "otra123" });

    expect(resultado.error).toEqual(expect.any(String));
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("un fallo inesperado al enviar el correo no convierte un registro exitoso en un error para el usuario", async () => {
    // `enviarCorreo` no lanza por dentro, pero el flujo no debe depender de
    // eso: la cuenta YA quedo creada cuando se dispara el correo.
    const supabase = crearSupabaseMock({
      data: { session: { access_token: "token" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(enviarCorreo).mockRejectedValue(new Error("fallo inesperado de red"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { registro } = await import("../actions");
    const resultado = await registro(DATOS_REGISTRO);

    expect(resultado).toEqual({ success: true });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[email]"),
      expect.any(Error),
    );
  });
});
