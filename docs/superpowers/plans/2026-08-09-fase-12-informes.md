# Fase 12 — Informes: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar visibilidad completa del negocio en `/admin/informes`: ventas
(tienda + POS), productos más vendidos, stock bajo, métodos de pago,
gastos, compras y ganancia real, cada uno con gráfica y tabla.

**Architecture:** Seis funciones SQL `security definer stable` (protegidas
con `is_admin()`, mismo patrón que `create_purchase`) hacen la agregación
`GROUP BY`/`SUM` dentro de Postgres, acotada a grano diario. Cada página de
Next.js (Server Component) llama una de esas funciones vía `.rpc()`, pinta
una gráfica (componente `chart` de shadcn/ui sobre Recharts, ya instalado)
y una tabla con los mismos datos. El filtro de rango de fechas es un
componente servidor compartido, sin JavaScript de cliente (enlaces con
presets + un `<form method="get">`), siguiendo el patrón ya usado en
`/admin/gastos`.

**Tech Stack:** Next.js App Router (Server Components), Supabase (RPC +
RLS), Recharts vía el componente `chart` de shadcn/ui, zod, react-hook-form
(solo donde ya se usa, los informes no llevan formularios de captura).

## Global Constraints

- Todo el producto en español (UI, mensajes de error).
- Solo `admin`/`superadmin` acceden a `/admin/informes/**` — ya cubierto
  por el middleware existente (`src/lib/auth/route-protection.ts`, prefijo
  `/admin`), sin cambios necesarios ahí.
- Las 6 funciones RPC nuevas son `language plpgsql`, `security definer`,
  `stable` (no mutan nada), `set search_path = public`, primera línea
  `if not public.is_admin() then raise exception 'No autorizado.'; end if;`,
  y `revoke execute ... from public, anon; grant execute ... to
  authenticated;` — mismo patrón de autorización que `create_purchase`/
  `create_pos_sale`, pero sin `for update` (son de solo lectura).
- **Nunca se suma un array completo de filas sin agregar en JavaScript
  para calcular un total de dinero.** Toda suma de transacciones vive en
  SQL (`GROUP BY`/`SUM`, grano diario). El cliente solo vuelve a agrupar
  filas que Postgres YA sumó (acotadas al número de días del rango, nunca
  al volumen de transacciones) — es la lección de la revisión final de la
  Fase 14, que corrigió exactamente este error en `/admin/compras`.
- Pedidos que cuentan como venta real: `status in ('pagado', 'enviado',
  'entregado')`. Ventas POS: todas (no existe un estado "pendiente" para
  POS, una venta POS siempre es un hecho consumado).
- `Ganancia = Ventas − Costo de productos vendidos (qty vendida × 
  product_costs.cost_price VIGENTE, sin costo registrado = 0) − Gastos`,
  calculada en SQL, nunca en el cliente. `product_costs` no guarda
  historial, así que la ganancia de periodos pasados usa el costo de HOY
  (decisión ya tomada en la Fase 14).
- Toda fecha se valida con `z.iso.date(...)` + `refine`, nunca con
  comparación de string plana (patrón ya establecido en Gastos/Compras).
- Filtro de fecha: Server Components con `<Link>` (presets) y
  `<form method="get">` (rango personalizado) — sin componente cliente,
  mismo patrón ya usado en `/admin/gastos/page.tsx`. Rango por defecto:
  mes actual (día 1 del mes en curso hasta hoy).
- Paleta de marca en gráficas: rosa `#E96A9E`, dorado `#D9A441`, rosa
  secundario `#F29DB8`, rosa medio `#F5B7C8`, ciruela `#6E2A44`.
- `store_settings` sigue el patrón key/value ya existente
  (`STORE_SETTINGS_KEYS` en `src/lib/validation/store-settings.ts`), sin
  cambios de esquema — el umbral de stock bajo es una clave nueva ahí.
- El componente `chart` de shadcn/ui (`src/components/ui/chart.tsx`) y la
  dependencia `recharts` ya están instalados (commit previo en esta
  rama) — ningún task de este plan necesita reinstalarlos.

---

## Task 1: Migración SQL — 6 funciones de informes

