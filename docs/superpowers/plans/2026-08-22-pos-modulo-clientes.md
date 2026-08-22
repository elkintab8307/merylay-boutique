# Rediseño POS — Módulo de clientes (sub-proyecto 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Excepción de la Task 1**: cambia el esquema de una base de datos de
> producción con datos reales (nueva tabla, columna nueva, backfill,
> `DROP COLUMN`). El **controller ejecuta la Task 1 directamente**, sin
> despachar un subagente implementador — el resto de las tareas (2-9)
> sí siguen el ciclo normal de subagente + revisión. Ver la nota al
> inicio de la Task 1.
>
> **Orden de las tareas**: la Task 2 (páginas de lectura) se hizo
> deliberadamente la primera después del esquema, aunque en el spec
> aparece más adelante — así, apenas termina, `pnpm tsc --noEmit` vuelve
> a estar 100% limpio en todo el repo, en vez de quedar roto en varios
> archivos hasta el final del plan. Después de la Task 2, cada tarea
> solo puede dejar una ventana de error esperado en, como máximo, un
> archivo (documentado en su propio Step de verificación).

**Goal:** Dar al POS un módulo de clientes real: tabla propia
(`pos_customers`, sin necesidad de cuenta/autenticación), selector de
buscar/crear dentro del carrito, migración del flujo de crédito al
mismo modelo, y una página `/pos/clientes` con historial de compras
combinado (POS + tienda online cuando el cliente tiene cuenta).

**Architecture:** Nueva tabla `pos_customers` con vínculo opcional a
`profiles` (autodetectado por teléfono). El selector vive dentro de
`venta-items-editor.tsx` (componente compartido por la terminal y la
edición de ventas) como una sección nueva, mismo patrón que ya usan
descuento/método de pago/crédito. `create_pos_sale`/`update_pos_sale`
ganan `p_customer_id`, reemplazando los campos de texto libre que hoy
usa crédito. Una migración con backfill mueve el historial de crédito
existente al nuevo modelo antes de eliminar las columnas viejas.

**Tech Stack:** Next.js App Router (Server + Client Components),
TypeScript, Supabase (Postgres + RLS vía MCP), Tailwind CSS,
lucide-react, Vitest + Testing Library, zod.

**Spec:** `docs/superpowers/specs/2026-08-22-pos-modulo-clientes-design.md`

## Global Constraints

- `pos_customers` NO requiere cuenta ni autenticación — es una entidad
  interna del POS. RLS: solo `staff`/`admin`/`superadmin`
  (`is_staff_or_above()`), mismo criterio que `pos_sales`.
- El teléfono se guarda siempre normalizado (solo dígitos:
  `v.replace(/\D/g, "")` en TypeScript, `regexp_replace(v, '\D', '',
  'g')` en SQL) — así búsqueda, índice único y vínculo automático no se
  rompen por formato.
- Asignar cliente es **opcional** en ventas normales, **obligatorio**
  en ventas a crédito (igual que hoy exige nombre/teléfono).
- Crear un cliente al vuelo solo exige nombre + teléfono. Cédula y
  dirección son opcionales.
- Vínculo automático a `profiles`: si el teléfono normalizado coincide
  con `profiles.whatsapp` normalizado, se enlaza `profile_id`. Si hay
  más de una coincidencia, se usa la más reciente por `created_at`. La
  consulta a `profiles` para este vínculo usa `createAdminClient()`
  (`src/lib/supabase/admin.ts`) porque la RLS de `profiles`
  (`profiles_select_own_or_superadmin`) no deja que `staff` lea el
  perfil de otro usuario.
- Todo el texto de la UI en español, mensajes de error claros.
- Backfill de crédito histórico: automático, en la misma migración que
  crea el esquema — no se deja como paso manual.
- Íconos: solo `lucide-react`, verificados contra la versión instalada
  antes de usarlos (`Users` ya verificado como existente en
  `lucide-react@1.28.0` para este plan).
- `SidebarSection.items[].icon` (`@/components/admin/backend-sidebar`)
  es siempre `React.ReactNode` — un elemento JSX ya renderizado (ej.
  `<Users className="h-4 w-4 shrink-0" />`), **nunca** una referencia a
  componente sin invocar. Pasar la referencia sin invocar desde un
  Server Component a `BackendSidebar` (Client Component) rompe el
  build de producción — ya ocurrió una vez en el sub-proyecto 1.

---

### Task 1: Esquema, migración de datos y RPCs (ejecutada por el controller)

> **Esta tarea NO se despacha a un subagente implementador.** Cambia el
> esquema de una base de datos de producción con datos reales
> (`DROP COLUMN` incluido) — el controller la ejecuta directamente con
> el MCP de Supabase (`apply_migration`, luego
> `generate_typescript_types`), revisa el resultado él mismo, y recién
> entonces continúa con la Task 2 vía el ciclo normal de subagentes.

**Files:**
- Create: `supabase/migrations/042_pos_customers.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado vía MCP tras
  aplicar la migración)

**Interfaces:**
- Produces: tabla `public.pos_customers (id, nombre, telefono, cedula,
  direccion, profile_id, created_at)`; columna `public.pos_sales.customer_id
  uuid references pos_customers(id)`; RPC
  `create_pos_sale(p_items jsonb, p_payment_method payment_method,
  p_discount numeric default 0, p_customer_id uuid default null,
  p_credit_num_cuotas int default null, p_credit_abono_inicial numeric
  default 0, p_credit_abono_metodo payment_method default null) returns
  pos_sales`; RPC `update_pos_sale(p_sale_id uuid, p_items jsonb,
  p_payment_method payment_method, p_discount numeric default 0,
  p_customer_id uuid default null) returns pos_sales`. Las columnas
  `credit_customer_name`/`credit_customer_phone` de `pos_sales`
  **dejan de existir** tras esta tarea — la Task 2 actualiza todas las
  páginas que las leían.

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/042_pos_customers.sql` con el siguiente
contenido completo:

```sql
-- pos_customers: entidad de cliente propia del POS, sin cuenta ni
-- autenticacion (a diferencia de profiles). Vinculo opcional a una
-- cuenta real de la tienda (profiles) cuando el telefono coincide.
create table public.pos_customers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  cedula text,
  direccion text,
  profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- El telefono se guarda siempre normalizado (solo digitos) desde la
-- aplicacion; este indice es lo que evita crear el mismo cliente dos
-- veces.
create unique index pos_customers_telefono_idx on public.pos_customers(telefono);

alter table public.pos_customers enable row level security;

create policy "pos_customers_staff_access"
  on public.pos_customers for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());

alter table public.pos_sales add column customer_id uuid references public.pos_customers(id);

-- Backfill: crea un pos_customers por cada nombre+telefono distinto ya
-- usado en ventas a credito, vincula esas ventas por customer_id, y
-- vincula automaticamente a profiles cuando el telefono coincide.
do $$
declare
  r record;
  v_customer_id uuid;
  v_telefono_normalizado text;
  v_profile_id uuid;
begin
  for r in
    select distinct credit_customer_name as nombre, credit_customer_phone as telefono
    from public.pos_sales
    where payment_method = 'credito' and credit_customer_name is not null
  loop
    v_telefono_normalizado := regexp_replace(r.telefono, '\D', '', 'g');

    select id into v_profile_id
    from public.profiles
    where regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') = v_telefono_normalizado
      and v_telefono_normalizado <> ''
    order by created_at desc
    limit 1;

    insert into public.pos_customers (nombre, telefono, profile_id)
    values (r.nombre, v_telefono_normalizado, v_profile_id)
    on conflict (telefono) do update set nombre = excluded.nombre
    returning id into v_customer_id;

    update public.pos_sales
    set customer_id = v_customer_id
    where payment_method = 'credito'
      and regexp_replace(credit_customer_phone, '\D', '', 'g') = v_telefono_normalizado;
  end loop;
end $$;

-- Las columnas de texto libre quedan redundantes: la misma informacion
-- ahora vive en pos_customers via customer_id.
alter table public.pos_sales
  drop column credit_customer_name,
  drop column credit_customer_phone;

-- --- create_pos_sale: p_credit_customer_name/phone -> p_customer_id ---

drop function public.create_pos_sale(jsonb, public.payment_method, numeric, text, text, int, numeric, public.payment_method);

create function public.create_pos_sale(
  p_items jsonb,
  p_payment_method public.payment_method,
  p_discount numeric default 0,
  p_customer_id uuid default null,
  p_credit_num_cuotas int default null,
  p_credit_abono_inicial numeric default 0,
  p_credit_abono_metodo public.payment_method default null
)
returns public.pos_sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := auth.uid();
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_qty int;
  v_unit_price numeric(12,2);
  v_available_stock int;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2);
  v_sale_number text;
  v_sale_id uuid;
  v_sale public.pos_sales;
  v_saldo_financiar numeric(12,2);
  v_cuota_monto numeric(12,2);
  v_cuota_residuo numeric(12,2);
  v_i int;
begin
  if v_staff_id is null or not public.is_staff_or_above() then
    raise exception 'No autorizado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;

  if p_payment_method = 'credito' then
    if p_customer_id is null then
      raise exception 'Selecciona el cliente para la venta a credito.';
    end if;
    if p_credit_num_cuotas is null or p_credit_num_cuotas < 1 or p_credit_num_cuotas > 60 then
      raise exception 'El numero de cuotas debe estar entre 1 y 60.';
    end if;
    if p_credit_abono_inicial < 0 then
      raise exception 'El abono inicial no puede ser negativo.';
    end if;
    if p_credit_abono_inicial > 0 and (p_credit_abono_metodo is null or p_credit_abono_metodo = 'credito') then
      raise exception 'Selecciona el metodo de pago del abono inicial.';
    end if;
  end if;

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

  if p_payment_method = 'credito' and p_credit_abono_inicial > v_total then
    raise exception 'El abono inicial no puede superar el total de la venta.';
  end if;

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

  v_sale_number := 'POS-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  while exists (select 1 from public.pos_sales where sale_number = v_sale_number) loop
    v_sale_number := 'POS-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  end loop;

  insert into public.pos_sales (
    sale_number, staff_id, subtotal, discount, total, payment_method, customer_id
  )
  values (
    v_sale_number, v_staff_id, v_subtotal, p_discount, v_total, p_payment_method, p_customer_id
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_price := (v_item->>'unitPrice')::numeric;

    insert into public.pos_sale_items (sale_id, product_id, variant_id, qty, unit_price, line_total)
    values (v_sale_id, v_product_id, v_variant_id, v_qty, v_unit_price, v_qty * v_unit_price);
  end loop;

  if p_payment_method = 'credito' then
    if v_total <= 0 then
      raise exception 'El total de la venta a credito debe ser mayor a cero.';
    end if;

    v_saldo_financiar := v_total - p_credit_abono_inicial;

    if v_saldo_financiar <= 0 then
      insert into public.credit_installments (sale_id, numero, due_date, amount)
      values (v_sale_id, 1, (now() at time zone 'America/Bogota')::date + 15, v_total);
    else
      v_cuota_monto := trunc(v_saldo_financiar / p_credit_num_cuotas, 2);
      if v_cuota_monto <= 0 then
        raise exception 'El saldo a financiar es muy bajo para dividirlo en % cuotas.', p_credit_num_cuotas;
      end if;
      v_cuota_residuo := v_saldo_financiar - (v_cuota_monto * p_credit_num_cuotas);

      for v_i in 1..p_credit_num_cuotas loop
        insert into public.credit_installments (sale_id, numero, due_date, amount)
        values (
          v_sale_id,
          v_i,
          (now() at time zone 'America/Bogota')::date + (15 * v_i),
          case when v_i = p_credit_num_cuotas then v_cuota_monto + v_cuota_residuo else v_cuota_monto end
        );
      end loop;
    end if;

    if p_credit_abono_inicial > 0 then
      insert into public.credit_payments (sale_id, amount, payment_method, staff_id)
      values (v_sale_id, p_credit_abono_inicial, p_credit_abono_metodo, v_staff_id);

      if v_saldo_financiar <= 0 then
        perform public.aplicar_abono_fifo(v_sale_id, p_credit_abono_inicial);
      end if;
    end if;
  end if;

  select * into v_sale from public.pos_sales where id = v_sale_id;
  return v_sale;
end;
$$;

revoke execute on function public.create_pos_sale(jsonb, public.payment_method, numeric, uuid, int, numeric, public.payment_method) from public, anon;
grant execute on function public.create_pos_sale(jsonb, public.payment_method, numeric, uuid, int, numeric, public.payment_method) to authenticated;

-- --- update_pos_sale: agrega p_customer_id ---

drop function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric);

create function public.update_pos_sale(
  p_sale_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_discount numeric default 0,
  p_customer_id uuid default null
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
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;

  perform 1 from public.pos_sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  for v_product_id, v_variant_id, v_qty in
    select product_id, variant_id, qty from public.pos_sale_items where sale_id = p_sale_id
  loop
    if v_variant_id is not null then
      update public.product_variants set stock = stock + v_qty where id = v_variant_id;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
    end if;
  end loop;

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

  update public.pos_sales
  set subtotal = v_subtotal, discount = p_discount, total = v_total,
      payment_method = p_payment_method, customer_id = p_customer_id
  where id = p_sale_id;

  select * into v_sale from public.pos_sales where id = p_sale_id;
  return v_sale;
end;
$$;

revoke execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric, uuid) from public, anon;
grant execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric, uuid) to authenticated;
```

- [ ] **Step 2: Aplicar la migración al proyecto de Supabase**

Usar el MCP de Supabase: `apply_migration` con `name: "pos_customers"` y
el contenido completo de arriba. Confirmar que no reporta errores.

- [ ] **Step 3: Verificar el backfill**

Con el MCP de Supabase (`execute_sql`), correr:

```sql
select count(*) as ventas_credito_sin_customer_id
from public.pos_sales
where payment_method = 'credito' and customer_id is null;
```

Expected: `0` filas (todo crédito histórico quedó vinculado). Si el
resultado no es 0, investigar antes de continuar — no seguir a la
Task 2 con un backfill incompleto.

- [ ] **Step 4: Regenerar los tipos de TypeScript**

Usar el MCP de Supabase (`generate_typescript_types`) y sobrescribir
`src/lib/supabase/database.types.ts` con el resultado completo.

- [ ] **Step 5: Verificar que el resto del código sigue compilando**

