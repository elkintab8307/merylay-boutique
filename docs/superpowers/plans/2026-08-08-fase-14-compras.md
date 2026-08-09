# Fase 14 — Compras y costo de producto: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar el costo real de cada producto mediante dos
mecanismos: edición manual en el formulario de producto (uso habitual) y
un módulo formal de Compras a proveedores (uso puntual, que además suma
stock atómicamente). El costo vive en una tabla separada
(`product_costs`) con RLS restringida a admin, nunca en la tabla
`products` de lectura pública — para que "solo admin ve el costo" sea una
garantía real, no una omisión de la UI.

**Architecture:** Cuatro tablas nuevas (`product_costs`, `suppliers`,
`purchases`, `purchase_items`) con RLS restringida a `is_admin()`, una RPC
atómica `create_purchase` (mismo patrón que `create_pos_sale`/
`create_order`: bloqueo de fila, todo o nada), y CRUDs admin siguiendo el
patrón ya establecido en `/admin/gastos` y `/admin/productos`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions),
Supabase (RLS + RPC), zod, react-hook-form (`useFieldArray` para líneas de
compra, mismo patrón ya usado para variantes de producto), Tailwind,
Vitest.

## Global Constraints

- Toda la UI, textos y mensajes de error en español.
- TypeScript estricto; nada de `any` sin justificar.
- El costo de producto (`product_costs`) **nunca** se agrega a la tabla
  `products` — vive en su propia tabla con RLS restringida a `is_admin()`,
  ya que `products` tiene lectura pública para la tienda.
- RLS de `product_costs`, `suppliers`, `purchases`, `purchase_items`
  restringida a `is_admin()` en las cuatro — `staff` sin ninguna policy,
  sin acceso alguno (ni lectura).
- Al registrar una compra, el costo del producto se **sobrescribe** con el
  costo unitario de esa compra (no se promedia) — decisión ya tomada.
- El costo se registra a nivel de producto general, nunca por variante.
- `qty > 0`, `unit_cost > 0` en `purchase_items` (constraints de base de
  datos, más validación zod del lado del formulario).
- `purchase_date` no puede ser futura (mismo patrón corregido de la Fase
  13: `z.iso.date(...)` + refine, nunca solo comparación de string sin
  validar formato).
- Commits atómicos en español después de cada tarea funcional.
- Spec de referencia: `docs/superpowers/specs/2026-08-08-fase-14-compras-design.md`.

---

## Mapa de archivos

```
supabase/migrations/015_compras.sql            # nuevo — via Supabase MCP
src/lib/supabase/database.types.ts             # regenerado via Supabase MCP

src/lib/validation/proveedor.ts                # nuevo — proveedorSchema
src/lib/validation/__tests__/proveedor.test.ts # nuevo
src/lib/validation/compra.ts                   # nuevo — compraSchema
src/lib/validation/__tests__/compra.test.ts    # nuevo
src/lib/validation/producto.ts                 # modificado — agrega costPrice

src/app/admin/productos/actions.ts             # modificado — lee/escribe product_costs
src/app/admin/productos/producto-form.tsx      # modificado — campo Costo de compra
src/app/admin/productos/nuevo/page.tsx         # modificado — costPrice: null
src/app/admin/productos/[id]/editar/page.tsx   # modificado — lee product_costs

src/app/admin/compras/proveedores/actions.ts             # nuevo
src/app/admin/compras/proveedores/page.tsx               # nuevo
src/app/admin/compras/proveedores/proveedor-form.tsx     # nuevo
src/app/admin/compras/proveedores/toggle-proveedor-button.tsx # nuevo
src/app/admin/compras/proveedores/nuevo/page.tsx         # nuevo
src/app/admin/compras/proveedores/[id]/editar/page.tsx   # nuevo

src/app/admin/compras/actions.ts               # nuevo — iniciarCompra
src/app/admin/compras/page.tsx                 # nuevo — lista de compras
src/app/admin/compras/nueva/page.tsx           # nuevo
src/app/admin/compras/compra-form.tsx           # nuevo — lineas dinamicas

src/app/admin/admin-nav.tsx                    # modificado — agrega "Compras"
```

