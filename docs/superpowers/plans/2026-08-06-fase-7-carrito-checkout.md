# MeryLay Boutique — Fase 7 (Carrito y checkout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carrito persistente (invitado en `localStorage`, autenticado en
Supabase, fusión al iniciar sesión) y checkout que crea pedidos reales con
descuento de stock atómico.

**Architecture:** Server Components para páginas de datos, Client Components
para el carrito de invitado y formularios. Lógica pura de carrito en
`src/lib/cart/` (TDD). La transacción financiera (verificar stock, descontar,
crear pedido) vive en una función Postgres `security definer` invocada vía
RPC, no en múltiples pasos de aplicación.

**Tech Stack:** Next.js 16 (App Router, `src/`), TypeScript estricto,
`@supabase/ssr`, `zod`, `react-hook-form`, Vitest, PL/pgSQL.

## Global Constraints

- Idioma: todo en español (UI, mensajes de error).
- TypeScript estricto; Server Components por defecto.
- El carrito de invitado nunca toca Supabase; el de usuario autenticado nunca
  usa `localStorage`.
- La operación de checkout (stock + pedido) es atómica — nunca varios pasos
  de aplicación que puedan dejar datos a medias.
- Commits atómicos en español al cerrar cada tarea funcional.

## Referencia del spec

Este plan implementa `docs/superpowers/specs/2026-08-06-fase-7-carrito-checkout-design.md`.

---

## Mapa de archivos

- `supabase/migrations/010_checkout_rpc.sql`
- `src/lib/cart/local-cart.ts`, `src/lib/cart/__tests__/local-cart.test.ts`
- `src/lib/cart/get-or-create-cart.ts`
- `src/lib/cart/merge-guest-cart-action.ts`
- `src/app/(store)/carrito/{page.tsx, actions.ts, guest-cart.tsx,
  authenticated-cart.tsx, cart-item-controls.tsx}`
- `src/lib/validation/checkout.ts`,
  `src/lib/validation/__tests__/checkout.test.ts`
- `src/app/(store)/checkout/{page.tsx, actions.ts, checkout-form.tsx}`
- `src/app/(store)/cuenta/pedidos/page.tsx`
- `src/app/(store)/cuenta/pedidos/[id]/page.tsx`
- Modifica: `src/app/(auth)/login/{actions.ts, login-form.tsx}`,
  `src/app/(auth)/registro/{actions.ts, registro-form.tsx}`
- Modifica: `src/lib/store/variants.ts`,
  `src/lib/store/__tests__/variants.test.ts`
- Modifica: `src/app/(store)/producto/[slug]/{page.tsx,
  product-variant-selector.tsx}`
- Modifica: `src/components/layout/site-header.tsx`

---

## Task 1: Migración 010 — función atómica `create_order`

**Files:**
- Create: `supabase/migrations/010_checkout_rpc.sql`

**Interfaces:**
- Consumes: `public.carts`, `public.cart_items`, `public.products`,
  `public.product_variants`, `public.orders`, `public.order_items`
  (Fase 2).
- Produces: función RPC `create_order(p_shipping_address jsonb, p_payment_method text) returns public.orders`
  — usada por Task 16 (`confirmarPedido`).

- [ ] **Step 1: Escribir la migración**

```sql
create or replace function public.create_order(
  p_shipping_address jsonb,
  p_payment_method text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2) := 0;
  v_item record;
  v_available_stock int;
  v_order public.orders;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesion para completar el pedido.';
  end if;

  select id into v_cart_id from public.carts where user_id = v_user_id limit 1;
  if v_cart_id is null then
    raise exception 'No tienes un carrito activo.';
  end if;

  if not exists (select 1 from public.cart_items where cart_id = v_cart_id) then
    raise exception 'Tu carrito esta vacio.';
  end if;

  -- Verificar stock disponible por cada item, bloqueando las filas
  -- para evitar sobreventa con checkouts concurrentes.
  for v_item in
    select ci.product_id, ci.variant_id, ci.qty
    from public.cart_items ci
    where ci.cart_id = v_cart_id
  loop
    if v_item.variant_id is not null then
      select stock into v_available_stock from public.product_variants where id = v_item.variant_id for update;
    else
      select stock into v_available_stock from public.products where id = v_item.product_id for update;
    end if;

    if v_available_stock is null or v_available_stock < v_item.qty then
      raise exception 'No hay stock suficiente para uno de los productos del carrito.';
    end if;
  end loop;

  -- Descontar stock
  for v_item in
    select ci.product_id, ci.variant_id, ci.qty
    from public.cart_items ci
    where ci.cart_id = v_cart_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants set stock = stock - v_item.qty where id = v_item.variant_id;
    else
      update public.products set stock = stock - v_item.qty where id = v_item.product_id;
    end if;
  end loop;

  select coalesce(sum(qty * unit_price), 0) into v_subtotal
  from public.cart_items where cart_id = v_cart_id;

  v_order_number := 'ML-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  while exists (select 1 from public.orders where order_number = v_order_number) loop
    v_order_number := 'ML-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  end loop;

  insert into public.orders (order_number, user_id, status, subtotal, shipping, total, payment_method, shipping_address)
  values (v_order_number, v_user_id, 'pendiente', v_subtotal, 0, v_subtotal, p_payment_method, p_shipping_address)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, variant_id, name_snapshot, qty, unit_price, line_total)
  select
    v_order_id,
    ci.product_id,
    ci.variant_id,
    case
      when pv.id is not null then
        p.name || ' (' || array_to_string(array_remove(array[pv.talla, pv.color], null), ' / ') || ')'
      else p.name
    end,
    ci.qty,
    ci.unit_price,
    ci.qty * ci.unit_price
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  left join public.product_variants pv on pv.id = ci.variant_id
  where ci.cart_id = v_cart_id;

  delete from public.cart_items where cart_id = v_cart_id;

  select * into v_order from public.orders where id = v_order_id;
  return v_order;
end;
$$;

revoke execute on function public.create_order(jsonb, text) from public, anon;
grant execute on function public.create_order(jsonb, text) to authenticated;
```

- [ ] **Step 2: Aplicar vía MCP**