Run: `pnpm tsc --noEmit`
Expected: habrá errores en los archivos que todavía usan
`credit_customer_name`/`credit_customer_phone` o los parámetros viejos
del RPC (`sale-action.ts`, `creditos/page.tsx`,
`creditos/[id]/page.tsx`, `venta/[id]/page.tsx`,
`sale-action.test.ts`) — **eso es esperado**, la Task 2 corrige las
páginas de lectura y la Task 4 corrige `sale-action.ts`/su test.
Confirmar que los ÚNICOS errores nuevos son en esos archivos conocidos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/042_pos_customers.sql src/lib/supabase/database.types.ts
git commit -m "feat: esquema de pos_customers y migracion del historial de credito"
```

---

### Task 2: Páginas de lectura leen el cliente vía `pos_customers`

**Files:**
- Modify: `src/app/pos/(admin)/venta/[id]/page.tsx`
- Modify: `src/app/pos/(admin)/creditos/page.tsx`
- Modify: `src/app/pos/(admin)/creditos/[id]/page.tsx`

**Interfaces:**
- Consumes: `pos_sales.customer_id`, tabla `pos_customers` (Task 1).

Esta tarea se hace inmediatamente después de la Task 1, aunque en el
spec el módulo de lectura aparece más adelante — así el repo vuelve a
compilar limpio antes de seguir con el resto de las tareas.

- [ ] **Step 1: Recibo (`venta/[id]/page.tsx`)**

En `src/app/pos/(admin)/venta/[id]/page.tsx`, la consulta de `pos_sales`
ya trae `select("*")`, así que `customer_id` ya viene incluido — no
hace falta tocar esa línea. Agregar, junto a los `Promise.all`
existentes que traen `abonoInicial`/`numCuotas` para crédito, una
consulta del cliente cuando `venta.customer_id` no es null:

Reemplazar el bloque:

```tsx
  const [{ data: items }, { data: abonoInicial }, { count: numCuotas }] = await Promise.all([
```

por:

```tsx
  const [{ data: items }, { data: abonoInicial }, { count: numCuotas }, { data: cliente }] = await Promise.all([
```

Y agregar un quinto elemento al array del `Promise.all` (después del
que trae `numCuotas`, antes del cierre `]);`):

```tsx
    venta.customer_id
      ? supabase.from("pos_customers").select("nombre, telefono").eq("id", venta.customer_id).single()
      : Promise.resolve({ data: null }),
```

Dentro del bloque `{esCredito && (...)}`, reemplazar las líneas que
muestran `venta.credit_customer_name`/`venta.credit_customer_phone`:

```tsx
            <p>Cliente: {venta.credit_customer_name}</p>
            <p>Teléfono: {venta.credit_customer_phone}</p>
```

por:

```tsx
            <p>Cliente: {cliente?.nombre ?? "-"}</p>
            <p>Teléfono: {cliente?.telefono ?? "-"}</p>
```

- [ ] **Step 2: Listado de créditos (`creditos/page.tsx`)**

En `src/app/pos/(admin)/creditos/page.tsx`, cambiar la consulta inicial:

```tsx
  const { data: ventas } = await supabase
    .from("pos_sales")
    .select("id, created_at, total, credit_customer_name, credit_customer_phone")
    .eq("payment_method", "credito")
    .order("created_at", { ascending: false });
```

por:

```tsx
  const { data: ventas } = await supabase
    .from("pos_sales")
    .select("id, created_at, total, customer_id")
    .eq("payment_method", "credito")
    .order("created_at", { ascending: false });
```

Después de calcular `saleIds` (que ya existe), agregar la consulta de
clientes y un mapa por id:

```tsx
  const customerIds = [...new Set((ventas ?? []).map((v) => v.customer_id).filter((id): id is string => Boolean(id)))];
  const { data: clientes } =
    customerIds.length > 0
      ? await supabase.from("pos_customers").select("id, nombre, telefono").in("id", customerIds)
      : { data: [] as { id: string; nombre: string; telefono: string }[] };
  const clientePorId = new Map((clientes ?? []).map((c) => [c.id, c]));
```

En el `map` que arma `filas`, no hace falta cambiar nada (sigue
esparciendo `...venta`). En el JSX de la tabla, reemplazar:

```tsx
                  <Link href={`/pos/creditos/${venta.id}`} className="text-brand-rosa hover:underline">
                    {venta.credit_customer_name}
                  </Link>
                  <p className="text-xs text-brand-ciruela/60">{venta.credit_customer_phone}</p>
```

por:

```tsx
                  <Link href={`/pos/creditos/${venta.id}`} className="text-brand-rosa hover:underline">
                    {clientePorId.get(venta.customer_id ?? "")?.nombre ?? "-"}
                  </Link>
                  <p className="text-xs text-brand-ciruela/60">
                    {clientePorId.get(venta.customer_id ?? "")?.telefono ?? "-"}
                  </p>
```

- [ ] **Step 3: Detalle de crédito (`creditos/[id]/page.tsx`)**

En `src/app/pos/(admin)/creditos/[id]/page.tsx`, cambiar la consulta
inicial:

```tsx
  const { data: venta } = await supabase
    .from("pos_sales")
    .select(
      "id, created_at, total, credit_customer_name, credit_customer_phone, payment_method",
    )
    .eq("id", id)
    .single();
```

por:

```tsx
  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id, created_at, total, customer_id, payment_method")
    .eq("id", id)
    .single();
```

Después del `if (!venta || venta.payment_method !== "credito") { notFound(); }`,
agregar la consulta del cliente:

```tsx
  const { data: cliente } = venta.customer_id
    ? await supabase.from("pos_customers").select("nombre, telefono").eq("id", venta.customer_id).single()
    : { data: null };
```

En el JSX del encabezado, reemplazar:

```tsx
          <h1 className="font-heading text-3xl text-brand-ciruela">
            {venta.credit_customer_name}
          </h1>
          <p className="text-sm text-brand-ciruela/70">{venta.credit_customer_phone}</p>
```

por:

```tsx
          <h1 className="font-heading text-3xl text-brand-ciruela">
            {cliente?.nombre ?? "-"}
          </h1>
          <p className="text-sm text-brand-ciruela/70">{cliente?.telefono ?? "-"}</p>
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: quedan errores SOLO en `sale-action.ts`/`sale-action.test.ts`
(usan los parámetros viejos del RPC — la Task 4 los corrige). Ningún
error en `venta/[id]/page.tsx`, `creditos/page.tsx` ni
`creditos/[id]/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/pos/(admin)/venta/[id]/page.tsx" "src/app/pos/(admin)/creditos/page.tsx" "src/app/pos/(admin)/creditos/[id]/page.tsx"
git commit -m "feat: recibo e historial de credito leen el cliente desde pos_customers"
```

---

### Task 3: Server actions de clientes (buscar, crear)

**Files:**
- Create: `src/app/pos/customer-actions.ts`
- Test: `src/app/pos/__tests__/customer-actions.test.ts`

**Interfaces:**
- Consumes: `createClient()` (`@/lib/supabase/server`),
  `createAdminClient()` (`@/lib/supabase/admin`), tabla `pos_customers`
  (Task 1).
- Produces: `type PosCustomerResult = { id: string; nombre: string;
  telefono: string }`; `buscarClientes(query: string):
  Promise<PosCustomerResult[]>`; `crearCliente(nombre: string, telefono:
  string): Promise<{ cliente?: PosCustomerResult; error?: string }>` —
  usados por la Task 5 (`ClienteSelector`).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/app/pos/__tests__/customer-actions.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

function crearSupabaseMock() {
  const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const or = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ or }));
  const single = vi.fn(() =>
    Promise.resolve({ data: { id: "cust-1", nombre: "Ana", telefono: "3001234567" }, error: null }),
  );
  const insertSelect = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  const from = vi.fn((table: string) => {
    if (table === "pos_customers") return { select, insert };
    return { select };
  });
  return { from, _spies: { select, or, limit, insert, insertSelect, single } };
}

