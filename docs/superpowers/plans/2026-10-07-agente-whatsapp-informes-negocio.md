# Informes de negocio para el agente de WhatsApp — Plan de implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para implementar este plan tarea por
> tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Objetivo:** Dar a los dueños cuatro informes de negocio que hoy no
existen (ventas por periodo, productos más vendidos, mejores clientes,
gastos por periodo) más una consulta de historial de un cliente puntual,
todos vía WhatsApp, en texto y opcionalmente en PDF.

**Arquitectura:** Un archivo nuevo (`reports.ts`) agrupa toda la lógica
de agregación de negocio, separada de `owner-actions.ts` (que sigue
siendo acciones puntuales de lectura/escritura sobre productos/pedidos).
Sin consultas SQL generadas por el modelo — toda la agregación se hace
en memoria sobre filas que ya trae Supabase, siguiendo el mismo patrón
ya usado en `buscarCatalogo` (el volumen de datos de este negocio es
pequeño: decenas de pedidos/ventas, no miles).

**Tech Stack:** Deno, TypeScript, Vitest, `@supabase/supabase-js`,
`pdf-lib`.

**Spec:**
`docs/superpowers/specs/2026-10-07-agente-whatsapp-informes-negocio-design.md`

## Global Constraints

- Todo el texto orientado al usuario en español.
- **Cero migraciones nuevas** — decisión explícita de este plan: la
  agregación de ventas/productos/clientes se hace en memoria en
  `reports.ts`, no con una función de Postgres nueva. El volumen actual
  (pedidos/ventas en el orden de decenas, confirmado contra la base
  real) hace esto seguro; si el negocio crece mucho, migrar a un RPC de
  Postgres es un cambio futuro aislado a este archivo.
- Cero secretos nuevos.
- TDD en cada paso.
- Nombres de funciones/variables nuevas en español.
- Ninguna de estas acciones es de escritura — ninguna pasa por el gate
  de confirmación (`pendingConfirmation`), y ninguna debe tocarlo.
- `consultar_ventas` se **elimina** (no coexiste con `informe_ventas`) —
  ver spec, sección "Nuevas acciones del dueño / informe_ventas".

## Review Focus

- `informeClientes` debe fusionar en una sola fila a un cliente que
  compra tanto por web/WhatsApp (vía `orders.user_id`) como por POS
  (vía un `pos_customers` con `profile_id` apuntando a ese mismo
  perfil) — nunca debe aparecer dos veces ni con el gasto dividido.
- `productosMasVendidos` debe sumar en una sola fila las ventas del
  mismo producto que vinieron de `order_items` y de `pos_sale_items` —
  nunca dos filas separadas para el mismo producto.
- `historialCliente` no debe reportar "varios clientes encontrados"
  cuando el `pos_customers` que coincidió por texto es en realidad la
  misma persona que un `profile` ya encontrado (mismo `profile_id`) —
  debe deduplicarse antes de contar candidatos.
- Un `product_id` nulo en `order_items`/`pos_sale_items` (producto
  borrado después de la venta) no debe hacer que `productosMasVendidos`
  truene al buscar su nombre — se descarta esa fila en vez de fallar.
- Una venta de POS sin `customer_id` (venta de mostrador sin cliente
  identificado) no debe aparecer en `informeClientes` ni hacer que la
  función falle — se excluye, no se le puede atribuir a nadie.
- `informeGastos` filtra por `expenses.expense_date`, que es una columna
  `date` (no `timestamptz`) — comparar con una fecha (`YYYY-MM-DD`), no
  con una marca de tiempo completa, para no excluir por error los
  gastos del día límite.

---

### Task 1: `generarPdfTabla` + `informeVentas` en `reports.ts` (nuevo)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/reports.ts`
- Test: `supabase/functions/whatsapp-webhook/reports.test.ts`
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.ts` — agregar
  `export` a `formatoMoneda`, `escaparValorFiltro` y
  `ESTADOS_PEDIDO_VENDIDO` (ya existen, sin cambiar su cuerpo); **eliminar**
  `consultarVentas` (su lógica se reutiliza dentro de `informeVentas`).
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.test.ts` —
  eliminar el `describe("consultarVentas", ...)` existente (la función ya
  no existe).

**Interfaces:**
- Produce: `generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array>` (no exportada, solo la usa este archivo);
  `informeVentas(dias: number, conPdf: boolean): Promise<RespuestaLectura>`.
- Consume: `RespuestaLectura`, `formatoMoneda`, `ESTADOS_PEDIDO_VENDIDO`
  (todas exportadas desde `owner-actions.ts` en este mismo task);
  `subirYFirmar` (ya exportada desde `catalog.ts`); `getSupabase` desde
  `_shared/db.ts`.

- [ ] **Paso 1: Escribir los tests que fallan**

Primero, en `owner-actions.ts`: cambiar
`const formatoMoneda = ...` → `export const formatoMoneda = ...`;
`function escaparValorFiltro` → `export function escaparValorFiltro`;
`const ESTADOS_PEDIDO_VENDIDO = [...]` → `export const ESTADOS_PEDIDO_VENDIDO = [...]`.
Eliminar la función `consultarVentas` completa.

En `owner-actions.test.ts`, eliminar el `describe("consultarVentas", ...)`
completo (sus dos tests de suma de pedidos+POS). No tocar ningún otro
`describe` del archivo.

