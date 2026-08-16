# Edición de pedidos de tienda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir a un admin/superadmin editar los productos de un pedido de la tienda ya registrado (agregar, quitar, cambiar cantidades), con reajuste automático de stock — reutilizando `VentaItemsEditor` de la fase anterior del POS, con una advertencia visible cuando el pedido se pagó con Wompi.

**Architecture:** Un nuevo RPC transaccional `update_order_items` (mismo patrón de bloqueo de filas que `update_pos_sale`) restaura el stock de los ítems actuales del pedido, valida y aplica el nuevo conjunto. `VentaItemsEditor` gana dos props opcionales para ocultar descuento y método de pago (que no aplican a un pedido de tienda), y se reutiliza en una nueva página `/admin/pedidos/[id]/editar`.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions), TypeScript, Supabase (Postgres + RLS + RPC plpgsql), Tailwind v4 (tokens de marca existentes).

## Global Constraints

- Todo el texto visible en español.
- Se permite editar cualquier pedido, incluidos los pagados con Wompi — mostrando una advertencia visible de que el cobro real no se ajusta automáticamente.
- El RPC no modifica `status`, `payment_method`, `shipping_address`, `order_number`, `user_id`, `created_at` ni `shipping` — solo `subtotal`/`total` derivados de los ítems.
- `/admin/pedidos/[id]/editar` no necesita un chequeo de rol propio en la página (ya cubierto por el middleware de `/admin/**`), pero la acción de servidor sigue llamando `requireAdmin()` por consistencia con el resto del panel.
- `pnpm build && pnpm lint && pnpm test` deben quedar en verde al final de cada tarea que toque código.

---

### Task 1: RPC `update_order_items` + tipos regenerados

**Files:**
- Create: `supabase/migrations/028_editar_pedido_tienda.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)

**Interfaces:**
- Produces: función RPC `update_order_items(p_order_id uuid, p_items jsonb)` que devuelve `public.orders` — Task 3 la invoca vía `supabase.rpc("update_order_items", {...})`.

- [ ] **Step 1: Crear la migración**

```sql
-- Permite corregir los productos de un pedido de tienda ya registrado
-- (solo admin/superadmin): reemplaza sus items y reajusta el stock
-- automaticamente. Mismo patron transaccional que update_pos_sale
-- (027_editar_venta_pos.sql): bloqueo de filas con "for update" para
-- evitar sobreventa/edicion concurrente. No toca status, payment_method,
-- shipping_address, order_number, user_id, created_at ni shipping.
create or replace function public.update_order_items(
  p_order_id uuid,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_qty int;
  v_unit_price numeric(12,2);
  v_available_stock int;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2);
  v_product_name text;
  v_variant_talla text;
  v_variant_color text;
  v_name_snapshot text;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos.';
  end if;

  -- Bloquea el pedido para evitar ediciones concurrentes, y lee el
  -- shipping actual (no se toca, se preserva en el total recalculado).
  select shipping into v_shipping from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  -- Restaura el stock de los items ACTUALES del pedido (revierte el
  -- descuento aplicado cuando se creo/edito por ultima vez).
  for v_product_id, v_variant_id, v_qty in
    select product_id, variant_id, qty from public.order_items where order_id = p_order_id
  loop
    if v_variant_id is not null then
      update public.product_variants set stock = stock + v_qty where id = v_variant_id;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
    end if;
  end loop;

  -- Verifica stock suficiente para el NUEVO conjunto de items,
  -- bloqueando filas (mismo chequeo que update_pos_sale).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en el pedido.';
    end if;

    if v_variant_id is not null then
      select stock into v_available_stock from public.product_variants where id = v_variant_id for update;
    else
      select stock into v_available_stock from public.products where id = v_product_id for update;
    end if;

    if v_available_stock is null or v_available_stock < v_qty then
      raise exception 'No hay stock suficiente para uno de los productos.';
    end if;

    v_subtotal := v_subtotal + v_qty * (v_item->>'unitPrice')::numeric;
  end loop;

  -- Descuenta stock del nuevo conjunto.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_variant_id is not null then
      update public.product_variants set stock = stock - v_qty where id = v_variant_id;
    else
      update public.products set stock = stock - v_qty where id = v_product_id;
    end if;
  end loop;

  -- Reemplaza los items del pedido (estrategia "borrar y reinsertar",
  -- mismo patron ya usado en update_pos_sale).
  delete from public.order_items where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_price := (v_item->>'unitPrice')::numeric;

    select p.name into v_product_name from public.products p where p.id = v_product_id;

    if v_variant_id is not null then
      select pv.talla, pv.color into v_variant_talla, v_variant_color
      from public.product_variants pv where pv.id = v_variant_id;
      v_name_snapshot := v_product_name || ' (' ||
        array_to_string(array_remove(array[v_variant_talla, v_variant_color], null), ' / ') || ')';
    else
      v_name_snapshot := v_product_name;
    end if;

    insert into public.order_items (order_id, product_id, variant_id, name_snapshot, qty, unit_price, line_total)
    values (p_order_id, v_product_id, v_variant_id, v_name_snapshot, v_qty, v_unit_price, v_qty * v_unit_price);
  end loop;

  -- status, payment_method, shipping_address, order_number, user_id,
  -- created_at y shipping NO cambian.
  update public.orders
  set subtotal = v_subtotal, total = v_subtotal + v_shipping
  where id = p_order_id;

  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;

