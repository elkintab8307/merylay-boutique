# Fase 11.1 — Dashboard de métricas + Gestión de pedidos: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `/admin` (dashboard con 3 métricas: ventas de hoy,
pedidos pendientes, stock bajo) y `/admin/pedidos` (listar, ver detalle,
cambiar estado) — cerrando el vacío de gestión de pedidos que nunca se
construyó en la Fase 5.

**Architecture:** Server Components para lectura (RLS ya permite a
admin/superadmin leer y actualizar `orders` vía las policies existentes),
una Server Action (`cambiarEstadoPedido`) siguiendo el patrón
`{ error?: string }` ya establecido, y dos módulos de lógica pura y
testeada (`buildLowStockItems`, `inicioDelDiaBogota`) que el dashboard
consume.

**Tech Stack:** Next.js App Router (Server Components + Server Actions),
Supabase (PostgREST), zod, Tailwind, Vitest.

## Global Constraints

- Toda la UI, textos y mensajes de error en español.
- TypeScript estricto; nada de `any` sin justificar.
- Sin migraciones nuevas — todo sale de `orders`, `order_items`,
  `pos_sales`, `products`, `product_variants`, ya existentes.
- Umbral de stock bajo = **2** unidades, como constante única
  (`LOW_STOCK_THRESHOLD`) reutilizada por lógica y UI.
- Un producto **con** variantes se evalúa por sus variantes (no por su
  propio campo `stock`, que no se decrementa cuando hay variantes); un
  producto **sin** variantes se evalúa por su propio `stock`.
- Nunca tragar errores de lectura silenciosamente — si una consulta del
  dashboard o de la lista de pedidos falla, se muestra un mensaje de error
  en español en vez de renderizar datos vacíos/en cero.
- Commits atómicos en español después de cada tarea funcional.
- Spec de referencia: `docs/superpowers/specs/2026-08-07-fase-11-1-dashboard-pedidos-design.md`.

---

## Mapa de archivos

```
src/lib/admin/low-stock.ts                    # nuevo — LOW_STOCK_THRESHOLD, buildLowStockItems
src/lib/admin/__tests__/low-stock.test.ts     # nuevo
src/lib/date/inicio-del-dia.ts                # nuevo — inicioDelDiaBogota
src/lib/date/__tests__/inicio-del-dia.test.ts # nuevo

src/app/admin/pedidos/actions.ts              # nuevo — cambiarEstadoPedido
src/app/admin/pedidos/estado-pedido-select.tsx # nuevo
src/app/admin/pedidos/page.tsx                # nuevo — lista, ?status=
src/app/admin/pedidos/[id]/page.tsx           # nuevo — detalle

src/app/admin/page.tsx                        # nuevo — dashboard (índice de /admin)
src/app/admin/admin-nav.tsx                   # modificado — agrega "Panel" y "Pedidos"
```

---

### Task 1: Lógica pura de stock bajo (`low-stock.ts`)

**Files:**
- Create: `src/lib/admin/low-stock.ts`
- Test: `src/lib/admin/__tests__/low-stock.test.ts`

**Interfaces:**
- Produces: `LOW_STOCK_THRESHOLD: number`, `type LowStockItem`,
  `buildLowStockItems(products, variants, threshold): LowStockItem[]` —
  usados por Task 6 (`admin/page.tsx`).

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { buildLowStockItems } from "../low-stock";