Crear `supabase/functions/whatsapp-webhook/reports.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));
vi.mock("./catalog.ts", () => ({ subirYFirmar: vi.fn(async () => "https://x/informe-firmado.pdf") }));

// Mock generico: cada tabla tiene una cola de respuestas {data, error} que
// se consume en orden en cada llamada a supabase.from(esa tabla) -- hace
// falta una cola (no una sola respuesta) porque algunas funciones de este
// archivo consultan la MISMA tabla mas de una vez con propositos distintos
// (ver historialCliente en tareas posteriores).
function mockSupabaseDesdeTablas(porTabla: Record<string, Array<{ data: unknown; error?: unknown }>>) {
  const contadores: Record<string, number> = {};
  const from = vi.fn((tabla: string) => {
    const cola = porTabla[tabla] ?? [{ data: [], error: null }];
    const i = contadores[tabla] ?? 0;
    contadores[tabla] = i + 1;
    const resultado = cola[Math.min(i, cola.length - 1)];
    const query: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "gte", "in", "or", "order", "limit"]) {
      query[metodo] = vi.fn(() => query);
    }
    (query as { then: unknown }).then = (resolve: (v: typeof resultado) => void) => resolve(resultado);
    query.maybeSingle = vi.fn(async () => ({
      data: Array.isArray(resultado.data) ? (resultado.data[0] ?? null) : resultado.data,
      error: resultado.error ?? null,
    }));
    return query;
  });
  return { from };
}

describe("informeVentas", () => {
  it("desglosa el total por canal y por metodo de pago", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{
        data: [
          { total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-05T10:00:00Z" },
          { total: 50000, channel: "whatsapp", payment_method: "wompi", created_at: "2026-10-06T10:00:00Z" },
        ],
        error: null,
      }],
      pos_sales: [{
        data: [{ total: 30000, payment_method: "efectivo", created_at: "2026-10-06T12:00:00Z" }],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeVentas } = await import("./reports.ts");
    const resultado = await informeVentas(7, false);

    expect(resultado.texto).toContain("$180.000");
    expect(resultado.texto).toContain("web: $100.000");
    expect(resultado.texto).toContain("whatsapp: $50.000");
    expect(resultado.texto).toContain("pos: $30.000");
    expect(resultado.texto).toContain("wompi: $150.000");
    expect(resultado.texto).toContain("efectivo: $30.000");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("sin ventas en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeVentas } = await import("./reports.ts");
    const resultado = await informeVentas(1, false);

    expect(resultado.texto).toContain("No hubo ventas");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("con conPdf=true, sube el PDF y lo manda como documento", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-05T10:00:00Z" }], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { informeVentas } = await import("./reports.ts");
    const resultado = await informeVentas(7, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe-ventas-merylay.pdf" }]);
  });

  it("con conPdf=false, no sube ningun PDF", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-05T10:00:00Z" }], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");
    vi.clearAllMocks();
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeVentas } = await import("./reports.ts");
    await informeVentas(7, false);

    expect(subirYFirmar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: FAIL — `reports.ts` no existe; `consultarVentas` ya no existe
pero sus tests viejos (si no se borraron) fallarían por eso.

- [ ] **Paso 3: Implementar**

Crear `supabase/functions/whatsapp-webhook/reports.ts`:

```ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getSupabase } from "../_shared/db.ts";
import { subirYFirmar } from "./catalog.ts";
import { ESTADOS_PEDIDO_VENDIDO, formatoMoneda, type RespuestaLectura } from "./owner-actions.ts";

const TOPE_FILAS_PDF_DETALLE = 200;

async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const altoFila = 20;
  const anchoPagina = 550;
  const pagina = pdf.addPage([anchoPagina, 120 + (filas.length + 1) * altoFila]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteTitulo = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = pagina.getHeight() - 40;
  pagina.drawText(titulo, { x: 20, y, size: 16, font: fuenteTitulo });
  y -= 30;

  const anchoColumna = (anchoPagina - 40) / encabezados.length;
  encabezados.forEach((encabezado, i) => {
    pagina.drawText(encabezado, { x: 20 + i * anchoColumna, y, size: 10, font: fuenteTitulo });
  });
  y -= altoFila;

  for (const fila of filas) {
    fila.forEach((valor, i) => {
      pagina.drawText(valor, { x: 20 + i * anchoColumna, y, size: 9, font: fuente });
    });
    y -= altoFila;
  }

  return pdf.save();
}