**Files:**
- Create: `supabase/migrations/018_informes.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerar con el MCP de
  Supabase después de aplicar la migración)

**Interfaces:**
- Consumes: `is_admin()` (ya existe), tablas `orders`, `order_items`,
  `pos_sales`, `pos_sale_items`, `expenses`, `expense_categories`,
  `purchases`, `purchase_items`, `suppliers`, `product_costs`, `products`
  (todas ya existen).
- Produces: `informe_ventas_serie`, `informe_productos_vendidos`,
  `informe_metodos_pago`, `informe_gastos_serie`, `informe_compras_serie`,
  `informe_ganancia_serie` — todas invocables vía `supabase.rpc(...)`
  desde las páginas de las Tasks 4-9.

- [ ] **Step 1: Crear la migración con las 6 funciones**

```sql
-- Ventas por dia y canal (tienda/pos). Un pedido de tienda solo cuenta
-- como venta real si ya esta pagado, enviado o entregado; una venta POS
-- siempre es un hecho consumado (no tiene estado "pendiente").
create function public.informe_ventas_serie(p_desde date, p_hasta date)
returns table (fecha date, canal text, monto numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  select o.created_at::date as fecha, 'tienda'::text as canal, sum(o.total) as monto
  from public.orders o
  where o.status in ('pagado', 'enviado', 'entregado')
    and o.created_at::date between p_desde and p_hasta
  group by o.created_at::date
  union all
  select s.created_at::date as fecha, 'pos'::text as canal, sum(s.total) as monto
  from public.pos_sales s
  where s.created_at::date between p_desde and p_hasta
  group by s.created_at::date
  order by fecha;
end;
$$;

revoke execute on function public.informe_ventas_serie(date, date) from public, anon;
grant execute on function public.informe_ventas_serie(date, date) to authenticated;

-- Top N productos por unidades e ingreso, combinando order_items
-- (pedidos calificados) y pos_sale_items en el rango de fechas.
create function public.informe_productos_vendidos(
  p_desde date, p_hasta date, p_limit int default 10
)
returns table (product_id uuid, nombre text, qty numeric, ingreso numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  select p.id as product_id, p.name as nombre, sum(x.qty)::numeric as qty, sum(x.line_total) as ingreso
  from (
    select oi.product_id, oi.qty, oi.line_total
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
      and oi.product_id is not null
    union all
    select psi.product_id, psi.qty, psi.line_total
    from public.pos_sale_items psi
    join public.pos_sales s on s.id = psi.sale_id
    where s.created_at::date between p_desde and p_hasta
      and psi.product_id is not null
  ) x
  join public.products p on p.id = x.product_id
  group by p.id, p.name
  order by qty desc
  limit p_limit;
end;
$$;

revoke execute on function public.informe_productos_vendidos(date, date, int) from public, anon;
grant execute on function public.informe_productos_vendidos(date, date, int) to authenticated;

-- Ingreso por metodo de pago, combinando ambos canales. "efectivo" y
-- "transferencia" existen en orders.payment_method y en el enum de
-- pos_sales.payment_method, y se combinan naturalmente bajo la misma
-- clave; "wompi" (solo tienda) y "tarjeta"/"nequi"/"daviplata" (solo POS)
-- quedan separados por ser rieles de pago distintos.
create function public.informe_metodos_pago(p_desde date, p_hasta date)
returns table (metodo text, total numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  select metodo, sum(monto) as total
  from (
    select coalesce(o.payment_method, 'sin especificar') as metodo, o.total as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
    union all
    select s.payment_method::text as metodo, s.total as monto
    from public.pos_sales s
    where s.created_at::date between p_desde and p_hasta
  ) x
  group by metodo
  order by total desc;
end;
$$;

revoke execute on function public.informe_metodos_pago(date, date) from public, anon;
grant execute on function public.informe_metodos_pago(date, date) to authenticated;

-- Gastos por dia y categoria.
create function public.informe_gastos_serie(p_desde date, p_hasta date)
returns table (fecha date, categoria text, monto numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  select e.expense_date as fecha, ec.name as categoria, sum(e.amount) as monto
  from public.expenses e
  join public.expense_categories ec on ec.id = e.category_id
  where e.expense_date between p_desde and p_hasta
  group by e.expense_date, ec.name
  order by fecha;
end;
$$;

revoke execute on function public.informe_gastos_serie(date, date) from public, anon;
grant execute on function public.informe_gastos_serie(date, date) to authenticated;

-- Compras por dia y proveedor.
create function public.informe_compras_serie(p_desde date, p_hasta date)
returns table (fecha date, proveedor text, monto numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  select pu.purchase_date as fecha, s.name as proveedor, sum(pi.line_total) as monto
  from public.purchase_items pi
  join public.purchases pu on pu.id = pi.purchase_id
  join public.suppliers s on s.id = pu.supplier_id
  where pu.purchase_date between p_desde and p_hasta
  group by pu.purchase_date, s.name
  order by fecha;
end;
$$;

revoke execute on function public.informe_compras_serie(date, date) from public, anon;
grant execute on function public.informe_compras_serie(date, date) to authenticated;

-- Ganancia real por dia: ventas calificadas, costo de productos vendidos
-- (qty x product_costs.cost_price VIGENTE, sin costo registrado = 0),
-- gastos, y unidades vendidas sin costo registrado (para la advertencia
-- visible del informe). La resta se calcula aqui, no en el cliente.
create function public.informe_ganancia_serie(p_desde date, p_hasta date)
returns table (
  fecha date,
  ventas numeric,
  costo_productos numeric,
  gastos numeric,
  ganancia numeric,
  unidades_sin_costo int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  ventas_dia as (
    select o.created_at::date as fecha, sum(o.total) as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
    group by o.created_at::date
    union all
    select s.created_at::date as fecha, sum(s.total) as monto
    from public.pos_sales s
    where s.created_at::date between p_desde and p_hasta
    group by s.created_at::date
  ),
  ventas_agrupadas as (
    select fecha, sum(monto) as monto
    from ventas_dia
    group by fecha
  ),
  items_vendidos as (
    select o.created_at::date as fecha, oi.product_id, oi.qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
      and oi.product_id is not null
    union all
    select s.created_at::date as fecha, psi.product_id, psi.qty
    from public.pos_sale_items psi
    join public.pos_sales s on s.id = psi.sale_id
    where s.created_at::date between p_desde and p_hasta
      and psi.product_id is not null
  ),
  costo_dia as (
    select
      iv.fecha,
      sum(iv.qty * coalesce(pc.cost_price, 0)) as costo,
      sum(iv.qty) filter (where pc.cost_price is null)::int as unidades_sin_costo
    from items_vendidos iv
    left join public.product_costs pc on pc.product_id = iv.product_id
    group by iv.fecha
  ),
  gastos_dia as (
    select e.expense_date as fecha, sum(e.amount) as monto
    from public.expenses e
    where e.expense_date between p_desde and p_hasta
    group by e.expense_date
  )
  select
    d.fecha,
    coalesce(v.monto, 0) as ventas,
    coalesce(c.costo, 0) as costo_productos,
    coalesce(g.monto, 0) as gastos,
    coalesce(v.monto, 0) - coalesce(c.costo, 0) - coalesce(g.monto, 0) as ganancia,
    coalesce(c.unidades_sin_costo, 0) as unidades_sin_costo
  from dias d
  left join ventas_agrupadas v on v.fecha = d.fecha
  left join costo_dia c on c.fecha = d.fecha
  left join gastos_dia g on g.fecha = d.fecha
  order by d.fecha;
end;
$$;

revoke execute on function public.informe_ganancia_serie(date, date) from public, anon;
grant execute on function public.informe_ganancia_serie(date, date) to authenticated;
```

- [ ] **Step 2: Aplicar la migración**

Aplícala a la base de datos real con la herramienta MCP de Supabase
`apply_migration` (nombre: `informes`, con el SQL completo de arriba).

- [ ] **Step 3: Regenerar tipos**

Usa `generate_typescript_types` del MCP de Supabase y sobrescribe
`src/lib/supabase/database.types.ts` completo con el resultado (el
archivo ya existe, es una regeneración total, no una edición manual).

- [ ] **Step 4: Verificar en vivo**

Con una transacción `DO $$ ... RAISE EXCEPTION ... END $$;` que revierta
todo (sin dejar residuo), confirma: (a) llamar cualquiera de las 6
funciones sin ser admin falla con "No autorizado."; (b)
`informe_ventas_serie` con un pedido de prueba `status = 'pagado'` y una
venta POS de prueba en el rango devuelve los montos correctos separados
por canal; (c) `informe_productos_vendidos` refleja unidades e ingreso
correctos para un producto de prueba vendido en ambos canales; (d)
`informe_ganancia_serie` con un producto de prueba SIN fila en
`product_costs` devuelve `unidades_sin_costo > 0` y `costo_productos`
correspondiente a costo 0 para esas unidades, y con un producto CON costo
registrado calcula `costo_productos = qty * cost_price` correctamente, y
`ganancia = ventas - costo_productos - gastos` se sostiene exactamente.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/018_informes.sql src/lib/supabase/database.types.ts
git commit -m "feat: migracion de informes - 6 funciones SQL de agregacion (Fase 12)"
```

---

## Task 2: Validación y helpers de rango de fechas

**Files:**
- Create: `src/lib/validation/informes.ts`
- Create: `src/lib/validation/__tests__/informes.test.ts`
- Create: `src/lib/informes/rango-fecha.ts`
- Create: `src/lib/informes/__tests__/rango-fecha.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `rangoFechaSchema`/`RangoFechaInput` (Task 2), `RangoFecha`
  (tipo `{ desde: string; hasta: string }`), `rangoHoy()`,
  `rangoEstaSemana()`, `rangoMesActual()`, `rangoEsteAnio()`,
  `resolverRango(params)` — consumidos por el componente de filtro
  (Task 3) y por las 6 páginas de informe (Tasks 4-9).

- [ ] **Step 1: Escribir los tests de `rangoFechaSchema` (deben fallar)**

`src/lib/validation/__tests__/informes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rangoFechaSchema } from "../informes";

describe("rangoFechaSchema", () => {
  it("acepta un rango valido", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-01", hasta: "2026-01-31" })
        .success,
    ).toBe(true);
  });

  it("acepta un rango de un solo dia", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-01", hasta: "2026-01-01" })
        .success,
    ).toBe(true);
  });

  it("rechaza cuando hasta es anterior a desde", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-31", hasta: "2026-01-01" })
        .success,
    ).toBe(false);
  });

  it("rechaza una fecha desde malformada", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "31/01/2026", hasta: "2026-01-31" })
        .success,
    ).toBe(false);
  });

  it("rechaza una fecha hasta malformada", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-01", hasta: "not-a-date" })
        .success,
    ).toBe(false);
  });

  it("rechaza cuando falta desde", () => {
    expect(rangoFechaSchema.safeParse({ hasta: "2026-01-31" }).success).toBe(
      false,
    );
  });
});
```

Run: `pnpm test src/lib/validation/__tests__/informes.test.ts`
Expected: FAIL con "Cannot find module '../informes'".

- [ ] **Step 2: Implementar `rangoFechaSchema`**

`src/lib/validation/informes.ts`:

```ts
import { z } from "zod";