---

### Task 1: Migración — esquema, RLS y RPC atómica

**Files:**
- Create (vía Supabase MCP `apply_migration`, nombre `compras` — confirmar
  el número siguiente con `list_migrations`; se espera `015_compras`):
  cuatro tablas + RLS + la función `create_purchase`.
- Regenerar `src/lib/supabase/database.types.ts` (Supabase MCP
  `generate_typescript_types`).

**Interfaces:**
- Produces: tablas `product_costs` (`product_id, cost_price, updated_at`),
  `suppliers` (`id, name, phone, is_active, created_at`), `purchases`
  (`id, supplier_id, purchase_date, created_by, created_at`),
  `purchase_items` (`id, purchase_id, product_id, qty, unit_cost,
  line_total`); RPC `create_purchase(p_supplier_id uuid, p_purchase_date
  date, p_items jsonb) returns public.purchases` — usadas por Tasks 3, 4,
  5.

- [ ] **Step 1: Confirmar el número de migración**

Usar el Supabase MCP `list_migrations` para confirmar que la última
migración aplicada es `014_gastos`, así que esta debe ser `015`.

- [ ] **Step 2: Aplicar la migración**

Usar el Supabase MCP `apply_migration` con `name: "compras"` y este SQL
completo:

```sql
create table public.product_costs (
  product_id uuid primary key references public.products(id),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  purchase_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  product_id uuid not null references public.products(id),
  qty integer not null check (qty > 0),
  unit_cost numeric(12,2) not null check (unit_cost > 0),
  line_total numeric(12,2) not null check (line_total > 0)
);

create index purchase_items_purchase_id_idx on public.purchase_items(purchase_id);
create index purchase_items_product_id_idx on public.purchase_items(product_id);
create index purchases_supplier_id_idx on public.purchases(supplier_id);

alter table public.product_costs enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "product_costs_all_admin"
  on public.product_costs for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "suppliers_all_admin"
  on public.suppliers for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "purchases_all_admin"
  on public.purchases for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "purchase_items_all_admin"
  on public.purchase_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- Registra una compra a un proveedor: crea la cabecera, cada linea, suma
-- stock al producto y sobrescribe su costo vigente con el costo de esta
-- compra (el mas reciente gana). Bloquea cada fila de producto antes de
-- sumar stock para evitar condiciones de carrera con otra compra o venta
-- concurrente del mismo producto.
create or replace function public.create_purchase(
  p_supplier_id uuid,
  p_purchase_date date,
  p_items jsonb
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_purchase public.purchases;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_cost numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene productos.';
  end if;

  insert into public.purchases (supplier_id, purchase_date, created_by)
  values (p_supplier_id, p_purchase_date, auth.uid())
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_cost := (v_item->>'unitCost')::numeric;

    if v_qty <= 0 then
      raise exception 'La cantidad debe ser mayor a cero.';
    end if;
    if v_unit_cost <= 0 then
      raise exception 'El costo unitario debe ser mayor a cero.';
    end if;

    -- Bloquea la fila del producto antes de sumar stock, para que dos
    -- compras (o una compra y una venta) concurrentes del mismo producto
    -- no se pisen entre si.
    perform 1 from public.products where id = v_product_id for update;
    if not found then
      raise exception 'Producto no encontrado.';
    end if;

    insert into public.purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
    values (v_purchase_id, v_product_id, v_qty, v_unit_cost, v_qty * v_unit_cost);

    update public.products set stock = stock + v_qty where id = v_product_id;

    insert into public.product_costs (product_id, cost_price, updated_at)
    values (v_product_id, v_unit_cost, now())
    on conflict (product_id) do update
      set cost_price = excluded.cost_price, updated_at = excluded.updated_at;
  end loop;

  select * into v_purchase from public.purchases where id = v_purchase_id;
  return v_purchase;
end;
$$;

revoke execute on function public.create_purchase(uuid, date, jsonb) from public, anon;
grant execute on function public.create_purchase(uuid, date, jsonb) to authenticated;
```

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Usar el Supabase MCP `generate_typescript_types` y sobrescribir
`src/lib/supabase/database.types.ts` con el resultado.

