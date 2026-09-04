# Stock del producto automático (suma de variantes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Para productos con variantes, `products.stock` se calcula solo (suma del stock de las variantes) mediante un trigger; el formulario y el listado del admin dejan de mostrar/pedir un número manual incorrecto.

**Architecture:** Un trigger `AFTER INSERT/UPDATE OF stock,product_id/DELETE` sobre `product_variants` mantiene `products.stock = sum(product_variants.stock)` para productos con variantes; se encadena con el trigger 048 que ya mantiene `product_variants.stock` desde las fotos. Ningún RPC de venta cambia. El formulario de producto muestra el total como solo lectura cuando hay variantes, y las acciones de guardado dejan de escribir `stock` en ese caso.

**Tech Stack:** Next.js App Router + TypeScript, Supabase (Postgres/RLS vía MCP `mcp__supabase__apply_migration`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-03-stock-producto-automatico-design.md`

## Global Constraints

- Todo el producto (mensajes, UI) en español. Los comentarios y mensajes en SQL sin tildes, mismo estilo que las funciones existentes (`create_order`, `recalcular_stock_variante`, etc.).
- El stock de productos **SIN** variantes (`products.stock`) no cambia en absoluto — sigue siendo manual. El trigger nuevo nunca se dispara para ellos (no tienen filas en `product_variants`).
- Ningún RPC de venta se modifica (`create_order`, `confirm_order_payment_wompi`, `update_order_items`, `create_pos_sale`, `update_pos_sale`).
- Ningún componente que hoy lee `product_variants.stock` o `products.stock` cambia (tienda, `low-stock.ts`, `informes/stock-bajo`, modal de inventario POS, tarjetas). El listado `admin/productos/page.tsx` no cambia de lógica: su insignia lee `producto.stock`, que tras la migración ya es correcto.
- Migraciones se aplican con el MCP de Supabase (`mcp__supabase__apply_migration`), nunca a mano en el dashboard.
- `productoSchema` (`src/lib/validation/producto.ts`) NO cambia.
- Commits atómicos en español al final de cada tarea.
- Trabajo en el worktree `.worktrees/rediseno-backend`, rama `rediseno-backend`.

---

## File Structure

- **Create** `supabase/migrations/050_stock_producto_automatico.sql` — función `recalcular_stock_producto()` + trigger `trg_recalcular_stock_producto` + backfill. (Task 1)
- **Create** `src/lib/admin/stock-producto.ts` — helper puro `debeGuardarStockManual(cantidadVariantes: number): boolean`. (Task 2)
- **Create** `src/lib/admin/__tests__/stock-producto.test.ts` — tests del helper. (Task 2)
- **Modify** `src/app/admin/productos/actions.ts` — `createProducto` y `updateProducto` usan el helper para no escribir `stock` cuando hay variantes. (Task 3)
- **Modify** `src/app/admin/productos/__tests__/actions.test.ts` — tests dirigidos de `createProducto`/`updateProducto` sobre el valor de `stock` persistido. (Task 3)
- **Modify** `src/app/admin/productos/producto-form.tsx` — Stock de solo lectura (calculado) cuando hay variantes; input manual cuando no. (Task 4)
- **Modify** `src/app/admin/productos/__tests__/producto-form.test.tsx` — 2 casos nuevos (con / sin variantes). (Task 4)

---

## Task 1: Migración 050 — trigger + backfill de `products.stock`

**Files:**
- Create: `supabase/migrations/050_stock_producto_automatico.sql`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: a nivel de base, `products.stock` queda sincronizado como `coalesce(sum(product_variants.stock),0)` para todo producto con ≥1 variante. Las tareas 3 y 4 asumen que este trigger existe y que `products.stock` ya no necesita escritura manual para productos con variantes.

- [ ] **Step 1: Escribir el archivo de migración**

Crear `supabase/migrations/050_stock_producto_automatico.sql` con exactamente este contenido:

```sql
-- Stock del producto automatico: para productos CON variantes,
-- products.stock deja de escribirse a mano y pasa a ser la suma del
-- stock de todas sus variantes (que a su vez ya se calcula solo del
-- conteo de fotos no vendidas -- migracion 048). Productos SIN
-- variantes: products.stock sigue siendo manual, este trigger nunca los
-- toca porque no tienen filas en product_variants.

create or replace function public.recalcular_stock_producto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- NEW/OLD solo estan asignados dentro de su operacion.
  if TG_OP in ('INSERT', 'UPDATE') and new.product_id is not null then
    update public.products
    set stock = (
      select coalesce(sum(stock), 0)
      from public.product_variants
      where product_id = new.product_id
    )
    where id = new.product_id;
  end if;

  -- DELETE, o UPDATE que reasigna product_id: recalcula tambien el
  -- producto viejo que perdio la variante.
  if TG_OP in ('DELETE', 'UPDATE') and old.product_id is not null
     and (TG_OP = 'DELETE' or old.product_id is distinct from new.product_id) then
    update public.products
    set stock = (
      select coalesce(sum(stock), 0)
      from public.product_variants
      where product_id = old.product_id
    )
    where id = old.product_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_stock_producto on public.product_variants;
create trigger trg_recalcular_stock_producto
after insert or update of stock, product_id or delete on public.product_variants
for each row execute function public.recalcular_stock_producto();

-- Backfill unico: deja products.stock igual a la suma de sus variantes
-- para todo producto que tenga al menos una variante.
update public.products p
set stock = (
  select coalesce(sum(pv.stock), 0)
  from public.product_variants pv
  where pv.product_id = p.id
)
where exists (select 1 from public.product_variants pv where pv.product_id = p.id);
```

- [ ] **Step 2: Aplicar la migración con el MCP de Supabase**

Usar `mcp__supabase__apply_migration` con:
- `name`: `stock_producto_automatico`
- `query`: el contenido completo del archivo del Step 1.

Expected: sin error.

- [ ] **Step 3: Verificar el backfill y el trigger con `mcp__supabase__execute_sql`**

Ejecutar esta consulta:

```sql
select
  p.id, p.name, p.stock as stock_producto,
  coalesce(sum(pv.stock), 0) as suma_variantes,
  count(pv.id) as num_variantes
from public.products p
join public.product_variants pv on pv.product_id = p.id
group by p.id, p.name, p.stock
having p.stock <> coalesce(sum(pv.stock), 0)
order by p.name;
```

Expected: **0 filas** (todo producto con variantes tiene `stock` = suma de sus variantes).

- [ ] **Step 4: Verificar el trigger con un cambio simulado**

Elegir un producto con variantes (de la consulta anterior antes del `having`, o `select id, stock from products p where exists (select 1 from product_variants where product_id = p.id) limit 1`). Guardar su `id` como `<PID>` y su `stock` actual como `<S0>`. Ejecutar:

```sql
-- baja el stock de una variante en 1 y confirma que el del producto baja en 1
begin;
update public.product_variants
set stock = stock - 1
where product_id = '<PID>' and stock > 0
  and id = (select id from public.product_variants where product_id = '<PID>' and stock > 0 limit 1);
select stock from public.products where id = '<PID>';  -- debe ser <S0> - 1
rollback;
```

Expected: el `select` devuelve `<S0> - 1`. El `rollback` deja todo como estaba.

- [ ] **Step 5: Verificar que productos SIN variantes no se ven afectados**

```sql
-- un producto sin variantes: cambiar su stock a mano debe quedarse
begin;
update public.products
set stock = 777
where id = (
  select id from public.products p
  where not exists (select 1 from public.product_variants where product_id = p.id)
  limit 1
);
select id, stock from public.products where stock = 777;  -- 1 fila, stock 777
rollback;
```

Expected: 1 fila con `stock = 777` (ningún trigger lo tocó). El `rollback` revierte.

- [ ] **Step 6: Chequear advisors**

Usar `mcp__supabase__get_advisors` con `type: "security"` y luego `type: "performance"`.
Expected: sin alertas NUEVAS relacionadas con `recalcular_stock_producto` / `trg_recalcular_stock_producto` / `products`.

- [ ] **Step 7: Regenerar tipos (verificación)**

Usar `mcp__supabase__generate_typescript_types`. Comparar con `src/lib/supabase/database.types.ts`. Como la migración no agrega columnas (solo una función y un trigger), no debería haber diff funcional. Si hay diff, aplicarlo al archivo.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/050_stock_producto_automatico.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): stock del producto se calcula solo de la suma de sus variantes

Trigger sobre product_variants que mantiene products.stock =
sum(product_variants.stock) para productos con variantes. Se encadena
con el trigger 048 (product_variants.stock desde fotos no vendidas).
Backfill unico de todos los productos con variantes. Productos sin
variantes: products.stock sigue manual, el trigger no los toca."
```

(Si `database.types.ts` no cambió, quitarlo del `git add`.)

---

## Task 2: Helper `debeGuardarStockManual`

**Files:**
- Create: `src/lib/admin/stock-producto.ts`
- Test: `src/lib/admin/__tests__/stock-producto.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export function debeGuardarStockManual(cantidadVariantes: number): boolean` — `true` sólo cuando `cantidadVariantes === 0`. Task 3 la importa en `actions.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/admin/__tests__/stock-producto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { debeGuardarStockManual } from "../stock-producto";

describe("debeGuardarStockManual", () => {
  it("es true cuando el producto no tiene variantes (stock manual)", () => {
    expect(debeGuardarStockManual(0)).toBe(true);
  });

  it("es false cuando el producto tiene variantes (lo calcula el trigger)", () => {
    expect(debeGuardarStockManual(1)).toBe(false);
    expect(debeGuardarStockManual(5)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/admin/__tests__/stock-producto.test.ts`
Expected: FAIL — `Failed to resolve import "../stock-producto"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/lib/admin/stock-producto.ts`:

```ts
/**
 * Para productos CON variantes, `products.stock` lo calcula solo un
 * trigger en la base (suma del stock de las variantes -- migracion 050).
 * Las acciones de guardado NO deben escribir un valor manual en ese
 * caso, para no pisar el valor del trigger. Para productos sin variantes
 * no hay de donde calcularlo: sigue siendo manual.
 */
export function debeGuardarStockManual(cantidadVariantes: number): boolean {
  return cantidadVariantes === 0;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/admin/__tests__/stock-producto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/stock-producto.ts src/lib/admin/__tests__/stock-producto.test.ts
git commit -m "feat: helper debeGuardarStockManual para el stock del producto"
```

---

## Task 3: `actions.ts` deja de escribir `stock` cuando hay variantes

**Files:**
- Modify: `src/app/admin/productos/actions.ts` (`createProducto` ~línea 66-78, `updateProducto` ~línea 158-172)
- Test: `src/app/admin/productos/__tests__/actions.test.ts` (agregar un `describe` nuevo al final)

**Interfaces:**
- Consumes: `debeGuardarStockManual` de `src/lib/admin/stock-producto.ts` (Task 2).
- Produces: nada nuevo para tareas siguientes.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/app/admin/productos/__tests__/actions.test.ts` (el archivo ya tiene `// @vitest-environment node` y mockea `@/lib/supabase/server`, `@/lib/admin/require-admin`, `next/cache`). Agregar este bloque:

```ts
describe("createProducto / updateProducto — stock segun variantes", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const inputBase = {
    name: "Pijama test",
    slug: "pijama-test",
    description: "",
    categoryId: null,
    price: 10000,
    promoPrice: null,
    costPrice: null,
    stock: 9,
    isActive: true,
    isFeatured: false,
    variantes: [] as Array<{ talla?: string; color?: string; priceOverride: number | null }>,
  };

  function mockParaCreate() {
    const productsInsertSpy = vi.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: "p1" }, error: null }) }),
    }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          // uniqueSlug: select().eq().maybeSingle()  y   select().eq().neq().maybeSingle()
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          insert: productsInsertSpy,
        };
      }
      if (tabla === "product_variants") {
        return {
          insert: () => ({ select: () => Promise.resolve({ data: [{ id: "v1" }], error: null }) }),
        };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    const rpc = vi.fn(() => Promise.resolve({ data: "SKU-1", error: null }));
    return { supabase: { from, rpc }, productsInsertSpy };
  }

  it("createProducto sin variantes escribe el stock del formulario", async () => {
    const { supabase, productsInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto({ ...inputBase, variantes: [] });

    expect(productsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 9 }),
    );
  });

  it("createProducto con variantes escribe stock 0 (lo calcula el trigger)", async () => {
    const { supabase, productsInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto({
      ...inputBase,
      variantes: [{ talla: "M", color: "Rosa", priceOverride: null }],
    });

    expect(productsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 0 }),
    );
  });

  function mockParaUpdate() {
    const productsUpdateSpy = vi.fn(() => ({
      eq: () => ({
        select: () => ({ single: () => Promise.resolve({ data: { sku: "SKU-1" }, error: null }) }),
      }),
    }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          update: productsUpdateSpy,
        };
      }
      if (tabla === "product_variants") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
          insert: () => ({ select: () => Promise.resolve({ data: [{ id: "v1" }], error: null }) }),
          upsert: () => Promise.resolve({ error: null }),
          delete: () => ({ in: () => Promise.resolve({ error: null }) }),
        };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    return { supabase: { from, rpc: vi.fn() }, productsUpdateSpy };
  }

  it("updateProducto sin variantes incluye stock en el update", async () => {
    const { supabase, productsUpdateSpy } = mockParaUpdate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto("p1", { ...inputBase, variantes: [] });

    expect(productsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 9 }),
    );
  });

  it("updateProducto con variantes NO incluye stock en el update", async () => {
    const { supabase, productsUpdateSpy } = mockParaUpdate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto("p1", {
      ...inputBase,
      variantes: [{ talla: "M", color: "Rosa", priceOverride: null }],
    });

    const payload = productsUpdateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("stock");
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/admin/productos/__tests__/actions.test.ts -t "stock segun variantes"`
Expected: los 2 casos "con variantes" fallan (hoy `createProducto` siempre manda `stock: 9`, `updateProducto` siempre incluye `stock`). Los 2 casos "sin variantes" pasan.

Si algún caso "sin variantes" falla por el mock (p. ej. una llamada de supabase no cubierta), ajustar el mock hasta que esos 2 pasen — sin cambiar todavía `actions.ts`.

- [ ] **Step 3: Modificar `createProducto`**

En `src/app/admin/productos/actions.ts`, agregar el import arriba (junto a los otros):

```ts
import { debeGuardarStockManual } from "@/lib/admin/stock-producto";
```

En `createProducto`, en el objeto que se pasa a `.from("products").insert({...})`, cambiar:

```ts
      stock: parsed.data.stock,
```

por:

```ts
      stock: debeGuardarStockManual(parsed.data.variantes.length) ? parsed.data.stock : 0,
```

- [ ] **Step 4: Modificar `updateProducto`**

En `updateProducto`, el `.from("products").update({...})` incluye hoy `stock: parsed.data.stock`. Cambiarlo para omitir la clave cuando hay variantes:

```ts
  const { data: productoActualizado, error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      promo_price: parsed.data.promoPrice,
      ...(debeGuardarStockManual(parsed.data.variantes.length)
        ? { stock: parsed.data.stock }
        : {}),
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .eq("id", id)
    .select("sku")
    .single();
```

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/admin/productos/__tests__/actions.test.ts`
Expected: PASS (todos, incluidos los de `eliminarProducto` que ya existían).

- [ ] **Step 6: Lint + typecheck de los archivos tocados**

Run: `npx eslint src/app/admin/productos/actions.ts src/lib/admin/stock-producto.ts src/app/admin/productos/__tests__/actions.test.ts`
Run: `npx tsc --noEmit 2>&1 | grep -E "actions.ts|stock-producto" || echo "sin errores"`
Expected: sin errores en esos archivos.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/productos/actions.ts src/app/admin/productos/__tests__/actions.test.ts
git commit -m "feat: no escribir products.stock a mano cuando el producto tiene variantes

createProducto inserta stock 0 y updateProducto omite stock cuando hay
variantes -- lo calcula el trigger de la migracion 050. Sin variantes,
el stock sigue guardandose desde el formulario como hoy."
```

---

## Task 4: Formulario — Stock de solo lectura cuando hay variantes

**Files:**
- Modify: `src/app/admin/productos/producto-form.tsx` (bloque del input `Stock`, ~línea 476-489)
- Test: `src/app/admin/productos/__tests__/producto-form.test.tsx` (2 casos nuevos)

**Interfaces:**
- Consumes: `fields` (de `useFieldArray`, ya presente) y `existingImages` (state, ya presente con forma `{ id, url, is_primary, variant_id, vendida }`).
- Produces: nada nuevo.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/app/admin/productos/__tests__/producto-form.test.tsx`, agregar dentro del `describe("ProductoForm", ...)` (el archivo ya tiene `beforeEach(() => vi.clearAllMocks())` y el mock de `@/lib/admin/upload-product-images-client`). El componente acepta la prop `imagenesExistentes?: ProductImage[]` con `ProductImage = { id, url, is_primary, variant_id, vendida }`.

```ts
it("con variantes muestra el stock calculado de solo lectura y no el input", () => {
  render(
    <ProductoForm
      defaultValues={{
        ...defaultValuesBase,
        variantes: [
          { talla: "M", color: "Rosa", priceOverride: null },
          { talla: "L", color: "Rosa", priceOverride: null },
        ],
      }}
      categoriasDisponibles={[]}
      imagenesExistentes={[
        { id: "i1", url: "u1", is_primary: true, variant_id: "v1", vendida: false },
        { id: "i2", url: "u2", is_primary: false, variant_id: "v1", vendida: true },
        { id: "i3", url: "u3", is_primary: false, variant_id: "v2", vendida: false },
      ]}
    />,
  );

  // 2 fotos no vendidas de variante => "2 unidades"
  expect(screen.getByText(/2 unidades/)).toBeInTheDocument();
  expect(screen.getByText(/se calcula solo/i)).toBeInTheDocument();
  expect(document.querySelector("#stock")).not.toBeInTheDocument();
});

it("sin variantes muestra el input de stock editable", () => {
  render(
    <ProductoForm
      defaultValues={{ ...defaultValuesBase, variantes: [] }}
      categoriasDisponibles={[]}
    />,
  );
  expect(document.querySelector("#stock")).toBeInTheDocument();
});
```

Nota: `defaultValuesBase` ya existe en ese archivo de test e incluye `variantes: []`. `screen` y `render` ya están importados.

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/admin/productos/__tests__/producto-form.test.tsx -t "stock"`
Expected: el caso "con variantes" falla (hoy siempre se renderiza `#stock`); el caso "sin variantes" pasa.

- [ ] **Step 3: Modificar el bloque de Stock en `producto-form.tsx`**

Reemplazar el bloque actual:

```tsx
        <div>
          <label htmlFor="stock" className="text-sm text-brand-ciruela">
            Stock
          </label>
          <Input
            id="stock"
            type="number"
            {...register("stock", { valueAsNumber: true })}
          />
          {errors.stock && (
            <p className="text-sm text-red-600">{errors.stock.message}</p>
          )}
        </div>
```

por:

```tsx
        {fields.length > 0 ? (
          <div>
            <label className="text-sm text-brand-ciruela">Stock</label>
            <p className="flex min-h-10 flex-wrap items-center gap-x-2 text-sm text-brand-ciruela">
              {existingImages.filter((img) => img.variant_id !== null && !img.vendida).length}{" "}
              unidades
              <span className="text-xs text-brand-ciruela/60">
                — se calcula solo, sumando las fotos disponibles de cada variante
              </span>
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="stock" className="text-sm text-brand-ciruela">
              Stock
            </label>
            <Input
              id="stock"
              type="number"
              {...register("stock", { valueAsNumber: true })}
            />
            {errors.stock && (
              <p className="text-sm text-red-600">{errors.stock.message}</p>
            )}
          </div>
        )}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/admin/productos/__tests__/producto-form.test.tsx`
Expected: PASS (todos, incluidos los casos previos de guardado/subida de imágenes).

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/app/admin/productos/producto-form.tsx src/app/admin/productos/__tests__/producto-form.test.tsx`
Run: `npx tsc --noEmit 2>&1 | grep -E "producto-form" || echo "sin errores"`
Expected: sin errores en esos archivos.

- [ ] **Step 6: Suite completa + build**

Run: `npx vitest run`
Expected: todo verde.
Run: `npx next build` (o `pnpm build`)
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/productos/producto-form.tsx src/app/admin/productos/__tests__/producto-form.test.tsx
git commit -m "feat: en el formulario, el Stock del producto con variantes es de solo lectura

Muestra la suma de fotos disponibles de las variantes en vez de un
input manual. Productos sin variantes conservan el input editable."
```

---

## Task 5: Verificación manual en navegador

**Files:** ninguno (verificación).

- [ ] **Step 1: Producto con variantes — formulario**

Abrir `/admin/productos/<id>/editar` de un producto con variantes. Confirmar:
- El campo "Stock" aparece como texto ("N unidades — se calcula solo…"), no como input.
- N coincide con la suma de los "X disponibles" que muestra cada variante más abajo.
- Editar otro campo (p. ej. la descripción) y Guardar → volver a entrar → el Stock sigue correcto.

- [ ] **Step 2: Producto sin variantes — formulario**

Abrir el editar de un producto sin variantes. Confirmar que el input "Stock" sigue editable; cambiarlo, guardar, recargar → el nuevo valor persiste.

- [ ] **Step 3: Listado**

En `/admin/productos`, para un producto con variantes, la insignia "N unidades" coincide con la suma real (la del formulario del Step 1).

- [ ] **Step 4: Venta descuenta el listado**

Vender una unidad de ese producto por la tienda (pago manual) y otra por el POS. Recargar `/admin/productos` → la insignia bajó en 2.

- [ ] **Step 5: Marcar vendida manualmente**

En el formulario del producto con variantes, usar "Marcar vendida" en una foto → guardar/recargar → la insignia del listado y el número del formulario bajaron en 1. Usar "Marcar disponible" → vuelven a subir.

---

## Self-Review

**Spec coverage:**
- Migración 050 (trigger + backfill) → Task 1. ✓
- Formulario: solo lectura con variantes / input sin variantes → Task 4. ✓
- `actions.ts`: `createProducto` stock 0 / `updateProducto` omite stock → Task 3. ✓
- "Sin cambios" en RPCs / tienda / low-stock / informes / listado-lógica → respetado (ninguna tarea los toca; constraint global). ✓
- `productoSchema` sin cambios → respetado. ✓
- Testing SQL (verificación, no TDD) → Task 1 Steps 3-6 + Task 5. ✓
- Testing Vitest (form + actions) → Tasks 3 y 4. ✓
- `pnpm build && lint && test` → Task 4 Steps 5-6. ✓

**Placeholder scan:** sin "TBD"/"añadir manejo de errores"/etc. Todo el SQL y TS está escrito literal.

**Type consistency:** `debeGuardarStockManual(cantidadVariantes: number): boolean` — definida en Task 2, usada igual en Task 3 (`debeGuardarStockManual(parsed.data.variantes.length)`). `ProductImage = { id, url, is_primary, variant_id, vendida }` — forma usada en Task 4 coincide con el tipo local del formulario y con el `select` de `[id]/editar/page.tsx` (`id, url, is_primary, variant_id, vendida`). `fields` y `existingImages` ya existen en `producto-form.tsx`.

**Gap encontrado y resuelto:** el `[id]/editar/page.tsx` construye `defaultValues.variantes` sin el campo `stock` por variante (ya se quitó en 048), y `imagenesExistentes` ya trae `vendida` — el formulario tiene todo lo que necesita para el conteo, sin cambios en las páginas que lo renderizan.
