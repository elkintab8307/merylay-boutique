import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("consultarStockBajo", () => {
  it("lista los productos activos con stock por debajo del umbral", async () => {
    const lt = vi.fn(async () => ({
      data: [{ name: "Pijama Rosa", stock: 2 }, { name: "Bata Dorada", stock: 0 }],
      error: null,
    }));
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ lt })) })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarStockBajo } = await import("./owner-actions.ts");
    const resultado = await consultarStockBajo(5);

    expect(resultado).toContain("Pijama Rosa: 2");
    expect(resultado).toContain("Bata Dorada: 0");
  });
});

const UUID = "33333333-3333-4333-8333-333333333333";

// Mock de supabase.from(tabla).update(valores).eq(col, val).select("id").
function mockUpdate(filasActualizadas: unknown[] | null, error: unknown = null) {
  const select = vi.fn(async () => ({ data: filasActualizadas, error }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const or = vi.fn();
  const supabase = { from: vi.fn(() => ({ update, or })) };
  return { supabase, update, eq, select, or };
}

describe.each([
  {
    nombre: "actualizarPrecioProducto",
    llamar: async (m: typeof import("./owner-actions.ts"), id: string) => m.actualizarPrecioProducto(id, 95000),
    valores: { price: 95000 },
    exito: "95.000",
  },
  {
    nombre: "actualizarStock",
    llamar: async (m: typeof import("./owner-actions.ts"), id: string) => m.actualizarStock(id, 12),
    valores: { stock: 12 },
    exito: "12 unidades",
  },
  {
    nombre: "activarODesactivarProducto",
    llamar: async (m: typeof import("./owner-actions.ts"), id: string) => m.activarODesactivarProducto(id, false),
    valores: { is_active: false },
    exito: "desactivado",
  },
])("$nombre", ({ llamar, valores, exito }) => {
  it("con un SKU (no uuid) filtra por sku con .eq, sin .or()", async () => {
    const { supabase, update, eq, select, or } = mockUpdate([{ id: UUID }]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    const resultado = await llamar(modulo, "PIJ-001");

    expect(update).toHaveBeenCalledWith(valores);
    expect(eq).toHaveBeenCalledWith("sku", "PIJ-001");
    expect(select).toHaveBeenCalledWith("id");
    expect(or).not.toHaveBeenCalled();
    expect(resultado).toContain(exito);
  });

  it("con un uuid filtra por id", async () => {
    const { supabase, eq } = mockUpdate([{ id: UUID }]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    await llamar(modulo, UUID);

    expect(eq).toHaveBeenCalledWith("id", UUID);
  });

  it("si ninguna fila coincide responde 'no encontre' en vez de un exito falso", async () => {
    const { supabase } = mockUpdate([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    const resultado = await llamar(modulo, "NO-EXISTE");

    expect(resultado).toContain("No encontré ningún producto con id/sku NO-EXISTE");
    expect(resultado).not.toContain(exito);
  });

  it("lanza un error descriptivo si la actualizacion falla", async () => {
    const { supabase } = mockUpdate(null, { message: "fallo de red" });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    await expect(llamar(modulo, "PIJ-001")).rejects.toThrow(/fallo de red/);
  });
});

describe("cambiarEstadoPedido", () => {
  it("si ningun pedido coincide responde 'no encontre' en vez de un exito falso", async () => {
    const { supabase, eq } = mockUpdate([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { cambiarEstadoPedido } = await import("./owner-actions.ts");
    const resultado = await cambiarEstadoPedido("ML-NOEXISTE", "enviado");

    expect(eq).toHaveBeenCalledWith("order_number", "ML-NOEXISTE");
    expect(resultado).toContain("No encontré ningún pedido");
  });
});

describe("consultarPedido", () => {
  function mockConsulta(pedido: unknown) {
    const maybeSingle = vi.fn(async () => ({ data: pedido, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const or = vi.fn();
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq, or })) })) };
    return { supabase, eq, or };
  }

  it("con un numero de pedido filtra por order_number", async () => {
    const { supabase, eq, or } = mockConsulta({ order_number: "ML-20261006-abc123", status: "pagado", total: 150000, channel: "whatsapp" });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarPedido } = await import("./owner-actions.ts");
    const resultado = await consultarPedido("ML-20261006-abc123");

    expect(eq).toHaveBeenCalledWith("order_number", "ML-20261006-abc123");
    expect(or).not.toHaveBeenCalled();
    expect(resultado).toContain("pagado");
  });

  it("con un uuid filtra por id", async () => {
    const { supabase, eq } = mockConsulta(null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarPedido } = await import("./owner-actions.ts");
    const resultado = await consultarPedido(UUID);

    expect(eq).toHaveBeenCalledWith("id", UUID);
    expect(resultado).toContain("No encontre ningun pedido");
  });
});

describe("buscarCliente", () => {
  it("escapa la barra invertida antes que las comillas dentro del literal del filtro", async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }));
    const or = vi.fn(() => ({ limit }));
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ or })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCliente } = await import("./owner-actions.ts");
    await buscarCliente('a\\"b,x');

    // Entrada: a\"b,x  ->  literal: "%a\\\"b,x%"
    const literal = '"%a\\\\\\"b,x%"';
    expect(or).toHaveBeenCalledWith(`full_name.ilike.${literal},whatsapp.ilike.${literal}`);
  });
});