- [ ] **Step 4: Verificación de humo (Supabase MCP `execute_sql`, solo lectura)**

```sql
select policyname, cmd from pg_policies
where tablename in ('product_costs', 'suppliers', 'purchases', 'purchase_items');

select routine_name from information_schema.routines
where routine_name = 'create_purchase';
```

Expected: 4 policies (una por tabla, todas `is_admin()`), la función
existe.

- [ ] **Step 5: Verificar que el resto del proyecto sigue compilando**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/015_compras.sql src/lib/supabase/database.types.ts
git commit -m "feat: migracion de compras - tablas, RLS y RPC atomica (Fase 14)"
```

---

### Task 2: Schemas de validación (proveedor y compra)

**Files:**
- Create: `src/lib/validation/proveedor.ts`
- Test: `src/lib/validation/__tests__/proveedor.test.ts`
- Create: `src/lib/validation/compra.ts`
- Test: `src/lib/validation/__tests__/compra.test.ts`

**Interfaces:**
- Produces: `proveedorSchema` (zod), `type ProveedorInput`, `compraSchema`
  (zod), `type CompraInput` — usados por Tasks 3, 4 y 5.

- [ ] **Step 1: Escribir el test que falla (proveedor)**

```ts
import { describe, expect, it } from "vitest";
import { proveedorSchema } from "../proveedor";