describe("buildLowStockItems", () => {
  it("incluye un producto sin variantes con stock igual o por debajo del umbral", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 2 }],
      [],
      2,
    );
    expect(items).toEqual([
      { productId: "p1", productName: "Pijama Rosa", variantLabel: null, stock: 2 },
    ]);
  });

  it("excluye un producto sin variantes con stock por encima del umbral", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 3 }],
      [],
      2,
    );
    expect(items).toEqual([]);
  });

  it("evalua un producto CON variantes por sus variantes, no por su propio stock", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 0 }],
      [
        { id: "v1", product_id: "p1", talla: "M", color: "Rosa", stock: 1 },
        { id: "v2", product_id: "p1", talla: "L", color: "Rosa", stock: 5 },
      ],
      2,
    );
    expect(items).toEqual([
      { productId: "p1", productName: "Pijama Rosa", variantLabel: "M / Rosa", stock: 1 },
    ]);
  });

  it("arma el variantLabel solo con talla, solo con color, o ambos", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 0 }],
      [{ id: "v1", product_id: "p1", talla: "M", color: null, stock: 0 }],
      2,
    );
    expect(items[0].variantLabel).toBe("M");
  });

  it("ordena los resultados por stock ascendente", () => {
    const items = buildLowStockItems(
      [
        { id: "p1", name: "A", stock: 2 },
        { id: "p2", name: "B", stock: 0 },
      ],
      [],
      2,
    );
    expect(items.map((i) => i.stock)).toEqual([0, 2]);
  });

  it("LOW_STOCK_THRESHOLD vale 2", async () => {
    const { LOW_STOCK_THRESHOLD } = await import("../low-stock");
    expect(LOW_STOCK_THRESHOLD).toBe(2);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/admin/__tests__/low-stock.test.ts`
Expected: FAIL (módulo `../low-stock` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
export const LOW_STOCK_THRESHOLD = 2;

export type LowStockItem = {
  productId: string;
  productName: string;
  variantLabel: string | null;
  stock: number;
};

type ProductoStock = { id: string; name: string; stock: number };
type VarianteStock = {
  id: string;
  product_id: string;
  talla: string | null;
  color: string | null;
  stock: number;
};

export function buildLowStockItems(
  products: ProductoStock[],
  variants: VarianteStock[],
  threshold: number,
): LowStockItem[] {
  const productIdsConVariantes = new Set(variants.map((v) => v.product_id));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  const items: LowStockItem[] = [];

  for (const variante of variants) {
    if (variante.stock <= threshold) {
      items.push({
        productId: variante.product_id,
        productName: productNameById.get(variante.product_id) ?? "Producto",
        variantLabel:
          [variante.talla, variante.color].filter(Boolean).join(" / ") || null,
        stock: variante.stock,
      });
    }
  }

  for (const producto of products) {
    if (!productIdsConVariantes.has(producto.id) && producto.stock <= threshold) {
      items.push({
        productId: producto.id,
        productName: producto.name,
        variantLabel: null,
        stock: producto.stock,
      });
    }
  }

  return items.sort((a, b) => a.stock - b.stock);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/admin/__tests__/low-stock.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/low-stock.ts src/lib/admin/__tests__/low-stock.test.ts
git commit -m "feat: logica de stock bajo para el dashboard admin (Fase 11.1)"
```

---

### Task 2: Inicio del día en hora de Bogotá (`inicio-del-dia.ts`)

**Files:**
- Create: `src/lib/date/inicio-del-dia.ts`
- Test: `src/lib/date/__tests__/inicio-del-dia.test.ts`

**Interfaces:**
- Produces: `inicioDelDiaBogota(ahora?: Date): string` — usado por Task 6
  (`admin/page.tsx`) para filtrar "ventas de hoy".

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { inicioDelDiaBogota } from "../inicio-del-dia";

describe("inicioDelDiaBogota", () => {
  it("devuelve medianoche de Bogota (UTC-5) para una hora de la tarde UTC del mismo dia", () => {
    // 2026-08-07T23:30:00Z = 2026-08-07T18:30:00-05:00 (mismo dia en Bogota)
    const resultado = inicioDelDiaBogota(new Date("2026-08-07T23:30:00Z"));
    expect(resultado).toBe("2026-08-07T00:00:00-05:00");
  });

  it("no cruza al dia siguiente cuando UTC ya cruzo pero Bogota no", () => {
    // 2026-08-08T03:30:00Z = 2026-08-07T22:30:00-05:00 (aun 7 de agosto en Bogota)
    const resultado = inicioDelDiaBogota(new Date("2026-08-08T03:30:00Z"));
    expect(resultado).toBe("2026-08-07T00:00:00-05:00");
  });

  it("cruza al dia siguiente cuando ya es de madrugada en Bogota", () => {
    // 2026-08-08T06:00:00Z = 2026-08-08T01:00:00-05:00 (ya 8 de agosto en Bogota)
    const resultado = inicioDelDiaBogota(new Date("2026-08-08T06:00:00Z"));
    expect(resultado).toBe("2026-08-08T00:00:00-05:00");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/date/__tests__/inicio-del-dia.test.ts`
Expected: FAIL (módulo `../inicio-del-dia` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
export function inicioDelDiaBogota(ahora: Date = new Date()): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);

  return `${fecha}T00:00:00-05:00`;
}
```

Nota: Colombia no observa horario de verano, por lo que el offset `-05:00`
es fijo durante todo el año — no hace falta calcularlo dinámicamente.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/date/__tests__/inicio-del-dia.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/date/inicio-del-dia.ts src/lib/date/__tests__/inicio-del-dia.test.ts
git commit -m "feat: helper de inicio del dia en hora de Bogota para metricas (Fase 11.1)"
```

---

### Task 3: Server Action para cambiar el estado de un pedido

**Files:**
- Create: `src/app/admin/pedidos/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()` de `@/lib/admin/require-admin` (ya existe:
  lanza si el rol no es `admin`/`superadmin`, retorna el usuario actual),
  `createClient()` de `@/lib/supabase/server`.
- Produces: `cambiarEstadoPedido(orderId: string, nuevoEstado: string): Promise<{ error?: string }>`
  — usado por Task 4 (`estado-pedido-select.tsx`).

- [ ] **Step 1: Implementación**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";

const estadoSchema = z.enum([
  "pendiente",
  "pagado",
  "enviado",
  "entregado",
  "cancelado",
]);

export async function cambiarEstadoPedido(
  orderId: string,
  nuevoEstado: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = estadoSchema.safeParse(nuevoEstado);
  if (!parsed.success) {
    return { error: "Estado inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: parsed.data })
    .eq("id", orderId);

  if (error) {
    return { error: "No se pudo actualizar el pedido." };
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return {};
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/pedidos/actions.ts
git commit -m "feat: server action para cambiar el estado de un pedido (Fase 11.1)"
```

---

### Task 4: Selector de estado + página de detalle de pedido

**Files:**
- Create: `src/app/admin/pedidos/estado-pedido-select.tsx`
- Create: `src/app/admin/pedidos/[id]/page.tsx`

**Interfaces:**
- Consumes: `cambiarEstadoPedido` (Task 3), `createClient()`,
  `formatPrice()` de `@/lib/format` (ya existe).
- Produces: página completa; `EstadoPedidoSelect` no tiene otros
  consumidores en este plan.

- [ ] **Step 1: Crear `estado-pedido-select.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cambiarEstadoPedido } from "./actions";

const ESTADOS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pagado", label: "Pagado" },
  { value: "enviado", label: "Enviado" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
] as const;

export function EstadoPedidoSelect({
  orderId,
  estadoActual,
}: {
  orderId: string;
  estadoActual: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (nuevoEstado: string) => {
    setError(null);
    startTransition(async () => {
      const result = await cambiarEstadoPedido(orderId, nuevoEstado);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="estado" className="text-sm text-brand-ciruela">
        Estado del pedido
      </label>
      <select
        id="estado"
        value={estadoActual}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="w-fit rounded border border-brand-rosa-claro bg-white px-2 py-1 text-sm text-brand-ciruela disabled:opacity-50"
      >
        {ESTADOS.map((estado) => (
          <option key={estado.value} value={estado.value}>
            {estado.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Crear `[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { EstadoPedidoSelect } from "../estado-pedido-select";

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string | null;
};

export default async function AdminPedidoDetallePage({
  params,
}: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (!pedido) {
    notFound();
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, unit_price, line_total")
    .eq("order_id", pedido.id);

  const direccion = pedido.shipping_address as ShippingAddress | null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Pedido {pedido.order_number}
        </h1>
        <p className="text-sm text-brand-ciruela/60">
          Método de pago: {pedido.payment_method ?? "-"} ·{" "}
          {new Date(pedido.created_at).toLocaleString("es-CO")}
        </p>
      </div>

      <EstadoPedidoSelect orderId={pedido.id} estadoActual={pedido.status} />

      <div className="flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4">
        {(items ?? []).map((item, index) => (
          <div
            key={index}
            className="flex justify-between py-2 text-sm text-brand-ciruela"
          >
            <span>
              {item.name_snapshot} × {item.qty}
            </span>
            <span>{formatPrice(item.line_total)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 font-heading text-brand-rosa">
          <span>Total</span>
          <span>{formatPrice(pedido.total)}</span>
        </div>
      </div>

      {direccion && (
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 text-sm text-brand-ciruela">
          <h2 className="mb-2 font-heading text-base">Envío</h2>
          <p>{direccion.fullName}</p>
          <p>{direccion.phone}</p>
          <p>
            {direccion.address}, {direccion.city}
          </p>
          {direccion.notes && (
            <p className="text-brand-ciruela/60">{direccion.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/pedidos/estado-pedido-select.tsx src/app/admin/pedidos/[id]/page.tsx
git commit -m "feat: pagina de detalle de pedido con cambio de estado (Fase 11.1)"
```

---

### Task 5: Lista de pedidos (`/admin/pedidos`)

**Files:**
- Create: `src/app/admin/pedidos/page.tsx`

**Interfaces:**
- Consumes: `createClient()`, `formatPrice()`.
- Produces: página completa, enlazada desde Task 6 (`/admin/pedidos?status=pendiente`).

- [ ] **Step 1: Implementación**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  pagado: "Pagado",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

type ShippingAddress = { fullName?: string };

export default async function AdminPedidosPage({
  searchParams,
}: PageProps<"/admin/pedidos">) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("id, order_number, status, total, created_at, shipping_address")
    .order("created_at", { ascending: false });

  if (typeof status === "string" && status) {
    query = query.eq("status", status);
  }

  const { data: pedidos, error } = await query;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Pedidos</h1>
      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los pedidos.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Pedido</th>
              <th className="py-2">Cliente</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Total</th>
              <th className="py-2">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(pedidos ?? []).map((pedido) => {
              const direccion = pedido.shipping_address as ShippingAddress | null;
              return (
                <tr key={pedido.id} className="border-b border-brand-rosa-claro/50">
                  <td className="py-2">
                    <Link
                      href={`/admin/pedidos/${pedido.id}`}
                      className="text-brand-rosa hover:underline"
                    >
                      {pedido.order_number}
                    </Link>
                  </td>
                  <td className="py-2 text-brand-ciruela/70">
                    {direccion?.fullName ?? "-"}
                  </td>
                  <td className="py-2">
                    {ESTADO_LABELS[pedido.status] ?? pedido.status}
                  </td>
                  <td className="py-2">{formatPrice(pedido.total)}</td>
                  <td className="py-2 text-brand-ciruela/70">
                    {new Date(pedido.created_at).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/pedidos/page.tsx
git commit -m "feat: lista de pedidos con filtro por estado (Fase 11.1)"
```

---

### Task 6: Dashboard (`/admin`) y navegación

**Files:**
- Create: `src/app/admin/page.tsx`
- Modify: `src/app/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `buildLowStockItems`, `LOW_STOCK_THRESHOLD` (Task 1),
  `inicioDelDiaBogota` (Task 2), `createClient()`, `formatPrice()`.
- Produces: página índice de `/admin`, sin otros consumidores en este plan.

- [ ] **Step 1: Crear `admin/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { inicioDelDiaBogota } from "@/lib/date/inicio-del-dia";
import { buildLowStockItems, LOW_STOCK_THRESHOLD } from "@/lib/admin/low-stock";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const inicioHoy = inicioDelDiaBogota();

  const [
    { data: ordenesHoy, error: ordenesError },
    { data: ventasPosHoy, error: posError },
    { count: pedidosPendientes, error: pendientesError },
    { data: productos, error: productosError },
    { data: variantes, error: variantesError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioHoy)
      .neq("status", "cancelado"),
    supabase.from("pos_sales").select("total").gte("created_at", inicioHoy),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendiente"),
    supabase.from("products").select("id, name, stock"),
    supabase
      .from("product_variants")
      .select("id, product_id, talla, color, stock"),
  ]);

  const huboError =
    ordenesError || posError || pendientesError || productosError || variantesError;

  if (huboError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>
        <p className="text-sm text-red-600">
          No se pudieron cargar las métricas.
        </p>
      </div>
    );
  }

  const ventasTienda = (ordenesHoy ?? []).reduce((sum, o) => sum + o.total, 0);
  const ventasPos = (ventasPosHoy ?? []).reduce((sum, v) => sum + v.total, 0);
  const ventasTotal = ventasTienda + ventasPos;

  const stockBajoCompleto = buildLowStockItems(
    productos ?? [],
    variantes ?? [],
    LOW_STOCK_THRESHOLD,
  );
  const stockBajo = stockBajoCompleto.slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
          <p className="text-sm text-brand-ciruela/70">Ventas de hoy</p>
          <p className="font-heading text-2xl text-brand-rosa">
            {formatPrice(ventasTotal)}
          </p>
          <p className="mt-1 text-xs text-brand-ciruela/60">
            Tienda: {formatPrice(ventasTienda)} · POS: {formatPrice(ventasPos)}
          </p>
        </div>

        <Link
          href="/admin/pedidos?status=pendiente"
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 hover:border-brand-rosa"
        >
          <p className="text-sm text-brand-ciruela/70">Pedidos pendientes</p>
          <p className="font-heading text-2xl text-brand-rosa">
            {pedidosPendientes ?? 0}
          </p>
        </Link>

        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
          <p className="text-sm text-brand-ciruela/70">Stock bajo</p>
          <p className="font-heading text-2xl text-brand-rosa">
            {stockBajoCompleto.length}
          </p>
        </div>
      </div>

      {stockBajo.length > 0 && (
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
          <h2 className="mb-3 font-heading text-lg text-brand-ciruela">
            Stock bajo
          </h2>
          <div className="flex flex-col divide-y divide-brand-rosa-claro/50 text-sm text-brand-ciruela">
            {stockBajo.map((item) => (
              <Link
                key={`${item.productId}-${item.variantLabel ?? ""}`}
                href={`/admin/productos/${item.productId}/editar`}
                className="flex justify-between py-2 hover:text-brand-rosa"
              >
                <span>
                  {item.productName}
                  {item.variantLabel ? ` (${item.variantLabel})` : ""}
                </span>
                <span>{item.stock} unidades</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modificar `admin-nav.tsx`**

Reemplazar el contenido completo por:

```tsx
import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="flex gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <Link href="/admin" className="hover:text-brand-rosa">
        Panel
      </Link>
      <Link href="/admin/pedidos" className="hover:text-brand-rosa">
        Pedidos
      </Link>
      <Link href="/admin/categorias" className="hover:text-brand-rosa">
        Categorías
      </Link>
      <Link href="/admin/productos" className="hover:text-brand-rosa">
        Productos
      </Link>
    </nav>
  );
}
```

- [ ] **Step 3: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos; suite completa en verde (incluye los 9 tests
nuevos de Tasks 1 y 2).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/admin-nav.tsx
git commit -m "feat: dashboard de metricas en /admin (Fase 11.1)"
```

---

### Task 7: Verificación de integración end-to-end

**Files:** ninguno nuevo (script desechable, no se commitea).

**Interfaces:**
- Consumes: todo lo construido en Tasks 1–6.

- [ ] **Step 1: Confirmar que el servidor de desarrollo está limpio**

Verificar que no hay un proceso `next dev` obsoleto de una sesión anterior.
Si existe, terminarlo y arrancar uno limpio con `pnpm dev` en segundo plano.

- [ ] **Step 2: Verificar rutas con `curl`**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/pedidos
```

Expected: ambas redirigen (307/302) hacia `/login` para una petición sin
sesión (la protección de `/admin/**` ya existe desde la Fase 1/3 vía
`proxy.ts` — este paso solo confirma que las rutas nuevas quedan cubiertas
por el mismo prefijo).

- [ ] **Step 3: Script de verificación de negocio (`.mjs` desechable)**

Crear un archivo temporal `scripts/tmp-verify-fase11-1.mjs` (fuera de
`src/`, para borrar al final) que, usando el cliente de service role
(mismo patrón que scripts anteriores, `dotenv` + `.env.local`):

1. Cree un pedido de prueba (`orders` + `order_items`) con
   `status = 'pendiente'` y `created_at = now()`.
2. Cree un producto de prueba sin variantes con `stock = 1` (por debajo del
   umbral de 2).
3. Verifique, consultando directamente las mismas tablas que usa
   `admin/page.tsx`, que: el pedido de prueba aparece en el conteo de
   `pedidos pendientes`; el producto de prueba aparece en el resultado de
   `buildLowStockItems` al pasarle los datos leídos.
4. Actualice el pedido de prueba a `status = 'pagado'` directamente (
   simulando lo que hace `cambiarEstadoPedido`) y confirme que ya no
   aparece en el conteo de pendientes.
5. Limpie todos los datos de prueba al final (`order_items`, `orders`,
   `products` de prueba).
6. Borre el script al terminar.

Run: `node scripts/tmp-verify-fase11-1.mjs`
Expected: todos los pasos imprimen `OK`.

- [ ] **Step 4: Limpieza**

```bash
rm -f scripts/tmp-verify-fase11-1.mjs
```

Detener el servidor de desarrollo iniciado en el Step 1. No hay commit en
esta tarea — es puramente de verificación.

---

## Cierre de fase

Al completar la Task 7, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