Usar `mcp__supabase__apply_migration` con `name: "checkout_rpc"`.

- [ ] **Step 3: Verificar con una prueba funcional completa**

Vía `mcp__supabase__execute_sql`, simulando el flujo con un usuario de
prueba (crear un usuario temporal, un producto con stock conocido, un
carrito con un ítem, invocar la función autenticado como ese usuario no es
directo desde SQL — en su lugar, verificar la lógica de negocio con una
llamada directa a la función usando `set local role` no es fiable para
`auth.uid()`; en cambio, verificar manualmente los pasos por separado):

```sql
-- Crear datos de prueba
insert into public.categories (name, slug) values ('Prueba Checkout', 'prueba-checkout-verif');
insert into public.products (name, slug, category_id, price, sku, stock)
select 'Producto Checkout', 'producto-checkout-verif', id, 50000, 'CHK-VERIF-001', 5
from public.categories where slug = 'prueba-checkout-verif';

-- Confirmar que la funcion existe y tiene el owner/permissions esperados
select proname, prosecdef from pg_proc where proname = 'create_order';

-- Limpiar
delete from public.products where slug = 'producto-checkout-verif';
delete from public.categories where slug = 'prueba-checkout-verif';
```

Expected: `prosecdef = true` (confirma `security definer`). La prueba
end-to-end completa (con un usuario autenticado real) se hace en la Task 20
usando el cliente anon con sesión, ya que `auth.uid()` solo resuelve
correctamente dentro de una request autenticada real, no en `execute_sql`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010_checkout_rpc.sql
git commit -m "feat(db): migracion 010 - funcion atomica create_order para el checkout"
```

---

## Task 2: Regenerar tipos TypeScript

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: esquema tras la Task 1.
- Produces: `Database["public"]["Functions"]["create_order"]` tipado —
  usado por Task 16 (`supabase.rpc("create_order", ...)`).

- [ ] **Step 1: Generar los tipos vía MCP**

Usar `mcp__supabase__generate_typescript_types` y reemplazar el contenido de
`src/lib/supabase/database.types.ts`.

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat(db): actualiza tipos TypeScript tras la migracion 010"
```

---

## Task 3: Lógica pura de carrito local (TDD)

**Files:**
- Create: `src/lib/cart/__tests__/local-cart.test.ts`
- Create: `src/lib/cart/local-cart.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `LocalCartItem`, `mergeCartItem()`, `updateItemQty()`,
  `removeItem()`, `computeSubtotal()`, `getLocalCart()`, `saveLocalCart()`,
  `clearLocalCart()` — usados por Task 11 (selector de variante), Task 12
  (carrito de invitado), Task 8/9 (fusión al login/registro).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { mergeCartItem, updateItemQty, removeItem, computeSubtotal } from "../local-cart";
import type { LocalCartItem } from "../local-cart";

const baseItem: LocalCartItem = {
  productId: "p1",
  variantId: null,
  slug: "producto-1",
  name: "Producto 1",
  unitPrice: 10000,
  qty: 1,
  imageUrl: null,
  stock: 5,
};

describe("mergeCartItem", () => {
  it("agrega un item nuevo si no existe", () => {
    const result = mergeCartItem([], baseItem);
    expect(result).toEqual([baseItem]);
  });

  it("suma la cantidad si el producto/variante ya existe", () => {
    const result = mergeCartItem([baseItem], { ...baseItem, qty: 2 });
    expect(result[0].qty).toBe(3);
  });

  it("capa la cantidad combinada al stock disponible", () => {
    const result = mergeCartItem([{ ...baseItem, qty: 4 }], { ...baseItem, qty: 3 });
    expect(result[0].qty).toBe(5);
  });

  it("trata productos con distinta variante como items distintos", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1" }],
      { ...baseItem, variantId: "v2" },
    );
    expect(result).toHaveLength(2);
  });
});

describe("updateItemQty", () => {
  it("actualiza la cantidad de un item existente", () => {
    const result = updateItemQty([baseItem], "p1", null, 3);
    expect(result[0].qty).toBe(3);
  });

  it("capa al stock disponible", () => {
    const result = updateItemQty([baseItem], "p1", null, 99);
    expect(result[0].qty).toBe(5);
  });

  it("elimina el item si la cantidad es 0", () => {
    const result = updateItemQty([baseItem], "p1", null, 0);
    expect(result).toHaveLength(0);
  });
});

describe("removeItem", () => {
  it("quita el item indicado", () => {
    const result = removeItem([baseItem], "p1", null);
    expect(result).toHaveLength(0);
  });

  it("no afecta otros items", () => {
    const other: LocalCartItem = { ...baseItem, productId: "p2" };
    const result = removeItem([baseItem, other], "p1", null);
    expect(result).toEqual([other]);
  });
});

describe("computeSubtotal", () => {
  it("suma precio por cantidad de todos los items", () => {
    const items = [baseItem, { ...baseItem, productId: "p2", qty: 2, unitPrice: 5000 }];
    expect(computeSubtotal(items)).toBe(10000 + 2 * 5000);
  });

  it("devuelve 0 para un carrito vacio", () => {
    expect(computeSubtotal([])).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test src/lib/cart/__tests__/local-cart
```

Expected: FAIL — `local-cart` no existe todavía en `src/lib/cart`.

- [ ] **Step 3: Implementar**