describe("proveedorSchema", () => {
  const base = { name: "Textiles del Valle", phone: "3001234567", isActive: true };

  it("acepta datos validos", () => {
    expect(proveedorSchema.safeParse(base).success).toBe(true);
  });

  it("acepta sin telefono", () => {
    expect(proveedorSchema.safeParse({ ...base, phone: "" }).success).toBe(true);
  });

  it("rechaza un nombre muy corto", () => {
    expect(proveedorSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/validation/__tests__/proveedor.test.ts`
Expected: FAIL (módulo `../proveedor` no existe)

- [ ] **Step 3: Implementación mínima (proveedor)**

```ts
import { z } from "zod";

export const proveedorSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  phone: z.string().trim().optional(),
  isActive: z.boolean(),
});

export type ProveedorInput = z.infer<typeof proveedorSchema>;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/validation/__tests__/proveedor.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Escribir el test que falla (compra)**

```ts
import { describe, expect, it } from "vitest";
import { compraSchema } from "../compra";

describe("compraSchema", () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const base = {
    supplierId: "11111111-1111-4111-8111-111111111111",
    purchaseDate: hoy,
    items: [
      { productId: "22222222-2222-4222-8222-222222222222", qty: 10, unitCost: 5000 },
    ],
  };

  it("acepta datos validos", () => {
    expect(compraSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza un arreglo de items vacio", () => {
    expect(compraSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  it("rechaza una cantidad no positiva", () => {
    expect(
      compraSchema.safeParse({
        ...base,
        items: [{ ...base.items[0], qty: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rechaza un costo unitario no positivo", () => {
    expect(
      compraSchema.safeParse({
        ...base,
        items: [{ ...base.items[0], unitCost: -1 }],
      }).success,
    ).toBe(false);
  });

  it("rechaza una fecha vacia", () => {
    expect(compraSchema.safeParse({ ...base, purchaseDate: "" }).success).toBe(false);
  });

  it("rechaza una fecha futura", () => {
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(compraSchema.safeParse({ ...base, purchaseDate: manana }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/validation/__tests__/compra.test.ts`
Expected: FAIL (módulo `../compra` no existe)

- [ ] **Step 7: Implementación mínima (compra)**

```ts
import { z } from "zod";

export const compraSchema = z.object({
  supplierId: z.string().uuid("Selecciona un proveedor válido"),
  purchaseDate: z
    .iso.date("Ingresa una fecha válida")
    .refine((fecha) => fecha <= new Date().toISOString().slice(0, 10), {
      message: "La fecha no puede ser futura",
    }),
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Selecciona un producto válido"),
        qty: z.number().int().positive("La cantidad debe ser mayor a cero"),
        unitCost: z.number().positive("El costo unitario debe ser mayor a cero"),
      }),
    )
    .min(1, "Agrega al menos un producto"),
});

export type CompraInput = z.infer<typeof compraSchema>;
```

Nota: se usa `z.iso.date(...)` (igual que el fix aplicado en la Fase 13
para `expenseDate`), no una comparación de string sin validar formato —
verificar la sintaxis exacta contra la versión de zod instalada
(`package.json`) antes de aplicar, por si difiere.

- [ ] **Step 8: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/validation/__tests__/compra.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/proveedor.ts src/lib/validation/__tests__/proveedor.test.ts src/lib/validation/compra.ts src/lib/validation/__tests__/compra.test.ts
git commit -m "feat: schemas de validacion de proveedores y compras (Fase 14)"
```

---

### Task 3: Costo de producto en el formulario existente

**Files:**
- Modify: `src/lib/validation/producto.ts`
- Modify: `src/app/admin/productos/actions.ts`
- Modify: `src/app/admin/productos/producto-form.tsx`
- Modify: `src/app/admin/productos/nuevo/page.tsx`
- Modify: `src/app/admin/productos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: tabla `product_costs` (Task 1).
- Produces: `productoSchema` gana un campo opcional `costPrice: number |
  null`; `createProducto`/`updateProducto` hacen `upsert` en
  `product_costs` cuando `costPrice` no es `null`.

- [ ] **Step 1: Agregar `costPrice` a `productoSchema`**

En `src/lib/validation/producto.ts`, agregar al objeto `productoSchema`
(después de `compareAtPrice`, antes de `sku`):

```ts
  costPrice: z.number().min(0, "El costo no puede ser negativo").nullable(),
```

- [ ] **Step 2: Modificar `createProducto` en `actions.ts`**

Después del bloque que inserta variantes (antes del bloque de
`imageFiles`), agregar:

```ts
  if (parsed.data.costPrice !== null) {
    const { error: costoError } = await supabase.from("product_costs").upsert({
      product_id: producto.id,
      cost_price: parsed.data.costPrice,
      updated_at: new Date().toISOString(),
    });

    if (costoError) {
      return { error: "El producto se creo, pero hubo un error al guardar el costo." };
    }
  }
```

- [ ] **Step 3: Modificar `updateProducto` en `actions.ts`**

Después del bloque que reinserta variantes (antes del bloque de
`newImageFiles`), agregar el mismo bloque que en Step 2 pero usando `id`
en vez de `producto.id`:

```ts
  if (parsed.data.costPrice !== null) {
    const { error: costoError } = await supabase.from("product_costs").upsert({
      product_id: id,
      cost_price: parsed.data.costPrice,
      updated_at: new Date().toISOString(),
    });

    if (costoError) {
      return { error: "El producto se actualizo, pero hubo un error al guardar el costo." };
    }
  }
```

- [ ] **Step 4: Agregar el campo al formulario**

En `src/app/admin/productos/producto-form.tsx`, dentro del `<div
className="grid grid-cols-2 gap-4">` que ya contiene `price` y
`compareAtPrice` (el primero de los dos bloques `grid-cols-2`, líneas
~139-165 del archivo actual), agregar un tercer campo justo después de
`compareAtPrice`, ajustando ese grid a `grid-cols-3` o agregando una fila
nueva — usar criterio para que se vea bien, pero el campo en sí:

```tsx
        <div>
          <label htmlFor="costPrice" className="text-sm text-brand-ciruela">
            Costo de compra
          </label>
          <Input
            id="costPrice"
            type="number"
            step="0.01"
            {...register("costPrice", {
              setValueAs: (v) => (v === "" ? null : Number(v)),
            })}
          />
          <p className="text-xs text-brand-ciruela/60">
            Información interna. No se muestra en la tienda pública.
          </p>
          {errors.costPrice && (
            <p className="text-sm text-red-600">{errors.costPrice.message}</p>
          )}
        </div>
```

- [ ] **Step 5: Modificar `nuevo/page.tsx`**

Agregar `costPrice: null,` a los `defaultValues` del `ProductoForm`
(junto a `compareAtPrice: null,`).

- [ ] **Step 6: Modificar `[id]/editar/page.tsx`**

Agregar una consulta a `product_costs` en el `Promise.all` existente:

```ts
  const [{ data: categorias }, { data: variantes }, { data: imagenes }, { data: costo }] =
    await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      supabase
        .from("product_variants")
        .select("talla, color, sku, price_override, stock")
        .eq("product_id", id),
      supabase
        .from("product_images")
        .select("id, url, is_primary")
        .eq("product_id", id)
        .order("sort_order"),
      supabase
        .from("product_costs")
        .select("cost_price")
        .eq("product_id", id)
        .maybeSingle(),
    ]);
```

Y agregar `costPrice: costo?.cost_price ?? null,` a los `defaultValues`
del `ProductoForm` (junto a `compareAtPrice: producto.compare_at_price,`).

- [ ] **Step 7: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validation/producto.ts src/app/admin/productos/actions.ts src/app/admin/productos/producto-form.tsx src/app/admin/productos/nuevo/page.tsx "src/app/admin/productos/[id]/editar/page.tsx"
git commit -m "feat: campo de costo de compra en el formulario de producto (Fase 14)"
```

---

### Task 4: CRUD de proveedores

**Files:**
- Create: `src/app/admin/compras/proveedores/actions.ts`
- Create: `src/app/admin/compras/proveedores/page.tsx`
- Create: `src/app/admin/compras/proveedores/proveedor-form.tsx`
- Create: `src/app/admin/compras/proveedores/toggle-proveedor-button.tsx`
- Create: `src/app/admin/compras/proveedores/nuevo/page.tsx`
- Create: `src/app/admin/compras/proveedores/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `proveedorSchema`/`ProveedorInput` (Task 2),
  tabla `suppliers` (Task 1).
- Produces: `createProveedor`, `updateProveedor`, `toggleProveedorActivo`
  — el select de proveedores en Task 5 lee `suppliers` directamente, no
  depende de estas acciones.

- [ ] **Step 1: Crear `actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { proveedorSchema, type ProveedorInput } from "@/lib/validation/proveedor";

export async function createProveedor(
  input: ProveedorInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = proveedorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return { error: "No se pudo crear el proveedor." };
  }

  revalidatePath("/admin/compras/proveedores");
  return {};
}

export async function updateProveedor(
  id: string,
  input: ProveedorInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = proveedorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      is_active: parsed.data.isActive,
    })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el proveedor." };
  }

  revalidatePath("/admin/compras/proveedores");
  return {};
}

export async function toggleProveedorActivo(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado del proveedor." };
  }

  revalidatePath("/admin/compras/proveedores");
  return {};
}
```

- [ ] **Step 2: Crear `proveedor-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { proveedorSchema, type ProveedorInput } from "@/lib/validation/proveedor";
import { createProveedor, updateProveedor } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProveedorForm({
  proveedorId,
  defaultValues,
}: {
  proveedorId?: string;
  defaultValues: ProveedorInput;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorSchema),
    defaultValues,
  });

  const onSubmit = async (data: ProveedorInput) => {
    setServerError(null);
    const result = proveedorId
      ? await updateProveedor(proveedorId, data)
      : await createProveedor(data);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/compras/proveedores");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-sm text-brand-ciruela">
          Nombre
        </label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="phone" className="text-sm text-brand-ciruela">
          Teléfono (opcional)
        </label>
        <Input id="phone" {...register("phone")} />
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-ciruela">
        <input type="checkbox" {...register("isActive")} />
        Activo
      </label>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear `toggle-proveedor-button.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleProveedorActivo } from "./actions";

export function ToggleProveedorButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await toggleProveedorActivo(id, !isActive);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline"
    >
      {isActive ? "Desactivar" : "Activar"}
    </button>
  );
}
```

- [ ] **Step 4: Crear `page.tsx` (lista)**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleProveedorButton } from "./toggle-proveedor-button";

export default async function ProveedoresPage() {
  const supabase = await createClient();
  const { data: proveedores, error } = await supabase
    .from("suppliers")
    .select("id, name, phone, is_active")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Proveedores</h1>
        <Link href="/admin/compras/proveedores/nuevo">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nuevo proveedor
          </Button>
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-red-600">No se pudieron cargar los proveedores.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Nombre</th>
              <th className="py-2">Teléfono</th>
              <th className="py-2">Activo</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(proveedores ?? []).map((proveedor) => (
              <tr key={proveedor.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{proveedor.name}</td>
                <td className="py-2">{proveedor.phone ?? "-"}</td>
                <td className="py-2">{proveedor.is_active ? "Sí" : "No"}</td>
                <td className="flex gap-3 py-2">
                  <Link
                    href={`/admin/compras/proveedores/${proveedor.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleProveedorButton
                    id={proveedor.id}
                    isActive={proveedor.is_active}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Crear `nuevo/page.tsx`**

```tsx
import { ProveedorForm } from "../proveedor-form";

export default function NuevoProveedorPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nuevo proveedor</h1>
      <ProveedorForm defaultValues={{ name: "", phone: "", isActive: true }} />
    </div>
  );
}
```

- [ ] **Step 6: Crear `[id]/editar/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProveedorForm } from "../../proveedor-form";

export default async function EditarProveedorPage({
  params,
}: PageProps<"/admin/compras/proveedores/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proveedor } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .single();

  if (!proveedor) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar proveedor</h1>
      <ProveedorForm
        proveedorId={proveedor.id}
        defaultValues={{
          name: proveedor.name,
          phone: proveedor.phone ?? "",
          isActive: proveedor.is_active,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/compras/proveedores
git commit -m "feat: CRUD de proveedores (Fase 14)"
```

---

### Task 5: Registro de compras (lista + nueva compra)

**Files:**
- Create: `src/app/admin/compras/actions.ts`
- Create: `src/app/admin/compras/page.tsx`
- Create: `src/app/admin/compras/compra-form.tsx`
- Create: `src/app/admin/compras/nueva/page.tsx`
- Modify: `src/app/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `compraSchema`/`CompraInput` (Task 2), RPC
  `create_purchase` (Task 1), `formatPrice()` de `@/lib/format`
  (existente).
- Produces: `iniciarCompra` — sin otros consumidores en este plan.

- [ ] **Step 1: Crear `actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { compraSchema, type CompraInput } from "@/lib/validation/compra";

export async function iniciarCompra(input: CompraInput): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = compraSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase", {
    p_supplier_id: parsed.data.supplierId,
    p_purchase_date: parsed.data.purchaseDate,
    p_items: parsed.data.items.map((item) => ({
      productId: item.productId,
      qty: item.qty,
      unitCost: item.unitCost,
    })),
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar la compra." };
  }

  redirect("/admin/compras");
}
```

- [ ] **Step 2: Crear `compra-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { compraSchema, type CompraInput } from "@/lib/validation/compra";
import { iniciarCompra } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";