describe("consultarVentas", () => {
  function mockVentas(pedidos: unknown[] | null, ventasPos: unknown[] | null, errorPos: unknown = null) {
    const eqPedidos = vi.fn(async () => ({ data: pedidos, error: null }));
    const gtePedidos = vi.fn(() => ({ in: eqPedidos }));
    const gtePos = vi.fn(async () => ({ data: ventasPos, error: errorPos }));
    const supabase = {
      from: vi.fn((tabla: string) => ({
        select: vi.fn(() => ({ gte: tabla === "pos_sales" ? gtePos : gtePedidos })),
      })),
    };
    return { supabase, eqPedidos, gtePos };
  }

  it("suma pedidos pagados de tienda/WhatsApp y ventas POS, con el desglose", async () => {
    const { supabase, eqPedidos, gtePos } = mockVentas(
      [{ total: 100000 }, { total: 50000 }],
      [{ total: 30000 }, { total: 20000 }, { total: 10000 }],
    );
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarVentas } = await import("./owner-actions.ts");
    const resultado = await consultarVentas(7);

    // Mismo criterio que los informes (migracion 018): un pedido enviado o
    // entregado tambien es una venta pagada.
    expect(eqPedidos).toHaveBeenCalledWith("status", ["pagado", "enviado", "entregado"]);
    expect(gtePos).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(resultado).toBe(
      "Ventas de los ultimos 7 dias: $210.000 (tienda/WhatsApp: $150.000 en 2 pedidos pagados; POS: $60.000 en 3 ventas).",
    );
  });

  it("lanza un error si falla la consulta de ventas POS, en vez de reportar un total incompleto", async () => {
    const { supabase } = mockVentas([{ total: 100000 }], null, { message: "fallo POS" });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarVentas } = await import("./owner-actions.ts");
    await expect(consultarVentas(1)).rejects.toThrow(/fallo POS/);
  });
});