export const rangoFechaSchema = z
  .object({
    desde: z.iso.date("Ingresa una fecha válida"),
    hasta: z.iso.date("Ingresa una fecha válida"),
  })
  .refine((data) => data.hasta >= data.desde, {
    message: "La fecha final no puede ser anterior a la inicial",
    path: ["hasta"],
  });

export type RangoFechaInput = z.infer<typeof rangoFechaSchema>;
```

Run: `pnpm test src/lib/validation/__tests__/informes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Escribir los tests de `rango-fecha.ts` (deben fallar)**

`src/lib/informes/__tests__/rango-fecha.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  rangoEsteAnio,
  rangoEstaSemana,
  rangoHoy,
  rangoMesActual,
  resolverRango,
} from "../rango-fecha";

describe("rangoHoy", () => {
  it("devuelve el mismo dia como desde y hasta", () => {
    const hoy = new Date(Date.UTC(2026, 7, 15));
    expect(rangoHoy(hoy)).toEqual({ desde: "2026-08-15", hasta: "2026-08-15" });
  });
});

describe("rangoMesActual", () => {
  it("devuelve del dia 1 del mes hasta la fecha dada", () => {
    const hoy = new Date(Date.UTC(2026, 7, 15));
    expect(rangoMesActual(hoy)).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-15",
    });
  });
});

describe("rangoEstaSemana", () => {
  it("devuelve desde el lunes de esta semana hasta la fecha dada", () => {
    const sabado = new Date(Date.UTC(2026, 7, 15));
    expect(rangoEstaSemana(sabado)).toEqual({
      desde: "2026-08-10",
      hasta: "2026-08-15",
    });
  });

  it("cuando la fecha dada es domingo, retrocede al lunes anterior", () => {
    const domingo = new Date(Date.UTC(2026, 7, 16));
    expect(rangoEstaSemana(domingo)).toEqual({
      desde: "2026-08-10",
      hasta: "2026-08-16",
    });
  });
});

describe("rangoEsteAnio", () => {
  it("devuelve desde el 1 de enero hasta la fecha dada", () => {
    const hoy = new Date(Date.UTC(2026, 7, 15));
    expect(rangoEsteAnio(hoy)).toEqual({
      desde: "2026-01-01",
      hasta: "2026-08-15",
    });
  });
});

describe("resolverRango", () => {
  it("usa el rango recibido cuando es valido", () => {
    expect(
      resolverRango({ desde: "2026-01-01", hasta: "2026-01-31" }),
    ).toEqual({ desde: "2026-01-01", hasta: "2026-01-31" });
  });

  it("cae al mes actual cuando faltan los parametros", () => {
    const resultado = resolverRango({});
    expect(resultado.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("cae al mes actual cuando hasta es anterior a desde", () => {
    const resultado = resolverRango({
      desde: "2026-02-01",
      hasta: "2026-01-01",
    });
    expect(resultado.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("cae al mes actual cuando las fechas estan malformadas", () => {
    const resultado = resolverRango({
      desde: "no-es-fecha",
      hasta: "2026-01-31",
    });
    expect(resultado.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
```

Run: `pnpm test src/lib/informes/__tests__/rango-fecha.test.ts`
Expected: FAIL con "Cannot find module '../rango-fecha'".

- [ ] **Step 4: Implementar `rango-fecha.ts`**

