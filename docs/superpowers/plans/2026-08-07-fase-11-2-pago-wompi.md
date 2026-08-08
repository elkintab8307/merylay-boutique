# Fase 11 (parte 2) — Integración de pago con Wompi: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un camino de pago real y verificado con Wompi al checkout
de la tienda (widget embebido + webhook de confirmación), con el stock
descontándose solo tras la aprobación del pago, preservando el checkout
manual existente (efectivo/transferencia) sin cambios de comportamiento.

**Architecture:** Un nuevo RPC (`create_order_wompi`) crea el pedido sin
tocar stock; una Server Action calcula la firma de integridad y devuelve
los parámetros para el widget de Wompi (client component); un Route
Handler (`/api/webhooks/wompi`) verifica la firma del evento y, si el pago
fue aprobado, invoca otro RPC (`confirm_order_payment_wompi`, solo
ejecutable por `service_role`) que descuenta stock atómicamente y marca el
pedido como pagado — mismo patrón de bloqueo por fila que
`create_order`/`create_pos_sale`.

**Tech Stack:** Next.js App Router (Server Components, Server Actions,
Route Handlers), Supabase (RPC + `service_role` client), Wompi Widget
Checkout + Eventos (webhooks), Node `crypto` (SHA-256), zod, Vitest.

## Global Constraints

- Toda la UI, textos y mensajes de error en español.
- TypeScript estricto; nada de `any` sin justificar.
- `RLS` siempre activo; el `service_role` (`createAdminClient`, ya
  existente) solo se usa en el Route Handler del webhook — nunca se expone
  al cliente.
- El checkout manual (`efectivo`/`transferencia`) no cambia de
  comportamiento: sigue usando `create_order` (RPC existente, sin tocar) y
  descontando stock de inmediato.
- El camino Wompi **nunca** descuenta stock al crear el pedido — solo al
  confirmar el pago vía webhook (`confirm_order_payment_wompi`).
- El POS (`pos_sales.payment_method`, enum `public.payment_method`) no se
  toca en ningún task de este plan — es una entidad de base de datos
  completamente separada de `orders.payment_method` (que es `text` libre).
- `WOMPI_PUBLIC_KEY` es la única credencial de Wompi que llega al
  navegador. `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET` son
  exclusivamente de servidor. `WOMPI_PRIVATE_KEY` **no se usa** en este
  plan (reservada para una futura consulta de transacciones o reembolsos,
  fuera de alcance) — esto es intencional, no un olvido.
- El webhook responde 401 solo si la firma del evento no es válida;
  cualquier otro fallo de negocio esperado (pedido no encontrado, estado
  inesperado) responde 200 para que Wompi no reintente indefinidamente un
  evento que nunca se va a resolver.
- Commits atómicos en español después de cada tarea funcional.
- Spec de referencia: `docs/superpowers/specs/2026-08-07-fase-11-2-pago-wompi-design.md`.

## Algoritmos de Wompi (verificados contra la documentación oficial)

**Firma de integridad** (widget): `SHA256(reference + amountInCents +
currency + integritySecret)`, en ese orden exacto, concatenación de texto
simple (sin separadores), resultado en hexadecimal minúsculas.

**Firma de eventos** (webhook): se listan las rutas en
`signature.properties` (p. ej. `["transaction.id", "transaction.status",
"transaction.amount_in_cents"]`), se extrae cada valor de `data` siguiendo
esa ruta, se concatenan en el mismo orden, se les agrega el `timestamp`
(numérico) y luego el `events_secret`, y se hashea con SHA-256. El
resultado se compara (insensible a mayúsculas) contra
`signature.checksum`.

---

## Mapa de archivos