describe("buscarInventario", () => {
  afterEach(() => {
    vi.doUnmock("./catalog.ts");
    vi.resetModules();
  });

  it("resume cuantos productos coinciden y el total de unidades en stock, con hasta 10 fotos", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => [
        { productId: "p1", variantId: null, nombre: "Camiseta A", talla: null, color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/a.jpg" },
        { productId: "p2", variantId: null, nombre: "Camiseta B", talla: null, color: null, precio: 40000, stock: 3, imageId: null, fotoUrl: "https://x/b.jpg" },
      ]),
      TOPE_BUSCAR_CATALOGO: 50,
    }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "camiseta" }, true);

    expect(resultado.texto).toContain("Encontré 2 producto(s)");
    expect(resultado.texto).toContain("4 unidad(es) en stock en total");
    expect(resultado.fotos).toHaveLength(2);
    expect(resultado.fotos[0]).toEqual({ url: "https://x/a.jpg", caption: expect.stringContaining("Camiseta A") });
  });

  it("con conFotos=false no manda ninguna foto aunque haya coincidencias, solo el conteo en texto", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => [
        { productId: "p1", variantId: null, nombre: "Camiseta A", talla: null, color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/a.jpg" },
        { productId: "p2", variantId: null, nombre: "Camiseta B", talla: null, color: null, precio: 40000, stock: 3, imageId: null, fotoUrl: "https://x/b.jpg" },
      ]),
      TOPE_BUSCAR_CATALOGO: 50,
    }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "camiseta" }, false);

    expect(resultado.texto).toContain("Encontré 2 producto(s)");
    expect(resultado.texto).toContain("4 unidad(es) en stock en total");
    expect(resultado.texto).not.toContain("mostrando");
    expect(resultado.fotos).toHaveLength(0);
  });

  it("avisa truncamiento y limita a 10 fotos cuando hay mas de 10 coincidencias", async () => {
    const productos = Array.from({ length: 15 }, (_, i) => ({
      productId: `p${i}`, variantId: null, nombre: `Producto ${i}`, talla: null, color: null,
      precio: 1000, stock: 1, imageId: null, fotoUrl: `https://x/${i}.jpg`,
    }));
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => productos), TOPE_BUSCAR_CATALOGO: 50 }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "producto" }, true);

    expect(resultado.texto).toContain("Encontré 15 producto(s)");
    expect(resultado.fotos).toHaveLength(10);
  });

  it("sin coincidencias, responde un mensaje claro y sin fotos", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => []), TOPE_BUSCAR_CATALOGO: 50 }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "inexistente" }, true);

    expect(resultado.texto).toContain("No encontré ningún producto");
    expect(resultado.fotos).toHaveLength(0);
  });

  it("cuenta productos distintos, no filas: 3 variantes del mismo producto cuentan como 1 producto, pero el stock de las 3 se suma", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => [
        { productId: "p1", variantId: "v1", nombre: "Pijama Rosa (Talla S)", talla: "S", color: "Rosa", precio: 89900, stock: 2, imageId: null, fotoUrl: "https://x/s.jpg" },
        { productId: "p1", variantId: "v2", nombre: "Pijama Rosa (Talla M)", talla: "M", color: "Rosa", precio: 89900, stock: 3, imageId: null, fotoUrl: "https://x/m.jpg" },
        { productId: "p1", variantId: "v3", nombre: "Pijama Rosa (Talla L)", talla: "L", color: "Rosa", precio: 89900, stock: 1, imageId: null, fotoUrl: "https://x/l.jpg" },
      ]),
      TOPE_BUSCAR_CATALOGO: 50,
    }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "pijama" }, true);

    expect(resultado.texto).toContain("Encontré 1 producto(s)");
    expect(resultado.texto).toContain("6 unidad(es) en stock en total");
  });

  it("cuando buscarCatalogo devuelve exactamente el tope (50 filas), avisa que podria haber mas", async () => {
    const productos = Array.from({ length: 50 }, (_, i) => ({
      productId: `p${i}`, variantId: null, nombre: `Producto ${i}`, talla: null, color: null,
      precio: 1000, stock: 1, imageId: null, fotoUrl: `https://x/${i}.jpg`,
    }));
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => productos), TOPE_BUSCAR_CATALOGO: 50 }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "producto" }, true);

    expect(resultado.texto).toContain("Encontré al menos 50 producto(s)");
    expect(resultado.texto).toContain("alcancé el límite de búsqueda");
  });

  it("cuando buscarCatalogo devuelve menos del tope, no avisa de posible truncamiento", async () => {
    const productos = Array.from({ length: 20 }, (_, i) => ({
      productId: `p${i}`, variantId: null, nombre: `Producto ${i}`, talla: null, color: null,
      precio: 1000, stock: 1, imageId: null, fotoUrl: `https://x/${i}.jpg`,
    }));
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => productos), TOPE_BUSCAR_CATALOGO: 50 }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "producto" }, true);

    expect(resultado.texto).toContain("Encontré 20 producto(s)");
    expect(resultado.texto).not.toContain("o más");
  });
});

describe("generarInformePdf", () => {
  afterEach(() => {
    vi.doUnmock("./catalog.ts");
    vi.resetModules();
  });

  it("genera el PDF con todas las coincidencias (sin el tope de 10) y lo manda como documento", async () => {
    const productos = Array.from({ length: 15 }, (_, i) => ({
      productId: `p${i}`, variantId: null, nombre: `Producto ${i}`, talla: null, color: null,
      precio: 1000, stock: 1, imageId: null, fotoUrl: null,
    }));
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => productos),
      generarPdfConFotos: vi.fn(async () => new Uint8Array([1])),
      subirYFirmar: vi.fn(async () => "https://x/informe-firmado.pdf"),
    }));

    const { generarInformePdf } = await import("./owner-actions.ts");
    const resultado = await generarInformePdf({ texto: "producto" });

    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe-merylay.pdf" }]);
  });

  it("sin coincidencias, no genera ningun PDF", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => []),
      generarPdfConFotos: vi.fn(),
      subirYFirmar: vi.fn(),
    }));

    const { generarInformePdf } = await import("./owner-actions.ts");
    const resultado = await generarInformePdf({ texto: "inexistente" });

    expect(resultado.texto).toContain("No encontré ningún producto");
    expect(resultado.documentos).toHaveLength(0);
  });
});

describe("ACCIONES_ESCRITURA", () => {
  it("incluye las cinco acciones de escritura de negocio", async () => {
    const { ACCIONES_ESCRITURA } = await import("./owner-actions.ts");
    expect(ACCIONES_ESCRITURA.has("actualizar_precio_producto")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("actualizar_stock")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("cambiar_estado_pedido")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("activar_o_desactivar_producto")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("consultar_ventas")).toBe(false);
  });
});