```ts
import { rangoFechaSchema } from "@/lib/validation/informes";

export type RangoFecha = { desde: string; hasta: string };

function formatearFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function rangoHoy(hoy: Date = new Date()): RangoFecha {
  const fecha = formatearFecha(hoy);
  return { desde: fecha, hasta: fecha };
}

export function rangoEstaSemana(hoy: Date = new Date()): RangoFecha {
  const diaSemana = hoy.getUTCDay();
  const offsetLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  const desde = new Date(
    Date.UTC(
      hoy.getUTCFullYear(),
      hoy.getUTCMonth(),
      hoy.getUTCDate() - offsetLunes,
    ),
  );
  return { desde: formatearFecha(desde), hasta: formatearFecha(hoy) };
}

export function rangoMesActual(hoy: Date = new Date()): RangoFecha {
  const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  return { desde: formatearFecha(desde), hasta: formatearFecha(hoy) };
}

export function rangoEsteAnio(hoy: Date = new Date()): RangoFecha {
  const desde = new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1));
  return { desde: formatearFecha(desde), hasta: formatearFecha(hoy) };
}

export function resolverRango(searchParams: {
  desde?: string;
  hasta?: string;
}): RangoFecha {
  const parsed = rangoFechaSchema.safeParse({
    desde: searchParams.desde,
    hasta: searchParams.hasta,
  });
  if (!parsed.success) {
    return rangoMesActual();
  }
  return parsed.data;
}
```

Run: `pnpm test src/lib/informes/__tests__/rango-fecha.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Verificar build, lint y suite completa**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/informes.ts src/lib/validation/__tests__/informes.test.ts src/lib/informes
git commit -m "feat: validacion y helpers de rango de fechas para informes (Fase 12)"
```

---

## Task 3: Componente compartido de filtro de fechas

**Files:**
- Create: `src/app/admin/informes/rango-fecha-filtro.tsx`

**Interfaces:**
- Consumes: `rangoHoy`, `rangoEstaSemana`, `rangoMesActual`,
  `rangoEsteAnio` de `src/lib/informes/rango-fecha.ts` (Task 2), `Button`
  de `@/components/ui/button` (ya existe).
- Produces: `RangoFechaFiltro({ basePath, desde, hasta })` — usado por
  las 6 páginas de informe con filtro de fecha (Tasks 4-9, todas menos
  stock bajo).

- [ ] **Step 1: Crear `rango-fecha-filtro.tsx`**

```tsx
import Link from "next/link";
import {
  rangoEsteAnio,
  rangoEstaSemana,
  rangoHoy,
  rangoMesActual,
} from "@/lib/informes/rango-fecha";
import { Button } from "@/components/ui/button";

function enlacePreset(
  basePath: string,
  rango: { desde: string; hasta: string },
) {
  return `${basePath}?desde=${rango.desde}&hasta=${rango.hasta}`;
}

export function RangoFechaFiltro({
  basePath,
  desde,
  hasta,
}: {
  basePath: string;
  desde: string;
  hasta: string;
}) {
  const presets = [
    { label: "Hoy", rango: rangoHoy() },
    { label: "Esta semana", rango: rangoEstaSemana() },
    { label: "Este mes", rango: rangoMesActual() },
    { label: "Este año", rango: rangoEsteAnio() },
  ];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Link
            key={preset.label}
            href={enlacePreset(basePath, preset.rango)}
            className="rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            {preset.label}
          </Link>
        ))}
      </div>
      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-end gap-3"
      >
        <div>
          <label htmlFor="desde" className="text-sm text-brand-ciruela">
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={desde}
            className="block rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="text-sm text-brand-ciruela">
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            defaultValue={hasta}
            className="block rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          />
        </div>
        <Button
          type="submit"
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          Filtrar
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos (el componente no se usa todavía en ninguna
página, así que no debe romper nada existente).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/informes/rango-fecha-filtro.tsx
git commit -m "feat: componente compartido de filtro de fechas para informes (Fase 12)"
```

---

## Task 4: Informe de ventas

**Files:**
- Create: `src/app/admin/informes/ventas/page.tsx`
- Create: `src/app/admin/informes/ventas/grafica-ventas.tsx`

**Interfaces:**
- Consumes: RPC `informe_ventas_serie` (Task 1), `resolverRango` (Task 2),
  `RangoFechaFiltro` (Task 3), `formatPrice` de `@/lib/format` (existente),
  componente `chart` de shadcn/ui (ya instalado).
- Produces: nada consumido por otras tasks.

- [ ] **Step 1: Crear `grafica-ventas.tsx`**

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  tienda: { label: "Tienda", color: "#E96A9E" },
  pos: { label: "POS", color: "#D9A441" },
} satisfies ChartConfig;