function crearAdminSupabaseMock(profileId: string | null) {
  const limit = vi.fn(() =>
    Promise.resolve({ data: profileId ? [{ id: profileId }] : [], error: null }),
  );
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, _spies: { select, eq, order, limit } };
}

describe("buscarClientes", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con query vacio, retorna [] sin consultar la base de datos", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarClientes } = await import("../customer-actions");
    const resultado = await buscarClientes("   ");

    expect(resultado).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("busca por nombre o telefono con ilike", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarClientes } = await import("../customer-actions");
    await buscarClientes("Ana");

    expect(supabase.from).toHaveBeenCalledWith("pos_customers");
    expect(supabase._spies.or).toHaveBeenCalledWith(
      expect.stringContaining("nombre.ilike.%Ana%"),
    );
  });
});

describe("crearCliente", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza nombre vacio sin llamar a la base de datos", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(crearAdminSupabaseMock(null) as never);

    const { crearCliente } = await import("../customer-actions");
    const resultado = await crearCliente("", "3001234567");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rechaza telefono invalido (menos de 7 digitos) sin llamar a la base de datos", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(crearAdminSupabaseMock(null) as never);

    const { crearCliente } = await import("../customer-actions");
    const resultado = await crearCliente("Ana", "123");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("normaliza el telefono y vincula profile_id si hay coincidencia en profiles.whatsapp", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const adminSupabase = crearAdminSupabaseMock("profile-9");
    vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);

    const { crearCliente } = await import("../customer-actions");
    await crearCliente("Ana Ruiz", "300 123 4567");

    expect(adminSupabase.from).toHaveBeenCalledWith("profiles");
    expect(supabase._spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Ana Ruiz",
        telefono: "3001234567",
        profile_id: "profile-9",
      }),
    );
  });

  it("sin coincidencia en profiles, crea el cliente con profile_id null", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(crearAdminSupabaseMock(null) as never);

    const { crearCliente } = await import("../customer-actions");
    const resultado = await crearCliente("Ana Ruiz", "3001234567");

    expect(supabase._spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: null }),
    );
    expect(resultado).toEqual({
      cliente: { id: "cust-1", nombre: "Ana", telefono: "3001234567" },
    });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm vitest run src/app/pos/__tests__/customer-actions.test.ts`
Expected: FAIL — el módulo `../customer-actions` no existe todavía.

- [ ] **Step 3: Implementar**

Crear `src/app/pos/customer-actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PosCustomerResult = {
  id: string;
  nombre: string;
  telefono: string;
};

function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

export async function buscarClientes(query: string): Promise<PosCustomerResult[]> {
  const trimmed = query.trim().replace(/[%,()]/g, "");
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_customers")
    .select("id, nombre, telefono")
    .or(`nombre.ilike.%${trimmed}%,telefono.ilike.%${trimmed}%`)
    .limit(10);

  return data ?? [];
}

export async function crearCliente(
  nombre: string,
  telefono: string,
): Promise<{ cliente?: PosCustomerResult; error?: string }> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length < 2) {
    return { error: "Ingresa el nombre del cliente." };
  }

  const telefonoNormalizado = normalizarTelefono(telefono);
  if (telefonoNormalizado.length < 7) {
    return { error: "Ingresa un teléfono válido." };
  }

  const adminClient = createAdminClient();
  const { data: perfiles } = await adminClient
    .from("profiles")
    .select("id")
    .eq("whatsapp", telefonoNormalizado)
    .order("created_at", { ascending: false })
    .limit(1);

  const profileId = perfiles?.[0]?.id ?? null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_customers")
    .insert({
      nombre: nombreLimpio,
      telefono: telefonoNormalizado,
      profile_id: profileId,
    })
    .select("id, nombre, telefono")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un cliente con ese teléfono. Búscalo en vez de crearlo de nuevo." };
    }
    return { error: "No se pudo crear el cliente." };
  }

  return { cliente: data };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm vitest run src/app/pos/__tests__/customer-actions.test.ts`
Expected: PASS (7 tests)

**Nota para el implementador**: `profiles.whatsapp` no está
normalizado en la base de datos (se guarda tal cual el cliente lo
escribió al registrarse). El `.eq("whatsapp", telefonoNormalizado)`
de arriba es una simplificación intencional para este paso — si al
correr los tests el mock no calza exactamente con este query builder,
ajusta el mock, no la lógica de negocio descrita.

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/customer-actions.ts src/app/pos/__tests__/customer-actions.test.ts
git commit -m "feat: server actions para buscar y crear clientes del POS"
```

---

### Task 4: `creditoVentaSchema` sin datos de cliente + `sale-action.ts` usa `customerId`

**Files:**
- Modify: `src/lib/validation/credito.ts`
- Modify: `src/lib/validation/__tests__/credito.test.ts`
- Modify: `src/app/pos/sale-action.ts`
- Modify: `src/app/pos/__tests__/sale-action.test.ts`

**Interfaces:**
- Consumes: RPC `create_pos_sale` con `p_customer_id` (Task 1).
- Produces: `CreditoVentaInput = { numCuotas: number; abonoInicial:
  number; abonoInicialMetodo: MetodoAbono | null }` (ya NO tiene
  `clienteNombre`/`clienteTelefono`); `registrarVenta(items,
  paymentMethod, discount, credito, customerId: string | null):
  Promise<{ error?: string }>` — la Task 5 pasa a llamarlo con 5
  argumentos.

- [ ] **Step 1: Actualizar `creditoVentaSchema`**

En `src/lib/validation/credito.ts`, reemplazar el archivo completo por:

```ts
import { z } from "zod";

const METODOS_ABONO = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"] as const;

export const creditoVentaSchema = z
  .object({
    numCuotas: z
      .number()
      .int()
      .min(1, "Debe haber al menos 1 cuota")
      .max(60, "Máximo 60 cuotas"),
    abonoInicial: z.number().min(0, "El abono inicial no puede ser negativo"),
    abonoInicialMetodo: z.enum(METODOS_ABONO).nullable(),
  })
  .refine((data) => data.abonoInicial === 0 || data.abonoInicialMetodo !== null, {
    message: "Selecciona el método de pago del abono inicial",
    path: ["abonoInicialMetodo"],
  });

export type CreditoVentaInput = z.infer<typeof creditoVentaSchema>;

export const abonoSchema = z.object({
  amount: z.number().positive("El monto debe ser mayor a cero"),
  paymentMethod: z.enum(METODOS_ABONO),
});

export type AbonoInput = z.infer<typeof abonoSchema>;
```

- [ ] **Step 2: Actualizar el test de `creditoVentaSchema`**

En `src/lib/validation/__tests__/credito.test.ts`, reemplazar el
archivo completo por:

```ts
import { describe, expect, it } from "vitest";
import { abonoSchema, creditoVentaSchema } from "../credito";

const BASE = {
  numCuotas: 3,
  abonoInicial: 0,
  abonoInicialMetodo: null,
};

describe("creditoVentaSchema", () => {
  it("acepta datos validos sin abono inicial", () => {
    expect(creditoVentaSchema.safeParse(BASE).success).toBe(true);
  });

  it("acepta datos validos con abono inicial y su metodo", () => {
    const resultado = creditoVentaSchema.safeParse({
      ...BASE,
      abonoInicial: 20000,
      abonoInicialMetodo: "efectivo",
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza menos de 1 cuota", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, numCuotas: 0 }).success).toBe(false);
  });

  it("rechaza abono inicial negativo", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, abonoInicial: -1 }).success).toBe(false);
  });

  it("rechaza abono inicial mayor a cero sin metodo de pago", () => {
    const resultado = creditoVentaSchema.safeParse({
      ...BASE,
      abonoInicial: 20000,
      abonoInicialMetodo: null,
    });
    expect(resultado.success).toBe(false);
  });
});

describe("abonoSchema", () => {
  it("acepta un monto positivo con metodo valido", () => {
    expect(abonoSchema.safeParse({ amount: 50000, paymentMethod: "efectivo" }).success).toBe(true);
  });

  it("rechaza un monto de cero o negativo", () => {
    expect(abonoSchema.safeParse({ amount: 0, paymentMethod: "efectivo" }).success).toBe(false);
    expect(abonoSchema.safeParse({ amount: -1, paymentMethod: "efectivo" }).success).toBe(false);
  });

  it("rechaza 'credito' como metodo de pago del abono", () => {
    expect(abonoSchema.safeParse({ amount: 50000, paymentMethod: "credito" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que pasa**

Run: `pnpm vitest run src/lib/validation/__tests__/credito.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 4: Actualizar `registrarVenta` en `sale-action.ts`**

Reemplazar `src/app/pos/sale-action.ts` completo por:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { creditoVentaSchema, type CreditoVentaInput } from "@/lib/validation/credito";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export async function registrarVenta(
  items: LocalCartItem[],
  paymentMethod: PaymentMethod,
  discount: number,
  credito: CreditoVentaInput | null,
  customerId: string | null,
): Promise<{ error?: string }> {
  if (items.length === 0) {
    return { error: "Agrega al menos un producto a la venta." };
  }

  let creditoValidado: CreditoVentaInput | null = null;
  if (paymentMethod === "credito") {
    if (!customerId) {
      return { error: "Selecciona el cliente para la venta a crédito." };
    }
    const parsed = creditoVentaSchema.safeParse(credito);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del crédito." };
    }
    creditoValidado = parsed.data;
  }

  const supabase = await createClient();
  // Los parámetros p_credit_* del RPC son `default null` en Postgres, pero el
  // generador de tipos de Supabase los tipa como `T | undefined` (sin `null`)
  // por tratarse de argumentos opcionales. La aserción de tipo es necesaria
  // para poder enviar `null` explícito, que es lo que el RPC espera cuando
  // la venta no es a crédito o no tiene cliente.
  const { data, error } = await supabase.rpc("create_pos_sale", {
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    p_payment_method: paymentMethod,
    p_discount: discount,
    p_customer_id: customerId,
    p_credit_num_cuotas: creditoValidado?.numCuotas ?? null,
    p_credit_abono_inicial: creditoValidado?.abonoInicial ?? 0,
    p_credit_abono_metodo: creditoValidado?.abonoInicialMetodo ?? null,
  } as Database["public"]["Functions"]["create_pos_sale"]["Args"]);

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar la venta." };
  }

  redirect(`/pos/venta/${data.id}`);
}
```

- [ ] **Step 5: Actualizar `sale-action.test.ts`**

Reemplazar `src/app/pos/__tests__/sale-action.test.ts` completo por:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LocalCartItem } from "@/lib/cart/local-cart";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const ITEMS: LocalCartItem[] = [
  {
    productId: "prod-1",
    variantId: null,
    slug: "pijama",
    name: "Pijama Rosa",
    unitPrice: 50000,
    qty: 2,
    imageUrl: null,
    stock: 10,
  },
];

function crearSupabaseMock() {
  const rpc = vi.fn(() => Promise.resolve({ data: { id: "sale-uuid-1" }, error: null }));
  return { rpc };
}

describe("registrarVenta", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(redirect).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza una venta sin productos sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta([], "efectivo", 0, null, null);

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("venta normal sin cliente: envia p_customer_id null y los campos de credito en null/0", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "efectivo", 0, null, null),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "efectivo",
        p_customer_id: null,
        p_credit_num_cuotas: null,
        p_credit_abono_inicial: 0,
        p_credit_abono_metodo: null,
      }),
    );
  });

  it("venta normal con cliente: envia p_customer_id", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "efectivo", 0, null, "cust-1"),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({ p_customer_id: "cust-1" }),
    );
  });

  it("credito sin cliente: rechaza sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(
      ITEMS,
      "credito",
      0,
      { numCuotas: 3, abonoInicial: 0, abonoInicialMetodo: null },
      null,
    );

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito con abono inicial > 0 sin metodo, rechaza sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(
      ITEMS,
      "credito",
      0,
      { numCuotas: 3, abonoInicial: 20000, abonoInicialMetodo: null },
      "cust-1",
    );

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito valido: llama al RPC con customerId y los campos de credito, y redirige", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(
        ITEMS,
        "credito",
        0,
        { numCuotas: 3, abonoInicial: 20000, abonoInicialMetodo: "efectivo" },
        "cust-1",
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "credito",
        p_customer_id: "cust-1",
        p_credit_num_cuotas: 3,
        p_credit_abono_inicial: 20000,
        p_credit_abono_metodo: "efectivo",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/pos/venta/sale-uuid-1");
  });
});
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `pnpm vitest run src/app/pos/__tests__/sale-action.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: queda un único error esperado, en
`src/app/pos/(admin)/pos-terminal.tsx` (llama a `registrarVenta` con 4
argumentos; ahora requiere 5) — la Task 5 lo corrige. Ningún otro
archivo debería tener errores.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validation/credito.ts src/lib/validation/__tests__/credito.test.ts src/app/pos/sale-action.ts src/app/pos/__tests__/sale-action.test.ts
git commit -m "feat: creditoVentaSchema y registrarVenta usan customerId en vez de nombre/telefono libres"
```

---

### Task 5: `ClienteSelector` y su integración en el carrito (terminal)

**Files:**
- Create: `src/app/pos/cliente-selector.tsx`
- Modify: `src/app/pos/venta-items-editor.tsx`
- Modify: `src/app/pos/(admin)/pos-terminal.tsx`

**Interfaces:**
- Consumes: `buscarClientes`/`crearCliente`/`PosCustomerResult` (Task 3);
  `registrarVenta(items, paymentMethod, discount, credito, customerId)`
  (Task 4).
- Produces: `type ClienteSeleccionado = { id: string; nombre: string;
  telefono: string }`; componente `<ClienteSelector cliente={...}
  onChange={...} requerido={boolean} />`; `VentaItemsEditor` gana un
  prop opcional `clienteInicial?: ClienteSeleccionado | null` y su
  `onGuardar` pasa a recibir un 5º argumento `customerId: string |
  null` — la Task 6 (edición de ventas) consume ambos.

- [ ] **Step 1: Crear el componente `ClienteSelector`**

Crear `src/app/pos/cliente-selector.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buscarClientes, crearCliente, type PosCustomerResult } from "./customer-actions";

