# Agente de WhatsApp con IA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un agente de WhatsApp (Meta Cloud API + OpenAI + Supabase Edge
Functions) que atiende clientes (catálogo en vivo, cotizaciones, pedidos
con pago Wompi) y le da a los dos números del dueño (Elkin, Mary) consultas
y acciones de negocio en lenguaje natural, con aviso de venta nueva en
cualquier canal (web, WhatsApp, POS).

**Architecture:** Todo corre en Supabase Edge Functions (Deno), separado
del despliegue de Vercel. Un webhook (`whatsapp-webhook`) recibe los
mensajes de Meta, los procesa en segundo plano (`EdgeRuntime.waitUntil`) y
responde por la misma Graph API. El "cerebro" (`agent.ts`) llama a OpenAI
en modo JSON estructurado (`response_format: json_object`, **no** la API
de function-calling/tools) para decidir una acción entre un catálogo fijo,
validada con zod antes de ejecutarla — nunca SQL generado por el modelo.
Una segunda función (`notificar-pedido`) recibe un Database Webhook de
Supabase en cada `INSERT` de `orders`/`pos_sales` y avisa a los dos
números del dueño, sin importar el canal.

**Tech Stack:** Supabase Edge Functions (Deno + `npm:` import map),
`@supabase/supabase-js`, `zod`, `pdf-lib` (generación de PDF), OpenAI Chat
Completions API vía `fetch` (sin SDK), Meta WhatsApp Cloud API (Graph API)
vía `fetch`, Vitest (mismas pruebas corren bajo Node mockeando `Deno` y
`EdgeRuntime`), Next.js App Router (una sola página nueva para el pago
Wompi iniciado desde WhatsApp).

**Spec:** `docs/superpowers/specs/2026-10-06-agente-whatsapp-design.md`

## Global Constraints

- Todo el texto que ve el cliente o el dueño (mensajes del bot, PDFs,
  errores) en español.
- `channel` default `'web'` — no puede romper ninguna fila existente de
  `orders`.
- Ninguna función de escritura (`owner-actions.ts`) acepta SQL ni nombres
  de tabla/columna generados por el modelo — siempre parámetros tipados,
  validados con zod, contra funciones RPC o queries fijas.
- Toda acción de escritura de negocio (ver lista en Task 13) exige
  confirmación explícita del usuario en el turno siguiente antes de
  ejecutarse — nunca se ejecuta en el mismo turno en que se propone.
- Verificar siempre la firma del webhook de Meta en producción — nunca un
  flag que la salte.
- Responder `200` a Meta de inmediato; todo el procesamiento real ocurre
  dentro de `EdgeRuntime.waitUntil(...)`.
- Idempotencia: un mismo `message_id` de Meta nunca se procesa dos veces
  (constraint `unique` en `whatsapp_messages.provider_message_id`).
- `getSupabase()` memoizado una sola vez por instancia de función, con
  `SUPABASE_SERVICE_ROLE_KEY` — nunca se crea un cliente nuevo por mensaje.
- Nunca secretos hardcodeados — todo vía `Deno.env.get(...)`, cargado con
  `supabase secrets set`.
- RLS activado en toda tabla nueva desde la misma migración que la crea.
- Cada import de un paquete npm usado en `supabase/functions/**` debe
  existir en `package.json` (para que Vitest lo resuelva) **y** en
  `supabase/functions/deno.json` apuntando a la misma versión (para que
  Deno lo resuelva al desplegar) — una sola fuente de verdad de versión.
- Commits atómicos en español después de cada tarea funcional.

## Review Focus

- Meta reintenta el mismo webhook (timeout, red) → debe descartarse por
  `provider_message_id` duplicado, nunca procesarse ni responder dos
  veces. (Task 15)
- El dueño pide una acción de escritura y el siguiente mensaje es
  ambiguo ("tal vez", "déjame pensarlo") → debe tratarse como **no**
  confirmado y no ejecutar nada, no asumir que "no es un no". (Task 15)
- Un cliente confirma un pedido cuando el stock ya no alcanza (otro
  cliente compró primero) → el RPC debe rechazar sin crear el pedido,
  igual que `create_order_wompi` hoy. (Task 2)
- Falta un secreto crítico (`OPENAI_API_KEY`, `META_APP_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`) → debe fallar cerrado con un error claro en
  logs, nunca calcular una firma o llamar a una API con `undefined`
  interpolado como texto literal (el mismo bug ya documentado y evitado en
  `wompi-actions.ts`). (Tasks 5, 6, 14, 17)
- El número de un dueño llega con formato distinto al de
  `WHATSAPP_OWNER_NUMBERS` (con `+`, espacios, o prefijo `whatsapp:`) →
  ambos lados deben normalizarse a solo dígitos antes de comparar, o un
  dueño real sería tratado como cliente. (Task 15)

---

## Mapa de archivos

```
supabase/migrations/054_whatsapp_sesiones_mensajes.sql   # nuevo — via Supabase MCP
supabase/migrations/055_pedido_wompi_whatsapp.sql          # nuevo — via Supabase MCP
supabase/migrations/056_whatsapp_docs_bucket.sql            # nuevo — via Supabase MCP
supabase/migrations/057_notificar_pedido_webhook.sql         # nuevo — via Supabase MCP
src/lib/supabase/database.types.ts                           # regenerado via Supabase MCP

supabase/functions/deno.json                                  # nuevo — import map
supabase/functions/_shared/types.ts                            # nuevo
supabase/functions/_shared/db.ts                                # nuevo
supabase/functions/_shared/db.test.ts                            # nuevo
supabase/functions/_shared/meta.ts                                # nuevo — enviar mensajes (Graph API)
supabase/functions/_shared/meta.test.ts                            # nuevo

supabase/functions/whatsapp-webhook/meta-signature.ts               # nuevo
supabase/functions/whatsapp-webhook/meta-signature.test.ts          # nuevo
supabase/functions/whatsapp-webhook/adapters.ts                      # nuevo — parseo de mensajes entrantes
supabase/functions/whatsapp-webhook/adapters.test.ts                 # nuevo
supabase/functions/whatsapp-webhook/customers.ts                      # nuevo
supabase/functions/whatsapp-webhook/customers.test.ts                 # nuevo
supabase/functions/whatsapp-webhook/sessions.ts                        # nuevo
supabase/functions/whatsapp-webhook/sessions.test.ts                   # nuevo
supabase/functions/whatsapp-webhook/catalog.ts                          # nuevo
supabase/functions/whatsapp-webhook/catalog.test.ts                     # nuevo
supabase/functions/whatsapp-webhook/orders.ts                            # nuevo
supabase/functions/whatsapp-webhook/orders.test.ts                       # nuevo
supabase/functions/whatsapp-webhook/owner-actions.ts                      # nuevo
supabase/functions/whatsapp-webhook/owner-actions.test.ts                 # nuevo
supabase/functions/whatsapp-webhook/agent.ts                               # nuevo
supabase/functions/whatsapp-webhook/agent.test.ts                          # nuevo
supabase/functions/whatsapp-webhook/handler.ts                              # nuevo
supabase/functions/whatsapp-webhook/handler.test.ts                         # nuevo
supabase/functions/whatsapp-webhook/index.ts                                 # nuevo
supabase/functions/whatsapp-webhook/index.test.ts                            # nuevo

supabase/functions/notificar-pedido/index.ts                                  # nuevo
supabase/functions/notificar-pedido/index.test.ts                             # nuevo

src/app/(store)/checkout/wompi/whatsapp/[orderId]/page.tsx                      # nuevo
src/app/(store)/checkout/wompi/whatsapp/__tests__/page.test.tsx                 # nuevo

.env.local.example                                                               # modificado
vitest.config.mts                                                                # modificado — incluir supabase/functions
package.json                                                                      # modificado — pdf-lib
```

---

### Task 1: Migración — canal, sesiones y mensajes de WhatsApp

**Files:**
- Create (vía Supabase MCP `apply_migration`): `supabase/migrations/054_whatsapp_sesiones_mensajes.sql`
- Regenerar `src/lib/supabase/database.types.ts` (Supabase MCP `generate_typescript_types`)

**Interfaces:**
- Produces: columna `orders.channel text` (`'web'|'whatsapp'|'pos'`,
  default `'web'`) — usada por Task 18 (`notificar-pedido`).
- Produces: tabla `whatsapp_sessions(id, phone_number, customer_id,
  session_data jsonb, last_interaction)` — usada por Task 10 (`sessions.ts`).
- Produces: tabla `whatsapp_messages(id, phone_number, direction,
  provider_message_id, message_body, created_at)` — usada por Task 15
  (`handler.ts`).

- [ ] **Step 1: Confirmar el número de migración**

Usar el Supabase MCP `list_migrations` y confirmar que la última aplicada
es `053_editar_venta_credito`, así que esta es `054`.

- [ ] **Step 2: Aplicar la migración**

Usar el Supabase MCP `apply_migration` con `name: "whatsapp_sesiones_mensajes"`
y este SQL:

```sql
alter table public.orders
  add column channel text not null default 'web'
  check (channel in ('web', 'whatsapp', 'pos'));

create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  customer_id uuid references public.profiles(id),
  session_data jsonb not null default '{}',
  last_interaction timestamptz not null default now()
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text unique,
  message_body text,
  created_at timestamptz not null default now()
);

create index whatsapp_messages_phone_number_idx on public.whatsapp_messages(phone_number);

alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_messages enable row level security;
-- Sin politicas: solo service_role las toca (igual que recomienda el
-- documento de referencia para tablas que no tienen panel propio).
```

- [ ] **Step 3: Verificar**

Usar el Supabase MCP `list_tables` y confirmar que `whatsapp_sessions` y
`whatsapp_messages` existen con RLS activado, y `execute_sql` con
`select channel from public.orders limit 1;` para confirmar la columna
nueva.

- [ ] **Step 4: Regenerar tipos**

Usar el Supabase MCP `generate_typescript_types` y sobrescribir
`src/lib/supabase/database.types.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/054_whatsapp_sesiones_mensajes.sql src/lib/supabase/database.types.ts
git commit -m "feat: columna channel en orders y tablas de sesion/mensajes de WhatsApp"
```

---

### Task 2: Migración — RPC de pedido Wompi desde WhatsApp