revoke execute on function public.update_order_items(uuid, jsonb) from public, anon;
grant execute on function public.update_order_items(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Aplicar la migración vía el MCP de Supabase**

Usa `mcp__supabase__apply_migration` con el nombre `028_editar_pedido_tienda` y
el contenido SQL del Step 1. Confirma con `mcp__supabase__list_migrations`
que quedó aplicada.

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Usa `mcp__supabase__generate_typescript_types` y reemplaza el contenido de
`src/lib/supabase/database.types.ts` con el resultado (no lo edites a mano).
Confirma que `Database["public"]["Functions"]["update_order_items"]`
aparece en el archivo regenerado.

- [ ] **Step 4: Verificar con el MCP de Supabase**

Corre `mcp__supabase__get_advisors` (tipo `security`) y confirma que no
aparece ningún hallazgo nuevo asociado a `update_order_items` más allá del
patrón `security definer` ya aceptado para `create_order`/`create_pos_sale`/`update_pos_sale`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/028_editar_pedido_tienda.sql src/lib/supabase/database.types.ts
git commit -m "feat: RPC update_order_items para editar pedidos de tienda con reajuste de stock"
```

---

### Task 2: `VentaItemsEditor` gana `mostrarDescuento`/`mostrarMetodoPago`

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx`

**Interfaces:**
- Produces: `VentaItemsEditor` gana dos props opcionales, ambas `true` por
  defecto (el POS no cambia de comportamiento):
  ```ts
  {
    mostrarDescuento?: boolean; // default true
    mostrarMetodoPago?: boolean; // default true
    // ...resto de props sin cambios (ver Task 2 de la fase anterior del POS)
  }
  ```
  Task 3 la usa con ambas en `false`.

**IMPORTANTE:** el comportamiento visible de `/pos` (crear/editar una venta)
no debe cambiar — este archivo ya existe y funciona, solo se le agregan dos
condicionales.

- [ ] **Step 1: Agregar las dos props a la desestructuración**

En `src/app/pos/venta-items-editor.tsx`, cambia:

```tsx
export function VentaItemsEditor({
  itemsIniciales = [],
  discountInicial = 0,
  paymentMethodInicial = "efectivo",
  textoBoton,
  textoBotonEnviando,
  onGuardar,
}: {
  itemsIniciales?: LocalCartItem[];
  discountInicial?: number;
  paymentMethodInicial?: PaymentMethod;
  textoBoton: string;
  textoBotonEnviando: string;
  onGuardar: (
    items: LocalCartItem[],
    paymentMethod: PaymentMethod,
    discount: number,
  ) => Promise<{ error?: string } | void>;
}) {
```

por:

```tsx
export function VentaItemsEditor({
  itemsIniciales = [],
  discountInicial = 0,
  paymentMethodInicial = "efectivo",
  mostrarDescuento = true,
  mostrarMetodoPago = true,
  textoBoton,
  textoBotonEnviando,
  onGuardar,
}: {
  itemsIniciales?: LocalCartItem[];
  discountInicial?: number;
  paymentMethodInicial?: PaymentMethod;
  mostrarDescuento?: boolean;
  mostrarMetodoPago?: boolean;
  textoBoton: string;
  textoBotonEnviando: string;
  onGuardar: (
    items: LocalCartItem[],
    paymentMethod: PaymentMethod,
    discount: number,
  ) => Promise<{ error?: string } | void>;
}) {
```

- [ ] **Step 2: Condicionar el campo de descuento**

Reemplaza:

```tsx
        <div>
          <label htmlFor="discount" className="text-sm text-brand-ciruela">
            Descuento (pesos)
          </label>
          <Input
            id="discount"
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
```

por:

```tsx
        {mostrarDescuento && (
          <div>
            <label htmlFor="discount" className="text-sm text-brand-ciruela">
              Descuento (pesos)
            </label>
            <Input
              id="discount"
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        )}
```

- [ ] **Step 3: Condicionar el selector de método de pago**

Reemplaza:

```tsx
        <div>
          <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
            Método de pago
          </label>
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
          </select>
        </div>
```

por:

```tsx
        {mostrarMetodoPago && (
          <div>
            <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
              Método de pago
            </label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
            </select>
          </div>
        )}
```

- [ ] **Step 4: Condicionar la línea de descuento en el resumen de totales**

Reemplaza:

```tsx
        <div className="flex flex-col gap-1 border-t border-brand-rosa-claro pt-3 text-sm text-brand-ciruela">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>-{formatPrice(discount)}</span>
          </div>
          <div className="flex justify-between font-heading text-lg text-brand-rosa">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
```

por:

```tsx
        <div className="flex flex-col gap-1 border-t border-brand-rosa-claro pt-3 text-sm text-brand-ciruela">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {mostrarDescuento && (
            <div className="flex justify-between">
              <span>Descuento</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-heading text-lg text-brand-rosa">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
```

Nota: cuando `mostrarDescuento` es `false`, el estado interno `discount`
nunca se modifica (queda en `discountInicial`, por defecto `0`), así que
`total = Math.max(subtotal - discount, 0)` da simplemente `subtotal` — no
hace falta ningún cambio al cálculo de `total` en sí.

- [ ] **Step 5: Verificar que compila, que /pos sigue igual, y que los tests pasan**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos nuevos, tests en verde. `PosTerminal` (que
usa `VentaItemsEditor` sin pasar `mostrarDescuento`/`mostrarMetodoPago`)
sigue mostrando ambos campos exactamente igual que antes, por los valores
por defecto `true`.

- [ ] **Step 6: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx
git commit -m "feat: VentaItemsEditor permite ocultar descuento y metodo de pago"
```

---

### Task 3: Página de edición `/admin/pedidos/[id]/editar`

**Files:**
- Create: `src/app/admin/pedidos/[id]/editar/page.tsx`
- Create: `src/app/admin/pedidos/[id]/editar/pedido-editar-form.tsx`
- Create: `src/app/admin/pedidos/[id]/editar/actions.ts`

**Interfaces:**
- Consumes: `VentaItemsEditor` de `@/app/pos/venta-items-editor` (Task 2,
  ya existe, ahora con `mostrarDescuento`/`mostrarMetodoPago`).
  `requireAdmin` de `@/lib/admin/require-admin` (sin cambios).
  `LocalCartItem` de `@/lib/cart/local-cart` (sin cambios). RPC
  `update_order_items` (Task 1, ya existe en los tipos regenerados).

- [ ] **Step 1: Crear `actions.ts`**

```tsx
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { LocalCartItem } from "@/lib/cart/local-cart";

export async function actualizarPedidoItems(
  orderId: string,
  items: LocalCartItem[],
): Promise<{ error?: string }> {
  await requireAdmin();

  if (items.length === 0) {
    return { error: "El pedido debe tener al menos un producto." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_order_items", {
    p_order_id: orderId,
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo actualizar el pedido." };
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${data.id}`);
  redirect(`/admin/pedidos/${data.id}`);
}
```

- [ ] **Step 2: Crear `pedido-editar-form.tsx`**

```tsx
"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { actualizarPedidoItems } from "./actions";

export function PedidoEditarForm({
  orderId,
  itemsIniciales,
}: {
  orderId: string;
  itemsIniciales: LocalCartItem[];
}) {
  return (
    <VentaItemsEditor
      itemsIniciales={itemsIniciales}
      mostrarDescuento={false}
      mostrarMetodoPago={false}
      textoBoton="Guardar cambios"
      textoBotonEnviando="Guardando..."
      onGuardar={(items) => actualizarPedidoItems(orderId, items)}
    />
  );
}
```

Nota: `onGuardar` recibe `(items, paymentMethod, discount)` por la firma
de `VentaItemsEditor`, pero aquí solo se usa `items` — `paymentMethod` y
`discount` se ignoran (no aplican a un pedido de tienda, y con
`mostrarMetodoPago`/`mostrarDescuento` en `false` el usuario nunca los
edita de todas formas).

- [ ] **Step 3: Crear `page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { PedidoEditarForm } from "./pedido-editar-form";

export default async function EditarPedidoPage({
  params,
}: PageProps<"/admin/pedidos/[id]/editar">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("orders")
    .select("id, order_number, payment_method")
    .eq("id", id)
    .single();

  if (!pedido) {
    notFound();
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, product_id, variant_id")
    .eq("order_id", pedido.id);

  const productIds = (items ?? [])
    .map((i) => i.product_id)
    .filter((v): v is string => Boolean(v));
  const variantIds = (items ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, stock").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; stock: number }[] }),
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, talla, color, stock")
          .in("id", variantIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            talla: string | null;
            color: string | null;
            stock: number;
          }[],
        }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const itemsIniciales: LocalCartItem[] = (items ?? []).map((item) => {
    const producto = item.product_id ? productById.get(item.product_id) : undefined;
    const variante = item.variant_id ? variantById.get(item.variant_id) : undefined;
    const varianteLabel = variante
      ? [variante.talla, variante.color].filter(Boolean).join(" / ")
      : null;
    const nombreBase = producto?.name ?? "Producto";
    // Mismo criterio que /pos/venta/[id]/editar: el stock "editable" de
    // una linea ya vendida es el stock actual mas lo que este pedido ya
    // tiene reservado.
    const stockActual = variante?.stock ?? producto?.stock ?? 0;

    return {
      productId: item.product_id ?? "",
      variantId: item.variant_id,
      slug: "",
      name: varianteLabel ? `${nombreBase} (${varianteLabel})` : nombreBase,
      unitPrice: item.unit_price,
      qty: item.qty,
      imageUrl: null,
      stock: stockActual + item.qty,
    };
  });

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Editar pedido {pedido.order_number}
      </h1>
      {pedido.payment_method === "wompi" && (
        <div className="rounded-lg border border-brand-oro bg-brand-oro/10 p-4 text-sm text-brand-ciruela">
          <p className="font-semibold">Este pedido se pagó con Wompi</p>
          <p>
            El cliente ya fue cobrado el total original. Editar los productos
            no ajusta ese cobro automáticamente — si el nuevo total difiere
            del que se cobró, resuélvelo por fuera del sistema (reembolso o
            cobro adicional a través de Wompi).
          </p>
        </div>
      )}
      <PedidoEditarForm orderId={pedido.id} itemsIniciales={itemsIniciales} />
    </main>
  );
}
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm build`
Expected: build exitoso, incluida la nueva ruta
`/admin/pedidos/[id]/editar` (este es el primer punto donde
`PageProps<"/admin/pedidos/[id]/editar">` se resuelve vía el typegen de
Next.js). Luego `pnpm lint && pnpm test` en verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/pedidos/[id]/editar"
git commit -m "feat: pagina de edicion de pedidos de tienda con reajuste de stock"
```

---

### Task 4: Botón "Editar pedido" en el detalle

**Files:**
- Modify: `src/app/admin/pedidos/[id]/page.tsx`

**Interfaces:** ninguna nueva — solo un `<Link>` a la ruta creada en Task 3.

- [ ] **Step 1: Agregar el import**

En `src/app/admin/pedidos/[id]/page.tsx`, agrega junto a los imports
existentes:

```tsx
import Link from "next/link";
```

(`notFound`, `createClient`, `formatPrice`, `EstadoPedidoSelect` ya están
importados — no los dupliques.)

- [ ] **Step 2: Agregar el botón junto al selector de estado**

Reemplaza:

```tsx
      <EstadoPedidoSelect orderId={pedido.id} estadoActual={pedido.status} />
```

por:

```tsx
      <div className="flex flex-wrap items-center gap-3">
        <EstadoPedidoSelect orderId={pedido.id} estadoActual={pedido.status} />
        <Link
          href={`/admin/pedidos/${pedido.id}/editar`}
          className="inline-flex items-center rounded-md border border-brand-rosa-claro px-4 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
        >
          Editar pedido
        </Link>
      </div>
```

- [ ] **Step 3: Verificar que compila y los tests siguen en verde**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos nuevos, tests en verde.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/pedidos/[id]/page.tsx"
git commit -m "feat: boton Editar pedido en el detalle de pedidos de tienda"
```

---

### Task 5: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-4.

- [ ] **Step 1: `pnpm build && pnpm lint && pnpm test` completos**

Expected: los tres en verde, sin advertencias nuevas más allá de las
preexistentes de `react-hooks/incompatible-library`.

- [ ] **Step 2: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 y arranca uno limpio con `pnpm dev` en segundo
plano si hace falta.

- [ ] **Step 3: Verificación manual en navegador (con sesión admin real)**

Deja anotado en el reporte final si esto se hizo o no de forma
interactiva:

1. Ir a `/admin/pedidos`, abrir cualquier pedido existente.
2. Confirmar que aparece "Editar pedido" junto al selector de estado.
3. Entrar a editar: agregar un producto, cambiar una cantidad, guardar.
4. Confirmar que redirige al detalle con los productos/subtotal/total
   actualizados, y que `status`/`payment_method`/`order_number` no
   cambiaron.
5. Confirmar en la base de datos que el stock de los productos
   involucrados quedó correcto (restaurado + redescontado según el
   nuevo conjunto).
6. Si existe algún pedido con `payment_method = 'wompi'`, abrir su
   edición y confirmar que aparece la advertencia dorada antes del
   formulario; en un pedido con pago manual, confirmar que NO aparece.
7. Confirmar que `VentaItemsEditor` en `/pos` (crear una venta) sigue
   mostrando descuento y método de pago exactamente igual que antes.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 5, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta fase (creada al iniciar la ejecución de este plan,
con base en `master`) para fusionar, verificar y subir.