export type ClienteSeleccionado = PosCustomerResult;

export function ClienteSelector({
  cliente,
  onChange,
  requerido = false,
}: {
  cliente: ClienteSeleccionado | null;
  onChange: (cliente: ClienteSeleccionado | null) => void;
  requerido?: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<PosCustomerResult[]>([]);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBuscando, startBuscar] = useTransition();
  const [isCreando, startCrear] = useTransition();

  const handleBuscar = () => {
    startBuscar(async () => {
      const encontrados = await buscarClientes(query);
      setResultados(encontrados);
    });
  };

  const handleSeleccionar = (encontrado: PosCustomerResult) => {
    onChange(encontrado);
    setExpandido(false);
    setResultados([]);
    setQuery("");
  };

  const handleCrear = () => {
    setError(null);
    startCrear(async () => {
      const resultado = await crearCliente(nombreNuevo, telefonoNuevo);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      if (resultado.cliente) {
        handleSeleccionar(resultado.cliente);
        setNombreNuevo("");
        setTelefonoNuevo("");
      }
    });
  };

  if (cliente && !expandido) {
    return (
      <div className="flex items-center justify-between rounded-md border border-brand-rosa-claro bg-brand-rosa-claro/20 px-3 py-2 text-sm">
        <div>
          <p className="font-medium text-brand-ciruela">{cliente.nombre}</p>
          <p className="text-xs text-brand-ciruela/60">{cliente.telefono}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="text-brand-rosa hover:underline"
        >
          Cambiar
        </button>
      </div>
    );
  }

  if (!expandido) {
    return (
      <button
        type="button"
        onClick={() => setExpandido(true)}
        className="text-left text-sm text-brand-rosa hover:underline"
      >
        + Agregar cliente{requerido ? " (obligatorio para crédito)" : ""}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-brand-rosa-claro bg-white p-3">
      <p className="text-sm font-semibold text-brand-ciruela">Cliente</p>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
        />
        <Button
          type="button"
          onClick={handleBuscar}
          disabled={isBuscando}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {isBuscando ? "Buscando..." : "Buscar"}
        </Button>
      </div>
      {resultados.length > 0 && (
        <ul className="flex flex-col divide-y divide-brand-rosa-claro rounded-md border border-brand-rosa-claro">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => handleSeleccionar(r)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-rosa-claro/20"
              >
                <span className="text-brand-ciruela">{r.nombre}</span>
                <span className="ml-2 text-xs text-brand-ciruela/60">{r.telefono}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && !isBuscando && resultados.length === 0 && (
        <p className="text-xs text-brand-ciruela/60">Sin resultados.</p>
      )}

      <p className="text-xs font-medium text-brand-ciruela/70">Crear cliente nuevo</p>
      <div className="flex flex-col gap-2">
        <Input
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          placeholder="Nombre"
        />
        <Input
          value={telefonoNuevo}
          onChange={(e) => setTelefonoNuevo(e.target.value)}
          placeholder="Teléfono"
        />
        <Button
          type="button"
          onClick={handleCrear}
          disabled={isCreando}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {isCreando ? "Creando..." : "Crear cliente"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {cliente && (
        <button
          type="button"
          onClick={() => setExpandido(false)}
          className="text-xs text-brand-ciruela/60 hover:underline"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos en este archivo.

- [ ] **Step 3: Integrar en `venta-items-editor.tsx`**

En `src/app/pos/venta-items-editor.tsx`:

Agregar el import:

```tsx
import { ClienteSelector, type ClienteSeleccionado } from "./cliente-selector";
```

Cambiar la firma del componente para agregar `clienteInicial` y ajustar
`onGuardar`:

```tsx
export function VentaItemsEditor({
  itemsIniciales = [],
  discountInicial = 0,
  paymentMethodInicial = "efectivo",
  clienteInicial = null,
  mostrarDescuento = true,
  mostrarMetodoPago = true,
  permitirCredito = true,
  textoBoton,
  textoBotonEnviando,
  onGuardar,
}: {
  itemsIniciales?: LocalCartItem[];
  discountInicial?: number;
  paymentMethodInicial?: PaymentMethod;
  clienteInicial?: ClienteSeleccionado | null;
  mostrarDescuento?: boolean;
  mostrarMetodoPago?: boolean;
  permitirCredito?: boolean;
  textoBoton: string;
  textoBotonEnviando: string;
  onGuardar: (
    items: LocalCartItem[],
    paymentMethod: PaymentMethod,
    discount: number,
    credito: CreditoVentaInput | null,
    customerId: string | null,
  ) => Promise<{ error?: string } | void>;
}) {
```

Agregar el estado del cliente junto a los demás `useState` (después de
`abonoInicialMetodo`):

```tsx
  const [cliente, setCliente] = useState<ClienteSeleccionado | null>(clienteInicial);
```

En `handleSubmit`, agregar la validación de cliente obligatorio para
crédito (dentro del bloque `if (esCredito) { ... }`, antes de la
validación de `numCuotas` que ya existe):

```tsx
    if (esCredito) {
      if (!cliente) {
        setError("Selecciona el cliente para la venta a crédito.");
        return;
      }
      if (numCuotas < 1) {
```

Y en la llamada a `onGuardar` dentro de `startSubmit`, agregar el 5º
argumento:

```tsx
      const result = await onGuardar(items, paymentMethod, discount, credito, cliente?.id ?? null);
```

Por último, agregar el componente `<ClienteSelector>` en el JSX, justo
antes del bloque `{esCredito && (...)}` (después del `<select>` de
método de pago):

```tsx
        <ClienteSelector
          cliente={cliente}
          onChange={setCliente}
          requerido={esCredito}
        />

        {esCredito && (
```

- [ ] **Step 4: Actualizar `pos-terminal.tsx`**

En `src/app/pos/(admin)/pos-terminal.tsx`, cambiar la llamada a
`onGuardar` para pasar el 5º argumento:

```tsx
"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import { registrarVenta } from "@/app/pos/sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount, credito, customerId) =>
        registrarVenta(items, paymentMethod, discount, credito, customerId)
      }
    />
  );
}
```

- [ ] **Step 5: Verificar que compila y que los tests existentes pasan**

Run: `pnpm tsc --noEmit`
Expected: quedan errores SOLO en
`editar-venta-form.tsx`/`actions.ts` de la edición de ventas (siguen
usando la firma vieja de `onGuardar`/`actualizarVenta`) — la Task 6 los
corrige. Ningún otro error.

Run: `pnpm vitest run`
Expected: toda la suite pasa.

- [ ] **Step 6: Commit**

```bash
git add src/app/pos/cliente-selector.tsx src/app/pos/venta-items-editor.tsx "src/app/pos/(admin)/pos-terminal.tsx"
git commit -m "feat: selector de cliente en el carrito de la terminal POS"
```

---

### Task 6: Cliente en la edición de ventas (`update_pos_sale`)

**Files:**
- Modify: `src/app/pos/(admin)/venta/[id]/editar/editar-venta-form.tsx`
- Modify: `src/app/pos/(admin)/venta/[id]/editar/actions.ts`
- Modify: `src/app/pos/(admin)/venta/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `ClienteSeleccionado` (Task 5), RPC `update_pos_sale` con
  `p_customer_id` (Task 1).
- Produces: `actualizarVenta(saleId, items, paymentMethod, discount,
  customerId: string | null): Promise<{ error?: string }>`.

- [ ] **Step 1: Actualizar `actualizarVenta`**

En `src/app/pos/(admin)/venta/[id]/editar/actions.ts`, reemplazar el
archivo completo por:

```ts
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
  customerId: string | null,
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
    p_customer_id: customerId,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo actualizar la venta." };
  }

  redirect(`/pos/venta/${data.id}`);
}
```

- [ ] **Step 2: Actualizar `EditarVentaForm`**

En `src/app/pos/(admin)/venta/[id]/editar/editar-venta-form.tsx`,
reemplazar el archivo completo por:

```tsx
"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import type { ClienteSeleccionado } from "@/app/pos/cliente-selector";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { Database } from "@/lib/supabase/database.types";
import { actualizarVenta } from "./actions";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export function EditarVentaForm({
  saleId,
  itemsIniciales,
  discountInicial,
  paymentMethodInicial,
  clienteInicial,
}: {
  saleId: string;
  itemsIniciales: LocalCartItem[];
  discountInicial: number;
  paymentMethodInicial: PaymentMethod;
  clienteInicial: ClienteSeleccionado | null;
}) {
  return (
    <VentaItemsEditor
      itemsIniciales={itemsIniciales}
      discountInicial={discountInicial}
      paymentMethodInicial={paymentMethodInicial}
      clienteInicial={clienteInicial}
      permitirCredito={false}
      textoBoton="Guardar cambios"
      textoBotonEnviando="Guardando..."
      onGuardar={(items, paymentMethod, discount, _credito, customerId) =>
        actualizarVenta(saleId, items, paymentMethod, discount, customerId)
      }
    />
  );
}
```

- [ ] **Step 3: Traer el cliente actual de la venta en `page.tsx`**

En `src/app/pos/(admin)/venta/[id]/editar/page.tsx`, cambiar la consulta
inicial de `pos_sales` para incluir `customer_id`:

```tsx
  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id, discount, payment_method, customer_id")
    .eq("id", id)
    .single();
```

Después del bloque que arma `itemsIniciales` (antes del `return`),
agregar la consulta del cliente y pasarlo a `EditarVentaForm`:

```tsx
  const { data: clienteData } = venta.customer_id
    ? await supabase
        .from("pos_customers")
        .select("id, nombre, telefono")
        .eq("id", venta.customer_id)
        .single()
    : { data: null };
```

Y actualizar el JSX para pasar `clienteInicial={clienteData}` a
`<EditarVentaForm>`:

```tsx
        <EditarVentaForm
          saleId={venta.id}
          itemsIniciales={itemsIniciales}
          discountInicial={venta.discount}
          paymentMethodInicial={venta.payment_method}
          clienteInicial={clienteData}
        />
```

- [ ] **Step 4: Verificar que compila y que la suite completa pasa**

Run: `pnpm tsc --noEmit`
Expected: sin errores en todo el repo.

Run: `pnpm vitest run`
Expected: todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add "src/app/pos/(admin)/venta/[id]/editar/editar-venta-form.tsx" "src/app/pos/(admin)/venta/[id]/editar/actions.ts" "src/app/pos/(admin)/venta/[id]/editar/page.tsx"
git commit -m "feat: la edicion de ventas POS permite asignar/cambiar el cliente"
```

---

### Task 7: Página `/pos/clientes` (listado)

**Files:**
- Create: `src/app/pos/(admin)/clientes/page.tsx`

**Interfaces:**
- Consumes: tabla `pos_customers` (Task 1).

- [ ] **Step 1: Crear la página de listado**

Crear `src/app/pos/(admin)/clientes/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

export default async function ClientesPage({
  searchParams,
}: PageProps<"/pos/clientes">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const supabase = await createClient();
  const base = supabase
    .from("pos_customers")
    .select("id, nombre, telefono, profile_id")
    .order("nombre");

  const { data: clientes } = query
    ? await base.or(`nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
    : await base.limit(50);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Clientes</h1>
      <form className="mb-4 flex gap-2" action="/pos/clientes">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o teléfono"
          className="w-full rounded-md border border-brand-rosa-claro px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-rosa px-4 py-2 text-sm text-brand-crema hover:bg-brand-rosa/90"
        >
          Buscar
        </button>
      </form>
      {(clientes ?? []).length === 0 ? (
        <p className="text-brand-ciruela/70">No hay clientes para mostrar.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Nombre</TableHeaderCell>
              <TableHeaderCell>Teléfono</TableHeaderCell>
              <TableHeaderCell>Cuenta vinculada</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(clientes ?? []).map((cliente) => (
              <TableRow key={cliente.id}>
                <TableCell>
                  <Link href={`/pos/clientes/${cliente.id}`} className="text-brand-rosa hover:underline">
                    {cliente.nombre}
                  </Link>
                </TableCell>
                <TableCell>{cliente.telefono}</TableCell>
                <TableCell>{cliente.profile_id ? "Sí" : "No"}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/pos/(admin)/clientes/page.tsx"
git commit -m "feat: pagina de listado de clientes del POS"
```

---

### Task 8: Página `/pos/clientes/[id]` (detalle, edición, historial combinado)

**Files:**
- Create: `src/app/pos/(admin)/clientes/[id]/page.tsx`
- Create: `src/app/pos/(admin)/clientes/[id]/editar-cliente-form.tsx`
- Create: `src/app/pos/(admin)/clientes/[id]/actions.ts`

**Interfaces:**
- Consumes: `pos_customers`, `pos_sales`, `orders`, `createAdminClient()`
  (Task 1 + existente).

- [ ] **Step 1: Server action para actualizar el cliente**

Crear `src/app/pos/(admin)/clientes/[id]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function actualizarCliente(
  id: string,
  datos: { nombre: string; telefono: string; cedula: string; direccion: string },
): Promise<{ error?: string }> {
  const nombre = datos.nombre.trim();
  if (nombre.length < 2) {
    return { error: "Ingresa el nombre del cliente." };
  }

  const telefonoNormalizado = datos.telefono.replace(/\D/g, "");
  if (telefonoNormalizado.length < 7) {
    return { error: "Ingresa un teléfono válido." };
  }

  const adminClient = createAdminClient();
  const { data: perfiles } = await adminClient
    .from("profiles")
    .select("id")
    .eq("whatsapp", telefonoNormalizado)
    .order("created_at", { ascending: false })
    .limit(1);

  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_customers")
    .update({
      nombre,
      telefono: telefonoNormalizado,
      cedula: datos.cedula.trim() || null,
      direccion: datos.direccion.trim() || null,
      profile_id: perfiles?.[0]?.id ?? null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe otro cliente con ese teléfono." };
    }
    return { error: "No se pudo actualizar el cliente." };
  }

  revalidatePath(`/pos/clientes/${id}`);
  return {};
}
```

- [ ] **Step 2: Formulario de edición (client component)**

Crear `src/app/pos/(admin)/clientes/[id]/editar-cliente-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { actualizarCliente } from "./actions";

export function EditarClienteForm({
  id,
  clienteInicial,
}: {
  id: string;
  clienteInicial: { nombre: string; telefono: string; cedula: string | null; direccion: string | null };
}) {
  const [nombre, setNombre] = useState(clienteInicial.nombre);
  const [telefono, setTelefono] = useState(clienteInicial.telefono);
  const [cedula, setCedula] = useState(clienteInicial.cedula ?? "");
  const [direccion, setDireccion] = useState(clienteInicial.direccion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleGuardar = () => {
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const resultado = await actualizarCliente(id, { nombre, telefono, cedula, direccion });
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
      <div>
        <label htmlFor="nombre" className="text-sm text-brand-ciruela">Nombre</label>
        <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div>
        <label htmlFor="telefono" className="text-sm text-brand-ciruela">Teléfono</label>
        <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </div>
      <div>
        <label htmlFor="cedula" className="text-sm text-brand-ciruela">Cédula (opcional)</label>
        <Input id="cedula" value={cedula} onChange={(e) => setCedula(e.target.value)} />
      </div>
      <div>
        <label htmlFor="direccion" className="text-sm text-brand-ciruela">Dirección (opcional)</label>
        <Input id="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {guardado && !error && <p className="text-sm text-emerald-600">Cambios guardados.</p>}
      <Button
        type="button"
        onClick={handleGuardar}
        disabled={isPending}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Página de detalle con historial combinado**

Crear `src/app/pos/(admin)/clientes/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/format";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { EditarClienteForm } from "./editar-cliente-form";

type MovimientoHistorial = {
  id: string;
  tipo: "pos" | "tienda";
  fecha: string;
  total: number;
  href: string;
};

export default async function ClienteDetallePage({
  params,
}: PageProps<"/pos/clientes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("pos_customers")
    .select("id, nombre, telefono, cedula, direccion, profile_id")
    .eq("id", id)
    .single();

  if (!cliente) {
    notFound();
  }

  const { data: ventasPos } = await supabase
    .from("pos_sales")
    .select("id, created_at, total")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  let pedidosTienda: { id: string; created_at: string; total: number }[] = [];
  if (cliente.profile_id) {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("orders")
      .select("id, created_at, total")
      .eq("user_id", cliente.profile_id)
      .order("created_at", { ascending: false });
    pedidosTienda = data ?? [];
  }

  const historial: MovimientoHistorial[] = [
    ...(ventasPos ?? []).map((v) => ({
      id: v.id,
      tipo: "pos" as const,
      fecha: v.created_at,
      total: v.total,
      href: `/pos/venta/${v.id}`,
    })),
    ...pedidosTienda.map((p) => ({
      id: p.id,
      tipo: "tienda" as const,
      fecha: p.created_at,
      total: p.total,
      href: `/admin/pedidos/${p.id}`,
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/pos/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a clientes
      </Link>
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">{cliente.nombre}</h1>

      <div className="mb-8">
        <EditarClienteForm
          id={cliente.id}
          clienteInicial={{
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            cedula: cliente.cedula,
            direccion: cliente.direccion,
          }}
        />
      </div>

      <h2 className="mb-4 font-heading text-xl text-brand-ciruela">Historial de compras</h2>
      {historial.length === 0 ? (
        <p className="text-brand-ciruela/70">Este cliente todavía no tiene compras registradas.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Origen</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {historial.map((mov) => (
              <TableRow key={`${mov.tipo}-${mov.id}`}>
                <TableCell className="whitespace-nowrap">
                  {new Date(mov.fecha).toLocaleDateString("es-CO")}
                </TableCell>
                <TableCell>
                  <Link href={mov.href} className="text-brand-rosa hover:underline">
                    {mov.tipo === "pos" ? "POS" : "Tienda online"}
                  </Link>
                </TableCell>
                <TableCell>{formatPrice(mov.total)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/pos/(admin)/clientes/[id]/page.tsx" "src/app/pos/(admin)/clientes/[id]/editar-cliente-form.tsx" "src/app/pos/(admin)/clientes/[id]/actions.ts"
git commit -m "feat: pagina de detalle de cliente con edicion e historial combinado"
```

---

### Task 9: Ícono en el sidebar y el botón "Cliente" de la barra superior

**Files:**
- Modify: `src/app/pos/(admin)/layout.tsx`
- Modify: `src/components/pos/pos-top-bar.tsx`

**Interfaces:**
- Consumes: rutas creadas en las Tasks 7-8 (`/pos/clientes`).

- [ ] **Step 1: Agregar "Clientes" al sidebar**

En `src/app/pos/(admin)/layout.tsx`, agregar el import de `Users` a la
línea existente de lucide-react:

```tsx
import { Store, Receipt, CreditCard, Users, LayoutDashboard } from "lucide-react";
```

Y agregar el ítem a la sección "POS" existente (después de "Créditos"):

```tsx
      items: [
        { href: "/pos", label: "Terminal", icon: <Store className="h-4 w-4 shrink-0" /> },
        { href: "/pos/ventas", label: "Ventas POS", icon: <Receipt className="h-4 w-4 shrink-0" /> },
        { href: "/pos/creditos", label: "Créditos", icon: <CreditCard className="h-4 w-4 shrink-0" /> },
        { href: "/pos/clientes", label: "Clientes", icon: <Users className="h-4 w-4 shrink-0" /> },
      ],
```

(el `icon` debe seguir siendo un elemento JSX pre-renderizado, nunca la
referencia al componente sin invocar — ver Global Constraints.)

- [ ] **Step 2: El botón "Cliente" de la barra superior enlaza a `/pos/clientes`**

En `src/components/pos/pos-top-bar.tsx`, agregar el import de `Link` y
`Users`:

```tsx
import Link from "next/link";
import { Users } from "lucide-react";
```

Y agregar un `<Link>` dentro del `<div className="flex items-center gap-3">`,
antes de `<ImprimirUltimoReciboButton />`:

```tsx
      <div className="flex items-center gap-3">
        <Link
          href="/pos/clientes"
          className="inline-flex items-center gap-1.5 rounded-md border border-brand-rosa-claro px-3 py-1.5 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
        >
          <Users className="h-4 w-4" />
          Clientes
        </Link>
        <ImprimirUltimoReciboButton />
```

- [ ] **Step 3: Verificar que compila y que el build de producción funciona**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

Antes de correr `pnpm build`, detener cualquier `pnpm dev` corriendo en
este worktree (`tasklist /FI "IMAGENAME eq node.exe"`, mismo patrón
usado en el sub-proyecto 1).

Run: `pnpm build`
Expected: build exitoso, todas las rutas del POS (incluidas
`/pos/clientes` y `/pos/clientes/[id]`) prerenderizan sin error.

Run: `pnpm vitest run`
Expected: toda la suite pasa (incluye todos los tests nuevos de las
Tasks 3, 4).

- [ ] **Step 4: Commit**

```bash
git add "src/app/pos/(admin)/layout.tsx" src/components/pos/pos-top-bar.tsx
git commit -m "feat: icono Clientes en el sidebar y enlace desde la barra superior del POS"
```

---

## Nota de verificación manual (no automatizable en esta sesión)

Igual que en el sub-proyecto 1: `/pos/**` requiere sesión autenticada de
`staff`/`admin`/`superadmin`, y el manejo en texto plano de la
contraseña del superadmin está prohibido en esta sesión. La
verificación visual final — que el selector de cliente, el listado y
el detalle se vean y funcionen como se espera en un navegador real —
la hace el usuario en el preview desplegado.