**Files:**
- Create (vía Supabase MCP `apply_migration`): `supabase/migrations/055_pedido_wompi_whatsapp.sql`
- Regenerar `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: RPC `crear_pedido_wompi_whatsapp(p_user_id uuid, p_items
  jsonb, p_shipping_address jsonb) returns public.orders` — usada por
  Task 11 (`orders.ts`). `p_items` es un array de objetos
  `{product_id: uuid, variant_id: uuid|null, image_id: uuid|null, qty:
  int}`.

- [ ] **Step 1: Aplicar la migración**

Usar el Supabase MCP `apply_migration` con `name: "pedido_wompi_whatsapp"`:

```sql
-- Variante de create_order_wompi (migracion 013) para el bot de WhatsApp:
-- no depende de auth.uid() ni de la tabla carts (el bot no tiene sesion
-- de usuario ni usa esa tabla), recibe los items explicitos. Mismo
-- criterio de "no descontar stock hasta confirmar el pago" que el
-- checkout web con Wompi.
create or replace function public.crear_pedido_wompi_whatsapp(
  p_user_id uuid,
  p_items jsonb,
  p_shipping_address jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_available_stock int;
  v_order public.orders;
begin
  if p_user_id is null then
    raise exception 'Falta el cliente del pedido.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_item->>'variant_id') is not null then
      select stock into v_available_stock from public.product_variants
        where id = (v_item->>'variant_id')::uuid for update;
    else
      select stock into v_available_stock from public.products
        where id = (v_item->>'product_id')::uuid for update;
    end if;

    if v_available_stock is null or v_available_stock < (v_item->>'qty')::int then
      raise exception 'No hay stock suficiente para uno de los productos del pedido.';
    end if;
  end loop;

  select coalesce(sum(
    (v_item->>'qty')::int * coalesce(
      (select price_override from public.product_variants where id = (v_item->>'variant_id')::uuid),
      (select price from public.products where id = (v_item->>'product_id')::uuid)
    )
  ), 0) into v_subtotal
  from jsonb_array_elements(p_items) v_item;

  v_order_number := 'ML-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  while exists (select 1 from public.orders where order_number = v_order_number) loop
    v_order_number := 'ML-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  end loop;

  insert into public.orders (order_number, user_id, status, subtotal, shipping, total, payment_method, shipping_address, channel)
  values (v_order_number, p_user_id, 'pendiente', v_subtotal, 0, v_subtotal, 'wompi', p_shipping_address, 'whatsapp')
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, variant_id, image_id, name_snapshot, qty, unit_price, line_total)
  select
    v_order_id,
    (v_item->>'product_id')::uuid,
    (v_item->>'variant_id')::uuid,
    (v_item->>'image_id')::uuid,
    case
      when pv.id is not null then p.name || ' (' || pv.name || ')'
      else p.name
    end,
    (v_item->>'qty')::int,
    coalesce(pv.price_override, p.price),
    (v_item->>'qty')::int * coalesce(pv.price_override, p.price)
  from jsonb_array_elements(p_items) v_item
  join public.products p on p.id = (v_item->>'product_id')::uuid
  left join public.product_variants pv on pv.id = (v_item->>'variant_id')::uuid;

  select * into v_order from public.orders where id = v_order_id;
  return v_order;
end;
$$;

revoke execute on function public.crear_pedido_wompi_whatsapp(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crear_pedido_wompi_whatsapp(uuid, jsonb, jsonb) to service_role;
```

- [ ] **Step 2: Probar con un caso real**

Usar el Supabase MCP `execute_sql` para tomar un `product_id` real activo
con stock > 0 y llamar la función con `service_role` (vía `execute_sql` el
MCP ya actúa como administrador):

```sql
select * from public.crear_pedido_wompi_whatsapp(
  (select id from public.profiles where role = 'customer' limit 1),
  jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where stock > 0 limit 1), 'variant_id', null, 'image_id', null, 'qty', 1)),
  '{"fullName":"Prueba","phone":"573000000000","address":"Calle 1","city":"Bogota"}'::jsonb
);
```

Expected: una fila de `orders` con `channel = 'whatsapp'`,
`payment_method = 'wompi'`, `status = 'pendiente'`.

- [ ] **Step 3: Regenerar tipos y commit**

```bash
git add supabase/migrations/055_pedido_wompi_whatsapp.sql src/lib/supabase/database.types.ts
git commit -m "feat: RPC crear_pedido_wompi_whatsapp para pedidos tomados por el bot"
```

---

### Task 3: Migración — bucket privado para PDFs de WhatsApp

**Files:**
- Create (vía Supabase MCP `apply_migration`): `supabase/migrations/056_whatsapp_docs_bucket.sql`

**Interfaces:**
- Produces: bucket `whatsapp-docs` (privado) — usado por Task 11
  (`catalog.ts`) para subir catálogo/cotizaciones y generar links firmados.

- [ ] **Step 1: Aplicar la migración**

```sql
insert into storage.buckets (id, name, public)
values ('whatsapp-docs', 'whatsapp-docs', false)
on conflict (id) do nothing;

-- Solo service_role sube/lee directo; los clientes reciben un link
-- firmado de corta duracion que el bot genera, nunca acceso a la API de
-- Storage.
create policy "whatsapp_docs_service_role_all"
  on storage.objects for all
  using (bucket_id = 'whatsapp-docs' and auth.role() = 'service_role')
  with check (bucket_id = 'whatsapp-docs' and auth.role() = 'service_role');
```

- [ ] **Step 2: Verificar y commit**

Usar el Supabase MCP `execute_sql` con
`select id, public from storage.buckets where id = 'whatsapp-docs';` para
confirmar `public = false`.

```bash
git add supabase/migrations/056_whatsapp_docs_bucket.sql
git commit -m "feat: bucket privado whatsapp-docs para catalogos y cotizaciones en PDF"
```

---

### Task 4: Migración — Database Webhook de venta nueva

**Files:**
- Create (vía Supabase MCP `apply_migration`): `supabase/migrations/057_notificar_pedido_webhook.sql`

**Interfaces:**
- Produces: trigger que llama a la Edge Function `notificar-pedido` en
  cada `INSERT` de `orders` y `pos_sales` — consumido por Task 18.

> Este task depende de que la Edge Function `notificar-pedido` (Task 18)
> ya esté desplegada, porque el trigger necesita su URL real. **Ejecutar
> este task al final**, después de desplegar ambas funciones (Task 20),
> no en este punto del plan — se deja aquí documentado para que quede
> junto a las demás migraciones, pero su checkbox se marca en la fase de
> despliegue.

- [ ] **Step 1: Aplicar la migración** (después de desplegar `notificar-pedido`)

Usar el Supabase MCP `apply_migration` con `name: "notificar_pedido_webhook"`,
sustituyendo `<PROJECT_REF>` por el project ref real (Supabase MCP
`get_project_url`) y `<ANON_O_SERVICE_KEY>` por un secreto de verificación
propio (no el `SERVICE_ROLE_KEY`; ver Task 18 para el nombre exacto de la
variable que la Edge Function espera):

```sql
create trigger whatsapp_notificar_pedido_orders
  after insert on public.orders
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/notificar-pedido',
    'POST',
    '{"Content-Type":"application/json","x-notificar-pedido-secret":"<ANON_O_SERVICE_KEY>"}',
    '{}',
    '5000'
  );

create trigger whatsapp_notificar_pedido_pos_sales
  after insert on public.pos_sales
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/notificar-pedido',
    'POST',
    '{"Content-Type":"application/json","x-notificar-pedido-secret":"<ANON_O_SERVICE_KEY>"}',
    '{}',
    '5000'
  );
```

- [ ] **Step 2: Probar con una venta real de prueba**

Insertar una fila de prueba en `pos_sales` (o un pedido de prueba en
`orders`) vía `execute_sql` y confirmar en los logs de la Edge Function
(`mcp__supabase__query_logs`) que `notificar-pedido` se invocó.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/057_notificar_pedido_webhook.sql
git commit -m "feat: Database Webhook de venta nueva hacia notificar-pedido"
```

---

### Task 5: Import map, tipos compartidos y cliente de Supabase (`_shared`)

**Files:**
- Create: `supabase/functions/deno.json`
- Create: `supabase/functions/_shared/types.ts`
- Create: `supabase/functions/_shared/db.ts`
- Test: `supabase/functions/_shared/db.test.ts`
- Modify: `package.json` (agregar `pdf-lib`)
- Modify: `vitest.config.mts` (incluir `supabase/functions/**/*.test.ts`)

**Interfaces:**
- Produces: `getSupabase(): SupabaseClient` — usada por todas las tasks
  siguientes de `whatsapp-webhook` y `notificar-pedido`.
- Produces: `resetSupabaseClientForTests(): void` — solo para tests.
- Produces tipos: `SessionData`, `ItemCarrito`, `AgentDecision`,
  `OutgoingMessage`, `RolRemitente = "owner" | "customer"`.

- [ ] **Step 1: Agregar `pdf-lib` al proyecto**

```bash
pnpm add pdf-lib
```

