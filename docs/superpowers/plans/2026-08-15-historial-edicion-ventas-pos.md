# Historial y edición de ventas del POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un historial de ventas del POS (visible a staff/admin/superadmin) y la capacidad de editar una venta ya registrada línea por línea (solo admin/superadmin), con reajuste automático de stock, sin duplicar la UI del terminal POS.

**Architecture:** Un nuevo RPC transaccional `update_pos_sale` (mismo patrón de bloqueo de filas que `create_pos_sale`) restaura el stock de los ítems actuales, valida y aplica el nuevo conjunto. La parte interactiva del terminal POS se extrae a un componente compartido `VentaItemsEditor`, reutilizado tanto por `PosTerminal` (crear) como por una nueva página de edición.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions), TypeScript, Supabase (Postgres + RLS + RPC plpgsql), Tailwind v4 (tokens de marca existentes).

## Global Constraints

- Todo el texto visible en español.
- Solo `admin`/`superadmin` puede editar una venta; `staff`/`admin`/`superadmin` pueden ver el historial (mismo acceso que el resto del POS).
- Sin límite de tiempo para editar una venta.
- El `sale_number`, `staff_id` y `created_at` originales de una venta nunca cambian al editarla.
- Toda la lógica de reajuste de stock vive en el RPC, en una sola transacción — nunca se reparte en múltiples round-trips desde el cliente/servidor de Next.js.
- `pnpm build && pnpm lint && pnpm test` deben quedar en verde al final de cada tarea que toque código.

---

### Task 1: RPC `update_pos_sale` + tipos regenerados

**Files:**
- Create: `supabase/migrations/027_editar_venta_pos.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)

**Interfaces:**
- Produces: función RPC `update_pos_sale(p_sale_id uuid, p_items jsonb, p_payment_method public.payment_method, p_discount numeric)` que devuelve `public.pos_sales` — Task 4 la invoca vía `supabase.rpc("update_pos_sale", {...})`.

- [ ] **Step 1: Crear la migración**

```sql
-- Permite corregir una venta del POS ya registrada (solo admin/superadmin):
-- reemplaza sus items y reajusta el stock automaticamente. Mismo patron
-- transaccional que create_pos_sale (011_pos_sale_rpc.sql): bloqueo de filas
-- con "for update" para evitar sobreventa/edicion concurrente.
create or replace function public.update_pos_sale(
  p_sale_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_discount numeric default 0
)
returns public.pos_sales
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
  v_total numeric(12,2);
  v_sale public.pos_sales;
begin
  -- Editar es mas restrictivo que crear: solo admin/superadmin, no staff.
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;

  -- Bloquea la venta para evitar dos ediciones concurrentes sobre la misma.
  perform 1 from public.pos_sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  -- Restaura el stock de los items ACTUALES de la venta (revierte el
  -- descuento que se aplico cuando se creo/edito por ultima vez).
  for v_product_id, v_variant_id, v_qty in
    select product_id, variant_id, qty from public.pos_sale_items where sale_id = p_sale_id
  loop
    if v_variant_id is not null then
      update public.product_variants set stock = stock + v_qty where id = v_variant_id;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
    end if;
  end loop;

  -- Verifica stock suficiente para el NUEVO conjunto de items, bloqueando
  -- filas (mismo chequeo que create_pos_sale).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en la venta.';
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

  if p_discount < 0 or p_discount > v_subtotal then
    raise exception 'El descuento no es valido.';
  end if;

  v_total := v_subtotal - p_discount;

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

  -- Reemplaza los items de la venta (estrategia "borrar y reinsertar", mismo
  -- patron ya usado para variantes de producto en admin/productos/actions.ts).
  delete from public.pos_sale_items where sale_id = p_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_price := (v_item->>'unitPrice')::numeric;

    insert into public.pos_sale_items (sale_id, product_id, variant_id, qty, unit_price, line_total)
    values (p_sale_id, v_product_id, v_variant_id, v_qty, v_unit_price, v_qty * v_unit_price);
  end loop;

  -- sale_number, staff_id y created_at NO cambian.
  update public.pos_sales
  set subtotal = v_subtotal, discount = p_discount, total = v_total, payment_method = p_payment_method
  where id = p_sale_id;

  select * into v_sale from public.pos_sales where id = p_sale_id;
  return v_sale;