```
src/lib/wompi/signature.ts                    # nuevo — calcularFirmaIntegridad, verificarFirmaEvento
src/lib/wompi/__tests__/signature.test.ts     # nuevo

supabase/migrations/013_wompi_pago.sql        # nuevo — via Supabase MCP
src/lib/supabase/database.types.ts            # regenerado via Supabase MCP

src/lib/validation/checkout.ts                # modificado — paymentMethod enum
src/lib/validation/__tests__/checkout.test.ts # modificado

src/app/(store)/checkout/wompi-actions.ts     # nuevo — iniciarPagoWompi
src/app/(store)/checkout/wompi-checkout-button.tsx # nuevo
src/app/(store)/checkout/checkout-form.tsx    # modificado
src/app/(store)/checkout/wompi/retorno/page.tsx    # nuevo

src/app/api/webhooks/wompi/route.ts           # nuevo
```

---

### Task 1: Firmas de Wompi (`signature.ts`)

**Files:**
- Create: `src/lib/wompi/signature.ts`
- Test: `src/lib/wompi/__tests__/signature.test.ts`

**Interfaces:**
- Produces: `calcularFirmaIntegridad(reference: string, amountInCents:
  number, currency: string, secret: string): string` — usado por Task 4
  (`wompi-actions.ts`).
- Produces: `verificarFirmaEvento(evento: { data: Record<string, unknown>;
  signature: { properties: string[]; checksum: string }; timestamp: number
  }, secret: string): boolean` — usado por Task 8 (`api/webhooks/wompi/route.ts`).

- [ ] **Step 1: Escribir el test que falla**

Los valores esperados de este test fueron calculados y verificados de
forma independiente con `node -e "require('crypto')..."` antes de escribir
este plan — son hashes SHA-256 reales, no inventados.

```ts
import { describe, expect, it } from "vitest";
import { calcularFirmaIntegridad, verificarFirmaEvento } from "../signature";

describe("calcularFirmaIntegridad", () => {
  it("calcula el hash SHA-256 de referencia + monto + moneda + secreto", () => {
    const resultado = calcularFirmaIntegridad(
      "ML-20260807-abc123",
      5000000,
      "COP",
      "test_integrity_secret",
    );
    expect(resultado).toBe(
      "a28e2bb2ceeceff0d2b04450543da24b2a6130537bd3dab405b254ddad74a039",
    );
  });

  it("produce un hash distinto si cambia el monto", () => {
    const a = calcularFirmaIntegridad("ref-1", 1000, "COP", "secreto");
    const b = calcularFirmaIntegridad("ref-1", 2000, "COP", "secreto");
    expect(a).not.toBe(b);
  });
});

describe("verificarFirmaEvento", () => {
  const eventoValido = {
    data: {
      transaction: {
        id: "1234-1610641025-49201",
        status: "APPROVED",
        amount_in_cents: 4490000,
      },
    },
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: "5a18ec5e8fdb7df463e9f94774cba8f583ba21bd04a09ceff2ea68a4bc0aefbe",
    },
    timestamp: 1530291411,
  };
  const secret = "prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";

  it("acepta un evento con firma valida", () => {
    expect(verificarFirmaEvento(eventoValido, secret)).toBe(true);
  });

  it("rechaza un evento con checksum alterado", () => {
    const eventoAlterado = {
      ...eventoValido,
      signature: { ...eventoValido.signature, checksum: "0".repeat(64) },
    };
    expect(verificarFirmaEvento(eventoAlterado, secret)).toBe(false);
  });

  it("rechaza un evento si el secreto no coincide", () => {
    expect(verificarFirmaEvento(eventoValido, "secreto-incorrecto")).toBe(false);
  });

  it("rechaza un evento si un valor de las propiedades fue alterado", () => {
    const eventoAlterado = {
      ...eventoValido,
      data: {
        transaction: { ...eventoValido.data.transaction, status: "DECLINED" },
      },
    };
    expect(verificarFirmaEvento(eventoAlterado, secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/wompi/__tests__/signature.test.ts`