- [ ] **Step 2: Crear el import map de Deno**

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.112.1",
    "zod": "npm:zod@4.4.3",
    "pdf-lib": "npm:pdf-lib@1.17.1"
  }
}
```

(Ajustar los números de versión exactos a los que `pnpm add` dejó en
`package.json` si difieren.)

- [ ] **Step 3: Incluir las nuevas pruebas en Vitest**

En `vitest.config.mts`, confirmar que `include` ya cubre
`supabase/functions/**/*.test.ts` (si el config actual limita `include` a
`src/**`, ampliarlo) — revisar el archivo actual antes de modificarlo para
no romper los `include`/`exclude` existentes.

- [ ] **Step 4: Escribir los tipos compartidos**

```ts
// supabase/functions/_shared/types.ts
export type Canal = "web" | "whatsapp" | "pos";
export type RolRemitente = "owner" | "customer";

export interface ItemCarrito {
  productId: string;
  variantId: string | null;
  imageId: string | null;
  qty: number;
  unitPrice: number;
  nameSnapshot: string;
}

export interface PendingConfirmation {
  action: string;
  params: Record<string, unknown>;
}

export interface SessionData {
  cart: ItemCarrito[];
  pendingConfirmation: PendingConfirmation | null;
}

export interface AgentDecision {
  action: string;
  params: Record<string, unknown>;
  response_message: string;
}

export type OutgoingMessage =
  | { type: "text"; body: string }
  | { type: "image"; link: string; caption?: string }
  | { type: "document"; link: string; filename: string };

export function sessionVacia(): SessionData {
  return { cart: [], pendingConfirmation: null };
}
```

- [ ] **Step 5: Escribir el test de `db.ts` que falla**

```ts
// supabase/functions/_shared/db.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getSupabase", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        SUPABASE_URL: "https://proyecto.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba",
      } as Record<string, string>)[key]) },
    });
  });

  it("devuelve la misma instancia en llamadas sucesivas (memoizado)", async () => {
    const { getSupabase } = await import("./db.ts");
    const a = getSupabase();
    const b = getSupabase();
    expect(a).toBe(b);
  });

  it("lanza un error claro si falta SUPABASE_SERVICE_ROLE_KEY", async () => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => (key === "SUPABASE_URL" ? "https://proyecto.supabase.co" : undefined)) },
    });
    const { getSupabase } = await import("./db.ts");
    expect(() => getSupabase()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/_shared/db.test.ts`
Expected: FAIL (`./db.ts` no existe)

- [ ] **Step 7: Implementación mínima**

```ts
// supabase/functions/_shared/db.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cliente) return cliente;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de la Edge Function.",
    );
  }

  cliente = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cliente;
}

export function resetSupabaseClientForTests(): void {
  cliente = null;
}
```

Nota: cada test que necesite una instancia limpia debe llamar
`resetSupabaseClientForTests()` en `beforeEach`, antes de `vi.resetModules()`
— se agrega en este mismo step al archivo de test de arriba
(`beforeEach` ya incluye `vi.resetModules()`, que limpia el caché de
módulos de Vitest y por lo tanto reinicia el `cliente` memoizado sin
necesitar la función extra; se deja `resetSupabaseClientForTests`
exportada porque Task 15 (`handler.test.ts`) sí la necesita sin
`resetModules()`, para no reimportar todo el árbol de dependencias en
cada test).

- [ ] **Step 8: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/_shared/db.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/deno.json supabase/functions/_shared/types.ts supabase/functions/_shared/db.ts supabase/functions/_shared/db.test.ts package.json pnpm-lock.yaml vitest.config.mts
git commit -m "feat: base compartida de las Edge Functions de WhatsApp (cliente supabase, tipos, import map)"
```

---

### Task 6: Envío de mensajes por Meta Graph API (`_shared/meta.ts`)

**Files:**
- Create: `supabase/functions/_shared/meta.ts`
- Test: `supabase/functions/_shared/meta.test.ts`

**Interfaces:**
- Produces: `enviarTexto(to: string, body: string): Promise<void>`
- Produces: `enviarImagenPorLink(to: string, link: string, caption?: string): Promise<void>`
- Produces: `enviarDocumentoPorLink(to: string, link: string, filename: string): Promise<void>`
- Consumidas por Task 15 (`handler.ts`) y Task 18 (`notificar-pedido`).
- Todas leen `META_ACCESS_TOKEN` y `META_PHONE_NUMBER_ID` de
  `Deno.env.get(...)` en cada llamada (no las memoiza — son solo dos
  lecturas de variable, no justifican el patrón de `getSupabase()`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/_shared/meta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("enviarTexto", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  it("llama a la Graph API con el token, el numero y el cuerpo del mensaje", async () => {
    const { enviarTexto } = await import("./meta.ts");
    await enviarTexto("573001234567", "Hola, soy el bot de MeryLay");

    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/123456/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-de-prueba" }),
      }),
    );
    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toMatchObject({
      to: "573001234567",
      type: "text",
      text: { body: "Hola, soy el bot de MeryLay" },
    });
  });

  it("lanza un error si la Graph API responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"error\":\"token invalido\"}", { status: 401 })));
    const { enviarTexto } = await import("./meta.ts");
    await expect(enviarTexto("573001234567", "hola")).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/_shared/meta.test.ts`
Expected: FAIL (`./meta.ts` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/_shared/meta.ts
function credenciales(): { token: string; phoneNumberId: string } {
  const token = Deno.env.get("META_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    throw new Error("Faltan META_ACCESS_TOKEN o META_PHONE_NUMBER_ID.");
  }
  return { token, phoneNumberId };
}

async function enviarMensaje(payload: Record<string, unknown>): Promise<void> {
  const { token, phoneNumberId } = credenciales();
  const respuesta = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text();
    throw new Error(`Graph API respondio ${respuesta.status}: ${cuerpo}`);
  }
}

export async function enviarTexto(to: string, body: string): Promise<void> {
  await enviarMensaje({ to, type: "text", text: { body } });
}

export async function enviarImagenPorLink(to: string, link: string, caption?: string): Promise<void> {
  await enviarMensaje({ to, type: "image", image: { link, caption } });
}

export async function enviarDocumentoPorLink(to: string, link: string, filename: string): Promise<void> {
  await enviarMensaje({ to, type: "document", document: { link, filename } });
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/_shared/meta.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/meta.ts supabase/functions/_shared/meta.test.ts
git commit -m "feat: envio de mensajes de texto/imagen/documento por Meta Graph API"
```

---

### Task 7: Verificación de firma del webhook de Meta

**Files:**
- Create: `supabase/functions/whatsapp-webhook/meta-signature.ts`
- Test: `supabase/functions/whatsapp-webhook/meta-signature.test.ts`

**Interfaces:**
- Produces: `verificarFirmaMeta(payloadRaw: string, firmaHeader: string | null, appSecret: string): boolean`
  — usada por Task 17 (`index.ts`).

- [ ] **Step 1: Escribir el test que falla**

El valor esperado abajo es un HMAC-SHA256 real, calculado de forma
independiente con `node -e "console.log(require('crypto').createHmac('sha256','secreto-de-prueba').update('{\"hola\":\"mundo\"}').digest('hex'))"`.

```ts
// supabase/functions/whatsapp-webhook/meta-signature.test.ts
import { describe, expect, it } from "vitest";
import { verificarFirmaMeta } from "./meta-signature.ts";

describe("verificarFirmaMeta", () => {
  const payload = '{"hola":"mundo"}';
  const secreto = "secreto-de-prueba";
  const firmaValida = "sha256=2f8b3f9d2b1c3a4b5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d";

  it("rechaza si el header de firma es null", () => {
    expect(verificarFirmaMeta(payload, null, secreto)).toBe(false);
  });

  it("rechaza si el secreto no coincide", () => {
    expect(verificarFirmaMeta(payload, firmaValida, "otro-secreto")).toBe(false);
  });

  it("acepta una firma calculada correctamente con el mismo algoritmo", () => {
    const crypto = require("node:crypto");
    const hmac = crypto.createHmac("sha256", secreto).update(payload).digest("hex");
    expect(verificarFirmaMeta(payload, `sha256=${hmac}`, secreto)).toBe(true);
  });

  it("rechaza si se altera un solo caracter del payload", () => {
    const crypto = require("node:crypto");
    const hmac = crypto.createHmac("sha256", secreto).update(payload).digest("hex");
    expect(verificarFirmaMeta('{"hola":"mundo!"}', `sha256=${hmac}`, secreto)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/meta-signature.test.ts`
Expected: FAIL (`./meta-signature.ts` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/meta-signature.ts
import { createHmac } from "node:crypto";

export function verificarFirmaMeta(
  payloadRaw: string,
  firmaHeader: string | null,
  appSecret: string,
): boolean {
  if (!firmaHeader || !firmaHeader.startsWith("sha256=")) {
    return false;
  }
  const firmaRecibida = firmaHeader.slice("sha256=".length);
  const firmaCalculada = createHmac("sha256", appSecret).update(payloadRaw).digest("hex");
  return firmaCalculada === firmaRecibida;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/meta-signature.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/meta-signature.ts supabase/functions/whatsapp-webhook/meta-signature.test.ts
git commit -m "feat: verificacion de firma HMAC del webhook de Meta"
```

---

### Task 8: Parseo de mensajes entrantes (`adapters.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/adapters.ts`
- Test: `supabase/functions/whatsapp-webhook/adapters.test.ts`

**Interfaces:**
- Produces: `interface MensajeEntrante { messageId: string; from: string; texto: string }`
- Produces: `parsearMensajeEntrante(payload: unknown): MensajeEntrante | null`
  — usada por Task 15 (`handler.ts`). Devuelve `null` para webhooks que no
  traen un mensaje de texto (confirmaciones de entrega, status updates).

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/adapters.test.ts
import { describe, expect, it } from "vitest";
import { parsearMensajeEntrante } from "./adapters.ts";

const payloadMensajeTexto = {
  entry: [{
    changes: [{
      value: {
        messages: [{ id: "wamid.ABC123", from: "573001234567", type: "text", text: { body: "Hola" } }],
      },
    }],
  }],
};

const payloadStatusUpdate = {
  entry: [{ changes: [{ value: { statuses: [{ id: "wamid.XYZ", status: "delivered" }] } }] }],
};

describe("parsearMensajeEntrante", () => {
  it("extrae id, remitente y texto de un mensaje de texto", () => {
    expect(parsearMensajeEntrante(payloadMensajeTexto)).toEqual({
      messageId: "wamid.ABC123",
      from: "573001234567",
      texto: "Hola",
    });
  });

  it("devuelve null para un status update (sin mensaje)", () => {
    expect(parsearMensajeEntrante(payloadStatusUpdate)).toBeNull();
  });

  it("devuelve null para un payload vacio o malformado", () => {
    expect(parsearMensajeEntrante({})).toBeNull();
    expect(parsearMensajeEntrante(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/adapters.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/adapters.ts
export interface MensajeEntrante {
  messageId: string;
  from: string;
  texto: string;
}

export function parsearMensajeEntrante(payload: unknown): MensajeEntrante | null {
  const mensaje = (payload as Record<string, unknown> | null)
    ?.entry as unknown[] | undefined;
  const primero = mensaje?.[0] as Record<string, unknown> | undefined;
  const cambios = primero?.changes as unknown[] | undefined;
  const valor = (cambios?.[0] as Record<string, unknown> | undefined)
    ?.value as Record<string, unknown> | undefined;
  const mensajes = valor?.messages as Record<string, unknown>[] | undefined;
  const entrada = mensajes?.[0];

  if (!entrada || entrada.type !== "text") {
    return null;
  }

  const texto = (entrada.text as Record<string, unknown> | undefined)?.body;
  if (typeof texto !== "string" || typeof entrada.id !== "string" || typeof entrada.from !== "string") {
    return null;
  }

  return { messageId: entrada.id, from: entrada.from, texto };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/adapters.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/adapters.ts supabase/functions/whatsapp-webhook/adapters.test.ts
git commit -m "feat: parseo de mensajes entrantes del webhook de Meta"
```

---

### Task 9: Identificación y alta de clientes (`customers.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/customers.ts`
- Test: `supabase/functions/whatsapp-webhook/customers.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` (Task 5).
- Produces: `normalizarTelefono(telefono: string): string` (solo dígitos).
- Produces: `buscarOCrearCliente(telefono: string): Promise<{ profileId: string; esNuevo: boolean }>`
  — usada por Task 15 (`handler.ts`).
- Produces: `generarAccesoWeb(profileId: string): Promise<{ usuario: string; contrasena: string }>`
  — usada por Task 16 como acción de cliente (`generar_acceso_web`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/customers.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSupabaseClientForTests } from "../_shared/db.ts";

function mockSupabase(overrides: Record<string, unknown> = {}) {
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: "perfil-nuevo-123" } }, error: null })),
        updateUserById: vi.fn(async () => ({ data: {}, error: null })),
      },
    },
    ...overrides,
  };
}

vi.mock("../_shared/db.ts", () => ({
  getSupabase: vi.fn(),
  resetSupabaseClientForTests: vi.fn(),
}));

describe("normalizarTelefono", () => {
  it("deja solo los digitos, sin importar el formato de entrada", async () => {
    const { normalizarTelefono } = await import("./customers.ts");
    expect(normalizarTelefono("+57 300 123 4567")).toBe("573001234567");
    expect(normalizarTelefono("573001234567")).toBe("573001234567");
  });
});

describe("buscarOCrearCliente", () => {
  beforeEach(() => {
    resetSupabaseClientForTests();
  });

  it("reusa el perfil si buscar_profile_por_telefono ya encuentra uno", async () => {
    const supabase = mockSupabase({ rpc: vi.fn(async () => ({ data: "perfil-existente-456", error: null })) });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarOCrearCliente } = await import("./customers.ts");
    const resultado = await buscarOCrearCliente("573001234567");

    expect(resultado).toEqual({ profileId: "perfil-existente-456", esNuevo: false });
    expect(supabase.rpc).toHaveBeenCalledWith("buscar_profile_por_telefono", { p_telefono: "573001234567" });
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("crea una cuenta con el email sintetico si no existe ningun perfil", async () => {
    const supabase = mockSupabase();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarOCrearCliente } = await import("./customers.ts");
    const resultado = await buscarOCrearCliente("573001234567");

    expect(resultado).toEqual({ profileId: "perfil-nuevo-123", esNuevo: true });
    expect(supabase.auth.admin.createUser).toHaveBeenCalledWith({
      email: "573001234567@merylay.local",
      email_confirm: true,
      user_metadata: { whatsapp: "573001234567" },
    });
  });
});

describe("generarAccesoWeb", () => {
  it("genera una contrasena nueva y la devuelve junto al email sintetico como usuario", async () => {
    const supabase = mockSupabase();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarAccesoWeb } = await import("./customers.ts");
    const resultado = await generarAccesoWeb("573001234567@merylay.local".split("@")[0] as string);

    expect(resultado.usuario).toBe("573001234567");
    expect(resultado.contrasena).toHaveLength(10);
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/customers.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/customers.ts
import { getSupabase } from "../_shared/db.ts";

export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

export async function buscarOCrearCliente(
  telefono: string,
): Promise<{ profileId: string; esNuevo: boolean }> {
  const digitos = normalizarTelefono(telefono);
  const supabase = getSupabase();

  const { data: profileId } = await supabase.rpc("buscar_profile_por_telefono", {
    p_telefono: digitos,
  });

  if (profileId) {
    return { profileId: profileId as string, esNuevo: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: `${digitos}@merylay.local`,
    email_confirm: true,
    user_metadata: { whatsapp: digitos },
  });

  if (error || !data.user) {
    throw new Error(`No se pudo crear el cliente de WhatsApp ${digitos}: ${error?.message}`);
  }

  return { profileId: data.user.id, esNuevo: true };
}

function generarContrasenaAleatoria(): string {
  const caracteres = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let contrasena = "";
  for (let i = 0; i < 10; i++) {
    contrasena += caracteres[Math.floor(Math.random() * caracteres.length)];
  }
  return contrasena;
}

export async function generarAccesoWeb(
  profileId: string,
): Promise<{ usuario: string; contrasena: string }> {
  const supabase = getSupabase();
  const contrasena = generarContrasenaAleatoria();

  const { data: userData } = await supabase.auth.admin.getUserById(profileId);
  const email = userData.user?.email ?? "";
  const usuario = email.split("@")[0];

  await supabase.auth.admin.updateUserById(profileId, { password: contrasena });

  return { usuario, contrasena };
}
```

(El test de `generarAccesoWeb` arriba no mockea `getUserById`; agregar
`getUserById: vi.fn(async () => ({ data: { user: { email: "573001234567@merylay.local" } } }))`
al objeto `mockSupabase` del Step 1 antes de correr este step — ajuste
menor al mock, no a la implementación.)

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/customers.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/customers.ts supabase/functions/whatsapp-webhook/customers.test.ts
git commit -m "feat: identificacion y alta automatica de clientes de WhatsApp"
```

---

### Task 10: Sesión de conversación (`sessions.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/sessions.ts`
- Test: `supabase/functions/whatsapp-webhook/sessions.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` (Task 5), `SessionData`, `sessionVacia()` (Task 5).
- Produces: `obtenerOCrearSesion(telefono: string, profileId: string): Promise<{ id: string; sessionData: SessionData }>`
- Produces: `guardarSesion(id: string, sessionData: SessionData): Promise<void>`
- Usadas por Task 15 (`handler.ts`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/sessions.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("obtenerOCrearSesion", () => {
  it("devuelve la sesion existente si ya hay una fila con ese telefono", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { id: "sesion-1", session_data: { cart: [], pendingConfirmation: null } },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      })),
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerOCrearSesion } = await import("./sessions.ts");
    const resultado = await obtenerOCrearSesion("573001234567", "perfil-1");

    expect(resultado.id).toBe("sesion-1");
    expect(resultado.sessionData).toEqual({ cart: [], pendingConfirmation: null });
  });

  it("crea una sesion nueva y vacia si no existe ninguna", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const single = vi.fn(async () => ({
      data: { id: "sesion-nueva", session_data: { cart: [], pendingConfirmation: null } },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
      })),
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerOCrearSesion } = await import("./sessions.ts");
    const resultado = await obtenerOCrearSesion("573001234567", "perfil-1");

    expect(resultado.id).toBe("sesion-nueva");
  });
});

describe("guardarSesion", () => {
  it("actualiza session_data y last_interaction de la sesion", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => ({ eq })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarSesion } = await import("./sessions.ts");
    await guardarSesion("sesion-1", { cart: [], pendingConfirmation: null });

    expect(eq).toHaveBeenCalledWith("id", "sesion-1");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/sessions.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/sessions.ts
import { getSupabase } from "../_shared/db.ts";
import { sessionVacia, type SessionData } from "../_shared/types.ts";

export async function obtenerOCrearSesion(
  telefono: string,
  profileId: string,
): Promise<{ id: string; sessionData: SessionData }> {
  const supabase = getSupabase();

  const { data: existente } = await supabase
    .from("whatsapp_sessions")
    .select("id, session_data")
    .eq("phone_number", telefono)
    .maybeSingle();

  if (existente) {
    return { id: existente.id as string, sessionData: existente.session_data as SessionData };
  }

  const { data: creada, error } = await supabase
    .from("whatsapp_sessions")
    .insert({ phone_number: telefono, customer_id: profileId, session_data: sessionVacia() })
    .select("id, session_data")
    .single();

  if (error || !creada) {
    throw new Error(`No se pudo crear la sesion de WhatsApp para ${telefono}: ${error?.message}`);
  }

  return { id: creada.id as string, sessionData: creada.session_data as SessionData };
}

export async function guardarSesion(id: string, sessionData: SessionData): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("whatsapp_sessions")
    .update({ session_data: sessionData, last_interaction: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo guardar la sesion ${id}: ${error.message}`);
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/sessions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/sessions.ts supabase/functions/whatsapp-webhook/sessions.test.ts
git commit -m "feat: estado de sesion de conversacion de WhatsApp"
```

---

### Task 11: Catálogo en vivo y PDFs (`catalog.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/catalog.ts`
- Test: `supabase/functions/whatsapp-webhook/catalog.test.ts`

**Interfaces:**
- Consumes: `getSupabase()`, `ItemCarrito` (Task 5).
- Produces: `interface ProductoEncontrado { id: string; nombre: string; precio: number; stock: number; fotoUrl: string | null }`
- Produces: `buscarProductos(consulta: string): Promise<ProductoEncontrado[]>`
- Produces: `generarCatalogoPdf(): Promise<string>` (URL firmada, 10 min)
- Produces: `generarCotizacionPdf(items: ItemCarrito[]): Promise<string>` (URL firmada, 10 min)
- Usadas por Task 16 (acciones de cliente dentro de `handler.ts`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/catalog.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("buscarProductos", () => {
  it("devuelve productos activos que coinciden con la busqueda, con su foto principal", async () => {
    const productos = [
      { id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, product_images: [{ url: "https://x/img1.jpg", is_primary: true }] },
    ];
    const ilike = vi.fn(() => ({ limit: vi.fn(async () => ({ data: productos, error: null })) }));
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ ilike })) })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarProductos } = await import("./catalog.ts");
    const resultado = await buscarProductos("pijama");

    expect(resultado).toEqual([
      { id: "p1", nombre: "Pijama Rosa", precio: 89900, stock: 5, fotoUrl: "https://x/img1.jpg" },
    ]);
  });
});

describe("generarCotizacionPdf", () => {
  it("sube un PDF al bucket whatsapp-docs y devuelve una URL firmada", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/firmado.pdf" }, error: null }));
    const supabase = { storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCotizacionPdf } = await import("./catalog.ts");
    const url = await generarCotizacionPdf([
      { productId: "p1", variantId: null, imageId: null, qty: 2, unitPrice: 50000, nameSnapshot: "Pijama Rosa" },
    ]);

    expect(url).toBe("https://x/firmado.pdf");
    expect(upload).toHaveBeenCalled();
    expect(createSignedUrl).toHaveBeenCalledWith(expect.stringContaining(".pdf"), 600);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/catalog.ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getSupabase } from "../_shared/db.ts";
import type { ItemCarrito } from "../_shared/types.ts";

export interface ProductoEncontrado {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  fotoUrl: string | null;
}

export async function buscarProductos(consulta: string): Promise<ProductoEncontrado[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, stock, product_images(url, is_primary)")
    .eq("is_active", true)
    .ilike("name", `%${consulta}%`)
    .limit(10);

  if (error || !data) return [];

  return (data as Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    product_images: { url: string; is_primary: boolean }[];
  }>).map((producto) => ({
    id: producto.id,
    nombre: producto.name,
    precio: producto.price,
    stock: producto.stock,
    fotoUrl: producto.product_images.find((img) => img.is_primary)?.url ?? producto.product_images[0]?.url ?? null,
  }));
}

async function pdfDesdeLineas(titulo: string, lineas: string[], total: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([400, 120 + lineas.length * 20]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  let y = pagina.getHeight() - 40;
  pagina.drawText(titulo, { x: 20, y, size: 16, font: fuente });
  y -= 30;
  for (const linea of lineas) {
    pagina.drawText(linea, { x: 20, y, size: 11, font: fuente });
    y -= 20;
  }
  pagina.drawText(`Total: $${total.toLocaleString("es-CO")}`, { x: 20, y: y - 10, size: 13, font: fuente });
  return pdf.save();
}

async function subirYFirmar(bytes: Uint8Array, nombreArchivo: string): Promise<string> {
  const supabase = getSupabase();
  const ruta = `${crypto.randomUUID()}-${nombreArchivo}`;

  const { error: errorSubida } = await supabase.storage
    .from("whatsapp-docs")
    .upload(ruta, bytes, { contentType: "application/pdf" });
  if (errorSubida) {
    throw new Error(`No se pudo subir el PDF ${nombreArchivo}: ${errorSubida.message}`);
  }

  const { data, error } = await supabase.storage.from("whatsapp-docs").createSignedUrl(ruta, 600);
  if (error || !data) {
    throw new Error(`No se pudo firmar el link del PDF ${nombreArchivo}: ${error?.message}`);
  }

  return data.signedUrl;
}

export async function generarCatalogoPdf(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("products")
    .select("name, price, stock")
    .eq("is_active", true)
    .order("name");

  const lineas = ((data ?? []) as Array<{ name: string; price: number; stock: number }>).map(
    (p) => `${p.name} — $${p.price.toLocaleString("es-CO")} (stock: ${p.stock})`,
  );
  const bytes = await pdfDesdeLineas("Catalogo MeryLay Boutique", lineas, 0);
  return subirYFirmar(bytes, "catalogo.pdf");
}

export async function generarCotizacionPdf(items: ItemCarrito[]): Promise<string> {
  const lineas = items.map(
    (item) => `${item.nameSnapshot} x${item.qty} — $${(item.unitPrice * item.qty).toLocaleString("es-CO")}`,
  );
  const total = items.reduce((suma, item) => suma + item.unitPrice * item.qty, 0);
  const bytes = await pdfDesdeLineas("Cotizacion MeryLay Boutique", lineas, total);
  return subirYFirmar(bytes, "cotizacion.pdf");
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/catalog.test.ts
git commit -m "feat: catalogo en vivo y generacion de PDF de catalogo/cotizacion"
```

---

### Task 12: Pedido y link de pago Wompi (`orders.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/orders.ts`
- Test: `supabase/functions/whatsapp-webhook/orders.test.ts`

**Interfaces:**
- Consumes: `getSupabase()`, `ItemCarrito` (Task 5), RPC
  `crear_pedido_wompi_whatsapp` (Task 2).
- Produces: `crearPedidoWompiDesdeCarrito(profileId: string, items: ItemCarrito[], direccionEnvio: Record<string, unknown>): Promise<{ linkPago: string; orderNumber: string }>`
  — usada por Task 16 (acciones de cliente dentro de `handler.ts`) para
  la acción `confirmar_pedido`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/orders.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("crearPedidoWompiDesdeCarrito", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        WOMPI_PUBLIC_KEY: "pub_test_123",
        WOMPI_INTEGRITY_SECRET: "integridad-de-prueba",
        SITE_URL: "https://merylayboutique.com",
      } as Record<string, string>)[key]) },
    });
  });

  it("llama al RPC, calcula la firma y devuelve un link al checkout de WhatsApp", async () => {
    const rpc = vi.fn(async () => ({
      data: { id: "pedido-1", order_number: "ML-20261006-abc123", total: 100000 },
      error: null,
    }));
    const supabase = { rpc };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { crearPedidoWompiDesdeCarrito } = await import("./orders.ts");
    const resultado = await crearPedidoWompiDesdeCarrito(
      "perfil-1",
      [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 100000, nameSnapshot: "Pijama Rosa" }],
      { fullName: "Prueba", phone: "573001234567", address: "Calle 1", city: "Bogota" },
    );

    expect(rpc).toHaveBeenCalledWith("crear_pedido_wompi_whatsapp", {
      p_user_id: "perfil-1",
      p_items: [{ product_id: "p1", variant_id: null, image_id: null, qty: 1 }],
      p_shipping_address: { fullName: "Prueba", phone: "573001234567", address: "Calle 1", city: "Bogota" },
    });
    expect(resultado.orderNumber).toBe("ML-20261006-abc123");
    expect(resultado.linkPago).toContain("https://merylayboutique.com/checkout/wompi/whatsapp/pedido-1");
    expect(resultado.linkPago).toContain("sig=");
  });

  it("lanza un error claro si no hay stock suficiente", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: "No hay stock suficiente para uno de los productos del pedido." } })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { crearPedidoWompiDesdeCarrito } = await import("./orders.ts");
    await expect(
      crearPedidoWompiDesdeCarrito("perfil-1", [{ productId: "p1", variantId: null, imageId: null, qty: 99, unitPrice: 100000, nameSnapshot: "Pijama Rosa" }], {}),
    ).rejects.toThrow(/stock suficiente/);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/orders.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/orders.ts
import { createHash } from "node:crypto";
import { getSupabase } from "../_shared/db.ts";
import type { ItemCarrito } from "../_shared/types.ts";

// Mismo algoritmo que calcularFirmaIntegridad en src/lib/wompi/signature.ts
// del proyecto Next.js (no se puede importar entre runtimes distintos —
// Deno vs Node —, se duplica a proposito esta funcion de 3 lineas).
function calcularFirmaIntegridad(reference: string, amountInCents: number, currency: string, secret: string): string {
  return createHash("sha256").update(`${reference}${amountInCents}${currency}${secret}`).digest("hex");
}

export async function crearPedidoWompiDesdeCarrito(
  profileId: string,
  items: ItemCarrito[],
  direccionEnvio: Record<string, unknown>,
): Promise<{ linkPago: string; orderNumber: string }> {
  const supabase = getSupabase();

  const { data: pedido, error } = await supabase.rpc("crear_pedido_wompi_whatsapp", {
    p_user_id: profileId,
    p_items: items.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId,
      image_id: item.imageId,
      qty: item.qty,
    })),
    p_shipping_address: direccionEnvio,
  });

  if (error || !pedido) {
    throw new Error(error?.message ?? "No se pudo crear el pedido.");
  }

  const publicKey = Deno.env.get("WOMPI_PUBLIC_KEY");
  const secretoIntegridad = Deno.env.get("WOMPI_INTEGRITY_SECRET");
  const siteUrl = Deno.env.get("SITE_URL");
  if (!publicKey || !secretoIntegridad || !siteUrl) {
    throw new Error("Faltan WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET o SITE_URL.");
  }

  const amountInCents = Math.round((pedido as { total: number }).total * 100);
  const firma = calcularFirmaIntegridad((pedido as { order_number: string }).order_number, amountInCents, "COP", secretoIntegridad);

  const parametros = new URLSearchParams({
    ref: (pedido as { order_number: string }).order_number,
    amount: String(amountInCents),
    currency: "COP",
    sig: firma,
  });

  return {
    linkPago: `${siteUrl}/checkout/wompi/whatsapp/${(pedido as { id: string }).id}?${parametros.toString()}`,
    orderNumber: (pedido as { order_number: string }).order_number,
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/orders.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/orders.ts supabase/functions/whatsapp-webhook/orders.test.ts
git commit -m "feat: creacion de pedido y link de pago Wompi desde el bot"
```

---

### Task 13: Acciones del dueño — lectura y escritura (`owner-actions.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/owner-actions.ts`
- Test: `supabase/functions/whatsapp-webhook/owner-actions.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` (Task 5).
- Produces (lectura): `consultarVentas(dias: number): Promise<string>`,
  `consultarStockBajo(umbral: number): Promise<string>`,
  `buscarCliente(consulta: string): Promise<string>`,
  `consultarPedido(numeroOId: string): Promise<string>`,
  `consultarProducto(consulta: string): Promise<string>` — cada una
  devuelve un resumen en texto plano listo para mandar por WhatsApp.
- Produces (escritura, **nunca se llaman sin confirmación previa** — el
  gate vive en Task 15): `actualizarPrecioProducto(idOSku: string, nuevoPrecio: number): Promise<string>`,
  `actualizarStock(idOSku: string, nuevoStock: number): Promise<string>`,
  `cambiarEstadoPedido(numeroPedido: string, nuevoEstado: string): Promise<string>`,
  `activarODesactivarProducto(idOSku: string, activo: boolean): Promise<string>`.
- Produces: `const ACCIONES_ESCRITURA: ReadonlySet<string>` con los nombres
  de las acciones de escritura — usada por Task 15 para decidir si exige
  confirmación.

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/owner-actions.test.ts
import { describe, expect, it, vi } from "vitest";

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

describe("actualizarPrecioProducto", () => {
  it("actualiza el precio por id o sku y confirma en texto", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const or = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => ({ or })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { actualizarPrecioProducto } = await import("./owner-actions.ts");
    const resultado = await actualizarPrecioProducto("PIJ-001", 95000);

    expect(resultado).toContain("95.000");
    expect(or).toHaveBeenCalledWith("id.eq.PIJ-001,sku.eq.PIJ-001");
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/owner-actions.ts
import { getSupabase } from "../_shared/db.ts";

const formatoMoneda = (valor: number) => `$${valor.toLocaleString("es-CO")}`;

export async function consultarVentas(dias: number): Promise<string> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("orders")
    .select("total")
    .gte("created_at", desde)
    .eq("status", "pagado");

  const total = ((data ?? []) as { total: number }[]).reduce((suma, o) => suma + o.total, 0);
  return `Ventas de los ultimos ${dias} dias: ${formatoMoneda(total)} (${data?.length ?? 0} pedidos pagados).`;
}

export async function consultarStockBajo(umbral: number): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("products")
    .select("name, stock")
    .eq("is_active", true)
    .lt("stock", umbral);

  const filas = (data ?? []) as { name: string; stock: number }[];
  if (filas.length === 0) return `Ningun producto activo tiene stock por debajo de ${umbral}.`;
  return filas.map((p) => `${p.name}: ${p.stock} unidades`).join("\n");
}

export async function buscarCliente(consulta: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, whatsapp, username")
    .or(`full_name.ilike.%${consulta}%,whatsapp.ilike.%${consulta}%`)
    .limit(5);

  const filas = (data ?? []) as { full_name: string | null; whatsapp: string | null; username: string }[];
  if (filas.length === 0) return `No encontre ningun cliente que coincida con "${consulta}".`;
  return filas.map((c) => `${c.full_name ?? c.username} — ${c.whatsapp ?? "sin telefono"}`).join("\n");
}

export async function consultarPedido(numeroOId: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("orders")
    .select("order_number, status, total, channel")
    .or(`id.eq.${numeroOId},order_number.eq.${numeroOId}`)
    .maybeSingle();

  if (!data) return `No encontre ningun pedido "${numeroOId}".`;
  const pedido = data as { order_number: string; status: string; total: number; channel: string };
  return `Pedido ${pedido.order_number} (${pedido.channel}): ${pedido.status}, ${formatoMoneda(pedido.total)}.`;
}

export async function consultarProducto(consulta: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("products")
    .select("name, price, stock, sku")
    .or(`name.ilike.%${consulta}%,sku.eq.${consulta}`)
    .limit(5);

  const filas = (data ?? []) as { name: string; price: number; stock: number; sku: string }[];
  if (filas.length === 0) return `No encontre ningun producto que coincida con "${consulta}".`;
  return filas.map((p) => `${p.name} (${p.sku}): ${formatoMoneda(p.price)}, stock ${p.stock}`).join("\n");
}

export async function actualizarPrecioProducto(idOSku: string, nuevoPrecio: number): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("products")
    .update({ price: nuevoPrecio })
    .or(`id.eq.${idOSku},sku.eq.${idOSku}`);

  if (error) throw new Error(`No se pudo actualizar el precio: ${error.message}`);
  return `Precio actualizado a ${formatoMoneda(nuevoPrecio)}.`;
}

export async function actualizarStock(idOSku: string, nuevoStock: number): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("products")
    .update({ stock: nuevoStock })
    .or(`id.eq.${idOSku},sku.eq.${idOSku}`);

  if (error) throw new Error(`No se pudo actualizar el stock: ${error.message}`);
  return `Stock actualizado a ${nuevoStock} unidades.`;
}

export async function cambiarEstadoPedido(numeroPedido: string, nuevoEstado: string): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("orders")
    .update({ status: nuevoEstado })
    .eq("order_number", numeroPedido);

  if (error) throw new Error(`No se pudo cambiar el estado del pedido: ${error.message}`);
  return `Pedido ${numeroPedido} actualizado a "${nuevoEstado}".`;
}

export async function activarODesactivarProducto(idOSku: string, activo: boolean): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("products")
    .update({ is_active: activo })
    .or(`id.eq.${idOSku},sku.eq.${idOSku}`);

  if (error) throw new Error(`No se pudo ${activo ? "activar" : "desactivar"} el producto: ${error.message}`);
  return `Producto ${activo ? "activado" : "desactivado"}.`;
}

export const ACCIONES_ESCRITURA: ReadonlySet<string> = new Set([
  "actualizar_precio_producto",
  "actualizar_stock",
  "cambiar_estado_pedido",
  "activar_o_desactivar_producto",
]);
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts
git commit -m "feat: consultas y acciones de negocio para Elkin y Mary"
```

---

### Task 14: El agente — decisión en JSON estructurado (`agent.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/agent.ts`
- Test: `supabase/functions/whatsapp-webhook/agent.test.ts`

**Interfaces:**
- Consumes: `AgentDecision`, `RolRemitente` (Task 5).
- Produces: `decidirAccion(opts: { rol: RolRemitente; nombreDueno?: "Elkin" | "Mary"; historial: { direction: "inbound" | "outbound"; message_body: string }[]; mensajeEntrante: string }): Promise<AgentDecision>`
  — usada por Task 15 (`handler.ts`). En caso de error tras los reintentos,
  devuelve `{ action: "error", params: {}, response_message: "..." }` y
  loguea el error completo con `console.error`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/agent.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("decidirAccion", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "OPENAI_API_KEY" ? "sk-test" : undefined)) } });
  });

  it("devuelve la accion que decide el modelo cuando la respuesta es JSON valido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "Buscando..." }) } }],
    }), { status: 200 })));

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "tienen pijamas?" });

    expect(resultado).toEqual({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "Buscando..." });
  });

  it("reintenta una vez si OpenAI responde 429 y despues funciona", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("limite excedido", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola!" }) } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado.action).toBe("chat");
  });

  it("devuelve action: error si fallan todos los reintentos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error de servidor", { status: 500 })));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    expect(resultado.action).toBe("error");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("incluye el nombre del dueño en el prompt cuando el rol es owner", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola Elkin" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "owner", nombreDueno: "Elkin", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const promptSistema = cuerpo.messages[0].content as string;
    expect(promptSistema).toContain("Elkin");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/agent.ts
import type { AgentDecision, RolRemitente } from "../_shared/types.ts";

const ACCIONES_CLIENTE = [
  "buscar_producto", "agregar_al_carrito", "quitar_del_carrito",
  "generar_catalogo_pdf", "generar_cotizacion_pdf", "confirmar_pedido",
  "generar_acceso_web", "chat",
].join(", ");

const ACCIONES_DUENO = [
  "consultar_ventas", "consultar_stock_bajo", "buscar_cliente", "consultar_pedido",
  "consultar_producto", "actualizar_precio_producto", "actualizar_stock",
  "cambiar_estado_pedido", "activar_o_desactivar_producto", "chat",
].join(", ");

function promptSistema(rol: RolRemitente, nombreDueno?: "Elkin" | "Mary"): string {
  if (rol === "owner") {
    return `Eres el asistente interno de MeryLay Boutique, hablando con ${nombreDueno}, dueño del negocio. ` +
      `Tiene acceso total de lectura y escritura sobre el negocio. ` +
      `Responde SIEMPRE con un JSON {"action": string, "params": object, "response_message": string}. ` +
      `"action" debe ser una de: ${ACCIONES_DUENO}. Usa "chat" solo si ninguna otra aplica.`;
  }
  return `Eres el asistente de ventas de MeryLay Boutique ("Inspiracion Femenina"), atendiendo a un cliente por WhatsApp. ` +
    `Responde SIEMPRE con un JSON {"action": string, "params": object, "response_message": string}. ` +
    `"action" debe ser una de: ${ACCIONES_CLIENTE}. Usa "chat" solo si ninguna otra aplica.`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function llamarOpenAI(mensajes: { role: string; content: string }[]): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  const maxIntentos = 3;
  let ultimoError: unknown;

  for (let intento = 0; intento < maxIntentos; intento++) {
    try {
      const respuesta = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: mensajes,
        }),
      });

      if (respuesta.ok) {
        const cuerpo = await respuesta.json();
        return cuerpo.choices[0].message.content as string;
      }

      if (![429, 500, 503].includes(respuesta.status)) {
        throw new Error(`OpenAI respondio ${respuesta.status}`);
      }
      ultimoError = new Error(`OpenAI respondio ${respuesta.status}`);
    } catch (e) {
      ultimoError = e;
    }
    await esperar(500 * 2 ** intento);
  }

  throw ultimoError;
}

export async function decidirAccion(opts: {
  rol: RolRemitente;
  nombreDueno?: "Elkin" | "Mary";
  historial: { direction: "inbound" | "outbound"; message_body: string }[];
  mensajeEntrante: string;
}): Promise<AgentDecision> {
  const mensajes = [
    { role: "system", content: promptSistema(opts.rol, opts.nombreDueno) },
    ...opts.historial.map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.message_body,
    })),
    { role: "user", content: opts.mensajeEntrante },
  ];

  try {
    const contenido = await llamarOpenAI(mensajes);
    const decision = JSON.parse(contenido) as AgentDecision;
    if (typeof decision.action !== "string" || typeof decision.response_message !== "string") {
      throw new Error("Respuesta de OpenAI sin el formato esperado.");
    }
    return { action: decision.action, params: decision.params ?? {}, response_message: decision.response_message };
  } catch (error) {
    console.error("[agent] Error llamando a OpenAI o parseando su respuesta:", error);
    return {
      action: "error",
      params: {},
      response_message: "Disculpa, tuve un problema para procesar tu mensaje. ¿Puedes intentarlo de nuevo en un momento?",
    };
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/agent.ts supabase/functions/whatsapp-webhook/agent.test.ts
git commit -m "feat: agente de WhatsApp con OpenAI en modo JSON estructurado y reintentos"
```

---

### Task 15: Orquestador (`handler.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/handler.ts`
- Test: `supabase/functions/whatsapp-webhook/handler.test.ts`

**Interfaces:**
- Consumes: todo lo anterior (`adapters`, `customers`, `sessions`,
  `catalog`, `orders`, `owner-actions`, `agent`, `_shared/meta`, `_shared/db`).
- Produces: `procesarMensajeEntrante(payload: unknown): Promise<void>` —
  usada por Task 17 (`index.ts`). Idempotente, determina rol por
  teléfono, aplica el gate de confirmación de escritura, despacha la
  acción y envía la respuesta.

- [ ] **Step 1: Escribir el test que falla**

Cubre, en orden, los cinco puntos de **Review Focus**: idempotencia,
confirmación ambigua, normalización de número de dueño, y dos casos de
flujo normal (cliente y dueño).

```ts
// supabase/functions/whatsapp-webhook/handler.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parsearMensajeEntrante: vi.fn(),
  buscarOCrearCliente: vi.fn(),
  obtenerOCrearSesion: vi.fn(),
  guardarSesion: vi.fn(),
  decidirAccion: vi.fn(),
  enviarTexto: vi.fn(),
  consultarStockBajo: vi.fn(),
  actualizarPrecioProducto: vi.fn(),
}));

vi.mock("./adapters.ts", () => ({ parsearMensajeEntrante: mocks.parsearMensajeEntrante }));
vi.mock("./customers.ts", () => ({ buscarOCrearCliente: mocks.buscarOCrearCliente, normalizarTelefono: (t: string) => t.replace(/\D/g, "") }));
vi.mock("./sessions.ts", () => ({ obtenerOCrearSesion: mocks.obtenerOCrearSesion, guardarSesion: mocks.guardarSesion }));
vi.mock("./agent.ts", () => ({ decidirAccion: mocks.decidirAccion }));
vi.mock("../_shared/meta.ts", () => ({ enviarTexto: mocks.enviarTexto, enviarImagenPorLink: vi.fn(), enviarDocumentoPorLink: vi.fn() }));
vi.mock("./owner-actions.ts", () => ({
  consultarStockBajo: mocks.consultarStockBajo,
  actualizarPrecioProducto: mocks.actualizarPrecioProducto,
  ACCIONES_ESCRITURA: new Set(["actualizar_precio_producto"]),
}));
vi.mock("./catalog.ts", () => ({ buscarProductos: vi.fn(), generarCatalogoPdf: vi.fn(), generarCotizacionPdf: vi.fn() }));
vi.mock("./orders.ts", () => ({ crearPedidoWompiDesdeCarrito: vi.fn() }));

const dbMocks = vi.hoisted(() => ({ insertarMensaje: vi.fn() }));
vi.mock("../_shared/db.ts", () => ({
  getSupabase: () => ({
    from: () => ({ insert: dbMocks.insertarMensaje }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "WHATSAPP_OWNER_NUMBERS" ? "573215879805,573102862373" : undefined)) } });
  dbMocks.insertarMensaje.mockResolvedValue({ error: null });
  mocks.buscarOCrearCliente.mockResolvedValue({ profileId: "perfil-1", esNuevo: false });
  mocks.obtenerOCrearSesion.mockResolvedValue({ id: "sesion-1", sessionData: { cart: [], pendingConfirmation: null } });
});

describe("procesarMensajeEntrante", () => {
  it("no procesa dos veces el mismo message_id (idempotencia)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.1", from: "573001234567", texto: "hola" });
    dbMocks.insertarMensaje.mockResolvedValue({ error: { code: "23505" } }); // violacion de unique

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
  });

  it("reconoce a +573215879805 como Elkin aunque llegue con '+' y espacios", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.2", from: "+57 321 587 9805", texto: "ventas de hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola Elkin" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).toHaveBeenCalledWith(expect.objectContaining({ rol: "owner", nombreDueno: "Elkin" }));
  });

  it("no ejecuta una accion de escritura si la confirmacion es ambigua", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.3", from: "573215879805", texto: "tal vez, dejame pensarlo" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
  });

  it("ejecuta la accion pendiente si el dueño confirma con 'si'", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.4", from: "573215879805", texto: "si, confirmo" });
    mocks.actualizarPrecioProducto.mockResolvedValue("Precio actualizado a $50.000.");

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).toHaveBeenCalledWith("P1", 50000);
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", "Precio actualizado a $50.000.");
  });

  it("pide confirmacion en vez de ejecutar cuando el modelo propone una accion de escritura por primera vez", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.5", from: "573215879805", texto: "sube el precio de P1 a 50000" });
    mocks.decidirAccion.mockResolvedValue({
      action: "actualizar_precio_producto",
      params: { idOSku: "P1", nuevoPrecio: 50000 },
      response_message: "Voy a actualizar el precio.",
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", expect.stringContaining("Confirmas"));
    expect(mocks.guardarSesion).toHaveBeenCalledWith("sesion-1", expect.objectContaining({
      pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } },
    }));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/handler.ts
import { getSupabase } from "../_shared/db.ts";
import { enviarTexto } from "../_shared/meta.ts";
import { parsearMensajeEntrante } from "./adapters.ts";
import { buscarOCrearCliente, normalizarTelefono } from "./customers.ts";
import { obtenerOCrearSesion, guardarSesion } from "./sessions.ts";
import { decidirAccion } from "./agent.ts";
import * as ownerActions from "./owner-actions.ts";
import { ACCIONES_ESCRITURA } from "./owner-actions.ts";

const AFIRMACIONES = new Set(["si", "sí", "confirmo", "dale", "ok", "listo"]);

function esDueno(telefono: string): "Elkin" | "Mary" | null {
  const numeros = (Deno.env.get("WHATSAPP_OWNER_NUMBERS") ?? "").split(",").map((n) => n.trim());
  const [elkin, mary] = numeros;
  if (telefono === elkin) return "Elkin";
  if (telefono === mary) return "Mary";
  return null;
}

async function registrarMensaje(telefono: string, direction: "inbound" | "outbound", body: string, providerMessageId?: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from("whatsapp_messages").insert({
    phone_number: telefono,
    direction,
    message_body: body,
    provider_message_id: providerMessageId ?? null,
  });
  if (error && (error as { code?: string }).code === "23505") {
    return false; // duplicado
  }
  return true;
}

async function ejecutarAccionEscritura(accion: string, params: Record<string, unknown>): Promise<string> {
  switch (accion) {
    case "actualizar_precio_producto":
      return ownerActions.actualizarPrecioProducto(params.idOSku as string, params.nuevoPrecio as number);
    case "actualizar_stock":
      return ownerActions.actualizarStock(params.idOSku as string, params.nuevoStock as number);
    case "cambiar_estado_pedido":
      return ownerActions.cambiarEstadoPedido(params.numeroPedido as string, params.nuevoEstado as string);
    case "activar_o_desactivar_producto":
      return ownerActions.activarODesactivarProducto(params.idOSku as string, params.activo as boolean);
    default:
      throw new Error(`Accion de escritura desconocida: ${accion}`);
  }
}

async function ejecutarAccionLectura(accion: string, params: Record<string, unknown>): Promise<string> {
  switch (accion) {
    case "consultar_ventas":
      return ownerActions.consultarVentas((params.dias as number) ?? 1);
    case "consultar_stock_bajo":
      return ownerActions.consultarStockBajo((params.umbral as number) ?? 5);
    case "buscar_cliente":
      return ownerActions.buscarCliente(params.consulta as string);
    case "consultar_pedido":
      return ownerActions.consultarPedido(params.numeroOId as string);
    case "consultar_producto":
      return ownerActions.consultarProducto(params.consulta as string);
    default:
      return "No reconozco esa consulta todavia.";
  }
}

export async function procesarMensajeEntrante(payload: unknown): Promise<void> {
  const entrante = parsearMensajeEntrante(payload);
  if (!entrante) return;

  const telefono = normalizarTelefono(entrante.from);
  const esNuevo = await registrarMensaje(telefono, "inbound", entrante.texto, entrante.messageId);
  if (!esNuevo) return; // ya procesado antes (reintento de Meta)

  const nombreDueno = esDueno(telefono);
  const rol = nombreDueno ? "owner" : "customer";

  const { profileId } = await buscarOCrearCliente(telefono);
  const { id: sessionId, sessionData } = await obtenerOCrearSesion(telefono, profileId);

  let respuesta: string;

  if (sessionData.pendingConfirmation) {
    const textoNormalizado = entrante.texto.trim().toLowerCase();
    if (AFIRMACIONES.has(textoNormalizado)) {
      const { action, params } = sessionData.pendingConfirmation;
      respuesta = await ejecutarAccionEscritura(action, params);
      sessionData.pendingConfirmation = null;
      await guardarSesion(sessionId, sessionData);
    } else {
      sessionData.pendingConfirmation = null;
      await guardarSesion(sessionId, sessionData);
      respuesta = "Entendido, no hice ningún cambio. ¿En qué más te ayudo?";
    }
  } else {
    const decision = await decidirAccion({
      rol,
      nombreDueno: nombreDueno ?? undefined,
      historial: [],
      mensajeEntrante: entrante.texto,
    });

    if (rol === "owner" && ACCIONES_ESCRITURA.has(decision.action)) {
      sessionData.pendingConfirmation = { action: decision.action, params: decision.params };
      await guardarSesion(sessionId, sessionData);
      respuesta = `¿Confirmas esta acción? ${decision.action} con ${JSON.stringify(decision.params)}. Responde "sí" para confirmar.`;
    } else if (rol === "owner") {
      respuesta = decision.action === "chat" ? decision.response_message : await ejecutarAccionLectura(decision.action, decision.params);
    } else {
      respuesta = decision.response_message;
    }
  }

  await enviarTexto(telefono, respuesta);
  await registrarMensaje(telefono, "outbound", respuesta);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts
git commit -m "feat: orquestador del bot (idempotencia, rol por telefono, gate de confirmacion)"
```

---

### Task 16: Acciones de cliente en el orquestador (catálogo, carrito, pedido)

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.test.ts`

**Interfaces:**
- Consumes: `buscarProductos`, `generarCatalogoPdf`, `generarCotizacionPdf`
  (Task 11), `crearPedidoWompiDesdeCarrito` (Task 12), `generarAccesoWeb`
  (Task 9).
- Produces: `ejecutarAccionCliente(accion: string, params:
  Record<string, unknown>, profileId: string, sessionData: SessionData):
  Promise<{ texto: string; documentos: { link: string; filename: string
  }[] }>` — reemplaza el `else { respuesta = decision.response_message;
  }` de Task 15 por un despacho real de las acciones de cliente. El tipo
  de retorno de todo el flujo de cliente cambia de `string` a `{ texto,
  documentos }` para poder mandar también el PDF de catálogo/cotización
  después del texto.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `handler.test.ts` (además de los mocks ya existentes, agregar
`buscarProductos`, `generarCatalogoPdf`, `generarCotizacionPdf` al mock de
`./catalog.ts`, `crearPedidoWompiDesdeCarrito` al mock de `./orders.ts`, y
`generarAccesoWeb` al mock de `./customers.ts`; y `enviarDocumentoPorLink`
al mock de `../_shared/meta.ts`, todos con `vi.hoisted`):

```ts
const clienteMocks = vi.hoisted(() => ({
  buscarProductos: vi.fn(),
  generarCatalogoPdf: vi.fn(),
  generarCotizacionPdf: vi.fn(),
  crearPedidoWompiDesdeCarrito: vi.fn(),
  generarAccesoWeb: vi.fn(),
  enviarDocumentoPorLink: vi.fn(),
}));

vi.mock("./catalog.ts", () => ({
  buscarProductos: clienteMocks.buscarProductos,
  generarCatalogoPdf: clienteMocks.generarCatalogoPdf,
  generarCotizacionPdf: clienteMocks.generarCotizacionPdf,
}));
vi.mock("./orders.ts", () => ({ crearPedidoWompiDesdeCarrito: clienteMocks.crearPedidoWompiDesdeCarrito }));
vi.mock("../_shared/meta.ts", () => ({
  enviarTexto: mocks.enviarTexto,
  enviarImagenPorLink: vi.fn(),
  enviarDocumentoPorLink: clienteMocks.enviarDocumentoPorLink,
}));
```

(Esto reemplaza los `vi.mock` equivalentes ya escritos en Task 15 para
`./catalog.ts`, `./orders.ts` y `../_shared/meta.ts` — no se duplican, se
amplían con las funciones nuevas.)

```ts
describe("ejecutarAccionCliente via procesarMensajeEntrante", () => {
  it("agrega un producto al carrito y responde con el total actualizado", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.10", from: "573009998888", texto: "agrega la pijama rosa" });
    mocks.decidirAccion.mockResolvedValue({
      action: "agregar_al_carrito",
      params: { productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 89900, nombre: "Pijama Rosa" },
      response_message: "Agregando...",
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("89.900"));
    expect(mocks.guardarSesion).toHaveBeenCalledWith("sesion-1", expect.objectContaining({
      cart: [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }],
    }));
  });

  it("manda el catalogo como documento ademas del texto", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.11", from: "573009998888", texto: "mandame el catalogo" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_catalogo_pdf", params: {}, response_message: "" });
    clienteMocks.generarCatalogoPdf.mockResolvedValue("https://x/catalogo-firmado.pdf");

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573009998888", "https://x/catalogo-firmado.pdf", "catalogo-merylay.pdf");
  });

  it("confirma el pedido con el carrito de la sesion y responde con el link de pago", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: {
        cart: [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }],
        pendingConfirmation: null,
      },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.12", from: "573009998888", texto: "confirmo, mi direccion es Calle 1, Bogota" });
    mocks.decidirAccion.mockResolvedValue({
      action: "confirmar_pedido",
      params: { fullName: "Cliente Prueba", phone: "573009998888", address: "Calle 1", city: "Bogota" },
      response_message: "",
    });
    clienteMocks.crearPedidoWompiDesdeCarrito.mockResolvedValue({ linkPago: "https://x/pagar/1", orderNumber: "ML-1" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.crearPedidoWompiDesdeCarrito).toHaveBeenCalledWith(
      "perfil-1",
      [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }],
      { fullName: "Cliente Prueba", phone: "573009998888", address: "Calle 1", city: "Bogota" },
    );
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("https://x/pagar/1"));
  });

  it("no confirma el pedido si el carrito esta vacio", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.13", from: "573009998888", texto: "confirmo" });
    mocks.decidirAccion.mockResolvedValue({ action: "confirmar_pedido", params: { fullName: "X", phone: "573009998888", address: "Y", city: "Z" }, response_message: "" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.crearPedidoWompiDesdeCarrito).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("carrito está vacío"));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: FAIL (los cuatro tests nuevos; los de Task 15 siguen pasando)

- [ ] **Step 3: Implementación**

En `handler.ts`: agregar los imports nuevos (y ampliar los dos ya
existentes de `./customers.ts` y `../_shared/meta.ts` de Task 15 con los
nombres nuevos, en vez de duplicar la línea de `import`):

```ts
import * as catalog from "./catalog.ts";
import { crearPedidoWompiDesdeCarrito } from "./orders.ts";
import { buscarOCrearCliente, normalizarTelefono, generarAccesoWeb } from "./customers.ts"; // reemplaza el import de Task 15
import { enviarTexto, enviarDocumentoPorLink } from "../_shared/meta.ts"; // reemplaza el import de Task 15
import type { ItemCarrito, SessionData } from "../_shared/types.ts";
import { z } from "zod";

const direccionEnvioSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
});

async function ejecutarAccionCliente(
  accion: string,
  params: Record<string, unknown>,
  profileId: string,
  sessionData: SessionData,
): Promise<{ texto: string; documentos: { link: string; filename: string }[] }> {
  switch (accion) {
    case "buscar_producto": {
      const productos = await catalog.buscarProductos(params.consulta as string);
      if (productos.length === 0) {
        return { texto: `No encontré productos para "${params.consulta}".`, documentos: [] };
      }
      const texto = productos
        .map((p) => `${p.nombre} — $${p.precio.toLocaleString("es-CO")} (stock: ${p.stock})`)
        .join("\n");
      return { texto, documentos: [] };
    }

    case "agregar_al_carrito": {
      const item: ItemCarrito = {
        productId: params.productId as string,
        variantId: (params.variantId as string) ?? null,
        imageId: (params.imageId as string) ?? null,
        qty: (params.qty as number) ?? 1,
        unitPrice: params.unitPrice as number,
        nameSnapshot: params.nombre as string,
      };
      sessionData.cart.push(item);
      const total = sessionData.cart.reduce((suma, i) => suma + i.unitPrice * i.qty, 0);
      return {
        texto: `Agregado. Tu carrito tiene ${sessionData.cart.length} producto(s), total $${total.toLocaleString("es-CO")}.`,
        documentos: [],
      };
    }

    case "quitar_del_carrito": {
      sessionData.cart = sessionData.cart.filter((item) => item.productId !== params.productId);
      return { texto: "Listo, lo quité del carrito.", documentos: [] };
    }

    case "generar_catalogo_pdf": {
      const link = await catalog.generarCatalogoPdf();
      return {
        texto: "Aquí tienes nuestro catálogo completo 💕",
        documentos: [{ link, filename: "catalogo-merylay.pdf" }],
      };
    }

    case "generar_cotizacion_pdf": {
      if (sessionData.cart.length === 0) {
        return { texto: "Tu carrito está vacío, agrega algún producto antes de pedir la cotización.", documentos: [] };
      }
      const link = await catalog.generarCotizacionPdf(sessionData.cart);
      return { texto: "Aquí tienes tu cotización 💕", documentos: [{ link, filename: "cotizacion-merylay.pdf" }] };
    }

    case "confirmar_pedido": {
      if (sessionData.cart.length === 0) {
        return { texto: "Tu carrito está vacío, agrega algún producto antes de confirmar un pedido.", documentos: [] };
      }
      const direccion = direccionEnvioSchema.safeParse(params);
      if (!direccion.success) {
        return {
          texto: "Para confirmar necesito tu nombre completo, teléfono, dirección y ciudad de envío.",
          documentos: [],
        };
      }
      const { linkPago, orderNumber } = await crearPedidoWompiDesdeCarrito(profileId, sessionData.cart, direccion.data);
      sessionData.cart = [];
      return {
        texto: `Tu pedido ${orderNumber} quedó listo. Paga aquí para confirmarlo: ${linkPago}`,
        documentos: [],
      };
    }

    case "generar_acceso_web": {
      const { usuario, contrasena } = await generarAccesoWeb(profileId);
      return {
        texto: `Ya puedes entrar a merylayboutique.com con el usuario ${usuario} y la contraseña ${contrasena}. Te recomendamos cambiarla después de tu primer ingreso.`,
        documentos: [],
      };
    }

    default:
      return { texto: "chat", documentos: [] }; // sobreescrito por response_message en el caller
  }
}
```

Y reemplazar, dentro de `procesarMensajeEntrante`, el bloque:

```ts
    } else {
      respuesta = decision.response_message;
    }
  }

  await enviarTexto(telefono, respuesta);
  await registrarMensaje(telefono, "outbound", respuesta);
}
```

por:

```ts
    } else if (decision.action === "chat") {
      respuesta = decision.response_message;
    } else {
      const resultado = await ejecutarAccionCliente(decision.action, decision.params, profileId, sessionData);
      respuesta = resultado.texto;
      await guardarSesion(sessionId, sessionData);
      for (const documento of resultado.documentos) {
        await enviarDocumentoPorLink(telefono, documento.link, documento.filename);
      }
    }
  }

  await enviarTexto(telefono, respuesta);
  await registrarMensaje(telefono, "outbound", respuesta);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: PASS (9 tests — los 5 de Task 15 más los 4 nuevos)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts
git commit -m "feat: acciones de cliente en el orquestador (catalogo, carrito, pedido, acceso web)"
```

---

### Task 17: Entry point del webhook (`index.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/index.ts`
- Test: `supabase/functions/whatsapp-webhook/index.test.ts`

**Interfaces:**
- Consumes: `verificarFirmaMeta` (Task 7), `procesarMensajeEntrante` (Task 15).
- Produces: `handleRequest(req: Request): Promise<Response>` — la única
  pieza que el runtime de Deno invoca (`Deno.serve(handleRequest)`, solo
  si `import.meta.main`, para que importar el módulo en Vitest no
  arranque un servidor).

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/whatsapp-webhook/index.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const procesarMock = vi.hoisted(() => vi.fn());
vi.mock("./handler.ts", () => ({ procesarMensajeEntrante: procesarMock }));
vi.mock("./meta-signature.ts", () => ({ verificarFirmaMeta: (payload: string, firma: string | null) => firma === "sha256=valida" }));

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "META_APP_SECRET" ? "secreto" : k === "META_VERIFY_TOKEN" ? "token-verificacion" : undefined)) } });
  vi.stubGlobal("EdgeRuntime", { waitUntil: vi.fn() });
  procesarMock.mockClear();
});

describe("handleRequest", () => {
  it("responde el challenge de verificacion de Meta en el handshake GET", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=token-verificacion&hub.challenge=123456", { method: "GET" });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe("123456");
  });

  it("rechaza con 403 si la firma del POST no es valida", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/whatsapp-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=invalida" },
      body: "{}",
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(403);
    expect(procesarMock).not.toHaveBeenCalled();
  });

  it("responde 200 de inmediato y procesa en segundo plano si la firma es valida", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/whatsapp-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=valida" },
      body: '{"hola":"mundo"}',
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect((globalThis as unknown as { EdgeRuntime: { waitUntil: ReturnType<typeof vi.fn> } }).EdgeRuntime.waitUntil).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/index.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/whatsapp-webhook/index.ts
import { verificarFirmaMeta } from "./meta-signature.ts";
import { procesarMensajeEntrante } from "./handler.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && token === Deno.env.get("META_VERIFY_TOKEN") && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Token de verificacion invalido.", { status: 403 });
  }

  const payloadRaw = await req.text();
  const firma = req.headers.get("x-hub-signature-256");
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";

  if (!verificarFirmaMeta(payloadRaw, firma, appSecret)) {
    return new Response("Firma invalida.", { status: 403 });
  }

  const payload = JSON.parse(payloadRaw);
  EdgeRuntime.waitUntil(
    procesarMensajeEntrante(payload).catch((error) => {
      console.error("[whatsapp-webhook] Error procesando mensaje:", error);
    }),
  );

  return new Response("OK", { status: 200 });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/index.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts supabase/functions/whatsapp-webhook/index.test.ts
git commit -m "feat: entry point del webhook de WhatsApp (verificacion, handshake, respuesta rapida)"
```

---

### Task 18: Notificación de venta nueva (`notificar-pedido`)

**Files:**
- Create: `supabase/functions/notificar-pedido/index.ts`
- Test: `supabase/functions/notificar-pedido/index.test.ts`

**Interfaces:**
- Consumes: `enviarTexto` (Task 6).
- Produces: `handleRequest(req: Request): Promise<Response>` — recibe el
  payload del Database Webhook de Supabase
  (`{ type: "INSERT", table: string, record: Record<string, unknown> }`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// supabase/functions/notificar-pedido/index.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviarTextoMock = vi.hoisted(() => vi.fn());
vi.mock("../_shared/meta.ts", () => ({ enviarTexto: enviarTextoMock }));

beforeEach(() => {
  enviarTextoMock.mockClear();
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => ({
    WHATSAPP_OWNER_NUMBERS: "573215879805,573102862373",
    NOTIFICAR_PEDIDO_SECRET: "secreto-del-trigger",
  } as Record<string, string>)[k]) } });
});

describe("handleRequest", () => {
  it("rechaza con 401 si el header secreto no coincide", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/notificar-pedido", {
      method: "POST",
      headers: { "x-notificar-pedido-secret": "incorrecto" },
      body: JSON.stringify({ type: "INSERT", table: "orders", record: {} }),
    });

    const respuesta = await handleRequest(req);
    expect(respuesta.status).toBe(401);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("avisa a Elkin y a Mary cuando entra un pedido nuevo", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/notificar-pedido", {
      method: "POST",
      headers: { "x-notificar-pedido-secret": "secreto-del-trigger" },
      body: JSON.stringify({
        type: "INSERT",
        table: "orders",
        record: { order_number: "ML-20261006-abc123", total: 150000, channel: "whatsapp" },
      }),
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledTimes(2);
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("ML-20261006-abc123"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573102862373", expect.stringContaining("ML-20261006-abc123"));
  });

  it("avisa tambien para una venta nueva del POS, con su propio formato", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/notificar-pedido", {
      method: "POST",
      headers: { "x-notificar-pedido-secret": "secreto-del-trigger" },
      body: JSON.stringify({
        type: "INSERT",
        table: "pos_sales",
        record: { sale_number: "POS-001", total: 50000 },
      }),
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("POS-001"));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test supabase/functions/notificar-pedido/index.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementación mínima**

```ts
// supabase/functions/notificar-pedido/index.ts
import { enviarTexto } from "../_shared/meta.ts";

interface PayloadWebhook {
  type: string;
  table: "orders" | "pos_sales";
  record: Record<string, unknown>;
}

function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
}

function resumenVenta(payload: PayloadWebhook): string {
  if (payload.table === "orders") {
    const r = payload.record as { order_number: string; total: number; channel: string };
    return `🛍️ Pedido nuevo (${r.channel}): ${r.order_number} — ${formatoMoneda(r.total)}`;
  }
  const r = payload.record as { sale_number: string; total: number };
  return `🛍️ Venta nueva en el POS: ${r.sale_number} — ${formatoMoneda(r.total)}`;
}

export async function handleRequest(req: Request): Promise<Response> {
  const secretoEsperado = Deno.env.get("NOTIFICAR_PEDIDO_SECRET") ?? "";
  const secretoRecibido = req.headers.get("x-notificar-pedido-secret") ?? "";
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
    return new Response("No autorizado.", { status: 401 });
  }

  const payload = (await req.json()) as PayloadWebhook;
  const mensaje = resumenVenta(payload);

  const numeros = (Deno.env.get("WHATSAPP_OWNER_NUMBERS") ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  for (const numero of numeros) {
    await enviarTexto(numero, mensaje);
  }

  return new Response("OK", { status: 200 });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test supabase/functions/notificar-pedido/index.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notificar-pedido/index.ts supabase/functions/notificar-pedido/index.test.ts
git commit -m "feat: notificacion de venta nueva a Elkin y Mary (todos los canales)"
```

---

### Task 19: Página web del pago Wompi iniciado desde WhatsApp

**Files:**
- Create: `src/app/(store)/checkout/wompi/whatsapp/[orderId]/page.tsx`
- Test: `src/app/(store)/checkout/wompi/whatsapp/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `WompiCheckoutButton` (componente existente,
  `src/app/(store)/checkout/wompi-checkout-button.tsx`, sin cambios).
- Produces: página servidor que lee `orderId` (ruta) y `ref`, `amount`,
  `currency`, `sig` (query string, generados por Task 12) y renderiza el
  botón de pago. No hace falta ninguna consulta a la base de datos: todos
  los datos necesarios ya vienen en la URL que mandó el bot.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/app/(store)/checkout/wompi/whatsapp/__tests__/page.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "../[orderId]/page";

vi.mock("../../../wompi-checkout-button", () => ({
  WompiCheckoutButton: (props: Record<string, unknown>) => (
    <div data-testid="boton-wompi">{JSON.stringify(props)}</div>
  ),
}));

describe("Pagina de pago Wompi desde WhatsApp", () => {
  it("renderiza el boton de Wompi con los datos de la URL", async () => {
    process.env.WOMPI_PUBLIC_KEY = "pub_test_123";

    const Componente = await Page({
      params: Promise.resolve({ orderId: "pedido-1" }),
      searchParams: Promise.resolve({ ref: "ML-20261006-abc123", amount: "150000", currency: "COP", sig: "firma-de-prueba" }),
    });
    render(Componente);

    const boton = screen.getByTestId("boton-wompi");
    expect(boton.textContent).toContain("pedido-1");
    expect(boton.textContent).toContain("ML-20261006-abc123");
    expect(boton.textContent).toContain("pub_test_123");
  });

  it("muestra un mensaje de error si falta algun dato en la URL", async () => {
    const Componente = await Page({
      params: Promise.resolve({ orderId: "pedido-1" }),
      searchParams: Promise.resolve({ ref: "ML-20261006-abc123" }),
    });
    render(Componente);

    expect(screen.getByText(/no está disponible/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/app/\(store\)/checkout/wompi/whatsapp/__tests__/page.test.tsx`
Expected: FAIL (la página no existe)

- [ ] **Step 3: Implementación mínima**

```tsx
// src/app/(store)/checkout/wompi/whatsapp/[orderId]/page.tsx
import { WompiCheckoutButton } from "../../wompi-checkout-button";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ ref?: string; amount?: string; currency?: string; sig?: string }>;
}) {
  const { orderId } = await params;
  const { ref, amount, currency, sig } = await searchParams;
  const publicKey = process.env.WOMPI_PUBLIC_KEY;

  if (!ref || !amount || !currency || !sig || !publicKey) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-brand-ciruela">
        El pago en línea no está disponible en este momento. Por favor contáctanos para coordinar el pago.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-8 text-center">
      <h1 className="font-serif text-2xl text-brand-ciruela">Completa tu pago</h1>
      <p className="text-brand-ciruela/80">Pedido {ref}</p>
      <WompiCheckoutButton
        orderId={orderId}
        reference={ref}
        amountInCents={Number(amount)}
        currency={currency}
        publicKey={publicKey}
        signature={sig}
      />
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/app/\(store\)/checkout/wompi/whatsapp/__tests__/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(store)/checkout/wompi/whatsapp/[orderId]/page.tsx" "src/app/(store)/checkout/wompi/whatsapp/__tests__/page.test.tsx"
git commit -m "feat: pagina de pago Wompi para pedidos iniciados desde WhatsApp"
```

---

### Task 20: Secrets, despliegue y configuración final

**Files:**
- Modify: `.env.local.example`

**Interfaces:** Ninguna — este task es operativo, cierra el plan.

- [ ] **Step 1: Documentar las variables nuevas**

Agregar a `.env.local.example` (sin valores reales):

```env
# Agente de WhatsApp (Fase extra, ver docs/superpowers/specs/2026-10-06-agente-whatsapp-design.md)
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_VERIFY_TOKEN=
META_APP_SECRET=
OPENAI_API_KEY=
WHATSAPP_OWNER_NUMBERS=573215879805,573102862373
SITE_URL=
NOTIFICAR_PEDIDO_SECRET=
```

- [ ] **Step 2: Cargar los secrets reales en Supabase**

```bash
supabase secrets set \
  META_ACCESS_TOKEN=<valor real> \
  META_PHONE_NUMBER_ID=<valor real> \
  META_VERIFY_TOKEN=<valor generado, ej. con: openssl rand -hex 16> \
  META_APP_SECRET=<valor real> \
  OPENAI_API_KEY=<valor real> \
  WHATSAPP_OWNER_NUMBERS=573215879805,573102862373 \
  SITE_URL=https://merylayboutique.com \
  NOTIFICAR_PEDIDO_SECRET=<valor generado, ej. con: openssl rand -hex 16> \
  --project-ref <PROJECT_REF>
```

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles
automáticamente dentro de cualquier Edge Function de este proyecto — no
hace falta volver a declararlos.)

- [ ] **Step 3: Desplegar ambas funciones**

```bash
supabase functions deploy whatsapp-webhook --project-ref <PROJECT_REF>
supabase functions deploy notificar-pedido --project-ref <PROJECT_REF>
```

- [ ] **Step 4: Aplicar la migración del Database Webhook (Task 4)**

Ahora que `notificar-pedido` está desplegada y tiene una URL real,
volver al Task 4, completar `<PROJECT_REF>` y `<ANON_O_SERVICE_KEY>` →
usar el valor de `NOTIFICAR_PEDIDO_SECRET` como ese header, y aplicar esa
migración.

- [ ] **Step 5: Configurar el webhook en Meta for Developers**

En el dashboard de Meta for Developers → WhatsApp → Configuration:
URL de callback = `https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`,
Verify token = el mismo valor de `META_VERIFY_TOKEN` cargado en el Step 2.
Suscribirse al campo `messages`.

- [ ] **Step 6: Prueba de extremo a extremo real**

Desde el número de Elkin: escribir "hola" → debe saludarlo por su nombre.
Desde cualquier otro número: pedir el catálogo → debe llegar un PDF.
Agregar un producto, confirmar pedido → debe llegar un link de pago;
pagar con una tarjeta de prueba de Wompi → debe llegarle a Elkin y a Mary
el aviso de pedido nuevo.

- [ ] **Step 7: Revisar logs**

Usar el Supabase MCP `query_logs` sobre ambas Edge Functions para
confirmar que no hay errores silenciosos en la prueba del Step 6.

- [ ] **Step 8: Commit**

```bash
git add .env.local.example
git commit -m "docs: variables de entorno del agente de WhatsApp"
```