end;
$$;

revoke execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric) from public, anon;
grant execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric) to authenticated;
```

- [ ] **Step 2: Aplicar la migración vía el MCP de Supabase**

Usa `mcp__supabase__apply_migration` con el nombre `027_editar_venta_pos` y el
contenido SQL del Step 1. Confirma con `mcp__supabase__list_migrations` que
quedó aplicada.

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Usa `mcp__supabase__generate_typescript_types` y reemplaza el contenido de
`src/lib/supabase/database.types.ts` con el resultado (no lo edites a mano).
Confirma que el nuevo tipo `Database["public"]["Functions"]["update_pos_sale"]`
aparece en el archivo regenerado.

- [ ] **Step 4: Verificar con el MCP de Supabase**

Corre `mcp__supabase__get_advisors` (tipo `security`) y confirma que no
aparece ningún hallazgo nuevo asociado a `update_pos_sale` (debe seguir el
mismo patrón `security definer` + `revoke`/`grant` ya usado por
`create_pos_sale`, que no genera advisors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/027_editar_venta_pos.sql src/lib/supabase/database.types.ts
git commit -m "feat: RPC update_pos_sale para editar ventas del POS con reajuste de stock"
```

---

### Task 2: Extraer `VentaItemsEditor` de `PosTerminal`

**Files:**
- Create: `src/app/pos/venta-items-editor.tsx`
- Modify: `src/app/pos/pos-terminal.tsx` (reescritura completa, se reduce a un wrapper delgado)

**Interfaces:**
- Consumes: `LocalCartItem`, `mergeCartItem`, `updateItemQty`, `removeItem`, `computeSubtotal` de `@/lib/cart/local-cart` (ya existen, sin cambios). `searchProducts`, `PosSearchResult` de `./search-action` (sin cambios). `ProductSearchResult` de `./product-search-result` (sin cambios). `Database["public"]["Enums"]["payment_method"]` de `@/lib/supabase/database.types`.
- Produces:
  ```ts
  export function VentaItemsEditor(props: {
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
  }): JSX.Element;
  ```
  Task 4 importa este componente vía `@/app/pos/venta-items-editor` (patrón de
  cross-import bajo `src/app/` ya usado en el proyecto, ver
  `src/app/(store)/favoritos/favorite-item-controls.tsx`).

**IMPORTANTE:** el comportamiento visible de `/pos` (crear una venta) no debe
cambiar — este es un refactor de extracción, no un rediseño.