export async function informeVentas(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const [pedidos, ventasPos] = await Promise.all([
    supabase.from("orders").select("total, channel, payment_method, created_at").gte("created_at", desde).in("status", ESTADOS_PEDIDO_VENDIDO),
    supabase.from("pos_sales").select("total, payment_method, created_at").gte("created_at", desde),
  ]);
  if (pedidos.error) throw new Error(`No se pudieron consultar los pedidos: ${pedidos.error.message}`);
  if (ventasPos.error) throw new Error(`No se pudieron consultar las ventas POS: ${ventasPos.error.message}`);

  const filasPedidos = (pedidos.data ?? []) as { total: number; channel: string; payment_method: string | null; created_at: string }[];
  const filasPos = (ventasPos.data ?? []) as { total: number; payment_method: string; created_at: string }[];

  if (filasPedidos.length === 0 && filasPos.length === 0) {
    return { texto: `No hubo ventas en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const totalPedidos = filasPedidos.reduce((suma, p) => suma + Number(p.total), 0);
  const totalPos = filasPos.reduce((suma, v) => suma + Number(v.total), 0);

  const porCanal = new Map<string, number>();
  for (const p of filasPedidos) porCanal.set(p.channel, (porCanal.get(p.channel) ?? 0) + Number(p.total));
  if (totalPos > 0 || filasPos.length > 0) porCanal.set("pos", (porCanal.get("pos") ?? 0) + totalPos);

  const porMetodo = new Map<string, number>();
  for (const p of filasPedidos) {
    const metodo = p.payment_method ?? "wompi";
    porMetodo.set(metodo, (porMetodo.get(metodo) ?? 0) + Number(p.total));
  }
  for (const v of filasPos) porMetodo.set(v.payment_method, (porMetodo.get(v.payment_method) ?? 0) + Number(v.total));

  const lineaCanal = [...porCanal.entries()].map(([canal, total]) => `${canal}: ${formatoMoneda(total)}`).join(", ");
  const lineaMetodo = [...porMetodo.entries()].map(([metodo, total]) => `${metodo}: ${formatoMoneda(total)}`).join(", ");

  const texto = `Ventas de los últimos ${dias} día(s): ${formatoMoneda(totalPedidos + totalPos)}.\n` +
    `Por canal: ${lineaCanal}.\n` +
    `Por método de pago: ${lineaMetodo}.`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const combinadas = [
    ...filasPedidos.map((p) => ({ fecha: p.created_at, canal: p.channel, metodo: p.payment_method ?? "wompi", total: Number(p.total) })),
    ...filasPos.map((v) => ({ fecha: v.created_at, canal: "pos", metodo: v.payment_method, total: Number(v.total) })),
  ].sort((a, b) => (a.fecha > b.fecha ? -1 : 1));

  const filasTabla = combinadas.slice(0, TOPE_FILAS_PDF_DETALLE).map((f) => [
    new Date(f.fecha).toLocaleDateString("es-CO"),
    f.canal,
    f.metodo,
    formatoMoneda(f.total),
  ]);

  const bytes = await generarPdfTabla(`Informe de ventas — últimos ${dias} día(s)`, ["Fecha", "Canal", "Método", "Total"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-ventas.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-ventas-merylay.pdf" }] };
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts
git commit -m "feat: informeVentas (desglose por canal/metodo de pago, con PDF opcional) reemplaza consultarVentas"
```

---

### Task 2: `productosMasVendidos` en `reports.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Produce: `productosMasVendidos(dias: number, limite: number, conPdf: boolean): Promise<RespuestaLectura>`.
- Consume: `generarPdfTabla` (ya existe en este archivo desde la Tarea 1).

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a `reports.test.ts`:

```ts
describe("productosMasVendidos", () => {
  it("combina en una sola fila las ventas del mismo producto venidas de order_items y pos_sale_items", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [{ product_id: "p1", qty: 2, line_total: 80000 }], error: null }],
      pos_sale_items: [{ data: [{ product_id: "p1", qty: 1, line_total: 40000 }], error: null }],
      products: [{ data: [{ id: "p1", name: "Pijama Rosa" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 10, false);

    expect(resultado.texto).toContain("Pijama Rosa — 3 unidad(es), $120.000");
    // una sola linea para "Pijama Rosa", no dos
    expect(resultado.texto.match(/Pijama Rosa/g)).toHaveLength(1);
  });

  it("ordena por unidades vendidas, de mayor a menor, y respeta el limite en texto", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{
        data: [
          { product_id: "p1", qty: 1, line_total: 40000 },
          { product_id: "p2", qty: 5, line_total: 200000 },
        ],
        error: null,
      }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [{ id: "p1", name: "Camiseta A" }, { id: "p2", name: "Camiseta B" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 1, false);

    expect(resultado.texto).toContain("1. Camiseta B");
    expect(resultado.texto).not.toContain("Camiseta A");
  });

  it("descarta filas con product_id nulo (producto borrado) sin fallar", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [{ product_id: null, qty: 2, line_total: 80000 }], error: null }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 10, false);

    expect(resultado.texto).toContain("No hubo productos vendidos");
  });

  it("sin ventas en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [], error: null }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(1, 10, false);

    expect(resultado.texto).toContain("No hubo productos vendidos");
  });

  it("con conPdf=true, genera el PDF sin el tope de 'limite' (hasta 50)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [{ product_id: "p1", qty: 2, line_total: 80000 }], error: null }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [{ id: "p1", name: "Pijama Rosa" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 1, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toHaveLength(1);
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: FAIL — `productosMasVendidos` no existe.

- [ ] **Paso 3: Implementar**

Agregar a `reports.ts`:

```ts
const TOPE_FILAS_PDF_RANKING = 50;

export async function productosMasVendidos(dias: number, limite: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const [itemsPedidos, itemsPos] = await Promise.all([
    supabase
      .from("order_items")
      .select("product_id, qty, line_total, orders!inner(status, created_at)")
      .gte("orders.created_at", desde)
      .in("orders.status", ESTADOS_PEDIDO_VENDIDO),
    supabase
      .from("pos_sale_items")
      .select("product_id, qty, line_total, pos_sales!inner(created_at)")
      .gte("pos_sales.created_at", desde),
  ]);
  if (itemsPedidos.error) throw new Error(`No se pudieron consultar los items de pedidos: ${itemsPedidos.error.message}`);
  if (itemsPos.error) throw new Error(`No se pudieron consultar los items de ventas POS: ${itemsPos.error.message}`);

  const filasPedidos = (itemsPedidos.data ?? []) as { product_id: string | null; qty: number; line_total: number }[];
  const filasPos = (itemsPos.data ?? []) as { product_id: string | null; qty: number; line_total: number }[];

  const acumulado = new Map<string, { qty: number; ingresos: number }>();
  for (const fila of [...filasPedidos, ...filasPos]) {
    if (!fila.product_id) continue; // producto eliminado despues de la venta
    const actual = acumulado.get(fila.product_id) ?? { qty: 0, ingresos: 0 };
    actual.qty += fila.qty;
    actual.ingresos += Number(fila.line_total);
    acumulado.set(fila.product_id, actual);
  }

  if (acumulado.size === 0) {
    return { texto: `No hubo productos vendidos en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const idsProductos = [...acumulado.keys()];
  const { data: productos, error: errorProductos } = await supabase.from("products").select("id, name").in("id", idsProductos);
  if (errorProductos) throw new Error(`No se pudieron consultar los nombres de productos: ${errorProductos.message}`);
  const nombrePorId = new Map(((productos ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const ranking = idsProductos
    .map((id) => ({ nombre: nombrePorId.get(id) ?? "(producto eliminado)", ...acumulado.get(id)! }))
    .sort((a, b) => b.qty - a.qty);

  const textoTabla = ranking.slice(0, limite).map((p, i) => `${i + 1}. ${p.nombre} — ${p.qty} unidad(es), ${formatoMoneda(p.ingresos)}`).join("\n");
  const texto = `Productos más vendidos en los últimos ${dias} día(s):\n${textoTabla}`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = ranking.slice(0, TOPE_FILAS_PDF_RANKING).map((p) => [p.nombre, String(p.qty), formatoMoneda(p.ingresos)]);
  const bytes = await generarPdfTabla(`Productos más vendidos — últimos ${dias} día(s)`, ["Producto", "Unidades", "Ingresos"], filasTabla);
  const link = await subirYFirmar(bytes, "productos-mas-vendidos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "productos-mas-vendidos-merylay.pdf" }] };
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "feat: productosMasVendidos combina order_items y pos_sale_items en un solo ranking"
```

---

### Task 3: `informeClientes` en `reports.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Produce: `informeClientes(dias: number, limite: number, conPdf: boolean): Promise<RespuestaLectura>`.

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a `reports.test.ts`:

```ts
describe("informeClientes", () => {
  it("fusiona en una sola fila a un cliente que compra por web/WhatsApp y por POS (pos_customers.profile_id vinculado)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ user_id: "profile-1", total: 100000 }], error: null }],
      pos_sales: [{ data: [{ customer_id: "pos-cliente-1", total: 50000 }], error: null }],
      pos_customers: [{ data: [{ id: "pos-cliente-1", profile_id: "profile-1", nombre: "Juan (POS)" }], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, false);

    expect(resultado.texto).toContain("Juan Pérez — $150.000 en 2 compra(s)");
    expect(resultado.texto.match(/Juan/g)).toHaveLength(1);
  });

  it("excluye ventas de POS sin customer_id (venta de mostrador sin cliente)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [], error: null }],
      pos_sales: [{ data: [{ customer_id: null, total: 50000 }], error: null }],
      pos_customers: [{ data: [], error: null }],
      profiles: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, false);

    expect(resultado.texto).toContain("No hubo clientes identificados");
  });

  it("ordena por total gastado de mayor a menor", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{
        data: [
          { user_id: "profile-1", total: 50000 },
          { user_id: "profile-2", total: 200000 },
        ],
        error: null,
      }],
      pos_sales: [{ data: [], error: null }],
      pos_customers: [{ data: [], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Cliente Chico", username: "c1" }, { id: "profile-2", full_name: "Cliente Grande", username: "c2" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, false);

    expect(resultado.texto.indexOf("Cliente Grande")).toBeLessThan(resultado.texto.indexOf("Cliente Chico"));
  });

  it("con conPdf=true, genera el PDF", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ user_id: "profile-1", total: 100000 }], error: null }],
      pos_sales: [{ data: [], error: null }],
      pos_customers: [{ data: [], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toHaveLength(1);
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: FAIL — `informeClientes` no existe.

- [ ] **Paso 3: Implementar**

Agregar a `reports.ts`:

```ts
export async function informeClientes(dias: number, limite: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const [pedidos, ventasPos, clientesPos] = await Promise.all([
    supabase.from("orders").select("user_id, total").gte("created_at", desde).in("status", ESTADOS_PEDIDO_VENDIDO),
    supabase.from("pos_sales").select("customer_id, total").gte("created_at", desde),
    supabase.from("pos_customers").select("id, profile_id, nombre"),
  ]);
  if (pedidos.error) throw new Error(`No se pudieron consultar los pedidos: ${pedidos.error.message}`);
  if (ventasPos.error) throw new Error(`No se pudieron consultar las ventas POS: ${ventasPos.error.message}`);
  if (clientesPos.error) throw new Error(`No se pudieron consultar los clientes de POS: ${clientesPos.error.message}`);

  const filasPedidos = (pedidos.data ?? []) as { user_id: string; total: number }[];
  const filasPos = (ventasPos.data ?? []) as { customer_id: string | null; total: number }[];
  const posCustomers = (clientesPos.data ?? []) as { id: string; profile_id: string | null; nombre: string }[];
  const posCustomerPorId = new Map(posCustomers.map((c) => [c.id, c]));

  // Clave de agrupacion: profile_id cuando existe (web/whatsapp, o POS
  // vinculado a un perfil) -- asi un cliente que compra por ambos canales
  // suma en UNA sola fila. Si un pos_customer no tiene profile_id, se usa
  // su propio id como clave (cliente solo-POS).
  const acumulado = new Map<string, { total: number; compras: number; nombrePos?: string }>();

  for (const p of filasPedidos) {
    const actual = acumulado.get(p.user_id) ?? { total: 0, compras: 0 };
    actual.total += Number(p.total);
    actual.compras += 1;
    acumulado.set(p.user_id, actual);
  }

  for (const v of filasPos) {
    if (!v.customer_id) continue; // venta de mostrador sin cliente identificado
    const posCustomer = posCustomerPorId.get(v.customer_id);
    const clave = posCustomer?.profile_id ?? v.customer_id;
    const actual = acumulado.get(clave) ?? { total: 0, compras: 0, nombrePos: posCustomer?.nombre };
    actual.total += Number(v.total);
    actual.compras += 1;
    if (!actual.nombrePos) actual.nombrePos = posCustomer?.nombre;
    acumulado.set(clave, actual);
  }

  if (acumulado.size === 0) {
    return { texto: `No hubo clientes identificados con compras en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const clavesSinNombrePos = [...acumulado.entries()].filter(([, v]) => !v.nombrePos).map(([clave]) => clave);
  const { data: perfiles, error: errorPerfiles } = clavesSinNombrePos.length > 0
    ? await supabase.from("profiles").select("id, full_name, username").in("id", clavesSinNombrePos)
    : { data: [] as { id: string; full_name: string | null; username: string }[], error: null };
  if (errorPerfiles) throw new Error(`No se pudieron consultar los nombres de clientes: ${errorPerfiles.message}`);
  const nombrePorProfile = new Map(((perfiles ?? []) as { id: string; full_name: string | null; username: string }[]).map((p) => [p.id, p.full_name ?? p.username]));

  const ranking = [...acumulado.entries()]
    .map(([clave, v]) => ({ nombre: v.nombrePos ?? nombrePorProfile.get(clave) ?? "Cliente", total: v.total, compras: v.compras }))
    .sort((a, b) => b.total - a.total);

  const textoTabla = ranking.slice(0, limite).map((c, i) => `${i + 1}. ${c.nombre} — ${formatoMoneda(c.total)} en ${c.compras} compra(s)`).join("\n");
  const texto = `Mejores clientes de los últimos ${dias} día(s):\n${textoTabla}`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = ranking.slice(0, TOPE_FILAS_PDF_RANKING).map((c) => [c.nombre, formatoMoneda(c.total), String(c.compras)]);
  const bytes = await generarPdfTabla(`Mejores clientes — últimos ${dias} día(s)`, ["Cliente", "Total gastado", "Compras"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-clientes.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-clientes-merylay.pdf" }] };
}
```

> Nota de formato: la primera prueba de este task espera literalmente
> `"Juan Pérez — $150.000 en 2 compra(s)"` dentro del texto (sin el
> prefijo `"1. "` de la posición en el ranking) — usa `toContain`, así
> que no importa que el texto real sea `"1. Juan Pérez — ..."`, solo que
> esa subcadena exacta esté presente.

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "feat: informeClientes fusiona identidad web/WhatsApp y POS por profile_id"
```

---

### Task 4: `historialCliente` en `reports.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Produce: `historialCliente(nombreOTelefono: string): Promise<RespuestaLectura>`.
- Consume: `escaparValorFiltro` (exportada desde `owner-actions.ts` en la
  Tarea 1).

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a `reports.ts` el import de `escaparValorFiltro`:

```ts
import { ESTADOS_PEDIDO_VENDIDO, escaparValorFiltro, formatoMoneda, type RespuestaLectura } from "./owner-actions.ts";
```

Agregar a `reports.test.ts`:

```ts
describe("historialCliente", () => {
  it("encuentra un cliente por nombre parcial y devuelve su historial con el total acumulado", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [], error: null }, // busqueda por texto: sin coincidencias en pos_customers
        { data: [], error: null }, // busqueda por profile_id vinculado: ninguna
      ],
      orders: [{
        data: [{ order_number: "ML-1", total: 100000, created_at: "2026-10-05T10:00:00Z", channel: "web" }],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("Historial de Juan Pérez");
    expect(resultado.texto).toContain("$100.000 en 1 compra(s)");
    expect(resultado.texto).toContain("ML-1");
  });

  it("cliente no encontrado, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [], error: null }],
      pos_customers: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Nadie");

    expect(resultado.texto).toContain("No encontré ningún cliente");
  });

  it("varias coincidencias reales (personas distintas), pide precisar", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }, { id: "profile-2", full_name: "Juana Gómez", username: "juana" }], error: null }],
      pos_customers: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("varios clientes");
  });

  it("un pos_customer vinculado (profile_id) a un perfil ya encontrado NO cuenta como candidato adicional (no es ambiguo)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [{ id: "pos-1", profile_id: "profile-1", nombre: "Juan (POS)" }], error: null }, // busqueda por texto: coincide, pero es el MISMO profile-1
        { data: [{ id: "pos-1" }], error: null }, // busqueda por profile_id vinculado: la encuentra
      ],
      orders: [{ data: [], error: null }],
      pos_sales: [{ data: [{ sale_number: "POS-1", total: 50000, created_at: "2026-10-06T10:00:00Z" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).not.toContain("varios clientes");
    expect(resultado.texto).toContain("Historial de Juan Pérez");
    expect(resultado.texto).toContain("POS-1");
  });

  it("cliente encontrado sin compras registradas, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [{ data: [], error: null }, { data: [], error: null }],
      orders: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("no tiene compras registradas");
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: FAIL — `historialCliente` no existe.

- [ ] **Paso 3: Implementar**

Agregar a `reports.ts`:

```ts
export async function historialCliente(nombreOTelefono: string): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const patron = escaparValorFiltro(`%${nombreOTelefono}%`);

  const { data: perfiles, error: errorPerfiles } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .eq("role", "customer")
    .or(`full_name.ilike.${patron},username.ilike.${patron},whatsapp.ilike.${patron},phone.ilike.${patron}`)
    .limit(5);
  if (errorPerfiles) throw new Error(`No se pudo buscar el cliente: ${errorPerfiles.message}`);

  const { data: clientesPos, error: errorPos } = await supabase
    .from("pos_customers")
    .select("id, profile_id, nombre")
    .or(`nombre.ilike.${patron},telefono.ilike.${patron}`)
    .limit(5);
  if (errorPos) throw new Error(`No se pudo buscar el cliente: ${errorPos.message}`);

  const filasPerfiles = (perfiles ?? []) as { id: string; full_name: string | null; username: string }[];
  const filasPos = (clientesPos ?? []) as { id: string; profile_id: string | null; nombre: string }[];

  // Un pos_customer vinculado (profile_id) a un perfil que YA aparecio en
  // la busqueda de perfiles es la MISMA persona, no un candidato adicional.
  const idsPerfilesEncontrados = new Set(filasPerfiles.map((p) => p.id));
  const posIndependientes = filasPos.filter((pc) => !pc.profile_id || !idsPerfilesEncontrados.has(pc.profile_id));

  const totalCandidatos = filasPerfiles.length + posIndependientes.length;
  if (totalCandidatos === 0) {
    return { texto: `No encontré ningún cliente que coincida con "${nombreOTelefono}".`, fotos: [], documentos: [] };
  }
  if (totalCandidatos > 1) {
    const nombres = [...filasPerfiles.map((p) => p.full_name ?? p.username), ...posIndependientes.map((c) => c.nombre)];
    return { texto: `Encontré varios clientes que coinciden: ${nombres.join(", ")}. ¿Puedes darme el nombre completo o el teléfono exacto?`, fotos: [], documentos: [] };
  }

  let profileId: string | null;
  let posCustomerId: string | null;
  let nombre: string;
  if (filasPerfiles.length === 1) {
    profileId = filasPerfiles[0].id;
    nombre = filasPerfiles[0].full_name ?? filasPerfiles[0].username;
    // Este perfil puede tener un pos_customer vinculado que no aparecio en
    // la busqueda de texto (su nombre de POS puede ser distinto) -- se
    // busca directo por profile_id, no por texto.
    const { data: posVinculado } = await supabase.from("pos_customers").select("id").eq("profile_id", profileId).maybeSingle();
    posCustomerId = (posVinculado as { id: string } | null)?.id ?? null;
  } else {
    posCustomerId = posIndependientes[0].id;
    profileId = posIndependientes[0].profile_id;
    nombre = posIndependientes[0].nombre;
  }

  const [pedidos, ventasPos] = await Promise.all([
    profileId
      ? supabase.from("orders").select("order_number, total, created_at, channel").eq("user_id", profileId).in("status", ESTADOS_PEDIDO_VENDIDO).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[], error: null }),
    posCustomerId
      ? supabase.from("pos_sales").select("sale_number, total, created_at").eq("customer_id", posCustomerId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (pedidos.error) throw new Error(`No se pudo consultar el historial de pedidos: ${pedidos.error.message}`);
  if (ventasPos.error) throw new Error(`No se pudo consultar el historial de ventas POS: ${ventasPos.error.message}`);

  const filasPedidosHist = (pedidos.data ?? []) as { order_number: string; total: number; created_at: string; channel: string }[];
  const filasPosHist = (ventasPos.data ?? []) as { sale_number: string; total: number; created_at: string }[];

  const todas = [
    ...filasPedidosHist.map((p) => ({ numero: p.order_number, canal: p.channel, total: Number(p.total), fecha: p.created_at })),
    ...filasPosHist.map((v) => ({ numero: v.sale_number, canal: "pos", total: Number(v.total), fecha: v.created_at })),
  ].sort((a, b) => (a.fecha > b.fecha ? -1 : 1));

  if (todas.length === 0) {
    return { texto: `${nombre} no tiene compras registradas todavía.`, fotos: [], documentos: [] };
  }

  const totalGastado = todas.reduce((suma, c) => suma + c.total, 0);
  const detalle = todas.map((c) => `${new Date(c.fecha).toLocaleDateString("es-CO")} (${c.canal}) — ${c.numero}: ${formatoMoneda(c.total)}`).join("\n");
  const texto = `Historial de ${nombre}: ${formatoMoneda(totalGastado)} en ${todas.length} compra(s).\n${detalle}`;

  return { texto, fotos: [], documentos: [] };
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "feat: historialCliente con deduplicacion de identidad web/POS"
```

---

### Task 5: `informeGastos` en `reports.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Produce: `informeGastos(dias: number, conPdf: boolean): Promise<RespuestaLectura>`.
- Consume: `generarPdfTabla`, `TOPE_FILAS_PDF_DETALLE` (ya existen en
  este archivo desde la Tarea 1).

Las tablas `expenses`/`expense_categories` ya existen en la base de
datos (con filas reales) aunque el panel web nunca construyó esa fase —
no se necesita ninguna migración.

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a `reports.test.ts`:

```ts
describe("informeGastos", () => {
  it("desglosa el total por categoria", async () => {
    const supabase = mockSupabaseDesdeTablas({
      expenses: [{
        data: [
          { description: "Arriendo", amount: 500000, expense_date: "2026-10-01", expense_categories: { name: "Renta" } },
          { description: "Internet", amount: 80000, expense_date: "2026-10-03", expense_categories: { name: "Servicios" } },
        ],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(30, false);

    expect(resultado.texto).toContain("$580.000");
    expect(resultado.texto).toContain("Renta: $500.000");
    expect(resultado.texto).toContain("Servicios: $80.000");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("agrupa los gastos sin categoria como 'Sin categoría'", async () => {
    const supabase = mockSupabaseDesdeTablas({
      expenses: [{ data: [{ description: "Varios", amount: 20000, expense_date: "2026-10-03", expense_categories: null }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(30, false);

    expect(resultado.texto).toContain("Sin categoría: $20.000");
  });

  it("sin gastos en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({ expenses: [{ data: [], error: null }] });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(1, false);

    expect(resultado.texto).toContain("No hubo gastos registrados");
  });

  it("con conPdf=true, genera el PDF con el detalle", async () => {
    const supabase = mockSupabaseDesdeTablas({
      expenses: [{ data: [{ description: "Arriendo", amount: 500000, expense_date: "2026-10-01", expense_categories: { name: "Renta" } }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(30, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe-gastos-merylay.pdf" }]);
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: FAIL — `informeGastos` no existe.

- [ ] **Paso 3: Implementar**

Agregar a `reports.ts`:

```ts
export async function informeGastos(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  // expense_date es tipo `date` (no timestamptz) -- se compara con una
  // fecha YYYY-MM-DD, no con una marca de tiempo completa.
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("expenses")
    .select("description, amount, expense_date, expense_categories(name)")
    .gte("expense_date", desde);
  if (error) throw new Error(`No se pudieron consultar los gastos: ${error.message}`);

  const filas = (data ?? []) as { description: string; amount: number; expense_date: string; expense_categories: { name: string } | null }[];
  if (filas.length === 0) {
    return { texto: `No hubo gastos registrados en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const total = filas.reduce((suma, g) => suma + Number(g.amount), 0);
  const porCategoria = new Map<string, number>();
  for (const g of filas) {
    const categoria = g.expense_categories?.name ?? "Sin categoría";
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + Number(g.amount));
  }
  const lineaCategorias = [...porCategoria.entries()].map(([categoria, monto]) => `${categoria}: ${formatoMoneda(monto)}`).join(", ");

  const texto = `Gastos de los últimos ${dias} día(s): ${formatoMoneda(total)}.\nPor categoría: ${lineaCategorias}.`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = [...filas]
    .sort((a, b) => (a.expense_date > b.expense_date ? -1 : 1))
    .slice(0, TOPE_FILAS_PDF_DETALLE)
    .map((g) => [
      new Date(g.expense_date).toLocaleDateString("es-CO"),
      g.expense_categories?.name ?? "Sin categoría",
      g.description,
      formatoMoneda(Number(g.amount)),
    ]);

  const bytes = await generarPdfTabla(`Informe de gastos — últimos ${dias} día(s)`, ["Fecha", "Categoría", "Descripción", "Monto"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-gastos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-gastos-merylay.pdf" }] };
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "feat: informeGastos desglosado por categoria, con PDF opcional"
```

---

### Task 6: Conectar `handler.ts` y `agent.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.test.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.test.ts`

**Interfaces:**
- Consume: `informeVentas`, `productosMasVendidos`, `informeClientes`,
  `historialCliente`, `informeGastos` (Tareas 1-5).

- [ ] **Paso 1: Escribir los tests que fallan**

En `handler.test.ts`, agregar al mock de `./reports.ts` (nuevo bloque
`vi.mock`, junto a los demás al inicio del archivo — agregar
`informeVentas: vi.fn()`, `productosMasVendidos: vi.fn()`,
`informeClientes: vi.fn()`, `historialCliente: vi.fn()` al objeto
`mocks` del `vi.hoisted`):

```ts
vi.mock("./reports.ts", () => ({
  informeVentas: mocks.informeVentas,
  productosMasVendidos: mocks.productosMasVendidos,
  informeClientes: mocks.informeClientes,
  historialCliente: mocks.historialCliente,
  informeGastos: mocks.informeGastos,
}));
```

Quitar `consultarVentas: mocks.consultarStockBajo` (sic — revisar si el
mock de `./owner-actions.ts` todavía referencia `consultarVentas`; si sí,
quitarlo, ya que la función se eliminó en la Tarea 1).

Agregar estos tests dentro de `describe("acciones de lectura del dueño con fotos/documentos", ...)`:

```ts
  it("informe_ventas llama a reports.informeVentas con dias y conPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3a", from: "573215879805", texto: "ventas de esta semana" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_ventas", params: { dias: 7, conPdf: true }, response_message: "" });
    mocks.informeVentas.mockResolvedValue({ texto: "Ventas: $100.000", fotos: [], documentos: [{ link: "https://x/v.pdf", filename: "informe-ventas-merylay.pdf" }] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeVentas).toHaveBeenCalledWith(7, true);
    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573215879805", "https://x/v.pdf", "informe-ventas-merylay.pdf");
  });

  it("productos_mas_vendidos llama a reports.productosMasVendidos con dias, limite y conPdf (con default de limite)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3b", from: "573215879805", texto: "que se vendio mas este mes" });
    mocks.decidirAccion.mockResolvedValue({ action: "productos_mas_vendidos", params: { dias: 30 }, response_message: "" });
    mocks.productosMasVendidos.mockResolvedValue({ texto: "1. Pijama Rosa", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.productosMasVendidos).toHaveBeenCalledWith(30, 10, false);
  });

  it("informe_clientes llama a reports.informeClientes", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3c", from: "573215879805", texto: "quienes son mis mejores clientes" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_clientes", params: { dias: 30, limite: 5, conPdf: false }, response_message: "" });
    mocks.informeClientes.mockResolvedValue({ texto: "1. Juan Pérez", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeClientes).toHaveBeenCalledWith(30, 5, false);
  });

  it("historial_cliente llama a reports.historialCliente con el nombre/telefono", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3d", from: "573215879805", texto: "que le ha comprado Juan" });
    mocks.decidirAccion.mockResolvedValue({ action: "historial_cliente", params: { nombreOTelefono: "Juan" }, response_message: "" });
    mocks.historialCliente.mockResolvedValue({ texto: "Historial de Juan: $100.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.historialCliente).toHaveBeenCalledWith("Juan");
  });

  it("informe_gastos llama a reports.informeGastos con dias y conPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3e", from: "573215879805", texto: "cuanto hemos gastado este mes" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_gastos", params: { dias: 30 }, response_message: "" });
    mocks.informeGastos.mockResolvedValue({ texto: "Gastos: $580.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeGastos).toHaveBeenCalledWith(30, false);
  });
```

En `agent.test.ts`, dentro de
`it("documenta en el prompt del dueño los parametros exactos de cada accion", ...)`,
agregar al `for` de claves: `"conPdf", "limite", "nombreOTelefono"`, y
después del `for`:

```ts
    expect(prompt).toContain("informe_ventas");
    expect(prompt).toContain("productos_mas_vendidos");
    expect(prompt).toContain("informe_clientes");
    expect(prompt).toContain("historial_cliente");
    expect(prompt).toContain("informe_gastos");
    expect(prompt).not.toContain("consultar_ventas:");
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar**

En `handler.ts`, agregar el import:

```ts
import { informeVentas, productosMasVendidos, informeClientes, historialCliente, informeGastos } from "./reports.ts";
```

Reemplazar el caso `"consultar_ventas"` de `ejecutarAccionLectura` por
estos cuatro casos nuevos (mantener los demás casos existentes tal
cual):

```ts
    case "informe_ventas": {
      const dias = (params.dias as number) ?? 1;
      const resultado = await informeVentas(dias, Boolean(params.conPdf));
      return resultado;
    }
    case "productos_mas_vendidos": {
      const dias = (params.dias as number) ?? 30;
      const limite = (params.limite as number) ?? 10;
      return productosMasVendidos(dias, limite, Boolean(params.conPdf));
    }
    case "informe_clientes": {
      const dias = (params.dias as number) ?? 30;
      const limite = (params.limite as number) ?? 10;
      return informeClientes(dias, limite, Boolean(params.conPdf));
    }
    case "historial_cliente":
      return historialCliente(params.nombreOTelefono as string);
    case "informe_gastos": {
      const dias = (params.dias as number) ?? 30;
      return informeGastos(dias, Boolean(params.conPdf));
    }
```

En `agent.ts`, en `ACCIONES_DUENO`, reemplazar la línea de
`consultar_ventas` por estas cuatro:

```
- informe_ventas: params {"dias": entero >= 1, "conPdf": boolean} — ventas del periodo (tienda/WhatsApp + POS), desglosadas por canal y metodo de pago. "hoy" = 1 dia, "esta semana" = 7, "este mes" = 30. "conPdf" es true solo si el dueño pide el detalle completo/descargable ("mandamelo en pdf", "el detalle completo"); si solo pregunta el total/resumen, usa conPdf false.
- productos_mas_vendidos: params {"dias": entero >= 1, "limite": entero >= 1, "conPdf": boolean} — ranking de productos por unidades vendidas e ingresos en el periodo. "limite" por defecto 10 si el dueño no especifica cuantos quiere ver.
- informe_clientes: params {"dias": entero >= 1, "limite": entero >= 1, "conPdf": boolean} — ranking de mejores clientes por total gastado en el periodo. "limite" por defecto 10.
- historial_cliente: params {"nombreOTelefono": string} — historial completo de compras de UN cliente especifico (nombre o telefono); usala cuando el dueño pregunte "que le ha comprado X" o "cuanto ha gastado X", a diferencia de buscar_cliente que solo da datos de contacto.
- informe_gastos: params {"dias": entero >= 1, "conPdf": boolean} — gastos del negocio en el periodo (arriendo, servicios, nomina, insumos, etc.), desglosados por categoria. Mismo criterio de "dias" y "conPdf" que informe_ventas.
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/agent.ts supabase/functions/whatsapp-webhook/agent.test.ts
git commit -m "feat: conecta los informes de negocio al dispatcher del dueño y al prompt"
```

---

### Task 7: Limpieza final y verificación

**Files:**
- Modify: cualquier archivo con referencias residuales a `consultarVentas`.

- [ ] **Paso 1: Buscar referencias residuales**

```bash
grep -rn "consultarVentas\|consultar_ventas" supabase/functions --include="*.ts"
```

Expected: sin resultados en código (solo en `docs/` si acaso, lo cual es
aceptable — son documentos históricos).

- [ ] **Paso 2: Correr la suite completa**

Run: `pnpm test`
Expected: PASS — todos los archivos.

- [ ] **Paso 3: Verificar tipos con `deno check`**

Run (desde la raíz del repo):
```bash
npx deno check --import-map=supabase/functions/deno.json supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/agent.ts
```
Expected: sin errores. (`npx deno` tarda unos segundos en resolver la
primera vez — si el comando no devuelve nada de inmediato, no asumir que
`deno` no está disponible; esperar la respuesta completa antes de
concluir que falló.)

- [ ] **Paso 4: Commit (solo si el paso 1 encontró algo que corregir)**

```bash
git add -A
git commit -m "chore: limpieza final de referencias a consultarVentas"
```

---

## Después de este plan

Con la suite en verde, fusionar a `master`, pushear, y redesplegar
`whatsapp-webhook` vía `mcp__supabase__deploy_edge_function` incluyendo
el nuevo archivo `reports.ts` junto con todos los demás ya desplegados.
