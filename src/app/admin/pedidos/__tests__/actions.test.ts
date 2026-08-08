// @vitest-environment node
//
// Se fuerza el entorno "node" porque `actions.ts` es un Server Action real
// (usa `cookies()` de next/headers via `createClient()`), igual que el
// Route Handler de Wompi en `route.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { enviarCorreo } from "@/lib/email/resend";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Mockeado para que las pruebas nunca disparen una llamada de red real a
// Resend y para poder verificar con quien/que asunto se intento enviar
// el correo de cambio de estado.
vi.mock("@/lib/email/resend", () => ({
  enviarCorreo: vi.fn(),
}));

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  update: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  single: () => Promise<{ data?: unknown; error?: unknown }>;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

// Builder encadenable y "thenable" que imita lo suficiente del query builder
// de supabase-js para los caminos que usa `cambiarEstadoPedido`:
// select().eq().single() (estado actual) y update().eq() (awaited
// directamente, sin metodo terminal).
function crearQueryBuilder(resultado: { data?: unknown; error?: unknown }) {
  const eq = vi.fn();
  const select = vi.fn();
  const update = vi.fn();
  const single = vi.fn(() => Promise.resolve(resultado));

  const builder = {} as QueryBuilder;
  builder.select = vi.fn((...args: unknown[]) => {
    select(...args);
    return builder;
  });
  builder.update = vi.fn((...args: unknown[]) => {
    update(...args);
    return builder;
  });
  builder.eq = vi.fn((...args: unknown[]) => {
    eq(...args);
    return builder;
  });
  builder.single = single;
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(resultado).then(resolve, reject);

  return { builder, eq, select, update, single };
}

function crearSupabaseMock(opts: {
  estadoActualResultado?: { data: unknown; error?: unknown };
  updateResultado?: { error: unknown };
}) {
  const selectQuery = crearQueryBuilder(opts.estadoActualResultado ?? { data: null, error: null });
  const updateQuery = crearQueryBuilder(opts.updateResultado ?? { error: null });

  const from = vi.fn(() => ({
    select: (...args: unknown[]) => selectQuery.builder.select(...args),
    update: (...args: unknown[]) => updateQuery.builder.update(...args),
  }));

  return { from, selectQuery, updateQuery };
}

function crearAdminMock(opts: {
  pedidoResultado?: { data: unknown; error?: unknown };
  usuarioResultado?: { data: { user: { email?: string } | null }; error?: unknown };
}) {
  const pedidoQuery = crearQueryBuilder(opts.pedidoResultado ?? { data: null, error: null });

  const from = vi.fn(() => ({
    select: (...args: unknown[]) => pedidoQuery.builder.select(...args),
  }));

  const getUserById = vi.fn(() =>
    Promise.resolve(opts.usuarioResultado ?? { data: { user: null }, error: null }),
  );
  const auth = { admin: { getUserById } };

  return { from, auth, pedidoQuery };
}

describe("cambiarEstadoPedido", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(requireAdmin).mockResolvedValue({
      profile: { role: "admin" },
    } as never);
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(enviarCorreo).mockReset();
    vi.mocked(enviarCorreo).mockResolvedValue({ id: "email-test-id" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("estado invalido: no toca la base de datos ni envia correo", async () => {
    const { cambiarEstadoPedido } = await import("../actions");
    const resultado = await cambiarEstadoPedido("order-1", "no-es-un-estado");

    expect(resultado.error).toBeDefined();
    expect(createClient).not.toHaveBeenCalled();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it(
    "transicion REAL a un estado notificable ('enviado', antes 'pagado'): " +
      "actualiza el pedido y envia el correo",
    async () => {
      const supabase = crearSupabaseMock({
        estadoActualResultado: { data: { status: "pagado" }, error: null },
        updateResultado: { error: null },
      });
      vi.mocked(createClient).mockResolvedValue(supabase as never);

      const admin = crearAdminMock({
        pedidoResultado: {
          data: { id: "order-1", order_number: "ML-1", user_id: "user-1" },
          error: null,
        },
        usuarioResultado: { data: { user: { email: "cliente@example.com" } }, error: null },
      });
      vi.mocked(createAdminClient).mockReturnValue(admin as never);

      const { cambiarEstadoPedido } = await import("../actions");
      const resultado = await cambiarEstadoPedido("order-1", "enviado");

      expect(resultado.error).toBeUndefined();
      expect(supabase.updateQuery.update).toHaveBeenCalledWith({ status: "enviado" });
      expect(enviarCorreo).toHaveBeenCalledTimes(1);
      expect(enviarCorreo).toHaveBeenCalledWith(
        expect.objectContaining({ to: "cliente@example.com", subject: expect.stringContaining("ML-1") }),
      );
    },
  );

  it(
    "transicion SIN CAMBIO REAL (el pedido ya estaba 'enviado' y se vuelve a " +
      "aplicar 'enviado', p. ej. doble clic): actualiza el pedido pero NO " +
      "envia un segundo correo",
    async () => {
      const supabase = crearSupabaseMock({
        estadoActualResultado: { data: { status: "enviado" }, error: null },
        updateResultado: { error: null },
      });
      vi.mocked(createClient).mockResolvedValue(supabase as never);

      const admin = crearAdminMock({});
      vi.mocked(createAdminClient).mockReturnValue(admin as never);

      const { cambiarEstadoPedido } = await import("../actions");
      const resultado = await cambiarEstadoPedido("order-1", "enviado");

      expect(resultado.error).toBeUndefined();
      // El update SI debe seguir ejecutandose (comportamiento existente,
      // sin condicionar): re-aplicar el mismo estado no es un error.
      expect(supabase.updateQuery.update).toHaveBeenCalledWith({ status: "enviado" });
      // Pero al no haber transicion real, no se busca al cliente ni se envia correo.
      expect(admin.from).not.toHaveBeenCalled();
      expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
      expect(enviarCorreo).not.toHaveBeenCalled();
    },
  );

  it("transicion real pero a un estado NO notificable ('pagado'): no envia correo", async () => {
    const supabase = crearSupabaseMock({
      estadoActualResultado: { data: { status: "pendiente" }, error: null },
      updateResultado: { error: null },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const admin = crearAdminMock({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { cambiarEstadoPedido } = await import("../actions");
    const resultado = await cambiarEstadoPedido("order-1", "pagado");

    expect(resultado.error).toBeUndefined();
    expect(supabase.updateQuery.update).toHaveBeenCalledWith({ status: "pagado" });
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("error al actualizar el pedido: retorna error y no envia correo", async () => {
    const supabase = crearSupabaseMock({
      estadoActualResultado: { data: { status: "pagado" }, error: null },
      updateResultado: { error: { message: "timeout" } },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const admin = crearAdminMock({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { cambiarEstadoPedido } = await import("../actions");
    const resultado = await cambiarEstadoPedido("order-1", "enviado");

    expect(resultado.error).toBeDefined();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });
});