type ProveedorOption = { id: string; name: string };
type ProductoOption = { id: string; name: string; sku: string };

export function CompraForm({
  proveedores,
  productos,
}: {
  proveedores: ProveedorOption[];
  productos: ProductoOption[];
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CompraInput>({
    resolver: zodResolver(compraSchema),
    defaultValues: {
      supplierId: "",
      purchaseDate: new Date().toISOString().slice(0, 10),
      items: [{ productId: "", qty: 1, unitCost: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const total = items.reduce((sum, item) => sum + (item.qty || 0) * (item.unitCost || 0), 0);

  const onSubmit = async (data: CompraInput) => {
    setServerError(null);
    const result = await iniciarCompra(data);
    if (result?.error) {
      setServerError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="supplierId" className="text-sm text-brand-ciruela">
            Proveedor
          </label>
          <select
            id="supplierId"
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
            {...register("supplierId")}
          >
            <option value="">Selecciona un proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.supplierId && (
            <p className="text-sm text-red-600">{errors.supplierId.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="purchaseDate" className="text-sm text-brand-ciruela">
            Fecha
          </label>
          <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
          {errors.purchaseDate && (
            <p className="text-sm text-red-600">{errors.purchaseDate.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg text-brand-ciruela">Productos</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ productId: "", qty: 1, unitCost: 0 })}
            className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
          >
            Agregar producto
          </Button>
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-3 rounded-md border border-brand-rosa-claro p-3"
          >
            <div>
              <label className="text-sm text-brand-ciruela">Producto</label>
              <select
                className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
                {...register(`items.${index}.productId` as const)}
              >
                <option value="">Selecciona un producto</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-brand-ciruela">Cantidad</label>
              <Input
                type="number"
                {...register(`items.${index}.qty` as const, { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="text-sm text-brand-ciruela">Costo unitario</label>
              <Input
                type="number"
                step="0.01"
                {...register(`items.${index}.unitCost` as const, { valueAsNumber: true })}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
              className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
            >
              Quitar
            </Button>
          </div>
        ))}
        {errors.items?.message && (
          <p className="text-sm text-red-600">{errors.items.message}</p>
        )}
      </div>

      <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
        <p className="text-sm text-brand-ciruela/70">Total de la compra</p>
        <p className="font-heading text-2xl text-brand-rosa">{formatPrice(total)}</p>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Registrando..." : "Registrar compra"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear `page.tsx` (lista de compras)**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default async function ComprasPage() {
  const supabase = await createClient();
  const { data: compras, error } = await supabase
    .from("purchases")
    .select("id, purchase_date, supplier_id")
    .order("purchase_date", { ascending: false });

  const { data: proveedores } = await supabase.from("suppliers").select("id, name");
  const proveedorNombreById = new Map((proveedores ?? []).map((p) => [p.id, p.name]));

  const { data: items } = await supabase
    .from("purchase_items")
    .select("purchase_id, line_total");
  const totalPorCompra = new Map<string, number>();
  for (const item of items ?? []) {
    totalPorCompra.set(
      item.purchase_id,
      (totalPorCompra.get(item.purchase_id) ?? 0) + item.line_total,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Compras</h1>
        <div className="flex gap-3">
          <Link href="/admin/compras/proveedores">
            <Button className="bg-white text-brand-rosa border border-brand-rosa hover:bg-brand-rosa-claro/30">
              Proveedores
            </Button>
          </Link>
          <Link href="/admin/compras/nueva">
            <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
              Nueva compra
            </Button>
          </Link>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-red-600">No se pudieron cargar las compras.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Fecha</th>
              <th className="py-2">Proveedor</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {(compras ?? []).map((compra) => (
              <tr key={compra.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{compra.purchase_date}</td>
                <td className="py-2">
                  {proveedorNombreById.get(compra.supplier_id) ?? "-"}
                </td>
                <td className="py-2">{formatPrice(totalPorCompra.get(compra.id) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Crear `nueva/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { CompraForm } from "../compra-form";

export default async function NuevaCompraPage() {
  const supabase = await createClient();
  const [{ data: proveedores }, { data: productos }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("products").select("id, name, sku").order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nueva compra</h1>
      <CompraForm proveedores={proveedores ?? []} productos={productos ?? []} />
    </div>
  );
}
```

- [ ] **Step 5: Modificar `admin-nav.tsx`**

Agregar un enlace "Compras" después de "Gastos":

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
      <Link href="/admin/gastos" className="hover:text-brand-rosa">
        Gastos
      </Link>
      <Link href="/admin/compras" className="hover:text-brand-rosa">
        Compras
      </Link>
    </nav>
  );
}
```

- [ ] **Step 6: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos; suite completa en verde.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/compras/actions.ts src/app/admin/compras/page.tsx src/app/admin/compras/compra-form.tsx src/app/admin/compras/nueva src/app/admin/admin-nav.tsx
git commit -m "feat: registro de compras a proveedores con RPC atomica (Fase 14)"
```

---

### Task 6: Verificación de integración end-to-end

**Files:** ninguno nuevo (script desechable, no se commitea).

**Interfaces:**
- Consumes: todo lo construido en Tasks 1–5.

- [ ] **Step 1: Confirmar que el servidor de desarrollo está limpio**

Verificar que no hay un proceso `next dev` obsoleto. Si existe,
terminarlo y arrancar uno limpio con `pnpm dev` en segundo plano.

- [ ] **Step 2: Verificar rutas con `curl`**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/compras
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/compras/proveedores
```

Expected: ambas redirigen (307/302) hacia `/login` sin sesión.

- [ ] **Step 3: Script de verificación de negocio (`.mjs` desechable)**

Crear `scripts/tmp-verify-fase14.mjs` (fuera de `src/`, para borrar al
final) que, con `dotenv` + `.env.local` y el cliente de service role:

1. Cree un usuario de prueba `staff` y otro `admin` (mismo patrón de
   fases anteriores).
2. Con el cliente `staff`, intente `select` sobre `product_costs`,
   `suppliers`, `purchases`, `purchase_items` — las cuatro deben devolver
   vacío por RLS (deny-all silencioso, mismo comportamiento confirmado en
   la Fase 13).
3. Con el cliente `admin`, cree un proveedor de prueba y un producto de
   prueba (o reutilice uno existente si el catálogo real está vacío,
   verificando primero), anote su `stock` actual.
4. Llame a la RPC `create_purchase` (como el cliente `admin`, no el de
   service role, para ejercer RLS real) con una línea de ese producto,
   `qty = 10`, `unitCost = 5000`.
5. Verifique: el `stock` del producto aumentó exactamente en 10;
   `product_costs` tiene `cost_price = 5000` para ese producto.
6. Llame a `create_purchase` una segunda vez para el mismo producto con
   `unitCost = 7000`, y verifique que `product_costs.cost_price` ahora es
   `7000` (sobrescrito, no promediado — confirma la decisión de diseño).
7. Limpie todos los datos de prueba (purchase_items, purchases, el
   producto si fue creado para la prueba, el proveedor, ambos usuarios) y
   restaure el stock del producto a su valor original si se reutilizó uno
   existente.

Run: `node scripts/tmp-verify-fase14.mjs`
Expected: todos los pasos imprimen `OK`.

- [ ] **Step 4: Limpieza**

```bash
rm -f scripts/tmp-verify-fase14.mjs
```

Detener el servidor de desarrollo. No hay commit en esta tarea.

---

## Cierre de fase

Al completar la Task 6, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