```ts
export type LocalCartItem = {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  unitPrice: number;
  qty: number;
  imageUrl: string | null;
  stock: number;
};

const STORAGE_KEY = "merylay-cart";

function sameItem(a: LocalCartItem, b: { productId: string; variantId: string | null }): boolean {
  return a.productId === b.productId && a.variantId === b.variantId;
}

export function mergeCartItem(items: LocalCartItem[], newItem: LocalCartItem): LocalCartItem[] {
  const index = items.findIndex((i) => sameItem(i, newItem));
  if (index === -1) {
    return [...items, { ...newItem, qty: Math.min(newItem.qty, newItem.stock) }];
  }
  const updated = [...items];
  const combinedQty = Math.min(updated[index].qty + newItem.qty, newItem.stock);
  updated[index] = { ...updated[index], qty: combinedQty };
  return updated;
}

export function updateItemQty(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
  qty: number,
): LocalCartItem[] {
  return items
    .map((i) =>
      sameItem(i, { productId, variantId }) ? { ...i, qty: Math.min(Math.max(qty, 0), i.stock) } : i,
    )
    .filter((i) => i.qty > 0);
}

export function removeItem(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
): LocalCartItem[] {
  return items.filter((i) => !sameItem(i, { productId, variantId }));
}

export function computeSubtotal(items: LocalCartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
}

export function getLocalCart(): LocalCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalCartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalCart(items: LocalCartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function clearLocalCart(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test src/lib/cart/__tests__/local-cart
```

Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart/local-cart.ts src/lib/cart/__tests__/local-cart.test.ts
git commit -m "feat(carrito): agrega logica pura y persistencia local del carrito de invitado"
```

---

## Task 4: `getOrCreateCart()` — helper de servidor

**Files:**
- Create: `src/lib/cart/get-or-create-cart.ts`

**Interfaces:**
- Consumes: `createClient()` de `src/lib/supabase/server.ts`.
- Produces: `getOrCreateCart(userId: string): Promise<string>` — usado por
  Task 6 (Server Actions de carrito) y Task 7 (`mergeGuestCart`).

- [ ] **Step 1: Implementar**

```ts
import { createClient } from "@/lib/supabase/server";

export async function getOrCreateCart(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error("No se pudo crear el carrito.");
  }
  return created.id;
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cart/get-or-create-cart.ts
git commit -m "feat(carrito): agrega getOrCreateCart"
```

---

## Task 5: Server Actions de carrito autenticado

**Files:**
- Create: `src/app/(store)/carrito/actions.ts`

**Interfaces:**
- Consumes: `getOrCreateCart()` (Task 4), `createClient()` de
  `src/lib/supabase/server.ts`.
- Produces: `addToCart()`, `updateCartItemQty()`, `removeCartItem()` —
  usados por Task 11 (selector de variante) y Task 13
  (`CartItemControls`).

- [ ] **Step 1: Implementar**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCart } from "@/lib/cart/get-or-create-cart";

export async function addToCart(
  productId: string,
  variantId: string | null,
  qty: number,
  unitPrice: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const cartId = await getOrCreateCart(user.id);

  let existingQuery = supabase
    .from("cart_items")
    .select("id, qty")
    .eq("cart_id", cartId)
    .eq("product_id", productId);
  existingQuery = variantId
    ? existingQuery.eq("variant_id", variantId)
    : existingQuery.is("variant_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("cart_items")
      .update({ qty: existing.qty + qty })
      .eq("id", existing.id);
    if (error) return { error: "No se pudo actualizar el carrito." };
  } else {
    const { error } = await supabase.from("cart_items").insert({
      cart_id: cartId,
      product_id: productId,
      variant_id: variantId,
      qty,
      unit_price: unitPrice,
    });
    if (error) return { error: "No se pudo agregar al carrito." };
  }

  revalidatePath("/carrito");
  return {};
}

export async function updateCartItemQty(
  cartItemId: string,
  qty: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  if (qty <= 0) {
    const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);
    if (error) return { error: "No se pudo actualizar el carrito." };
  } else {
    const { error } = await supabase.from("cart_items").update({ qty }).eq("id", cartItemId);
    if (error) return { error: "No se pudo actualizar el carrito." };
  }

  revalidatePath("/carrito");
  return {};
}

export async function removeCartItem(cartItemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);
  if (error) return { error: "No se pudo eliminar el producto del carrito." };
  revalidatePath("/carrito");
  return {};
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/carrito/actions.ts"
git commit -m "feat(carrito): agrega Server Actions de carrito autenticado"
```

---

## Task 6: `mergeGuestCart()` — Server Action de fusión

**Files:**
- Create: `src/lib/cart/merge-guest-cart-action.ts`

**Interfaces:**
- Consumes: `getOrCreateCart()` (Task 4), `LocalCartItem` (Task 3),
  `createClient()` de `src/lib/supabase/server.ts`.
- Produces: `mergeGuestCart(items: LocalCartItem[])` — usado por Task 8
  (login) y Task 9 (registro).

- [ ] **Step 1: Implementar**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateCart } from "@/lib/cart/get-or-create-cart";
import type { LocalCartItem } from "@/lib/cart/local-cart";