Expected: FAIL (módulo `../signature` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
import { createHash } from "node:crypto";

export function calcularFirmaIntegridad(
  reference: string,
  amountInCents: number,
  currency: string,
  secret: string,
): string {
  const cadena = `${reference}${amountInCents}${currency}${secret}`;
  return createHash("sha256").update(cadena).digest("hex");
}

type EventoWompi = {
  data: Record<string, unknown>;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
};

function obtenerValorPorRuta(objeto: unknown, ruta: string): string {
  const partes = ruta.split(".");
  let valor: unknown = objeto;
  for (const parte of partes) {
    valor = (valor as Record<string, unknown> | undefined)?.[parte];
  }
  return String(valor);
}

export function verificarFirmaEvento(evento: EventoWompi, secret: string): boolean {
  const valores = evento.signature.properties.map((ruta) =>
    obtenerValorPorRuta(evento.data, ruta),
  );
  const cadena = `${valores.join("")}${evento.timestamp}${secret}`;
  const checksumCalculado = createHash("sha256").update(cadena).digest("hex");
  return checksumCalculado.toLowerCase() === evento.signature.checksum.toLowerCase();
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/wompi/__tests__/signature.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/wompi/signature.ts src/lib/wompi/__tests__/signature.test.ts
git commit -m "feat: firmas de integridad y de eventos de Wompi (Fase 11.2)"
```

---

### Task 2: Migración — esquema y RPCs de Wompi

**Files:**
- Create (vía Supabase MCP `apply_migration`, nombre `wompi_pago`, que
  Supabase numerará según la última migración aplicada —
  `list_migrations` primero para confirmar el número siguiente, se espera
  `013_wompi_pago`): columna nueva en `orders` + dos funciones RPC.
- Regenerar `src/lib/supabase/database.types.ts` (Supabase MCP
  `generate_typescript_types`).

**Interfaces:**
- Produces: RPC `create_order_wompi(p_shipping_address jsonb) returns
  public.orders` — usado por Task 4 (`wompi-actions.ts`).
- Produces: RPC `confirm_order_payment_wompi(p_order_id uuid,
  p_wompi_transaction_id text) returns public.orders` — usado por Task 8
  (webhook).
- Produces: columna `orders.wompi_transaction_id text` (nullable).

- [ ] **Step 1: Confirmar el número de migración**

Usar el Supabase MCP `list_migrations` para confirmar que la última
migración aplicada es `012_bloqueo_cambio_rol_profiles`, así que esta debe
ser `013`.

- [ ] **Step 2: Aplicar la migración**

Usar el Supabase MCP `apply_migration` con `name: "wompi_pago"` y este SQL
completo:

```sql
alter table public.orders add column wompi_transaction_id text;

-- Crea un pedido con metodo de pago Wompi sin descontar stock.
-- El stock se descuenta solo al confirmar el pago (confirm_order_payment_wompi),
-- ya que un pago con tarjeta/PSE puede abandonarse o rechazarse.
create or replace function public.create_order_wompi(
  p_shipping_address jsonb
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

  -- Verifica stock disponible (sin descontar) para no aceptar un pedido
  -- Wompi de algo que ya esta agotado.
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

  select coalesce(sum(qty * unit_price), 0) into v_subtotal
  from public.cart_items where cart_id = v_cart_id;

  v_order_number := 'ML-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  while exists (select 1 from public.orders where order_number = v_order_number) loop
    v_order_number := 'ML-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  end loop;

  insert into public.orders (order_number, user_id, status, subtotal, shipping, total, payment_method, shipping_address)
  values (v_order_number, v_user_id, 'pendiente', v_subtotal, 0, v_subtotal, 'wompi', p_shipping_address)
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

revoke execute on function public.create_order_wompi(jsonb) from public, anon;
grant execute on function public.create_order_wompi(jsonb) to authenticated;

-- Confirma el pago de un pedido Wompi ya aprobado: descuenta stock de
-- forma atomica y marca el pedido como pagado. Idempotente: si el pedido
-- ya esta pagado, no hace nada (Wompi puede reenviar el mismo evento).
-- Solo puede ejecutarla el service_role (llamada exclusivamente desde el
-- webhook, que ya valida la firma del evento como su propia autenticacion).
create or replace function public.confirm_order_payment_wompi(
  p_order_id uuid,
  p_wompi_transaction_id text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.status = 'pagado' then
    return v_order;
  end if;

  if v_order.status <> 'pendiente' then
    raise exception 'El pedido no esta en un estado valido para confirmar el pago.';
  end if;

  for v_item in
    select product_id, variant_id, qty from public.order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants set stock = greatest(stock - v_item.qty, 0) where id = v_item.variant_id;
    else
      update public.products set stock = greatest(stock - v_item.qty, 0) where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
  set status = 'pagado', wompi_transaction_id = p_wompi_transaction_id
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.confirm_order_payment_wompi(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment_wompi(uuid, text) to service_role;
```

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Usar el Supabase MCP `generate_typescript_types` y sobrescribir
`src/lib/supabase/database.types.ts` con el resultado.

- [ ] **Step 4: Verificación de humo (Supabase MCP `execute_sql`, solo lectura/estructura)**

Confirmar que la columna y ambas funciones existen:

```sql
select column_name from information_schema.columns
where table_name = 'orders' and column_name = 'wompi_transaction_id';

select routine_name from information_schema.routines
where routine_name in ('create_order_wompi', 'confirm_order_payment_wompi');
```

Expected: la columna aparece, ambas funciones aparecen.

- [ ] **Step 5: Verificar que el resto del proyecto sigue compilando**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos (los tipos regenerados no deben romper nada
existente — `create_order`/`create_pos_sale` no se tocaron).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/013_wompi_pago.sql src/lib/supabase/database.types.ts
git commit -m "feat: migracion de pago Wompi - columna y RPCs (Fase 11.2)"
```

---

### Task 3: Actualizar el schema de validación del checkout

**Files:**
- Modify: `src/lib/validation/checkout.ts`
- Modify: `src/lib/validation/__tests__/checkout.test.ts`

**Interfaces:**
- Produces: `checkoutSchema` con `paymentMethod: z.enum(["efectivo",
  "transferencia", "wompi"])` — usado por Task 4 y Task 6.

- [ ] **Step 1: Modificar `checkout.ts`**

Cambiar la línea:
```ts
paymentMethod: z.enum(["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"]),
```
por:
```ts
paymentMethod: z.enum(["efectivo", "transferencia", "wompi"]),
```
El resto del archivo no cambia.

- [ ] **Step 2: Actualizar los tests**

Agregar estos dos casos a `describe("checkoutSchema", ...)` en
`src/lib/validation/__tests__/checkout.test.ts` (el resto del archivo no
cambia):

```ts
  it("acepta wompi como metodo de pago", () => {
    expect(
      checkoutSchema.safeParse({ ...base, paymentMethod: "wompi" }).success,
    ).toBe(true);
  });

  it("rechaza los metodos de pago manuales removidos (tarjeta, nequi, daviplata)", () => {
    expect(checkoutSchema.safeParse({ ...base, paymentMethod: "tarjeta" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, paymentMethod: "nequi" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, paymentMethod: "daviplata" }).success).toBe(false);
  });
```

- [ ] **Step 3: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/validation/__tests__/checkout.test.ts`
Expected: PASS (7 tests: los 5 originales + los 2 nuevos)

- [ ] **Step 4: Commit**

```bash
git add src/lib/validation/checkout.ts src/lib/validation/__tests__/checkout.test.ts
git commit -m "feat: wompi reemplaza tarjeta/nequi/daviplata en el checkout (Fase 11.2)"
```

---

### Task 4: Server Action `iniciarPagoWompi`

**Files:**
- Create: `src/app/(store)/checkout/wompi-actions.ts`

**Interfaces:**
- Consumes: `calcularFirmaIntegridad` (Task 1), `checkoutSchema` /
  `CheckoutInput` (Task 3), `createClient()` de `@/lib/supabase/server`,
  RPC `create_order_wompi` (Task 2).
- Produces: `iniciarPagoWompi(input: CheckoutInput): Promise<{ error:
  string } | { orderId: string; reference: string; amountInCents: number;
  currency: string; publicKey: string; signature: string }>` — usado por
  Task 6 (`checkout-form.tsx`).

- [ ] **Step 1: Implementación**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { calcularFirmaIntegridad } from "@/lib/wompi/signature";

type PagoWompiIniciado = {
  orderId: string;
  reference: string;
  amountInCents: number;
  currency: string;
  publicKey: string;
  signature: string;
};

export async function iniciarPagoWompi(
  input: CheckoutInput,
): Promise<{ error: string } | PagoWompiIniciado> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success || parsed.data.paymentMethod !== "wompi") {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data: pedido, error } = await supabase.rpc("create_order_wompi", {
    p_shipping_address: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      city: parsed.data.city,
      notes: parsed.data.notes || null,
    },
  });

  if (error || !pedido) {
    return { error: error?.message ?? "No se pudo iniciar el pago." };
  }

  const amountInCents = Math.round(pedido.total * 100);
  const currency = "COP";
  const signature = calcularFirmaIntegridad(
    pedido.order_number,
    amountInCents,
    currency,
    process.env.WOMPI_INTEGRITY_SECRET!,
  );

  return {
    orderId: pedido.id,
    reference: pedido.order_number,
    amountInCents,
    currency,
    publicKey: process.env.WOMPI_PUBLIC_KEY!,
    signature,
  };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos (el RPC `create_order_wompi` debe estar
tipado tras la Task 2 — si `tsc` se queja de que no existe, confirma que
`database.types.ts` se regeneró correctamente en la Task 2 antes de
continuar).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/checkout/wompi-actions.ts"
git commit -m "feat: server action para iniciar el pago con Wompi (Fase 11.2)"
```

---

### Task 5: Botón/widget de Wompi (client component)

**Files:**
- Create: `src/app/(store)/checkout/wompi-checkout-button.tsx`

**Interfaces:**
- Consumes: la forma de datos que retorna `iniciarPagoWompi` (Task 4):
  `{ orderId, reference, amountInCents, currency, publicKey, signature }`.
- Produces: componente `WompiCheckoutButton`, usado por Task 6
  (`checkout-form.tsx`).

- [ ] **Step 1: Implementación**

```tsx
"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    WidgetCheckout: new (config: {
      currency: string;
      amountInCents: number;
      reference: string;
      publicKey: string;
      signature: { integrity: string };
      redirectUrl?: string;
    }) => {
      open: (
        callback: (result: { transaction?: { id: string; status: string } }) => void,
      ) => void;
    };
  }
}

export function WompiCheckoutButton({
  orderId,
  reference,
  amountInCents,
  currency,
  publicKey,
  signature,
}: {
  orderId: string;
  reference: string;
  amountInCents: number;
  currency: string;
  publicKey: string;
  signature: string;
}) {
  const router = useRouter();
  const [scriptListo, setScriptListo] = useState(false);

  const handlePagar = () => {
    if (!window.WidgetCheckout) return;

    const checkout = new window.WidgetCheckout({
      currency,
      amountInCents,
      reference,
      publicKey,
      signature: { integrity: signature },
      redirectUrl: `${window.location.origin}/checkout/wompi/retorno?orderId=${orderId}`,
    });

    checkout.open((result) => {
      const estado = result.transaction?.status ?? "PENDING";
      router.push(`/checkout/wompi/retorno?orderId=${orderId}&estado=${estado}`);
    });
  };

  return (
    <>
      <Script src="https://checkout.wompi.co/widget.js" onLoad={() => setScriptListo(true)} />
      <Button
        type="button"
        onClick={handlePagar}
        disabled={!scriptListo}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        Pagar con Wompi
      </Button>
    </>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos (este componente aún no está importado por
ninguna página, así que no genera una ruta nueva todavía — eso ocurre en
Task 6).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/checkout/wompi-checkout-button.tsx"
git commit -m "feat: boton y widget de pago de Wompi (Fase 11.2)"
```

---

### Task 6: Integrar Wompi en el formulario de checkout

**Files:**
- Modify: `src/app/(store)/checkout/checkout-form.tsx`

**Interfaces:**
- Consumes: `confirmarPedido` (existente, sin cambios), `iniciarPagoWompi`
  (Task 4), `WompiCheckoutButton` (Task 5), `checkoutSchema`/`CheckoutInput`
  (Task 3).

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { confirmarPedido } from "./actions";
import { iniciarPagoWompi } from "./wompi-actions";
import { WompiCheckoutButton } from "./wompi-checkout-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DatosWompi = {
  orderId: string;
  reference: string;
  amountInCents: number;
  currency: string;
  publicKey: string;
  signature: string;
};

export function CheckoutForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [datosWompi, setDatosWompi] = useState<DatosWompi | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "transferencia" },
  });

  const metodoSeleccionado = watch("paymentMethod");

  const onSubmit = async (data: CheckoutInput) => {
    setServerError(null);
    setDatosWompi(null);

    if (data.paymentMethod === "wompi") {
      const result = await iniciarPagoWompi(data);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      setDatosWompi(result);
      return;
    }

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
          <option value="efectivo">Efectivo contra entrega</option>
          <option value="transferencia">Transferencia bancaria</option>
          <option value="wompi">Pagar en línea con Wompi (tarjeta, PSE, Nequi)</option>
        </select>
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {datosWompi ? (
        <WompiCheckoutButton {...datosWompi} />
      ) : (
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {isSubmitting
            ? "Procesando..."
            : metodoSeleccionado === "wompi"
              ? "Continuar a pago con Wompi"
              : "Confirmar pedido"}
        </Button>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/checkout/checkout-form.tsx"
git commit -m "feat: integra el flujo de pago Wompi en el formulario de checkout (Fase 11.2)"
```

---

### Task 7: Página de retorno de Wompi

**Files:**
- Create: `src/app/(store)/checkout/wompi/retorno/page.tsx`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server`.
- Produces: página completa, sin otros consumidores en este plan (la
  navega el navegador tras cerrar el widget, vía `WompiCheckoutButton` de
  la Task 5, o el `redirectUrl` del propio widget de Wompi).

- [ ] **Step 1: Implementación**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const MENSAJES_ESTADO: Record<string, string> = {
  APPROVED: "¡Tu pago fue aprobado! Estamos confirmando tu pedido.",
  DECLINED: "Tu pago fue rechazado. Puedes intentar de nuevo o elegir otro método.",
  VOIDED: "Tu pago fue anulado.",
  ERROR: "Ocurrió un error al procesar tu pago.",
  PENDING: "Tu pago está siendo procesado. Te avisaremos cuando se confirme.",
};

export default async function WompiRetornoPage({
  searchParams,
}: PageProps<"/checkout/wompi/retorno">) {
  const { orderId, estado } = await searchParams;
  const supabase = await createClient();

  const { data: pedido } =
    typeof orderId === "string"
      ? await supabase
          .from("orders")
          .select("id, order_number, status, total")
          .eq("id", orderId)
          .single()
      : { data: null };

  const mensaje = typeof estado === "string" ? MENSAJES_ESTADO[estado] : undefined;

  return (
    <main className="mx-auto max-w-xl px-6 py-12 text-center">
      <h1 className="mb-4 font-heading text-3xl text-brand-ciruela">
        {pedido ? `Pedido ${pedido.order_number}` : "Pago con Wompi"}
      </h1>
      <p className="mb-6 text-brand-ciruela/80">
        {mensaje ?? "Estamos confirmando el estado de tu pago."}
      </p>
      {pedido && (
        <p className="mb-6 text-sm text-brand-ciruela/60">
          Estado actual del pedido: <strong>{pedido.status}</strong>
        </p>
      )}
      <Link href="/cuenta/pedidos" className="text-brand-rosa hover:underline">
        Ver mis pedidos
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/checkout/wompi/retorno/page.tsx"
git commit -m "feat: pagina de retorno tras pagar con Wompi (Fase 11.2)"
```

---

### Task 8: Webhook de confirmación de pago

**Files:**
- Create: `src/app/api/webhooks/wompi/route.ts`

**Interfaces:**
- Consumes: `verificarFirmaEvento` (Task 1), `createAdminClient()` de
  `@/lib/supabase/admin` (existente), RPC `confirm_order_payment_wompi`
  (Task 2).
- Produces: endpoint `POST /api/webhooks/wompi`, sin otros consumidores en
  este plan (lo llama Wompi directamente).

- [ ] **Step 1: Implementación**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarFirmaEvento } from "@/lib/wompi/signature";

const ESTADOS_CANCELADOS = new Set(["DECLINED", "VOIDED", "ERROR"]);

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const evento = payload as {
    data?: { transaction?: { id?: string; reference?: string; status?: string } };
    signature?: { properties?: string[]; checksum?: string };
    timestamp?: number;
  };

  if (!evento.data || !evento.signature?.properties || !evento.signature.checksum || !evento.timestamp) {
    return NextResponse.json({ error: "Evento con formato invalido." }, { status: 400 });
  }

  const firmaValida = verificarFirmaEvento(
    {
      data: evento.data,
      signature: {
        properties: evento.signature.properties,
        checksum: evento.signature.checksum,
      },
      timestamp: evento.timestamp,
    },
    process.env.WOMPI_EVENTS_SECRET!,
  );

  if (!firmaValida) {
    return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
  }

  const transaccion = evento.data.transaction;
  if (!transaccion?.reference || !transaccion.status) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  if (transaccion.status === "APPROVED") {
    const { data: pedido } = await admin
      .from("orders")
      .select("id")
      .eq("order_number", transaccion.reference)
      .maybeSingle();

    if (pedido) {
      await admin.rpc("confirm_order_payment_wompi", {
        p_order_id: pedido.id,
        p_wompi_transaction_id: transaccion.id ?? "",
      });
    }
  } else if (ESTADOS_CANCELADOS.has(transaccion.status)) {
    await admin
      .from("orders")
      .update({ status: "cancelado" })
      .eq("order_number", transaccion.reference)
      .eq("status", "pendiente");
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos; suite completa en verde (incluye los 6 tests
nuevos de Task 1 y los 2 de Task 3, más los ya existentes).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/wompi/route.ts
git commit -m "feat: webhook de confirmacion de pago de Wompi (Fase 11.2)"
```

---

### Task 9: Verificación de integración end-to-end contra el sandbox de Wompi

**Files:** ninguno nuevo (script desechable, no se commitea).

**Interfaces:**
- Consumes: todo lo construido en Tasks 1–8.

- [ ] **Step 1: Confirmar que el servidor de desarrollo está limpio**

Verificar que no hay un proceso `next dev` obsoleto de una sesión anterior.
Si existe, terminarlo y arrancar uno limpio con `pnpm dev` en segundo
plano.

- [ ] **Step 2: Verificar la ruta del webhook responde**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/webhooks/wompi -H "Content-Type: application/json" -d "{}"
```

Expected: `400` (evento con formato inválido — falta `signature`,
`timestamp`, etc.), confirmando que la ruta existe y responde sin caerse.

- [ ] **Step 3: Flujo completo con el widget de Wompi (sandbox)**

Iniciar sesión como un cliente de prueba en `http://localhost:3000`,
agregar un producto al carrito, ir a `/checkout`, elegir "Pagar en línea
con Wompi", completar el formulario de envío, y en el widget usar una
**tarjeta de prueba de Wompi** (las tarjetas de prueba están documentadas
en la sección de Wompi Sandbox — usar una que resulte en `APPROVED`).

Antes de pagar, anotar el stock actual del producto usado (vía Supabase
MCP `execute_sql`: `select stock from products where id = '...'`).

- [ ] **Step 4: Verificar el efecto del pago aprobado**

Tras completar el pago y ser redirigido a `/checkout/wompi/retorno`:
1. Confirmar que el pedido tiene `status = 'pagado'` y
   `wompi_transaction_id` no nulo (Supabase MCP `execute_sql`).
2. Confirmar que el stock del producto se descontó exactamente en la
   cantidad comprada, comparando contra el valor anotado en el Step 3.
3. Confirmar en el dashboard de Wompi sandbox (o vía logs si el
   desarrollador local expone el webhook — ver nota abajo) que el evento
   `transaction.updated` llegó y fue respondido con `200`.

**Nota sobre exponer el webhook local a Wompi**: Wompi necesita una URL
pública para enviar el webhook; `localhost:3000` no es alcanzable desde
internet. Si no hay un túnel disponible (ngrok o similar) en este
entorno, usar en su lugar un script `.mjs` desechable
(`scripts/tmp-verify-fase11-2.mjs`) que simula el webhook directamente,
sin depender de que Wompi lo entregue:

1. Cree un pedido de prueba llamando al RPC `create_order_wompi` (con un
   usuario de prueba autenticado, o directamente insertando la fila con el
   cliente de service role si es más simple) para obtener un
   `order_number` real que sirva de `reference`.
2. Construya un payload de evento con la forma exacta de Wompi:
   ```js
   const timestamp = Math.floor(Date.now() / 1000);
   const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
   const valores = ["test-txn-id", "APPROVED", String(amountInCents)];
   const cadena = valores.join("") + timestamp + process.env.WOMPI_EVENTS_SECRET;
   const checksum = createHash("sha256").update(cadena).digest("hex");
   const payload = {
     event: "transaction.updated",
     data: { transaction: { id: "test-txn-id", reference: orderNumber, status: "APPROVED", amount_in_cents: amountInCents } },
     signature: { properties, checksum },
     timestamp,
   };
   ```
   (Este es el mismo algoritmo que `verificarFirmaEvento` implementa del
   lado receptor — el script solo lo aplica del lado emisor para construir
   un evento válido.)
3. Haga `POST` a `http://localhost:3000/api/webhooks/wompi` con ese
   payload y confirme respuesta `200`.
4. Verifique (Supabase MCP `execute_sql`) que el pedido pasó a `pagado`,
   `wompi_transaction_id = "test-txn-id"`, y que el stock del producto de
   prueba se descontó exactamente en la cantidad comprada.
5. Reenvíe el mismo payload una segunda vez y confirme que el stock **no**
   se descuenta de nuevo (idempotencia — el pedido ya estaba `pagado`).
6. Limpie los datos de prueba (pedido, order_items, restaurar stock del
   producto de prueba a su valor original) y borre el script.

- [ ] **Step 5: Verificar el caso de pago rechazado**

Repetir un pedido de prueba con una tarjeta de prueba que resulte en
`DECLINED` (o simular el evento como en el Step 4 con
`status: "DECLINED"`), y confirmar que el pedido queda `cancelado` y el
stock **no** se tocó (nunca se había descontado).

- [ ] **Step 6: Limpieza**

Borrar cualquier script temporal, restaurar el stock de productos de
prueba si quedó alterado por una prueba real contra el sandbox, detener el
servidor de desarrollo. No hay commit en esta tarea — es puramente de
verificación.

---

## Cierre de fase

Al completar la Task 9, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