export function GraficaVentas({
  datos,
}: {
  datos: { fecha: string; tienda: number; pos: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="max-h-80 w-full">
      <BarChart data={datos}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="tienda" fill="var(--color-tienda)" radius={4} />
        <Bar dataKey="pos" fill="var(--color-pos)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaVentas } from "./grafica-ventas";

export default async function InformeVentasPage({
  searchParams,
}: PageProps<"/admin/informes/ventas">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_ventas_serie", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const porFecha = new Map<
    string,
    { fecha: string; tienda: number; pos: number }
  >();
  for (const fila of filas ?? []) {
    const entry =
      porFecha.get(fila.fecha) ?? { fecha: fila.fecha, tienda: 0, pos: 0 };
    if (fila.canal === "tienda") entry.tienda = fila.monto;
    if (fila.canal === "pos") entry.pos = fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datos = Array.from(porFecha.values());
  const totalTienda = datos.reduce((sum, d) => sum + d.tienda, 0);
  const totalPos = datos.reduce((sum, d) => sum + d.pos, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Ventas</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/ventas"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de ventas.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
              <p className="text-sm text-brand-ciruela/70">Tienda</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalTienda)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
              <p className="text-sm text-brand-ciruela/70">POS</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalPos)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
              <p className="text-sm text-brand-ciruela/70">Total</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalTienda + totalPos)}
              </p>
            </div>
          </div>
          {datos.length > 0 && <GraficaVentas datos={datos} />}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Fecha</th>
                <th className="py-2">Tienda</th>
                <th className="py-2">POS</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((fila) => (
                <tr
                  key={fila.fecha}
                  className="border-b border-brand-rosa-claro/50"
                >
                  <td className="py-2">{fila.fecha}</td>
                  <td className="py-2">{formatPrice(fila.tienda)}</td>
                  <td className="py-2">{formatPrice(fila.pos)}</td>
                  <td className="py-2">
                    {formatPrice(fila.tienda + fila.pos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/informes/ventas
git commit -m "feat: informe de ventas tienda y POS (Fase 12)"
```

---

## Task 5: Informe de productos más vendidos

**Files:**
- Create: `src/app/admin/informes/productos/page.tsx`
- Create: `src/app/admin/informes/productos/grafica-productos.tsx`

**Interfaces:**
- Consumes: RPC `informe_productos_vendidos` (Task 1), `resolverRango`
  (Task 2), `RangoFechaFiltro` (Task 3), `formatPrice`.
- Produces: nada consumido por otras tasks.

- [ ] **Step 1: Crear `grafica-productos.tsx`**

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  qty: { label: "Unidades vendidas", color: "#E96A9E" },
} satisfies ChartConfig;

export function GraficaProductos({
  datos,
}: {
  datos: { nombre: string; qty: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="max-h-96 w-full">
      <BarChart data={datos} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis
          dataKey="nombre"
          type="category"
          tickLine={false}
          axisLine={false}
          width={160}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="qty" fill="var(--color-qty)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaProductos } from "./grafica-productos";

const LIMITE = 10;

export default async function InformeProductosPage({
  searchParams,
}: PageProps<"/admin/informes/productos">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc(
    "informe_productos_vendidos",
    { p_desde: desde, p_hasta: hasta, p_limit: LIMITE },
  );

  const datos = (filas ?? []).map((fila) => ({
    productId: fila.product_id,
    nombre: fila.nombre,
    qty: Number(fila.qty),
    ingreso: fila.ingreso,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Productos más vendidos
      </h1>
      <RangoFechaFiltro
        basePath="/admin/informes/productos"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de productos.
        </p>
      ) : (
        <>
          {datos.length > 0 && <GraficaProductos datos={datos} />}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Producto</th>
                <th className="py-2">Unidades</th>
                <th className="py-2">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((fila) => (
                <tr
                  key={fila.productId}
                  className="border-b border-brand-rosa-claro/50"
                >
                  <td className="py-2">{fila.nombre}</td>
                  <td className="py-2">{fila.qty}</td>
                  <td className="py-2">{formatPrice(fila.ingreso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/informes/productos
git commit -m "feat: informe de productos mas vendidos (Fase 12)"
```

---

## Task 6: Informe de métodos de pago

**Files:**
- Create: `src/app/admin/informes/metodos-pago/page.tsx`
- Create: `src/app/admin/informes/metodos-pago/grafica-metodos-pago.tsx`

**Interfaces:**
- Consumes: RPC `informe_metodos_pago` (Task 1), `resolverRango` (Task 2),
  `RangoFechaFiltro` (Task 3), `formatPrice`.
- Produces: nada consumido por otras tasks.

- [ ] **Step 1: Crear `grafica-metodos-pago.tsx`**

```tsx
"use client";

import { Cell, Pie, PieChart } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const PALETA = ["#E96A9E", "#D9A441", "#F29DB8", "#F5B7C8", "#6E2A44"];

export function GraficaMetodosPago({
  datos,
}: {
  datos: { metodo: string; total: number }[];
}) {
  const chartConfig = Object.fromEntries(
    datos.map((d, i) => [
      d.metodo,
      { label: d.metodo, color: PALETA[i % PALETA.length] },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-80"
    >
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="metodo" />} />
        <Pie data={datos} dataKey="total" nameKey="metodo" innerRadius={60}>
          {datos.map((d, i) => (
            <Cell key={d.metodo} fill={PALETA[i % PALETA.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="metodo" />} />
      </PieChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaMetodosPago } from "./grafica-metodos-pago";

export default async function InformeMetodosPagoPage({
  searchParams,
}: PageProps<"/admin/informes/metodos-pago">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_metodos_pago", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const datos = (filas ?? []).map((fila) => ({
    metodo: fila.metodo,
    total: fila.total,
  }));
  const total = datos.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Métodos de pago
      </h1>
      <RangoFechaFiltro
        basePath="/admin/informes/metodos-pago"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de métodos de pago.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
            <p className="text-sm text-brand-ciruela/70">Total del periodo</p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(total)}
            </p>
          </div>
          {datos.length > 0 && <GraficaMetodosPago datos={datos} />}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Método</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((fila) => (
                <tr
                  key={fila.metodo}
                  className="border-b border-brand-rosa-claro/50"
                >
                  <td className="py-2 capitalize">{fila.metodo}</td>
                  <td className="py-2">{formatPrice(fila.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/informes/metodos-pago
git commit -m "feat: informe de metodos de pago (Fase 12)"
```

---

## Task 7: Informe de gastos

**Files:**
- Create: `src/app/admin/informes/gastos/page.tsx`
- Create: `src/app/admin/informes/gastos/grafica-gastos.tsx`

**Interfaces:**
- Consumes: RPC `informe_gastos_serie` (Task 1), `resolverRango` (Task 2),
  `RangoFechaFiltro` (Task 3), `formatPrice`.
- Produces: `GraficaGastos` (misma forma que `GraficaCompras` de la
  Task 8 — no se comparte código entre ambas por ser triviales y de
  dominios distintos, pero mantén la firma idéntica si te resulta natural
  copiarla).

- [ ] **Step 1: Crear `grafica-gastos.tsx`**

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const PALETA = ["#E96A9E", "#D9A441", "#F29DB8", "#F5B7C8", "#6E2A44"];

export function GraficaGastos({
  datos,
  series,
}: {
  datos: Record<string, number | string>[];
  series: { clave: string; etiqueta: string }[];
}) {
  const chartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.clave,
      { label: s.etiqueta, color: PALETA[i % PALETA.length] },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="max-h-80 w-full">
      <BarChart data={datos}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => (
          <Bar
            key={s.clave}
            dataKey={s.clave}
            stackId="a"
            fill={`var(--color-${s.clave})`}
            radius={2}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaGastos } from "./grafica-gastos";

export default async function InformeGastosPage({
  searchParams,
}: PageProps<"/admin/informes/gastos">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_gastos_serie", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const categoriasUnicas = Array.from(
    new Set((filas ?? []).map((f) => f.categoria)),
  );
  const claveDeCategoria = new Map(
    categoriasUnicas.map((cat, i) => [cat, `cat${i}`]),
  );

  const porFecha = new Map<string, Record<string, number | string>>();
  for (const fila of filas ?? []) {
    const clave = claveDeCategoria.get(fila.categoria)!;
    const entry = porFecha.get(fila.fecha) ?? { fecha: fila.fecha };
    entry[clave] = (Number(entry[clave]) || 0) + fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datosGrafica = Array.from(porFecha.values());
  const series = categoriasUnicas.map((cat, i) => ({
    clave: `cat${i}`,
    etiqueta: cat,
  }));

  const totalPorCategoria = new Map<string, number>();
  for (const fila of filas ?? []) {
    totalPorCategoria.set(
      fila.categoria,
      (totalPorCategoria.get(fila.categoria) ?? 0) + fila.monto,
    );
  }
  const total = Array.from(totalPorCategoria.values()).reduce(
    (sum, v) => sum + v,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Gastos</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/gastos"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de gastos.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
            <p className="text-sm text-brand-ciruela/70">Total del periodo</p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(total)}
            </p>
          </div>
          {datosGrafica.length > 0 && (
            <GraficaGastos datos={datosGrafica} series={series} />
          )}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Categoría</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(totalPorCategoria.entries()).map(
                ([categoria, monto]) => (
                  <tr
                    key={categoria}
                    className="border-b border-brand-rosa-claro/50"
                  >
                    <td className="py-2">{categoria}</td>
                    <td className="py-2">{formatPrice(monto)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/informes/gastos
git commit -m "feat: informe de gastos por categoria (Fase 12)"
```

---

## Task 8: Informe de compras

**Files:**
- Create: `src/app/admin/informes/compras/page.tsx`
- Create: `src/app/admin/informes/compras/grafica-compras.tsx`

**Interfaces:**
- Consumes: RPC `informe_compras_serie` (Task 1), `resolverRango`
  (Task 2), `RangoFechaFiltro` (Task 3), `formatPrice`.
- Produces: nada consumido por otras tasks.

- [ ] **Step 1: Crear `grafica-compras.tsx`**

Idéntico a `grafica-gastos.tsx` de la Task 7, cambiando únicamente el
nombre del componente:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const PALETA = ["#E96A9E", "#D9A441", "#F29DB8", "#F5B7C8", "#6E2A44"];

export function GraficaCompras({
  datos,
  series,
}: {
  datos: Record<string, number | string>[];
  series: { clave: string; etiqueta: string }[];
}) {
  const chartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.clave,
      { label: s.etiqueta, color: PALETA[i % PALETA.length] },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="max-h-80 w-full">
      <BarChart data={datos}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => (
          <Bar
            key={s.clave}
            dataKey={s.clave}
            stackId="a"
            fill={`var(--color-${s.clave})`}
            radius={2}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

Mismo patrón de `page.tsx` de gastos (Task 7), cambiando `categoria` por
`proveedor` y la función RPC:

```tsx
import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaCompras } from "./grafica-compras";

export default async function InformeComprasPage({
  searchParams,
}: PageProps<"/admin/informes/compras">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_compras_serie", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const proveedoresUnicos = Array.from(
    new Set((filas ?? []).map((f) => f.proveedor)),
  );
  const claveDeProveedor = new Map(
    proveedoresUnicos.map((prov, i) => [prov, `prov${i}`]),
  );

  const porFecha = new Map<string, Record<string, number | string>>();
  for (const fila of filas ?? []) {
    const clave = claveDeProveedor.get(fila.proveedor)!;
    const entry = porFecha.get(fila.fecha) ?? { fecha: fila.fecha };
    entry[clave] = (Number(entry[clave]) || 0) + fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datosGrafica = Array.from(porFecha.values());
  const series = proveedoresUnicos.map((prov, i) => ({
    clave: `prov${i}`,
    etiqueta: prov,
  }));

  const totalPorProveedor = new Map<string, number>();
  for (const fila of filas ?? []) {
    totalPorProveedor.set(
      fila.proveedor,
      (totalPorProveedor.get(fila.proveedor) ?? 0) + fila.monto,
    );
  }
  const total = Array.from(totalPorProveedor.values()).reduce(
    (sum, v) => sum + v,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Compras</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/compras"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de compras.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
            <p className="text-sm text-brand-ciruela/70">Total del periodo</p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(total)}
            </p>
          </div>
          {datosGrafica.length > 0 && (
            <GraficaCompras datos={datosGrafica} series={series} />
          )}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Proveedor</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(totalPorProveedor.entries()).map(
                ([proveedor, monto]) => (
                  <tr
                    key={proveedor}
                    className="border-b border-brand-rosa-claro/50"
                  >
                    <td className="py-2">{proveedor}</td>
                    <td className="py-2">{formatPrice(monto)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/informes/compras
git commit -m "feat: informe de compras por proveedor (Fase 12)"
```

---

## Task 9: Informe de ganancia real

**Files:**
- Create: `src/app/admin/informes/ganancia/page.tsx`
- Create: `src/app/admin/informes/ganancia/grafica-ganancia.tsx`

**Interfaces:**
- Consumes: RPC `informe_ganancia_serie` (Task 1), `resolverRango`
  (Task 2), `RangoFechaFiltro` (Task 3), `formatPrice`.
- Produces: nada consumido por otras tasks.

- [ ] **Step 1: Crear `grafica-ganancia.tsx`**

```tsx
"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  ventas: { label: "Ventas", color: "#E96A9E" },
  costo_productos: { label: "Costo de productos", color: "#D9A441" },
  gastos: { label: "Gastos", color: "#6E2A44" },
  ganancia: { label: "Ganancia", color: "#F29DB8" },
} satisfies ChartConfig;

export function GraficaGanancia({
  datos,
}: {
  datos: {
    fecha: string;
    ventas: number;
    costo_productos: number;
    gastos: number;
    ganancia: number;
  }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="max-h-80 w-full">
      <LineChart data={datos}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          dataKey="ventas"
          stroke="var(--color-ventas)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="costo_productos"
          stroke="var(--color-costo_productos)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="gastos"
          stroke="var(--color-gastos)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="ganancia"
          stroke="var(--color-ganancia)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaGanancia } from "./grafica-ganancia";

export default async function InformeGananciaPage({
  searchParams,
}: PageProps<"/admin/informes/ganancia">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc(
    "informe_ganancia_serie",
    { p_desde: desde, p_hasta: hasta },
  );

  const datos = filas ?? [];
  const totalVentas = datos.reduce((sum, f) => sum + f.ventas, 0);
  const totalCosto = datos.reduce((sum, f) => sum + f.costo_productos, 0);
  const totalGastos = datos.reduce((sum, f) => sum + f.gastos, 0);
  const totalGanancia = datos.reduce((sum, f) => sum + f.ganancia, 0);
  const unidadesSinCosto = datos.reduce(
    (sum, f) => sum + f.unidades_sin_costo,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Ganancia real
      </h1>
      <RangoFechaFiltro
        basePath="/admin/informes/ganancia"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de ganancia.
        </p>
      ) : (
        <>
          {unidadesSinCosto > 0 && (
            <p className="rounded-lg border border-brand-oro bg-brand-crema p-4 text-sm text-brand-ciruela">
              {unidadesSinCosto} unidad{unidadesSinCosto === 1 ? "" : "es"}{" "}
              vendida{unidadesSinCosto === 1 ? "" : "s"} en este periodo
              correspond{unidadesSinCosto === 1 ? "e" : "en"} a productos sin
              costo registrado. Se contaron con costo 0, así que la ganancia
              mostrada puede estar sobreestimada.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
              <p className="text-sm text-brand-ciruela/70">Ventas</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalVentas)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
              <p className="text-sm text-brand-ciruela/70">
                Costo de productos
              </p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalCosto)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
              <p className="text-sm text-brand-ciruela/70">Gastos</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalGastos)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
              <p className="text-sm text-brand-ciruela/70">Ganancia</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalGanancia)}
              </p>
            </div>
          </div>
          {datos.length > 0 && <GraficaGanancia datos={datos} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/informes/ganancia
git commit -m "feat: informe de ganancia real (Fase 12)"
```

---

## Task 10: Informe de stock bajo + umbral configurable

**Files:**
- Create: `src/app/admin/informes/stock-bajo/page.tsx`
- Modify: `src/lib/validation/store-settings.ts`
- Modify: `src/lib/validation/__tests__/store-settings.test.ts`
- Modify: `src/app/superadmin/ajustes/ajustes-form.tsx`
- Modify: `src/app/superadmin/ajustes/page.tsx`

**Interfaces:**
- Consumes: `STORE_SETTINGS_KEYS` (existente, se extiende).
- Produces: clave `stock_bajo_umbral` en `store_settings`, consumida
  únicamente por esta misma página.

- [ ] **Step 1: Extender `storeSettingsSchema`**

En `src/lib/validation/store-settings.ts`, agrega el campo al final del
objeto del schema (después de `redesWhatsapp`):

```ts
  stockBajoUmbral: z
    .number({ error: "Ingresa un umbral válido" })
    .int("El umbral debe ser un número entero")
    .min(0, "El umbral no puede ser negativo"),
```

Y agrega la entrada correspondiente en `STORE_SETTINGS_KEYS`:

```ts
  stockBajoUmbral: "stock_bajo_umbral",
```

- [ ] **Step 2: Actualizar el test de `storeSettingsSchema`**

En `src/lib/validation/__tests__/store-settings.test.ts`, agrega
`stockBajoUmbral: 5,` al objeto `base`, y agrega dos tests nuevos justo
después del test `"rechaza un costo de envio negativo"`:

```ts
  it("rechaza un umbral de stock bajo negativo", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      stockBajoUmbral: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un umbral de stock bajo con decimales", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      stockBajoUmbral: 5.5,
    });
    expect(result.success).toBe(false);
  });
```

Run: `pnpm test src/lib/validation/__tests__/store-settings.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 3: Agregar el campo al formulario de Ajustes**

En `src/app/superadmin/ajustes/ajustes-form.tsx`, agrega una nueva
sección después del bloque "Envío" (antes de "Redes sociales"):

```tsx
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg text-brand-ciruela">
          Inventario
        </h2>
        <div>
          <label
            htmlFor="stockBajoUmbral"
            className="text-sm text-brand-ciruela"
          >
            Umbral de stock bajo (unidades)
          </label>
          <Input
            id="stockBajoUmbral"
            type="number"
            {...register("stockBajoUmbral", { valueAsNumber: true })}
          />
          {errors.stockBajoUmbral && (
            <p className="text-sm text-red-600">
              {errors.stockBajoUmbral.message}
            </p>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Leer el valor por defecto en la página de Ajustes**

En `src/app/superadmin/ajustes/page.tsx`, agrega al objeto
`defaultValues` (después de `envioCostoDefecto`):

```ts
    stockBajoUmbral: Number(
      valueByKey.get(STORE_SETTINGS_KEYS.stockBajoUmbral) ?? 5,
    ),
```

- [ ] **Step 5: Crear el informe de stock bajo**

```tsx
import { createClient } from "@/lib/supabase/server";
import { STORE_SETTINGS_KEYS } from "@/lib/validation/store-settings";

const UMBRAL_POR_DEFECTO = 5;

export default async function InformeStockBajoPage() {
  const supabase = await createClient();

  const { data: ajuste } = await supabase
    .from("store_settings")
    .select("value")
    .eq("key", STORE_SETTINGS_KEYS.stockBajoUmbral)
    .maybeSingle();
  const umbral = Number(ajuste?.value ?? UMBRAL_POR_DEFECTO);

  const { data: todosLosProductos } = await supabase
    .from("products")
    .select("id, name");
  const nombrePorProductoId = new Map(
    (todosLosProductos ?? []).map((p) => [p.id, p.name]),
  );

  const { data: productosConVariante } = await supabase
    .from("product_variants")
    .select("product_id");
  const idsConVariante = new Set(
    (productosConVariante ?? []).map((v) => v.product_id),
  );

  const { data: productos, error: errorProductos } = await supabase
    .from("products")
    .select("id, name, sku, stock")
    .lte("stock", umbral)
    .order("stock");

  const { data: variantes, error: errorVariantes } = await supabase
    .from("product_variants")
    .select("id, name, sku, stock, product_id")
    .lte("stock", umbral)
    .order("stock");

  const error = errorProductos || errorVariantes;
  const productosSinVariante = (productos ?? []).filter(
    (p) => !idsConVariante.has(p.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Stock bajo
      </h1>
      <p className="text-sm text-brand-ciruela/70">
        Productos y variantes con {umbral} unidades o menos. El umbral se
        edita en Ajustes de tienda.
      </p>
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de stock bajo.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Producto</th>
              <th className="py-2">SKU</th>
              <th className="py-2">Stock</th>
            </tr>
          </thead>
          <tbody>
            {productosSinVariante.map((p) => (
              <tr key={p.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{p.name}</td>
                <td className="py-2">{p.sku}</td>
                <td className="py-2">{p.stock}</td>
              </tr>
            ))}
            {(variantes ?? []).map((v) => (
              <tr key={v.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">
                  {nombrePorProductoId.get(v.product_id) ?? "-"} — {v.name}
                </td>
                <td className="py-2">{v.sku}</td>
                <td className="py-2">{v.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/informes/stock-bajo src/lib/validation/store-settings.ts src/lib/validation/__tests__/store-settings.test.ts src/app/superadmin/ajustes
git commit -m "feat: informe de stock bajo y umbral configurable (Fase 12)"
```

---

## Task 11: Índice de informes y navegación

**Files:**
- Create: `src/app/admin/informes/page.tsx`
- Modify: `src/app/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: rutas creadas en Tasks 4-10.
- Produces: nada.

- [ ] **Step 1: Crear el índice `/admin/informes`**

```tsx
import Link from "next/link";
import {
  AlertTriangle,
  CreditCard,
  Package,
  PiggyBank,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

const INFORMES = [
  {
    href: "/admin/informes/ventas",
    titulo: "Ventas",
    descripcion: "Tienda y POS combinados, por periodo.",
    Icono: TrendingUp,
  },
  {
    href: "/admin/informes/productos",
    titulo: "Productos más vendidos",
    descripcion: "Top productos por unidades e ingreso.",
    Icono: Package,
  },
  {
    href: "/admin/informes/stock-bajo",
    titulo: "Stock bajo",
    descripcion: "Productos y variantes con pocas unidades.",
    Icono: AlertTriangle,
  },
  {
    href: "/admin/informes/metodos-pago",
    titulo: "Métodos de pago",
    descripcion: "Ingreso por método, ambos canales.",
    Icono: CreditCard,
  },
  {
    href: "/admin/informes/gastos",
    titulo: "Gastos",
    descripcion: "Gastos por categoría y periodo.",
    Icono: Receipt,
  },
  {
    href: "/admin/informes/compras",
    titulo: "Compras",
    descripcion: "Compras por proveedor y periodo.",
    Icono: ShoppingCart,
  },
  {
    href: "/admin/informes/ganancia",
    titulo: "Ganancia real",
    descripcion: "Ventas menos costo de productos y gastos.",
    Icono: PiggyBank,
  },
];

export default function InformesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Informes</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INFORMES.map(({ href, titulo, descripcion, Icono }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4 hover:border-brand-rosa"
          >
            <Icono className="h-6 w-6 text-brand-rosa" />
            <p className="font-heading text-lg text-brand-ciruela">
              {titulo}
            </p>
            <p className="text-sm text-brand-ciruela/70">{descripcion}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Agregar el enlace en `admin-nav.tsx`**

Agrega, después del enlace "Compras" y antes del cierre de `</nav>`:

```tsx
      <Link href="/admin/informes" className="hover:text-brand-rosa">
        Informes
      </Link>
```

- [ ] **Step 3: Verificar build y lint, y navegar manualmente**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos. Levanta `pnpm dev`, entra a `/admin/informes`
autenticado como admin, y confirma que las 7 tarjetas enlazan a páginas
que cargan sin error (aunque estén vacías de datos).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/informes/page.tsx src/app/admin/admin-nav.tsx
git commit -m "feat: indice de informes y enlace de navegacion (Fase 12)"
```

---

## Task 12: Verificación de integración end-to-end

**Files:** ninguno nuevo (script desechable, no se commitea).

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-11.

- [ ] **Step 1: Confirmar que el servidor de desarrollo está limpio**

Verificar que no hay un proceso `next dev` obsoleto (revisa el puerto
3000 en Windows con `Stop-Process` si hace falta). Si no hay ninguno,
arrancar uno limpio con `pnpm dev` en segundo plano.

- [ ] **Step 2: Verificar rutas con `curl`**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/informes
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/informes/ganancia
```

Expected: ambas redirigen (307/302) hacia `/login` sin sesión.

- [ ] **Step 3: Script de verificación de negocio (`.mjs` desechable)**

Crea `scripts/tmp-verify-fase12.mjs` (fuera de `src/`, para borrar al
final) que, con `dotenv` + `.env.local` y el cliente de service role
(`createAdminClient`, mismo patrón que `scripts/seed-superadmin.ts`):

1. Cree un usuario de prueba `staff` y otro `admin` (mismo patrón que
   verificaciones de fases anteriores: crear con
   `admin.auth.admin.createUser`, luego actualizar `profiles.role` con
   el cliente admin).
2. Con un cliente autenticado como `staff` (`signInWithPassword`),
   invoque cada una de las 6 funciones RPC nuevas
   (`informe_ventas_serie`, `informe_productos_vendidos`,
   `informe_metodos_pago`, `informe_gastos_serie`,
   `informe_compras_serie`, `informe_ganancia_serie`) con un rango de
   fechas cualquiera — las seis deben devolver un error (`No
   autorizado.`), nunca datos.
3. Con el cliente de service role, cree datos de prueba con montos
   conocidos y fechas de HOY: un proveedor, un producto con
   `product_costs.cost_price` conocido (ej. 3000), una categoría de
   gasto, un pedido en `orders` con `status = 'pagado'` y `total`
   conocido (con su `order_item` referenciando el producto de prueba),
   una venta en `pos_sales` con `total` conocido (con su
   `pos_sale_item` referenciando el mismo producto), un gasto en
   `expenses` con `amount` conocido, y una compra vía la RPC
   `create_purchase` con `unitCost` conocido para el mismo producto.
   Antes de insertar, lee el total que cada informe devuelve para el
   rango "hoy" (probablemente 0 si la base está limpia, pero no lo
   asumas — la comparación debe ser por diferencia, no por valor
   absoluto).
4. Con un cliente autenticado como `admin`, invoque las 6 funciones para
   el rango "hoy" y confirme que el delta (después menos antes) de cada
   total coincide exactamente con los montos de prueba insertados:
   ventas de tienda, ventas POS, unidades e ingreso del producto de
   prueba, el método de pago usado, el monto del gasto, el monto de la
   compra, y en `informe_ganancia_serie` que `costo_productos` refleje
   `qty_vendida_del_producto_de_prueba * cost_price_conocido` y que
   `ganancia = ventas - costo_productos - gastos` se sostenga para el
   delta.
5. Limpie TODOS los datos de prueba en orden inverso de dependencias
   (order_items, orders, pos_sale_items, pos_sales, expenses,
   purchase_items, purchases, product_costs del producto de prueba,
   products de prueba, suppliers de prueba, expense_categories de
   prueba, ambos usuarios de prueba y sus perfiles).

Run: `node scripts/tmp-verify-fase12.mjs`
Expected: todos los pasos imprimen `OK`.

- [ ] **Step 4: Limpieza**

```bash
rm -f scripts/tmp-verify-fase12.mjs
```

Detener el servidor de desarrollo si se levantó en el Step 1. No hay
commit en esta tarea.

---

## Cierre de fase

Al completar la Task 12, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (`fase-12-informes`, creada al iniciar la
ejecución de este plan, con base en `master`) para fusionar, verificar y
subir.