export async function mergeGuestCart(items: LocalCartItem[]): Promise<{ error?: string }> {
  if (items.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const cartId = await getOrCreateCart(user.id);

  for (const item of items) {
    let existingQuery = supabase
      .from("cart_items")
      .select("id, qty")
      .eq("cart_id", cartId)
      .eq("product_id", item.productId);
    existingQuery = item.variantId
      ? existingQuery.eq("variant_id", item.variantId)
      : existingQuery.is("variant_id", null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      await supabase
        .from("cart_items")
        .update({ qty: existing.qty + item.qty })
        .eq("id", existing.id);
    } else {
      await supabase.from("cart_items").insert({
        cart_id: cartId,
        product_id: item.productId,
        variant_id: item.variantId,
        qty: item.qty,
        unit_price: item.unitPrice,
      });
    }
  }

  return {};
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cart/merge-guest-cart-action.ts
git commit -m "feat(carrito): agrega mergeGuestCart para fusionar el carrito al iniciar sesion"
```

---

## Task 7: Modificar login — fusión de carrito antes de navegar

**Files:**
- Modify: `src/app/(auth)/login/actions.ts`
- Modify: `src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `mergeGuestCart()` (Task 6), `getLocalCart()`/`clearLocalCart()`
  (Task 3).
- Produces: `login()` ya no redirige internamente — devuelve
  `{ error: string } | { success: true }`; el cliente fusiona el carrito y
  navega.

**Nota**: este es el único cambio a un Server Action ya construido en una
fase anterior (Fase 3), necesario porque solo el navegador puede leer
`localStorage` y el flujo de login lo necesita antes de navegar.

- [ ] **Step 1: Modificar la Server Action**

`src/app/(auth)/login/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveEmail } from "@/lib/auth/resolve-email";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export async function login(
  input: LoginInput,
): Promise<{ error: string } | { success: true }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const email = await resolveEmail(parsed.data.identifier);
  if (!email) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  return { success: true };
}
```

- [ ] **Step 2: Modificar el formulario**

`src/app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "./actions";
import { getLocalCart, clearLocalCart } from "@/lib/cart/local-cart";
import { mergeGuestCart } from "@/lib/cart/merge-guest-cart-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    const result = await login(data);
    if ("error" in result) {
      setServerError(result.error);
      return;
    }

    const guestCart = getLocalCart();
    if (guestCart.length > 0) {
      await mergeGuestCart(guestCart);
      clearLocalCart();
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="identifier" className="text-sm text-brand-ciruela">
          Usuario o correo electrónico
        </label>
        <Input id="identifier" {...register("identifier")} />
        {errors.identifier && (
          <p className="text-sm text-red-600">{errors.identifier.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="text-sm text-brand-ciruela">
          Contraseña
        </label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && (
          <p className="text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/login"
git commit -m "feat(carrito): login fusiona el carrito de invitado antes de navegar"
```

---

## Task 8: Modificar registro — mismo tratamiento

**Files:**
- Modify: `src/app/(auth)/registro/actions.ts`
- Modify: `src/app/(auth)/registro/registro-form.tsx`

**Interfaces:**
- Consumes: `mergeGuestCart()` (Task 6), `getLocalCart()`/`clearLocalCart()`
  (Task 3).
- Produces: `registro()` ya no redirige internamente en el caso de sesión
  automática — devuelve `{ error }`, `{ success: true }` o `{ message }`.

- [ ] **Step 1: Modificar la Server Action**

`src/app/(auth)/registro/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";

export async function registro(
  input: RegistroInput,
): Promise<{ error?: string; message?: string; success?: boolean }> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "Ya existe una cuenta con ese correo electrónico." };
    }
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  if (data.session) {
    return { success: true };
  }

  return {
    message:
      "Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.",
  };
}
```

- [ ] **Step 2: Modificar el formulario**

`src/app/(auth)/registro/registro-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";
import { registro } from "./actions";
import { getLocalCart, clearLocalCart } from "@/lib/cart/local-cart";
import { mergeGuestCart } from "@/lib/cart/merge-guest-cart-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegistroForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroInput>({ resolver: zodResolver(registroSchema) });

  const onSubmit = async (data: RegistroInput) => {
    setServerError(null);
    setSuccessMessage(null);
    const result = await registro(data);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    if (result?.success) {
      const guestCart = getLocalCart();
      if (guestCart.length > 0) {
        await mergeGuestCart(guestCart);
        clearLocalCart();
      }
      router.push("/");
      router.refresh();
      return;
    }
    if (result?.message) {
      setSuccessMessage(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="fullName" className="text-sm text-brand-ciruela">
          Nombre completo
        </label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && (
          <p className="text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="email" className="text-sm text-brand-ciruela">
          Correo electrónico
        </label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="text-sm text-brand-ciruela">
          Contraseña
        </label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && (
          <p className="text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="confirmPassword" className="text-sm text-brand-ciruela">
          Confirmar contraseña
        </label>
        <Input
          id="confirmPassword"
          type="password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {successMessage && (
        <p className="text-sm text-brand-oro">{successMessage}</p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/registro"
git commit -m "feat(carrito): registro fusiona el carrito de invitado antes de navegar"
```

---

## Task 9: `VariantOption` gana el campo `id`

**Files:**
- Modify: `src/lib/store/variants.ts`
- Modify: `src/lib/store/__tests__/variants.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `VariantOption` con `id: string` — usado por Task 10 (página de
  producto) y Task 11 (selector de variante, para `cart_items.variant_id`).

- [ ] **Step 1: Actualizar el tipo**

En `src/lib/store/variants.ts`, agregar `id: string;` a `VariantOption`:

```ts
export type VariantOption = {
  id: string;
  talla: string | null;
  color: string | null;
  sku: string;
  stock: number;
  priceOverride: number | null;
};
```

(`getVariantOptions()` y `findMatchingVariant()` no cambian de lógica — el
campo adicional simplemente viaja con cada objeto.)

- [ ] **Step 2: Actualizar los tests existentes con el campo `id`**

En `src/lib/store/__tests__/variants.test.ts`, agregar `id` a cada objeto de
variante de prueba (ej. `{ id: "1", talla: "L", color: "Rosa", sku: "1", stock: 1, priceOverride: null }`,
usando el mismo valor que `sku` para simplicidad en los fixtures existentes).

- [ ] **Step 3: Ejecutar y confirmar que sigue pasando**

```bash
pnpm test src/lib/store/__tests__/variants
```

Expected: PASS — 4 tests (sin cambios de cantidad, solo de forma).

- [ ] **Step 4: Commit**

```bash
git add src/lib/store/variants.ts src/lib/store/__tests__/variants.test.ts
git commit -m "feat(carrito): VariantOption incluye id para referenciar cart_items.variant_id"
```

---

## Task 10: Página de producto pasa `id` de variante y datos para el carrito

**Files:**
- Modify: `src/app/(store)/producto/[slug]/page.tsx`

**Interfaces:**
- Consumes: `VariantOption` con `id` (Task 9).
- Produces: props adicionales (`productId`, `productSlug`, `productName`,
  `imageUrl`, `basePrice`, `currentUserId`) para
  `<ProductVariantSelector />` — usados por Task 11.

- [ ] **Step 1: Actualizar la query de variantes y el render**

En `src/app/(store)/producto/[slug]/page.tsx`, cambiar el select de
variantes para incluir `id`, obtener el usuario actual, y pasar los props
nuevos al selector:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";

export default async function ProductoPage({
  params,
}: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!producto) {
    notFound();
  }

  const [{ data: imagenes }, { data: variantes }, { data: { user } }] = await Promise.all([
    supabase
      .from("product_images")
      .select("url, alt")
      .eq("product_id", producto.id)
      .order("sort_order"),
    supabase
      .from("product_variants")
      .select("id, talla, color, sku, stock, price_override")
      .eq("product_id", producto.id),
    supabase.auth.getUser(),
  ]);

  const variantesMapeadas = (variantes ?? []).map((v) => ({
    id: v.id,
    talla: v.talla,
    color: v.color,
    sku: v.sku,
    stock: v.stock,
    priceOverride: v.price_override,
  }));

  const imagenPrincipal = imagenes && imagenes.length > 0 ? imagenes[0].url : null;

  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2">
      <ProductGallery images={imagenes ?? []} productName={producto.name} />

      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl text-brand-ciruela">{producto.name}</h1>
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-2xl text-brand-rosa">
            {formatPrice(producto.price)}
          </span>
          {producto.compare_at_price && producto.compare_at_price > producto.price && (
            <span className="text-brand-ciruela/50 line-through">
              {formatPrice(producto.compare_at_price)}
            </span>
          )}
        </div>
        {producto.description && (
          <p className="text-brand-ciruela/80">{producto.description}</p>
        )}
        <ProductVariantSelector
          productId={producto.id}
          productSlug={producto.slug}
          productName={producto.name}
          imageUrl={imagenPrincipal}
          basePrice={producto.price}
          variants={variantesMapeadas}
          baseStock={producto.stock}
          currentUserId={user?.id ?? null}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: FAIL de tipos esperado — `ProductVariantSelector` todavía no
acepta estos props (se corrige en la Task 11). Continuar a la siguiente
tarea sin hacer commit todavía.

---

## Task 11: Conectar "Agregar al carrito" en el selector de variante

**Files:**
- Modify: `src/app/(store)/producto/[slug]/product-variant-selector.tsx`

**Interfaces:**
- Consumes: `mergeCartItem()`/`getLocalCart()`/`saveLocalCart()`
  (Task 3), `addToCart()` (Task 5), `VariantOption` con `id` (Task 9),
  props nuevos de Task 10.
- Produces: botón funcional — cierra el `pnpm build` fallido de la Task 10.

- [ ] **Step 1: Reescribir el componente**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getVariantOptions,
  findMatchingVariant,
  type VariantOption,
} from "@/lib/store/variants";
import { getLocalCart, saveLocalCart, mergeCartItem, type LocalCartItem } from "@/lib/cart/local-cart";
import { addToCart } from "@/app/(store)/carrito/actions";

export function ProductVariantSelector({
  productId,
  productSlug,
  productName,
  imageUrl,
  basePrice,
  variants,
  baseStock,
  currentUserId,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  basePrice: number;
  variants: VariantOption[];
  baseStock: number;
  currentUserId: string | null;
}) {
  const { tallas, colores } = useMemo(() => getVariantOptions(variants), [variants]);
  const [talla, setTalla] = useState<string | null>(variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(variants[0]?.color ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasVariants = variants.length > 0;
  const variantSeleccionada = hasVariants
    ? findMatchingVariant(variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : baseStock;
  const agotado = stockDisponible <= 0;
  const unitPrice = variantSeleccionada?.priceOverride ?? basePrice;
  const variantLabel = [talla, color].filter(Boolean).join(" / ");
  const displayName = hasVariants && variantLabel ? `${productName} (${variantLabel})` : productName;

  const handleAddToCart = () => {
    setMessage(null);
    const item: LocalCartItem = {
      productId,
      variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
      slug: productSlug,
      name: displayName,
      unitPrice,
      qty: 1,
      imageUrl,
      stock: stockDisponible,
    };

    if (currentUserId) {
      startTransition(async () => {
        const result = await addToCart(item.productId, item.variantId, 1, item.unitPrice);
        setMessage(result?.error ?? "Agregado al carrito.");
      });
    } else {
      const current = getLocalCart();
      saveLocalCart(mergeCartItem(current, item));
      setMessage("Agregado al carrito.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {tallas.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Talla</label>
          <select
            value={talla ?? ""}
            onChange={(e) => setTalla(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {tallas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      {colores.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Color</label>
          <select
            value={color ?? ""}
            onChange={(e) => setColor(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {colores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-sm text-brand-ciruela/70">
        {agotado ? "Agotado" : `Stock disponible: ${stockDisponible}`}
      </p>

      <Button
        type="button"
        disabled={agotado || isPending}
        onClick={handleAddToCart}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
      >
        {isPending ? "Agregando..." : "Agregar al carrito"}
      </Button>
      {message && <p className="text-sm text-brand-oro">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos (corrige el fallo esperado de la Task 10).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/producto/[slug]/page.tsx" "src/app/(store)/producto/[slug]/product-variant-selector.tsx" src/lib/store/variants.ts src/lib/store/__tests__/variants.test.ts
git commit -m "feat(carrito): conecta el boton Agregar al carrito (invitado y autenticado)"
```

---

## Task 12: Carrito de invitado (`localStorage`)

**Files:**
- Create: `src/app/(store)/carrito/guest-cart.tsx`

**Interfaces:**
- Consumes: `getLocalCart()`, `saveLocalCart()`, `updateItemQty()`,
  `removeItem()`, `computeSubtotal()` (Task 3), `formatPrice()` (Fase 6).
- Produces: `<GuestCart />` — usado por Task 14 (`/carrito`, rama sin
  sesión).

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  getLocalCart,
  saveLocalCart,
  updateItemQty,
  removeItem,
  computeSubtotal,
  type LocalCartItem,
} from "@/lib/cart/local-cart";

export function GuestCart() {
  const [items, setItems] = useState<LocalCartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setItems(getLocalCart());
    setLoaded(true);
  }, []);

  const handleUpdate = (productId: string, variantId: string | null, qty: number) => {
    const next = updateItemQty(items, productId, variantId, qty);
    setItems(next);
    saveLocalCart(next);
  };

  const handleRemove = (productId: string, variantId: string | null) => {
    const next = removeItem(items, productId, variantId);
    setItems(next);
    saveLocalCart(next);
  };

  if (!loaded) return null;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Tu carrito está vacío.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col divide-y divide-brand-rosa-claro">
        {items.map((item) => (
          <div
            key={`${item.productId}-${item.variantId ?? "base"}`}
            className="flex items-center gap-4 py-4"
          >
            <div className="flex-1">
              <Link
                href={`/producto/${item.slug}`}
                className="font-body text-brand-ciruela hover:text-brand-rosa"
              >
                {item.name}
              </Link>
              <p className="text-sm text-brand-rosa">{formatPrice(item.unitPrice)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUpdate(item.productId, item.variantId, item.qty - 1)}
                className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
              >
                -
              </button>
              <span className="w-6 text-center text-sm text-brand-ciruela">{item.qty}</span>
              <button
                type="button"
                onClick={() => handleUpdate(item.productId, item.variantId, item.qty + 1)}
                className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
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
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-brand-rosa-claro pt-4">
        <span className="font-heading text-lg text-brand-ciruela">Subtotal</span>
        <span className="font-heading text-xl text-brand-rosa">
          {formatPrice(computeSubtotal(items))}
        </span>
      </div>
      <Link href="/checkout">
        <Button className="w-full bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
          Proceder al pago
        </Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/carrito/guest-cart.tsx"
git commit -m "feat(carrito): agrega vista de carrito de invitado"
```

---

## Task 13: Carrito autenticado (listado + controles)

**Files:**
- Create: `src/app/(store)/carrito/cart-item-controls.tsx`
- Create: `src/app/(store)/carrito/authenticated-cart.tsx`

**Interfaces:**
- Consumes: `updateCartItemQty()`, `removeCartItem()` (Task 5),
  `formatPrice()` (Fase 6).
- Produces: `<AuthenticatedCart />` — usado por Task 14 (`/carrito`, rama
  con sesión).

- [ ] **Step 1: Controles de cantidad**

`src/app/(store)/carrito/cart-item-controls.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItemQty, removeCartItem } from "./actions";

export function CartItemControls({ cartItemId, qty }: { cartItemId: string; qty: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (nextQty: number) => {
    startTransition(async () => {
      await updateCartItemQty(cartItemId, nextQty);
      router.refresh();
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      await removeCartItem(cartItemId);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleUpdate(qty - 1)}
        className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
      >
        -
      </button>
      <span className="w-6 text-center text-sm text-brand-ciruela">{qty}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleUpdate(qty + 1)}
        className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
      >
        +
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleRemove}
        className="ml-2 text-sm text-red-600 hover:underline"
      >
        Quitar
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Vista del carrito autenticado**

`src/app/(store)/carrito/authenticated-cart.tsx`:

```tsx
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CartItemControls } from "./cart-item-controls";

export type CartItemView = {
  id: string;
  name: string;
  slug: string;
  variantLabel: string | null;
  qty: number;
  unitPrice: number;
};

export function AuthenticatedCart({ items }: { items: CartItemView[] }) {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Tu carrito está vacío.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col divide-y divide-brand-rosa-claro">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 py-4">
            <div className="flex-1">
              <Link
                href={`/producto/${item.slug}`}
                className="font-body text-brand-ciruela hover:text-brand-rosa"
              >
                {item.name}
              </Link>
              {item.variantLabel && (
                <p className="text-xs text-brand-ciruela/60">{item.variantLabel}</p>
              )}
              <p className="text-sm text-brand-rosa">{formatPrice(item.unitPrice)}</p>
            </div>
            <CartItemControls cartItemId={item.id} qty={item.qty} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-brand-rosa-claro pt-4">
        <span className="font-heading text-lg text-brand-ciruela">Subtotal</span>
        <span className="font-heading text-xl text-brand-rosa">{formatPrice(subtotal)}</span>
      </div>
      <Link href="/checkout">
        <Button className="w-full bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
          Proceder al pago
        </Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(store)/carrito/cart-item-controls.tsx" "src/app/(store)/carrito/authenticated-cart.tsx"
git commit -m "feat(carrito): agrega vista y controles de carrito autenticado"
```

---

## Task 14: Página `/carrito`

**Files:**
- Create: `src/app/(store)/carrito/page.tsx`

**Interfaces:**
- Consumes: `<GuestCart />` (Task 12), `<AuthenticatedCart />` (Task 13),
  `createClient()` de `src/lib/supabase/server.ts`.
- Produces: ruta `/carrito`.

- [ ] **Step 1: Implementar**

```tsx
import { createClient } from "@/lib/supabase/server";
import { GuestCart } from "./guest-cart";
import { AuthenticatedCart, type CartItemView } from "./authenticated-cart";

export default async function CarritoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tu carrito</h1>
        <GuestCart />
      </main>
    );
  }

  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: cartItems } = cart
    ? await supabase
        .from("cart_items")
        .select("id, product_id, variant_id, qty, unit_price")
        .eq("cart_id", cart.id)
    : { data: [] };

  const productIds = (cartItems ?? []).map((i) => i.product_id);
  const variantIds = (cartItems ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, slug").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    variantIds.length > 0
      ? supabase.from("product_variants").select("id, talla, color").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; talla: string | null; color: string | null }[] }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const items: CartItemView[] = (cartItems ?? []).map((item) => {
    const product = productById.get(item.product_id);
    const variant = item.variant_id ? variantById.get(item.variant_id) : null;
    return {
      id: item.id,
      name: product?.name ?? "Producto",
      slug: product?.slug ?? "",
      variantLabel: variant
        ? [variant.talla, variant.color].filter(Boolean).join(" / ")
        : null,
      qty: item.qty,
      unitPrice: item.unit_price,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tu carrito</h1>
      <AuthenticatedCart items={items} />
    </main>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/carrito/page.tsx"
git commit -m "feat: pagina de carrito (invitado y autenticado)"
```

---

## Task 15: Schema zod de checkout (TDD)

**Files:**
- Create: `src/lib/validation/__tests__/checkout.test.ts`
- Create: `src/lib/validation/checkout.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `checkoutSchema`, `CheckoutInput` — usados por Task 17
  (`CheckoutForm`) y Task 18 (`confirmarPedido`).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { checkoutSchema } from "../checkout";

describe("checkoutSchema", () => {
  const base = {
    fullName: "Maria Perez",
    phone: "3001234567",
    address: "Calle 10 # 20-30",
    city: "Bogota",
    notes: "",
    paymentMethod: "transferencia" as const,
  };

  it("acepta datos validos", () => {
    expect(checkoutSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza nombre muy corto", () => {
    expect(checkoutSchema.safeParse({ ...base, fullName: "A" }).success).toBe(false);
  });

  it("rechaza telefono muy corto", () => {
    expect(checkoutSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
  });

  it("rechaza direccion vacia", () => {
    expect(checkoutSchema.safeParse({ ...base, address: "" }).success).toBe(false);
  });

  it("rechaza un metodo de pago invalido", () => {
    expect(
      checkoutSchema.safeParse({ ...base, paymentMethod: "bitcoin" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test src/lib/validation/__tests__/checkout
```

Expected: FAIL — `checkout` no existe todavía en `src/lib/validation`.

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";

export const checkoutSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
  phone: z.string().trim().min(7, "Ingresa un teléfono válido"),
  address: z.string().trim().min(5, "Ingresa una dirección válida"),
  city: z.string().trim().min(2, "Ingresa tu ciudad"),
  notes: z.string().trim().optional(),
  paymentMethod: z.enum(["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test src/lib/validation/__tests__/checkout
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/checkout.ts src/lib/validation/__tests__/checkout.test.ts
git commit -m "feat(checkout): agrega schema zod de checkout"
```

---

## Task 16: Server Action `confirmarPedido`

**Files:**
- Create: `src/app/(store)/checkout/actions.ts`

**Interfaces:**
- Consumes: `checkoutSchema`/`CheckoutInput` (Task 15), función RPC
  `create_order` (Task 1/2).
- Produces: `confirmarPedido()` — usado por Task 17 (`CheckoutForm`).

- [ ] **Step 1: Implementar**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";

export async function confirmarPedido(input: CheckoutInput): Promise<{ error?: string }> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_shipping_address: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      city: parsed.data.city,
      notes: parsed.data.notes || null,
    },
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo completar el pedido." };
  }

  redirect(`/cuenta/pedidos/${data.id}?confirmado=1`);
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/checkout/actions.ts"
git commit -m "feat(checkout): agrega Server Action confirmarPedido (invoca create_order)"
```

---

## Task 17: Página `/checkout`

**Files:**
- Create: `src/app/(store)/checkout/checkout-form.tsx`
- Create: `src/app/(store)/checkout/page.tsx`

**Interfaces:**
- Consumes: `confirmarPedido()` (Task 16), `checkoutSchema`/`CheckoutInput`
  (Task 15), `formatPrice()` (Fase 6), `createClient()` de
  `src/lib/supabase/server.ts`.
- Produces: ruta `/checkout` (requiere sesión).

- [ ] **Step 1: Formulario**

`src/app/(store)/checkout/checkout-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { confirmarPedido } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CheckoutForm() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "transferencia" },
  });

  const onSubmit = async (data: CheckoutInput) => {
    setServerError(null);
    const result = await confirmarPedido(data);
    if (result?.error) {
      setServerError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="fullName" className="text-sm text-brand-ciruela">
          Nombre completo
        </label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && (
          <p className="text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="phone" className="text-sm text-brand-ciruela">
          Teléfono
        </label>
        <Input id="phone" {...register("phone")} />
        {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
      </div>
      <div>
        <label htmlFor="address" className="text-sm text-brand-ciruela">
          Dirección
        </label>
        <Input id="address" {...register("address")} />
        {errors.address && (
          <p className="text-sm text-red-600">{errors.address.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="city" className="text-sm text-brand-ciruela">
          Ciudad
        </label>
        <Input id="city" {...register("city")} />
        {errors.city && <p className="text-sm text-red-600">{errors.city.message}</p>}
      </div>
      <div>
        <label htmlFor="notes" className="text-sm text-brand-ciruela">
          Notas (opcional)
        </label>
        <Input id="notes" {...register("notes")} />
      </div>
      <div>
        <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
          Método de pago
        </label>
        <select
          id="paymentMethod"
          {...register("paymentMethod")}
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia bancaria</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
        </select>
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Procesando..." : "Confirmar pedido"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Página**

`src/app/(store)/checkout/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { CheckoutForm } from "./checkout-form";

export default async function CheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/checkout");
  }

  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: cartItems } = cart
    ? await supabase
        .from("cart_items")
        .select("id, product_id, qty, unit_price")
        .eq("cart_id", cart.id)
    : { data: [] };

  if (!cartItems || cartItems.length === 0) {
    redirect("/carrito");
  }

  const productIds = cartItems.map((i) => i.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .in("id", productIds);
  const productById = new Map((products ?? []).map((p) => [p.id, p.name]));

  const items = cartItems.map((item) => ({
    id: item.id,
    name: productById.get(item.product_id) ?? "Producto",
    qty: item.qty,
    unitPrice: item.unit_price,
  }));
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Finalizar compra</h1>
      <div className="mb-8 flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-brand-ciruela">
            <span>
              {item.name} × {item.qty}
            </span>
            <span>{formatPrice(item.unitPrice * item.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-brand-rosa-claro pt-2 font-heading text-brand-rosa">
          <span>Total</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
      </div>
      <CheckoutForm />
    </main>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(store)/checkout"
git commit -m "feat: pagina de checkout con resumen del pedido y formulario"
```

---

## Task 18: Página `/cuenta/pedidos` (listado)

**Files:**
- Create: `src/app/(store)/cuenta/pedidos/page.tsx`

**Interfaces:**
- Consumes: `createClient()` de `src/lib/supabase/server.ts`,
  `formatPrice()` (Fase 6).
- Produces: ruta `/cuenta/pedidos` (requiere sesión).

- [ ] **Step 1: Implementar**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export default async function PedidosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/cuenta/pedidos");
  }

  const { data: pedidos } = await supabase
    .from("orders")
    .select("id, order_number, status, total, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Mis pedidos</h1>
      {pedidos && pedidos.length > 0 ? (
        <div className="flex flex-col divide-y divide-brand-rosa-claro">
          {pedidos.map((pedido) => (
            <Link
              key={pedido.id}
              href={`/cuenta/pedidos/${pedido.id}`}
              className="flex items-center justify-between py-4 hover:text-brand-rosa"
            >
              <div>
                <p className="font-body text-brand-ciruela">{pedido.order_number}</p>
                <p className="text-xs text-brand-ciruela/60">
                  {new Date(pedido.created_at).toLocaleDateString("es-CO")} ·{" "}
                  {pedido.status}
                </p>
              </div>
              <span className="font-heading text-brand-rosa">
                {formatPrice(pedido.total)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-brand-ciruela/70">Todavía no tienes pedidos.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/cuenta/pedidos/page.tsx"
git commit -m "feat: pagina de listado de pedidos del cliente"
```

---

## Task 19: Página `/cuenta/pedidos/[id]` (detalle y confirmación)

**Files:**
- Create: `src/app/(store)/cuenta/pedidos/[id]/page.tsx`

**Interfaces:**
- Consumes: `createClient()` de `src/lib/supabase/server.ts`,
  `formatPrice()` (Fase 6).
- Produces: ruta `/cuenta/pedidos/[id]` (requiere sesión, y es el destino de
  `confirmarPedido()` de la Task 16).

- [ ] **Step 1: Implementar**

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string | null;
};

export default async function PedidoDetallePage({
  params,
  searchParams,
}: PageProps<"/cuenta/pedidos/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirectTo=/cuenta/pedidos/${id}`);
  }

  const { data: pedido } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!pedido) {
    notFound();
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, unit_price, line_total")
    .eq("order_id", pedido.id);

  const confirmado = search.confirmado === "1";
  const direccion = pedido.shipping_address as ShippingAddress | null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {confirmado && (
        <div className="mb-6 rounded-md border border-brand-oro bg-brand-rosa-claro/40 px-4 py-3 text-brand-ciruela">
          ¡Gracias por tu compra! Tu pedido fue confirmado.
        </div>
      )}
      <h1 className="mb-2 font-heading text-3xl text-brand-ciruela">
        Pedido {pedido.order_number}
      </h1>
      <p className="mb-8 text-sm text-brand-ciruela/60">
        Estado: {pedido.status} · Método de pago: {pedido.payment_method}
      </p>

      <div className="mb-8 flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4">
        {(items ?? []).map((item, index) => (
          <div key={index} className="flex justify-between py-2 text-sm text-brand-ciruela">
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
          {direccion.notes && <p className="text-brand-ciruela/60">{direccion.notes}</p>}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/cuenta/pedidos/[id]"
git commit -m "feat: pagina de detalle de pedido con banner de confirmacion"
```

---

## Task 20: Header — enlaces de carrito y pedidos

**Files:**
- Modify: `src/components/layout/site-header.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: header con enlaces "Carrito" (siempre) y "Mis pedidos" (con
  sesión).

- [ ] **Step 1: Agregar los enlaces**

En `src/components/layout/site-header.tsx`, dentro del bloque de la derecha
(junto a "Inspiración Femenina" y antes del login/logout), agregar:

```tsx
<Link href="/carrito" className="hover:text-brand-rosa">
  Carrito
</Link>
{currentUser && (
  <Link href="/cuenta/pedidos" className="hover:text-brand-rosa">
    Mis pedidos
  </Link>
)}
```

(Insertar estos dos elementos dentro del `<div className="flex items-center gap-4 ...">` existente, antes del bloque condicional `{currentUser ? ... : ...}`.)

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/site-header.tsx
git commit -m "feat: header agrega enlaces de carrito y mis pedidos"
```

---

## Task 21: Verificación manual end-to-end

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: Tasks 1–20.

- [ ] **Step 1: Levantar el servidor**

```bash
pnpm dev
```

- [ ] **Step 2: Preparar datos**

Como `adminsu`, confirmar (o crear) un producto activo con stock conocido
(ej. 5 unidades) y sin variantes, para simplificar la verificación de stock.

- [ ] **Step 3: Carrito de invitado**

Sin sesión, ir al producto y hacer click en "Agregar al carrito" dos veces.
Ir a `/carrito` y confirmar que aparece con cantidad 2 y el subtotal
correcto. Cambiar la cantidad y confirmar que persiste tras recargar la
página (sigue en `localStorage`).

- [ ] **Step 4: Fusión al iniciar sesión**

Click en "Proceder al pago" → redirige a `/login?redirectTo=/checkout`.
Iniciar sesión con un cliente existente. Confirmar que llega a `/checkout`
con el mismo ítem y cantidad que tenía como invitado (fusionado a Supabase).

- [ ] **Step 5: Completar el checkout**

Llenar el formulario de envío, elegir un método de pago, confirmar el
pedido. Confirmar la redirección a `/cuenta/pedidos/<id>?confirmado=1` con
el banner de éxito y los datos correctos.

- [ ] **Step 6: Confirmar el descuento de stock**

Vía `mcp__supabase__execute_sql`, confirmar que `products.stock` del
producto usado bajó exactamente en la cantidad comprada.

- [ ] **Step 7: Confirmar `/cuenta/pedidos`**

Ir a `/cuenta/pedidos` y confirmar que el pedido recién creado aparece en la
lista con el total correcto.

- [ ] **Step 8: Probar el guardado de sobreventa**

Intentar comprar más unidades que el stock restante (agregar al carrito una
cantidad mayor al stock actual y proceder al checkout). Confirmar que
`confirmarPedido` devuelve un error claro y que **no** se crea el pedido ni
se descuenta stock (verificar en la base de datos que no quedó un pedido a
medias).

- [ ] **Step 9: Detener el servidor**

```bash
# Ctrl+C o kill del proceso de pnpm dev
```

No requiere commit (verificación manual).

---

## Task 22: Verificación final y cierre de Fase 7

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: Tasks 1–21.

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Tests**

```bash
pnpm test
```

Expected: PASS (incluye los 16 tests nuevos de esta fase: 11 de
`local-cart`, 5 de `checkoutSchema`, más los 49 existentes de fases
anteriores → total esperado 65).

- [ ] **Step 4: Commit de cierre de fase**

```bash
git add -A
git commit -m "chore: cierra Fase 7 (carrito y checkout) - build, lint y tests en verde" --allow-empty
```