- [ ] **Step 1: Crear `venta-items-editor.tsx` con el contenido completo**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import {
  mergeCartItem,
  updateItemQty,
  removeItem,
  computeSubtotal,
  type LocalCartItem,
} from "@/lib/cart/local-cart";
import { searchProducts, type PosSearchResult } from "./search-action";
import { ProductSearchResult } from "./product-search-result";
import type { Database } from "@/lib/supabase/database.types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosSearchResult[]>([]);
  const [items, setItems] = useState<LocalCartItem[]>(itemsIniciales);
  const [discount, setDiscount] = useState(discountInicial);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethodInicial);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const subtotal = computeSubtotal(items);
  const total = Math.max(subtotal - discount, 0);

  const handleSearch = () => {
    startSearch(async () => {
      const found = await searchProducts(query);
      setResults(found);
    });
  };

  const handleAdd = (item: LocalCartItem) => {
    setItems((prev) => mergeCartItem(prev, item));
  };

  const handleUpdateQty = (productId: string, variantId: string | null, qty: number) => {
    setItems((prev) => updateItemQty(prev, productId, variantId, qty));
  };

  const handleRemove = (productId: string, variantId: string | null) => {
    setItems((prev) => removeItem(prev, productId, variantId));
  };

  const handleSubmit = () => {
    setError(null);
    startSubmit(async () => {
      const result = await onGuardar(items, paymentMethod, discount);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        <h2 className="font-heading text-xl text-brand-ciruela">Buscar producto</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o SKU"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button
            type="button"
            onClick={handleSearch}
            disabled={isSearching}
            className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
          >
            {isSearching ? "Buscando..." : "Buscar"}
          </Button>
        </div>
        <div className="flex flex-col">
          {results.map((product) => (
            <ProductSearchResult key={product.id} product={product} onAdd={handleAdd} />
          ))}
          {results.length === 0 && query && !isSearching && (
            <p className="text-sm text-brand-ciruela/60">Sin resultados.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        <h2 className="font-heading text-xl text-brand-ciruela">Venta actual</h2>
        {items.length === 0 ? (
          <p className="text-sm text-brand-ciruela/60">
            Todavía no hay productos en la venta.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-brand-rosa-claro">
            {items.map((item) => (
              <div
                key={`${item.productId}-${item.variantId ?? "base"}`}
                className="flex items-center gap-2 py-2"
              >
                <div className="flex-1">
                  <p className="text-sm text-brand-ciruela">{item.name}</p>
                  <p className="text-xs text-brand-ciruela/60">{formatPrice(item.unitPrice)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty - 1)}
                  className="h-11 w-11 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm">{item.qty}</span>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty + 1)}
                  className="h-11 w-11 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.productId, item.variantId)}
                  className="ml-2 text-sm text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={items.length === 0 || isSubmitting}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {isSubmitting ? textoBotonEnviando : textoBoton}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reemplazar el contenido completo de `pos-terminal.tsx`**

```tsx
"use client";

import { VentaItemsEditor } from "./venta-items-editor";
import { registrarVenta } from "./sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount) =>
        registrarVenta(items, paymentMethod, discount)
      }
    />
  );
}
```

- [ ] **Step 3: Verificar que compila y los tests siguen en verde**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos nuevos, tests en verde (no hay tests
dedicados de `PosTerminal`, esta tarea no agrega ninguno — es refactor de
extracción sin lógica nueva).

- [ ] **Step 4: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx src/app/pos/pos-terminal.tsx
git commit -m "refactor: extrae VentaItemsEditor de PosTerminal para reutilizarlo al editar"
```

---

### Task 3: Página `/pos/ventas` (historial)

**Files:**
- Create: `src/app/pos/ventas/page.tsx`
- Modify: `src/app/pos/page.tsx`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server` (sin cambios). `formatPrice` de `@/lib/format` (sin cambios).

- [ ] **Step 1: Crear `src/app/pos/ventas/page.tsx`**

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

const LIMITE = 50;

export default async function HistorialVentasPage() {
  const supabase = await createClient();
  const { data: ventas } = await supabase
    .from("pos_sales")
    .select("id, sale_number, created_at, payment_method, total")
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/pos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al POS
      </Link>
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">
        Historial de ventas
      </h1>
      {ventas && ventas.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Fecha</th>
                <th className="py-2">Número</th>
                <th className="py-2">Método de pago</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.id} className="border-b border-brand-rosa-claro/50">
                  <td className="py-2">
                    {new Date(venta.created_at).toLocaleString("es-CO")}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/pos/venta/${venta.id}`}
                      className="text-brand-rosa hover:underline"
                    >
                      {venta.sale_number}
                    </Link>
                  </td>
                  <td className="py-2">{venta.payment_method}</td>
                  <td className="py-2">{formatPrice(venta.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-brand-ciruela/70">Todavía no hay ventas registradas.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Agregar el enlace al historial en `src/app/pos/page.tsx`**

Reemplaza el `<h1>` actual (línea con
`<h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Punto de venta</h1>`)
por:

```tsx
<div className="mb-8 flex items-center justify-between">
  <h1 className="font-heading text-3xl text-brand-ciruela">Punto de venta</h1>
  <Link
    href="/pos/ventas"
    className="text-sm text-brand-ciruela hover:text-brand-rosa"
  >
    Ver historial de ventas
  </Link>
</div>
```

El resto del archivo (el `<Link>` condicional "Volver al panel" y
`<PosTerminal />`) no cambia. `Link` ya está importado en este archivo.

- [ ] **Step 3: Verificar que compila y los tests siguen en verde**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos nuevos (puede haber un error de
`PageProps<"/pos/ventas">` sin resolver hasta que se corra `pnpm build` —
si `tsc --noEmit` se queja solo de eso, ignóralo por ahora; esta página no
usa `PageProps` de todas formas, así que no debería pasar). Tests en verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/pos/ventas/page.tsx src/app/pos/page.tsx
git commit -m "feat: historial de ventas del POS en /pos/ventas"
```

---

### Task 4: Página de edición `/pos/venta/[id]/editar`

**Files:**
- Create: `src/app/pos/venta/[id]/editar/page.tsx`
- Create: `src/app/pos/venta/[id]/editar/editar-venta-form.tsx`
- Create: `src/app/pos/venta/[id]/editar/actions.ts`

**Interfaces:**
- Consumes: `VentaItemsEditor` de `@/app/pos/venta-items-editor` (Task 2, ya
  existe). `getCurrentProfile` de `@/lib/auth/get-current-user` (sin
  cambios). `requireAdmin` de `@/lib/admin/require-admin` (sin cambios).
  `LocalCartItem` de `@/lib/cart/local-cart` (sin cambios). RPC
  `update_pos_sale` (Task 1, ya existe en los tipos regenerados).

**IMPORTANTE:** esta ruta debe quedar bloqueada para cualquiera que no sea
`admin`/`superadmin` — el middleware solo protege el prefijo `/pos` en
general (staff incluido), así que esta página necesita su propio chequeo
de rol con `notFound()`, y la acción de servidor necesita el suyo con
`requireAdmin()` (defensa en profundidad: uno protege la URL, el otro
protege la mutación sin importar cómo se invoque).

- [ ] **Step 1: Crear `actions.ts`**

```tsx
"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LocalCartItem } from "@/lib/cart/local-cart";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export async function actualizarVenta(
  saleId: string,
  items: LocalCartItem[],
  paymentMethod: PaymentMethod,
  discount: number,
): Promise<{ error?: string }> {
  await requireAdmin();

  if (items.length === 0) {
    return { error: "La venta debe tener al menos un producto." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_pos_sale", {
    p_sale_id: saleId,
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    p_payment_method: paymentMethod,
    p_discount: discount,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo actualizar la venta." };
  }

  redirect(`/pos/venta/${data.id}`);
}
```

- [ ] **Step 2: Crear `editar-venta-form.tsx`**

```tsx
"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { Database } from "@/lib/supabase/database.types";
import { actualizarVenta } from "./actions";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export function EditarVentaForm({
  saleId,
  itemsIniciales,
  discountInicial,
  paymentMethodInicial,
}: {
  saleId: string;
  itemsIniciales: LocalCartItem[];
  discountInicial: number;
  paymentMethodInicial: PaymentMethod;
}) {
  return (
    <VentaItemsEditor
      itemsIniciales={itemsIniciales}
      discountInicial={discountInicial}
      paymentMethodInicial={paymentMethodInicial}
      textoBoton="Guardar cambios"
      textoBotonEnviando="Guardando..."
      onGuardar={(items, paymentMethod, discount) =>
        actualizarVenta(saleId, items, paymentMethod, discount)
      }
    />
  );
}
```

- [ ] **Step 3: Crear `page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { EditarVentaForm } from "./editar-venta-form";

export default async function EditarVentaPage({
  params,
}: PageProps<"/pos/venta/[id]/editar">) {
  const { id } = await params;

  const currentUser = await getCurrentProfile();
  const esAdmin =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";
  if (!esAdmin) {
    notFound();
  }

  const supabase = await createClient();
  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id, discount, payment_method")
    .eq("id", id)
    .single();

  if (!venta) {
    notFound();
  }

  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("qty, unit_price, product_id, variant_id")
    .eq("sale_id", venta.id);

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
    // El stock "editable" de una linea ya vendida es el stock actual mas lo
    // que esta venta ya tiene reservado: esa cantidad sigue descontada del
    // stock real hasta que se guarde la edicion, asi que hay que sumarla de
    // vuelta para no subestimar el maximo disponible en el editor.
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
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Editar venta</h1>
      <EditarVentaForm
        saleId={venta.id}
        itemsIniciales={itemsIniciales}
        discountInicial={venta.discount}
        paymentMethodInicial={venta.payment_method}
      />
    </main>
  );
}
```

- [ ] **Step 4: Verificar que compila y los tests siguen en verde**

Run: `pnpm build`
Expected: build exitoso, incluida la nueva ruta `/pos/venta/[id]/editar`
(este es el primer punto donde `PageProps<"/pos/venta/[id]/editar">` se
resuelve vía el typegen de Next.js). Luego `pnpm lint && pnpm test` en
verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/pos/venta/[id]/editar"
git commit -m "feat: pagina de edicion de ventas del POS con reajuste de stock"
```

---

### Task 5: Botón "Editar venta" en el recibo

**Files:**
- Modify: `src/app/pos/venta/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile` de `@/lib/auth/get-current-user` (sin cambios).

- [ ] **Step 1: Agregar el import y el chequeo de rol**

En `src/app/pos/venta/[id]/page.tsx`, agrega el import junto a los
existentes:

```tsx
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
```

(`notFound`, `createClient`, `formatPrice`, `PrintButton` ya están
importados — no los dupliques.)

Justo después de `const supabase = await createClient();`, agrega:

```tsx
const currentUser = await getCurrentProfile();
const esAdmin =
  currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";
```

- [ ] **Step 2: Agregar el botón junto a `PrintButton`**

Reemplaza:

```tsx
      <div className="mt-6 flex justify-center">
        <PrintButton />
      </div>
```

por:

```tsx
      <div className="mt-6 flex justify-center gap-3">
        <PrintButton />
        {esAdmin && (
          <Link
            href={`/pos/venta/${venta.id}/editar`}
            className="inline-flex items-center rounded-md border border-brand-rosa-claro px-4 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            Editar venta
          </Link>
        )}
      </div>
```

- [ ] **Step 3: Verificar que compila y los tests siguen en verde**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos nuevos, tests en verde.

- [ ] **Step 4: Commit**

```bash
git add "src/app/pos/venta/[id]/page.tsx"
git commit -m "feat: boton Editar venta en el recibo, visible solo a admin/superadmin"
```

---

### Task 6: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-5.

- [ ] **Step 1: `pnpm build && pnpm lint && pnpm test` completos**

Expected: los tres en verde, sin advertencias nuevas más allá de las 3
preexistentes de `react-hooks/incompatible-library`.

- [ ] **Step 2: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 y arranca uno limpio con `pnpm dev` en segundo
plano si hace falta.

- [ ] **Step 3: Verificación manual con curl (rutas y protección de rol)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pos/ventas
```
Expected: `200` o redirección a `/login` si no hay sesión (sin sesión,
`/pos/**` completo requiere login vía el proxy — comportamiento esperado,
no es un fallo).

- [ ] **Step 4: Verificación manual en navegador (requiere sesión admin)**

Deja anotado en el reporte final que lo siguiente no se automatizó y
requiere un recorrido manual del usuario (o de un agente con la extensión
de Chrome conectada y sesión iniciada):

1. Iniciar sesión como `adminsu` (o cualquier admin/superadmin).
2. Ir a `/pos`, confirmar que aparece "Ver historial de ventas".
3. Ir a `/pos/ventas`, confirmar que lista ventas existentes (si las hay)
   con enlace al recibo.
4. Abrir un recibo (`/pos/venta/[id]`), confirmar que aparece "Editar
   venta".
5. Editar la venta: cambiar la cantidad de un ítem, agregar un producto
   nuevo, cambiar el método de pago, guardar. Confirmar que redirige al
   recibo actualizado con los cambios reflejados.
6. Confirmar en `/admin/informes/stock-bajo` o directamente en
   `/admin/productos` que el stock de los productos involucrados quedó
   correcto tras la edición (no duplicado ni perdido).
7. Con un usuario `staff` (no admin/superadmin), confirmar que
   `/pos/venta/[id]/editar` da 404 y que el botón "Editar venta" no
   aparece en el recibo.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 6, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta fase (creada al iniciar la ejecución de este plan,
con base en `master`) para fusionar, verificar y subir.
