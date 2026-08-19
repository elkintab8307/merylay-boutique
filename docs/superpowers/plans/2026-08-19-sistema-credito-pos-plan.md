# Sistema de crédito para el POS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir vender a crédito desde el POS (cliente, cuotas, abono
inicial opcional), gestionar los abonos hasta saldar la deuda desde una
sección nueva accesible a staff, y reconocer el ingreso de un crédito en
Informes en el momento del abono (no de la venta).

**Architecture:** Se extiende `pos_sales` (nuevo valor `'credito'` del enum
`payment_method`, dos columnas de cliente) en vez de crear un sistema
paralelo. Dos tablas nuevas (`credit_installments`, `credit_payments`)
enlazadas a `pos_sales.id`. `create_pos_sale` se extiende con parámetros
opcionales de crédito; una función nueva `registrar_abono_credito` aplica
cada abono con reparto FIFO sobre las cuotas. Los tres informes de ingresos
existentes se ajustan para excluir el total de una venta a crédito y sumar
en su lugar cada abono, fechado el día que se recibe.

**Tech Stack:** Next.js App Router (Server Components + Server Actions),
Supabase Postgres/RLS vía MCP, react-hook-form + zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md`

## Global Constraints

- Todo el producto (UI, mensajes) en español.
- `payment_method` gana el valor `'credito'`; nunca es válido como
  `credit_payments.payment_method` (un abono siempre tiene un método real).
- El saldo de un crédito nunca se almacena: siempre se calcula como
  `pos_sales.total - sum(credit_payments.amount)` para esa venta.
- Stock se descuenta de inmediato al vender a crédito, igual que cualquier
  venta del POS (ya decidido en brainstorming, no es un caso especial).
- Reparto de abonos: FIFO contra la cuota pendiente más antigua (ver spec
  §4.3). Toda cuota nueva usa `check (amount > 0)` — el caso "abono inicial
  cubre el 100%" genera una sola cuota simbólica ya pagada, nunca N cuotas
  de $0 (spec §4.2 paso 4).
- Edición de una venta a crédito (`update_pos_sale`) queda bloqueada por
  completo, sin excepción, tanto en el RPC como en la página.
- La sección de gestión de créditos vive bajo `/pos/**` (no `/admin/**`)
  porque staff debe poder registrar abonos — mismo patrón ya usado por
  "Ventas POS" (`src/app/pos/(admin)/ventas/page.tsx`, sin `requireAdmin()`,
  protegido solo por RLS `is_staff_or_above()`).
- Informes de ingreso (`informe_ventas_serie`, `informe_metodos_pago`,
  `informe_ganancia_serie`) excluyen el `total` de una venta a crédito y
  suman en su lugar cada `credit_payments.amount`, fechado por
  `credit_payments.created_at`. `informe_productos_vendidos` NO cambia
  (fuera de alcance, spec §6.2 — no reatribuye ingreso a nivel de línea de
  producto).
- La lógica de negocio en SQL (reparto FIFO, generación de cuotas) no tiene
  equivalente TypeScript, así que no hay test de Vitest para ella — se
  verifica con consultas `execute_sql` explícitas dentro de la misma tarea
  que la crea (pasos "Verificar"), igual criterio que el resto de RPCs de
  este proyecto (no hay suite pgTAP). La suite de Vitest cubre las
  funciones TypeScript puras y los Server Actions con mocks.
- Migraciones vía `mcp__supabase__apply_migration`; tipos regenerados vía
  `mcp__supabase__generate_typescript_types` y escritos completos a
  `src/lib/supabase/database.types.ts`.
- Si `pnpm tsc --noEmit` señala que `PageProps<"/pos/creditos">` (o
  cualquier ruta nueva de este plan) no existe, ejecuta `pnpm dev` unos
  segundos (o `pnpm build`) para que Next.js regenere `.next/types`, luego
  repite `tsc`.

---

## Task 1: Migración de esquema — tablas y columnas del sistema de crédito

**Por qué son dos migraciones y no una:** Postgres no permite usar un
valor de enum recién agregado con `ALTER TYPE ... ADD VALUE` dentro de la
misma transacción en que se agregó (falla con "unsafe use of new value of
enum type") — y el `check (payment_method <> 'credito')` de
`credit_payments` sí lo usa (la cadena `'credito'` se resuelve contra el
enum al crear la tabla). Cada migración de este proyecto corre en su
propia transacción, así que el valor nuevo necesita quedar confirmado
antes de que otra migración lo use.

**Files:**
- Create: `supabase/migrations/032_credito_enum_value.sql`
- Create: `supabase/migrations/033_sistema_credito_schema.sql`

**Interfaces:**
- Produces: valor de enum `'credito'` en `public.payment_method`; columnas
  `pos_sales.credit_customer_name text`, `pos_sales.credit_customer_phone
  text`; enum `public.credit_installment_status` (`pendiente`, `parcial`,
  `pagada`); tabla `public.credit_installments(id, sale_id, numero,
  due_date, amount, paid_amount, status)`; tabla
  `public.credit_payments(id, sale_id, amount, payment_method, staff_id,
  created_at)`.

- [ ] **Paso 1: Escribir y aplicar `032_credito_enum_value.sql`**

```sql
-- Solo agrega el valor del enum, en su propia migracion/transaccion: un
-- check constraint que lo use (033_sistema_credito_schema.sql) no puede
-- ir en la misma transaccion que lo agrega. Ver
-- docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md.
alter type public.payment_method add value 'credito';
```

Usa `mcp__supabase__apply_migration` con `name: "credito_enum_value"`.

- [ ] **Paso 2: Verificar el paso 1**

Con `mcp__supabase__execute_sql`:

```sql
select enum_range(null::public.payment_method);
-- debe incluir 'credito'
```

- [ ] **Paso 3: Commit del paso 1**

```bash
git add supabase/migrations/032_credito_enum_value.sql
git commit -m "feat: agrega el valor 'credito' al enum payment_method"
```

- [ ] **Paso 4: Escribir `033_sistema_credito_schema.sql`**

```sql
-- Esquema del sistema de credito para el POS: venta con pago diferido en
-- cuotas. Requiere que 032_credito_enum_value.sql ya este aplicado (usa
-- el valor 'credito' en un check constraint). Ver
-- docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md.

alter table public.pos_sales
  add column credit_customer_name text,
  add column credit_customer_phone text;

create type public.credit_installment_status as enum ('pendiente', 'parcial', 'pagada');

create table public.credit_installments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  numero int not null check (numero > 0),
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status public.credit_installment_status not null default 'pendiente',
  unique (sale_id, numero)
);

create index credit_installments_sale_id_idx on public.credit_installments(sale_id);
create index credit_installments_due_date_idx on public.credit_installments(due_date) where status <> 'pagada';

create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  staff_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint credit_payments_method_not_credito check (payment_method <> 'credito')
);

create index credit_payments_sale_id_idx on public.credit_payments(sale_id);

alter table public.credit_installments enable row level security;
alter table public.credit_payments enable row level security;

create policy "credit_installments_staff_access"
  on public.credit_installments for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());

create policy "credit_payments_staff_access"
  on public.credit_payments for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());
```

- [ ] **Paso 5: Aplicar la migración**

Usa `mcp__supabase__apply_migration` con `name: "sistema_credito_schema"`.

- [ ] **Paso 6: Verificar**

Con `mcp__supabase__execute_sql`, ejecuta y confirma:

```sql
select column_name from information_schema.columns
where table_name = 'pos_sales'
  and column_name in ('credit_customer_name', 'credit_customer_phone');
-- 2 filas

select table_name from information_schema.tables
where table_name in ('credit_installments', 'credit_payments');
-- 2 filas
```

- [ ] **Paso 7: Commit**

```bash
git add supabase/migrations/033_sistema_credito_schema.sql
git commit -m "feat: esquema del sistema de credito para el POS"
```

---

## Task 2: RPCs de venta — crear a crédito, registrar abono, bloquear edición

**Files:**
- Create: `supabase/migrations/034_sistema_credito_rpc.sql`

**Interfaces:**
- Consumes: tablas y enum de Task 1.
- Produces: función `public.aplicar_abono_fifo(p_sale_id uuid, p_monto
  numeric) returns void` (interna, sin grant a `authenticated`);
  `public.create_pos_sale(...)` con firma extendida (5 parámetros nuevos,
  todos con default, así que las llamadas existentes sin ellos siguen
  funcionando); `public.registrar_abono_credito(p_sale_id uuid, p_amount
  numeric, p_payment_method payment_method) returns credit_payments`;
  `public.update_pos_sale(...)` que ahora rechaza ventas con
  `payment_method = 'credito'`.

- [ ] **Paso 1: Escribir la migración**

```sql
-- RPCs del sistema de credito. Ver
-- docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md §4.

-- Reparto FIFO compartido entre create_pos_sale (abono inicial) y
-- registrar_abono_credito (abonos posteriores). No se expone a
-- "authenticated": solo se llama desde otras funciones SECURITY DEFINER,
-- que ejecutan como el rol dueño de la funcion (bypassa el chequeo de
-- grant). Revocarla de authenticated impide que se llame directamente
-- saltandose la validacion de saldo de registrar_abono_credito.
create or replace function public.aplicar_abono_fifo(p_sale_id uuid, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restante numeric(12,2) := p_monto;
  v_cuota record;
  v_aplicado numeric(12,2);
begin
  for v_cuota in
    select id, amount, paid_amount
    from public.credit_installments
    where sale_id = p_sale_id and status <> 'pagada'
    order by numero
    for update
  loop
    exit when v_restante <= 0;

    v_aplicado := least(v_restante, v_cuota.amount - v_cuota.paid_amount);

    update public.credit_installments
    set paid_amount = paid_amount + v_aplicado,
        status = case when paid_amount + v_aplicado >= amount then 'pagada' else 'parcial' end
    where id = v_cuota.id;

    v_restante := v_restante - v_aplicado;
  end loop;
end;
$$;

revoke execute on function public.aplicar_abono_fifo(uuid, numeric) from public, anon, authenticated;

-- create_pos_sale extendido: 5 parametros nuevos, todos con default, para
-- no romper las llamadas existentes (venta normal, sin credito).
create or replace function public.create_pos_sale(
  p_items jsonb,
  p_payment_method public.payment_method,
  p_discount numeric default 0,
  p_credit_customer_name text default null,
  p_credit_customer_phone text default null,
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
    if coalesce(trim(p_credit_customer_name), '') = '' then
      raise exception 'Ingresa el nombre del cliente para la venta a credito.';
    end if;
    if coalesce(trim(p_credit_customer_phone), '') = '' then
      raise exception 'Ingresa el telefono del cliente para la venta a credito.';
    end if;
    if p_credit_num_cuotas is null or p_credit_num_cuotas < 1 then
      raise exception 'El numero de cuotas debe ser al menos 1.';
    end if;
    if p_credit_abono_inicial < 0 then
      raise exception 'El abono inicial no puede ser negativo.';
    end if;
    if p_credit_abono_inicial > 0 and (p_credit_abono_metodo is null or p_credit_abono_metodo = 'credito') then
      raise exception 'Selecciona el metodo de pago del abono inicial.';
    end if;
  end if;

  -- Verificar stock, bloqueando filas para evitar sobreventa concurrente.
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

  -- Descontar stock
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
    sale_number, staff_id, subtotal, discount, total, payment_method,
    credit_customer_name, credit_customer_phone
  )
  values (
    v_sale_number, v_staff_id, v_subtotal, p_discount, v_total, p_payment_method,
    case when p_payment_method = 'credito' then trim(p_credit_customer_name) else null end,
    case when p_payment_method = 'credito' then trim(p_credit_customer_phone) else null end
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
    v_saldo_financiar := v_total - p_credit_abono_inicial;

    if v_saldo_financiar <= 0 then
      -- El abono inicial cubre el 100% del total: una sola cuota
      -- simbolica (check (amount > 0) impide generar cuotas de $0), que el
      -- reparto FIFO de abajo marca 'pagada' de inmediato.
      insert into public.credit_installments (sale_id, numero, due_date, amount)
      values (v_sale_id, 1, current_date + 30, v_total);
    else
      v_cuota_monto := trunc(v_saldo_financiar / p_credit_num_cuotas, 2);
      v_cuota_residuo := v_saldo_financiar - (v_cuota_monto * p_credit_num_cuotas);

      for v_i in 1..p_credit_num_cuotas loop
        insert into public.credit_installments (sale_id, numero, due_date, amount)
        values (
          v_sale_id,
          v_i,
          current_date + (30 * v_i),
          case when v_i = p_credit_num_cuotas then v_cuota_monto + v_cuota_residuo else v_cuota_monto end
        );
      end loop;
    end if;

    if p_credit_abono_inicial > 0 then
      insert into public.credit_payments (sale_id, amount, payment_method, staff_id)
      values (v_sale_id, p_credit_abono_inicial, p_credit_abono_metodo, v_staff_id);

      perform public.aplicar_abono_fifo(v_sale_id, p_credit_abono_inicial);
    end if;
  end if;

  select * into v_sale from public.pos_sales where id = v_sale_id;
  return v_sale;
end;
$$;

revoke execute on function public.create_pos_sale(jsonb, public.payment_method, numeric, text, text, int, numeric, public.payment_method) from public, anon;
grant execute on function public.create_pos_sale(jsonb, public.payment_method, numeric, text, text, int, numeric, public.payment_method) to authenticated;

-- Registrar un abono contra un credito existente.
create or replace function public.registrar_abono_credito(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method
)
returns public.credit_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := auth.uid();
  v_payment_method public.payment_method;
  v_total numeric(12,2);
  v_pagado numeric(12,2);
  v_saldo numeric(12,2);
  v_payment public.credit_payments;
begin
  if v_staff_id is null or not public.is_staff_or_above() then
    raise exception 'No autorizado.';
  end if;

  if p_payment_method = 'credito' then
    raise exception 'El metodo de pago del abono no puede ser "credito".';
  end if;

  if p_amount <= 0 then
    raise exception 'El monto del abono debe ser mayor a cero.';
  end if;

  select payment_method, total into v_payment_method, v_total
  from public.pos_sales where id = p_sale_id for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_payment_method <> 'credito' then
    raise exception 'Esta venta no es un credito.';
  end if;

  select coalesce(sum(amount), 0) into v_pagado
  from public.credit_payments where sale_id = p_sale_id;

  v_saldo := v_total - v_pagado;

  if p_amount > v_saldo then
    raise exception 'El abono no puede superar el saldo pendiente (%).', v_saldo;
  end if;

  insert into public.credit_payments (sale_id, amount, payment_method, staff_id)
  values (p_sale_id, p_amount, p_payment_method, v_staff_id)
  returning * into v_payment;

  perform public.aplicar_abono_fifo(p_sale_id, p_amount);

  return v_payment;
end;
$$;

revoke execute on function public.registrar_abono_credito(uuid, numeric, public.payment_method) from public, anon;
grant execute on function public.registrar_abono_credito(uuid, numeric, public.payment_method) to authenticated;

-- update_pos_sale: bloquea por completo la edicion de una venta a
-- credito (en cualquiera de los dos sentidos: ni editar una que ya es
-- credito, ni convertir una existente en credito desde aqui). Mismo
-- criterio que 029_bloquear_edicion_wompi_pendiente.sql: editar
-- danaria el saldo ya calculado a partir de credit_payments.
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
  v_current_payment_method public.payment_method;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;

  select payment_method into v_current_payment_method
  from public.pos_sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_current_payment_method = 'credito' then
    raise exception 'Esta venta es un credito y no se puede editar. Gestiona los abonos desde Creditos.';
  end if;

  if p_payment_method = 'credito' then
    raise exception 'No se puede convertir una venta existente en credito desde aqui. Registra una venta nueva a credito desde el POS.';
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
  set subtotal = v_subtotal, discount = p_discount, total = v_total, payment_method = p_payment_method
  where id = p_sale_id;

  select * into v_sale from public.pos_sales where id = p_sale_id;
  return v_sale;
end;
$$;

revoke execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric) from public, anon;
grant execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric) to authenticated;
```

- [ ] **Paso 2: Aplicar la migración**

Usa `mcp__supabase__apply_migration` con `name: "sistema_credito_rpc"`.

- [ ] **Paso 3: Verificar con `mcp__supabase__execute_sql`**

Necesitas un `product_id` real y un `staff_id` (`profiles.id` con rol
`staff`/`admin`/`superadmin`) existentes en la base para estas pruebas —
consíguelos con `select id, stock from public.products limit 1;` y
`select id from public.profiles where role in ('staff','admin','superadmin') limit 1;`.
Estas consultas se ejecutan como el rol `postgres` vía MCP, así que
`auth.uid()` es null dentro de las funciones — para probarlas de extremo a
extremo, envuelve cada llamada así (sustituye `<staff_id>`):

```sql
select set_config('request.jwt.claims', json_build_object('sub', '<staff_id>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.create_pos_sale(
  jsonb_build_array(jsonb_build_object('productId', '<product_id>', 'variantId', '', 'qty', 1, 'unitPrice', 100000)),
  'credito', 0, 'Ana Ruiz', '3001234567', 3, 20000, 'efectivo'
);
```

Confirma:
- La venta se crea con `payment_method = 'credito'` y `credit_customer_name = 'Ana Ruiz'`.
- `select numero, due_date, amount, paid_amount, status from public.credit_installments where sale_id = '<sale_id>' order by numero;`
  → 3 filas, suma de `amount` = 80000 (100000 − 20000 de abono inicial),
  la cuota 1 con `paid_amount = 20000` y `status = 'parcial'` (o `'pagada'`
  si el abono inicial alcanzó a cubrirla completa, según el monto de
  ejemplo usado).
- `select * from public.credit_payments where sale_id = '<sale_id>';` → 1
  fila de 20000.
- Registra un segundo abono con `select public.registrar_abono_credito('<sale_id>', 30000, 'transferencia');`
  y confirma que el reparto FIFO avanza a la cuota 2.
- Intenta un abono mayor al saldo pendiente y confirma que lanza
  excepción ("no puede superar el saldo pendiente").
- Intenta `select public.update_pos_sale('<sale_id>', jsonb_build_array(...), 'efectivo', 0);`
  sobre esa venta y confirma que lanza excepción ("es un credito y no se
  puede editar").

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/034_sistema_credito_rpc.sql
git commit -m "feat: RPCs de venta a credito, abonos y bloqueo de edicion"
```

---

## Task 3: Migración de informes — reconocer ingreso por abono

**Files:**
- Create: `supabase/migrations/035_sistema_credito_informes.sql`

**Interfaces:**
- Consumes: `credit_payments`, `credit_installments` (Task 1),
  `pos_sales.payment_method = 'credito'` (Task 1).
- Produces: `informe_ventas_serie`, `informe_metodos_pago`,
  `informe_ganancia_serie` reemplazadas (misma firma); función nueva
  `public.informe_creditos_resumen(p_desde date, p_hasta date) returns
  table (cartera_pendiente numeric, monto_vencido numeric,
  cobrado_en_periodo numeric)`.

- [ ] **Paso 1: Escribir la migración**

```sql
-- Ajusta los informes de ingreso para que una venta a credito no cuente
-- como ingreso al momento de venderse: su total se excluye, y cada abono
-- (credit_payments) se suma en su lugar, fechado el dia que se recibe.
-- Ver docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md §6.
--
-- Nota de consistencia temporal (intencional, ver spec §6.2): el costo de
-- producto vendido (informe_ganancia_serie, items_vendidos/costo_dia) NO
-- cambia y se sigue reconociendo el dia de la venta, no del abono. Para
-- un credito, esto significa que el dia de la venta puede mostrar
-- ganancia negativa (costo sin ingreso todavia) y los dias de abono
-- ganancia sin costo asociado — es el criterio de caja que se pidio
-- explicitamente para el ingreso, aplicado de forma consistente.

create or replace function public.informe_ventas_serie(p_desde date, p_hasta date)
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
  select x.fecha, x.canal, sum(x.monto) as monto
  from (
    select (o.created_at at time zone 'America/Bogota')::date as fecha, 'tienda'::text as canal, o.total as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    union all
    select (s.created_at at time zone 'America/Bogota')::date as fecha, 'pos'::text as canal, s.total as monto
    from public.pos_sales s
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and s.payment_method <> 'credito'
    union all
    select (cp.created_at at time zone 'America/Bogota')::date as fecha, 'pos'::text as canal, cp.amount as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  ) x
  group by x.fecha, x.canal
  order by x.fecha;
end;
$$;

create or replace function public.informe_metodos_pago(p_desde date, p_hasta date)
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
  select x.metodo, sum(x.monto) as total
  from (
    select coalesce(o.payment_method, 'sin especificar') as metodo, o.total as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    union all
    select s.payment_method::text as metodo, s.total as monto
    from public.pos_sales s
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and s.payment_method <> 'credito'
    union all
    select cp.payment_method::text as metodo, cp.amount as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  ) x
  group by x.metodo
  order by total desc;
end;
$$;

create or replace function public.informe_ganancia_serie(p_desde date, p_hasta date)
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
    select (o.created_at at time zone 'America/Bogota')::date as fecha, sum(o.total) as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    group by (o.created_at at time zone 'America/Bogota')::date
    union all
    select (s.created_at at time zone 'America/Bogota')::date as fecha, sum(s.total) as monto
    from public.pos_sales s
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and s.payment_method <> 'credito'
    group by (s.created_at at time zone 'America/Bogota')::date
    union all
    select (cp.created_at at time zone 'America/Bogota')::date as fecha, sum(cp.amount) as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    group by (cp.created_at at time zone 'America/Bogota')::date
  ),
  ventas_agrupadas as (
    select ventas_dia.fecha, sum(ventas_dia.monto) as monto
    from ventas_dia
    group by ventas_dia.fecha
  ),
  items_vendidos as (
    select (o.created_at at time zone 'America/Bogota')::date as fecha, oi.product_id, oi.qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and oi.product_id is not null
    union all
    select (s.created_at at time zone 'America/Bogota')::date as fecha, psi.product_id, psi.qty
    from public.pos_sale_items psi
    join public.pos_sales s on s.id = psi.sale_id
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
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

-- Resumen de cartera de creditos: cartera_pendiente y monto_vencido son
-- una fotografia (no dependen del rango de fechas); cobrado_en_periodo si.
create or replace function public.informe_creditos_resumen(p_desde date, p_hasta date)
returns table (cartera_pendiente numeric, monto_vencido numeric, cobrado_en_periodo numeric)
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
  with saldos as (
    select s.id, s.total - coalesce(sum(cp.amount), 0) as saldo
    from public.pos_sales s
    left join public.credit_payments cp on cp.sale_id = s.id
    where s.payment_method = 'credito'
    group by s.id, s.total
  ),
  vencido as (
    select coalesce(sum(ci.amount - ci.paid_amount), 0) as monto
    from public.credit_installments ci
    where ci.status <> 'pagada' and ci.due_date < current_date
  ),
  cobrado as (
    select coalesce(sum(cp.amount), 0) as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  )
  select
    coalesce((select sum(saldo) from saldos where saldo > 0), 0) as cartera_pendiente,
    (select monto from vencido) as monto_vencido,
    (select monto from cobrado) as cobrado_en_periodo;
end;
$$;

revoke execute on function public.informe_creditos_resumen(date, date) from public, anon;
grant execute on function public.informe_creditos_resumen(date, date) to authenticated;
```

- [ ] **Paso 2: Aplicar la migración**

Usa `mcp__supabase__apply_migration` con `name: "sistema_credito_informes"`.

- [ ] **Paso 3: Verificar con `mcp__supabase__execute_sql`**

Reutilizando la venta a crédito y los abonos creados en la verificación de
Task 2:

```sql
select * from public.informe_metodos_pago(current_date - 1, current_date + 1);
```

Confirma que el `total` de la venta a crédito **no** aparece como una fila
con método `'credito'`, y que sí aparecen `'efectivo'` (20000, del abono
inicial) y `'transferencia'` (30000, del segundo abono) sumando esos
montos — no el total de la venta.

```sql
select * from public.informe_creditos_resumen(current_date - 1, current_date + 1);
```

Confirma `cartera_pendiente` = saldo restante de esa venta,
`cobrado_en_periodo` = 50000 (20000 + 30000).

Termina borrando la venta de prueba creada en esta verificación y en la
de Task 2 (esto es real y quedaría visible en `/pos/creditos` e Informes
si no se limpia):

```sql
-- credit_payments usa "on delete restrict" (§3.4 del spec): hay que
-- borrarlos primero, o el delete de pos_sales de abajo falla.
delete from public.credit_payments where sale_id = '<sale_id>';
delete from public.pos_sales where id = '<sale_id>';
-- cascada: borra pos_sale_items y credit_installments (on delete cascade).

-- create_pos_sale descontó stock real del producto de prueba (qty 1 en
-- el ejemplo de Task 2) y borrar la venta no lo restaura solo: devuélvelo.
update public.products set stock = stock + 1 where id = '<product_id>';
```

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/035_sistema_credito_informes.sql
git commit -m "feat: informes reconocen el ingreso de un credito por abono"
```

---

## Task 4: Tipos regenerados y validación zod

**Files:**
- Modify: `src/lib/supabase/database.types.ts`
- Create: `src/lib/validation/credito.ts`
- Test: `src/lib/validation/__tests__/credito.test.ts`
- Create: `src/lib/pos/estado-credito.ts`
- Test: `src/lib/pos/__tests__/estado-credito.test.ts`

**Interfaces:**
- Consumes: `Database["public"]["Enums"]["payment_method"]` (regenerado,
  ahora incluye `'credito'`).
- Produces: `creditoVentaSchema`, `type CreditoVentaInput` (clienteNombre,
  clienteTelefono, numCuotas, abonoInicial, abonoInicialMetodo);
  `abonoSchema`, `type AbonoInput` (amount, paymentMethod); `type
  EstadoCredito = "pagado" | "vencido" | "al_dia"`; `function
  calcularEstadoCredito(saldo: number, cuotas: {status: "pendiente" |
  "parcial" | "pagada"; dueDate: string}[], hoy: string): EstadoCredito`.

- [ ] **Paso 1: Regenerar los tipos de Supabase**

Ejecuta `mcp__supabase__generate_typescript_types` y escribe el resultado
completo (reemplazando el archivo entero) en
`src/lib/supabase/database.types.ts`.

- [ ] **Paso 2: Escribir el test de `creditoVentaSchema`/`abonoSchema` (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { abonoSchema, creditoVentaSchema } from "../credito";

const BASE = {
  clienteNombre: "Ana Ruiz",
  clienteTelefono: "3001234567",
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

  it("rechaza nombre de cliente vacio", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, clienteNombre: "" }).success).toBe(false);
  });

  it("rechaza telefono vacio", () => {
    expect(creditoVentaSchema.safeParse({ ...BASE, clienteTelefono: "" }).success).toBe(false);
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

- [ ] **Paso 3: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- --run src/lib/validation/__tests__/credito.test.ts`
Expected: FAIL (el módulo `../credito` no existe todavía)

- [ ] **Paso 4: Implementar `src/lib/validation/credito.ts`**

```ts
import { z } from "zod";

const METODOS_ABONO = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"] as const;

export const creditoVentaSchema = z
  .object({
    clienteNombre: z.string().trim().min(2, "Ingresa el nombre del cliente"),
    clienteTelefono: z.string().trim().min(7, "Ingresa un teléfono válido"),
    numCuotas: z.number().int().min(1, "Debe haber al menos 1 cuota"),
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

- [ ] **Paso 5: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- --run src/lib/validation/__tests__/credito.test.ts`
Expected: PASS

- [ ] **Paso 6: Escribir el test de `calcularEstadoCredito` (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { calcularEstadoCredito } from "../estado-credito";

describe("calcularEstadoCredito", () => {
  it("es 'pagado' cuando el saldo es 0, sin importar las cuotas", () => {
    const estado = calcularEstadoCredito(0, [{ status: "pendiente", dueDate: "2020-01-01" }], "2026-01-01");
    expect(estado).toBe("pagado");
  });

  it("es 'pagado' cuando el saldo es negativo (defensivo)", () => {
    expect(calcularEstadoCredito(-1, [], "2026-01-01")).toBe("pagado");
  });

  it("es 'vencido' cuando hay saldo y una cuota no pagada con fecha pasada", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "parcial", dueDate: "2026-01-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("vencido");
  });

  it("no es 'vencido' si la cuota vencida ya esta pagada", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "pagada", dueDate: "2026-01-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("al_dia");
  });

  it("no es 'vencido' cuando la fecha de vencimiento es hoy mismo (solo estrictamente pasada cuenta)", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "pendiente", dueDate: "2026-02-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("al_dia");
  });

  it("es 'al_dia' cuando hay saldo pero ninguna cuota vencida", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "pendiente", dueDate: "2026-03-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("al_dia");
  });
});
```

- [ ] **Paso 7: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- --run src/lib/pos/__tests__/estado-credito.test.ts`
Expected: FAIL (el módulo `../estado-credito` no existe todavía)

- [ ] **Paso 8: Implementar `src/lib/pos/estado-credito.ts`**

```ts
export type EstadoCredito = "pagado" | "vencido" | "al_dia";

export function calcularEstadoCredito(
  saldo: number,
  cuotas: { status: "pendiente" | "parcial" | "pagada"; dueDate: string }[],
  hoy: string,
): EstadoCredito {
  if (saldo <= 0) return "pagado";
  const hayVencida = cuotas.some((c) => c.status !== "pagada" && c.dueDate < hoy);
  return hayVencida ? "vencido" : "al_dia";
}
```

- [ ] **Paso 9: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- --run src/lib/pos/__tests__/estado-credito.test.ts`
Expected: PASS

- [ ] **Paso 10: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/validation/credito.ts \
  src/lib/validation/__tests__/credito.test.ts src/lib/pos/estado-credito.ts \
  src/lib/pos/__tests__/estado-credito.test.ts
git commit -m "feat: tipos regenerados y validacion del sistema de credito"
```

---

## Task 5: `VentaItemsEditor` — campos de crédito

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx` (archivo completo, ~140 → ~250 líneas)

**Interfaces:**
- Consumes: `CreditoVentaInput` de `@/lib/validation/credito` (Task 4).
- Produces: nueva prop `permitirCredito?: boolean` (default `true`);
  `onGuardar` gana un 4º parámetro `credito: CreditoVentaInput | null`.
  Los dos llamadores existentes (`pos-terminal.tsx`, `editar-venta-form.tsx`)
  se actualizan en las Tasks 6 y 7 respectivamente — este componente
  todavía compila solo (TypeScript acepta un callback con menos
  parámetros que los declarados en el tipo de la prop).

- [ ] **Paso 1: Reemplazar el archivo completo**

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
import type { CreditoVentaInput } from "@/lib/validation/credito";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const METODOS_ABONO = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"] as const;

export function VentaItemsEditor({
  itemsIniciales = [],
  discountInicial = 0,
  paymentMethodInicial = "efectivo",
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
  ) => Promise<{ error?: string } | void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosSearchResult[]>([]);
  const [items, setItems] = useState<LocalCartItem[]>(itemsIniciales);
  const [discount, setDiscount] = useState(discountInicial);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethodInicial);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [numCuotas, setNumCuotas] = useState(1);
  const [abonoInicial, setAbonoInicial] = useState(0);
  const [abonoInicialMetodo, setAbonoInicialMetodo] = useState<
    (typeof METODOS_ABONO)[number] | ""
  >("");
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const subtotal = computeSubtotal(items);
  const total = Math.max(subtotal - discount, 0);
  const esCredito = paymentMethod === "credito" && permitirCredito;

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

    if (esCredito) {
      if (!clienteNombre.trim() || !clienteTelefono.trim()) {
        setError("Ingresa el nombre y teléfono del cliente.");
        return;
      }
      if (numCuotas < 1) {
        setError("El número de cuotas debe ser al menos 1.");
        return;
      }
      if (abonoInicial > 0 && !abonoInicialMetodo) {
        setError("Selecciona el método de pago del abono inicial.");
        return;
      }
    }

    startSubmit(async () => {
      const credito: CreditoVentaInput | null = esCredito
        ? {
            clienteNombre: clienteNombre.trim(),
            clienteTelefono: clienteTelefono.trim(),
            numCuotas,
            abonoInicial,
            abonoInicialMetodo: abonoInicialMetodo || null,
          }
        : null;
      const result = await onGuardar(items, paymentMethod, discount, credito);
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
              {permitirCredito && <option value="credito">Crédito</option>}
            </select>
          </div>
        )}

        {esCredito && (
          <div className="flex flex-col gap-3 rounded-md border border-brand-oro/50 bg-brand-oro/10 p-3">
            <p className="text-sm font-semibold text-brand-ciruela">Datos del crédito</p>
            <div>
              <label htmlFor="clienteNombre" className="text-sm text-brand-ciruela">
                Cliente
              </label>
              <Input
                id="clienteNombre"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="clienteTelefono" className="text-sm text-brand-ciruela">
                Teléfono
              </label>
              <Input
                id="clienteTelefono"
                value={clienteTelefono}
                onChange={(e) => setClienteTelefono(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="numCuotas" className="text-sm text-brand-ciruela">
                Número de cuotas
              </label>
              <Input
                id="numCuotas"
                type="number"
                min={1}
                value={numCuotas}
                onChange={(e) => setNumCuotas(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div>
              <label htmlFor="abonoInicial" className="text-sm text-brand-ciruela">
                Abono inicial (opcional)
              </label>
              <Input
                id="abonoInicial"
                type="number"
                min={0}
                value={abonoInicial}
                onChange={(e) => setAbonoInicial(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            {abonoInicial > 0 && (
              <div>
                <label htmlFor="abonoInicialMetodo" className="text-sm text-brand-ciruela">
                  Método de pago del abono inicial
                </label>
                <select
                  id="abonoInicialMetodo"
                  value={abonoInicialMetodo}
                  onChange={(e) =>
                    setAbonoInicialMetodo(e.target.value as (typeof METODOS_ABONO)[number] | "")
                  }
                  className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
                >
                  <option value="">Selecciona un método</option>
                  {METODOS_ABONO.map((metodo) => (
                    <option key={metodo} value={metodo}>
                      {metodo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

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

- [ ] **Paso 2: Verificar que el proyecto compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores. Un callback con menos parámetros que los que
declara el tipo de `onGuardar` es asignable en TypeScript (igual que
`Array.prototype.forEach`), así que `pos-terminal.tsx` y
`editar-venta-form.tsx` — todavía sin tocar en este punto — siguen
compilando. Nota importante: esto significa que, hasta que la Task 7
agregue `permitirCredito={false}` al formulario de edición, ese formulario
mostraría "Crédito" como opción de método de pago sin que nada la maneje
correctamente — es un hueco funcional temporal esperado entre tareas, no
un error de compilación.

- [ ] **Paso 3: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx
git commit -m "feat: VentaItemsEditor soporta venta a credito"
```

---

## Task 6: Conectar la creación de ventas a crédito

**Files:**
- Modify: `src/app/pos/sale-action.ts`
- Modify: `src/app/pos/pos-terminal.tsx`
- Test: `src/app/pos/__tests__/sale-action.test.ts`

**Interfaces:**
- Consumes: `creditoVentaSchema`, `CreditoVentaInput` (Task 4);
  `onGuardar` de `VentaItemsEditor` (Task 5); RPC `create_pos_sale`
  extendido (Task 2).

- [ ] **Paso 1: Escribir el test (falla primero)**

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
    const resultado = await registrarVenta([], "efectivo", 0, null);

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("venta normal (no credito): envia los campos de credito en null/0 aunque llegue un objeto credito", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "efectivo", 0, {
        clienteNombre: "Ana",
        clienteTelefono: "3001234567",
        numCuotas: 3,
        abonoInicial: 0,
        abonoInicialMetodo: null,
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "efectivo",
        p_credit_customer_name: null,
        p_credit_customer_phone: null,
        p_credit_num_cuotas: null,
        p_credit_abono_inicial: 0,
        p_credit_abono_metodo: null,
      }),
    );
  });

  it("credito: rechaza datos invalidos (sin nombre de cliente) sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(ITEMS, "credito", 0, {
      clienteNombre: "",
      clienteTelefono: "3001234567",
      numCuotas: 3,
      abonoInicial: 0,
      abonoInicialMetodo: null,
    });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito: con abono inicial > 0 sin metodo, rechaza sin llamar al RPC", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    const resultado = await registrarVenta(ITEMS, "credito", 0, {
      clienteNombre: "Ana",
      clienteTelefono: "3001234567",
      numCuotas: 3,
      abonoInicial: 20000,
      abonoInicialMetodo: null,
    });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("credito valido: llama al RPC con los campos de credito y redirige", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(ITEMS, "credito", 0, {
        clienteNombre: "Ana Ruiz",
        clienteTelefono: "3001234567",
        numCuotas: 3,
        abonoInicial: 20000,
        abonoInicialMetodo: "efectivo",
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_payment_method: "credito",
        p_credit_customer_name: "Ana Ruiz",
        p_credit_customer_phone: "3001234567",
        p_credit_num_cuotas: 3,
        p_credit_abono_inicial: 20000,
        p_credit_abono_metodo: "efectivo",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/pos/venta/sale-uuid-1");
  });
});
```

- [ ] **Paso 2: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- --run src/app/pos/__tests__/sale-action.test.ts`
Expected: FAIL (`registrarVenta` todavía no acepta un 4º parámetro)

- [ ] **Paso 3: Modificar `src/app/pos/sale-action.ts`**

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
): Promise<{ error?: string }> {
  if (items.length === 0) {
    return { error: "Agrega al menos un producto a la venta." };
  }

  let creditoValidado: CreditoVentaInput | null = null;
  if (paymentMethod === "credito") {
    const parsed = creditoVentaSchema.safeParse(credito);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del crédito." };
    }
    creditoValidado = parsed.data;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pos_sale", {
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    p_payment_method: paymentMethod,
    p_discount: discount,
    p_credit_customer_name: creditoValidado?.clienteNombre ?? null,
    p_credit_customer_phone: creditoValidado?.clienteTelefono ?? null,
    p_credit_num_cuotas: creditoValidado?.numCuotas ?? null,
    p_credit_abono_inicial: creditoValidado?.abonoInicial ?? 0,
    p_credit_abono_metodo: creditoValidado?.abonoInicialMetodo ?? null,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar la venta." };
  }

  redirect(`/pos/venta/${data.id}`);
}
```

- [ ] **Paso 4: Modificar `src/app/pos/pos-terminal.tsx`**

```tsx
"use client";

import { VentaItemsEditor } from "./venta-items-editor";
import { registrarVenta } from "./sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount, credito) =>
        registrarVenta(items, paymentMethod, discount, credito)
      }
    />
  );
}
```

- [ ] **Paso 5: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- --run src/app/pos/__tests__/sale-action.test.ts`
Expected: PASS

- [ ] **Paso 6: Commit**

```bash
git add src/app/pos/sale-action.ts src/app/pos/pos-terminal.tsx \
  src/app/pos/__tests__/sale-action.test.ts
git commit -m "feat: conecta la venta a credito con create_pos_sale"
```

---

## Task 7: Bloquear la edición de ventas a crédito

**Files:**
- Modify: `src/app/pos/(admin)/venta/[id]/editar/editar-venta-form.tsx`
- Modify: `src/app/pos/(admin)/venta/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `permitirCredito` de `VentaItemsEditor` (Task 5); rechazo del
  RPC `update_pos_sale` para `payment_method = 'credito'` (Task 2, defensa
  en profundidad — `actions.ts` de esta pantalla NO se modifica: ya
  retorna `{ error: error.message }` cuando el RPC lanza excepción, así
  que el mensaje del RPC llega tal cual sin cambios de código).

- [ ] **Paso 1: Modificar `editar-venta-form.tsx` — un solo prop nuevo**

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
      permitirCredito={false}
      textoBoton="Guardar cambios"
      textoBotonEnviando="Guardando..."
      onGuardar={(items, paymentMethod, discount) =>
        actualizarVenta(saleId, items, paymentMethod, discount)
      }
    />
  );
}
```

- [ ] **Paso 2: Modificar `page.tsx` — aviso en vez del formulario cuando es crédito**

En `src/app/pos/(admin)/venta/[id]/editar/page.tsx`, después de la
consulta existente `const { data: venta } = await supabase.from("pos_sales")...`
(que ya selecciona `payment_method`), agrega justo debajo del bloque
`if (!venta) { notFound(); }`:

```tsx
  const ventaEsCredito = venta.payment_method === "credito";
```

Y reemplaza el `return` final (que hoy renderiza `<EditarVentaForm ... />`
directamente) por:

```tsx
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href={`/pos/venta/${venta.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al recibo
      </Link>
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Editar venta</h1>
      {ventaEsCredito ? (
        <div className="rounded-lg border border-brand-oro bg-brand-oro/10 p-4 text-sm text-brand-ciruela">
          <p className="font-semibold">Esta venta no se puede editar</p>
          <p>
            Es un crédito — para no dañar los abonos ya registrados, no se
            pueden cambiar sus productos ni su total. Gestiona los abonos
            desde{" "}
            <Link href={`/pos/creditos/${venta.id}`} className="underline">
              Créditos
            </Link>
            .
          </p>
        </div>
      ) : (
        <EditarVentaForm
          saleId={venta.id}
          itemsIniciales={itemsIniciales}
          discountInicial={venta.discount}
          paymentMethodInicial={venta.payment_method}
        />
      )}
    </div>
  );
```

(El resto del archivo — las consultas de `items`, `products`, `variants`
y la construcción de `itemsIniciales` — no cambia. `Link` y `ArrowLeft` ya
están importados al inicio del archivo.)

- [ ] **Paso 3: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores (esto también resuelve el error esperado del Paso 2
de Task 5, ya que ahora `editar-venta-form.tsx` sí coincide con la firma
de `onGuardar`).

- [ ] **Paso 4: Commit**

```bash
git add "src/app/pos/(admin)/venta/[id]/editar/editar-venta-form.tsx" \
  "src/app/pos/(admin)/venta/[id]/editar/page.tsx"
git commit -m "fix: bloquea la edicion de ventas a credito"
```

---

## Task 8: Listado de créditos (`/pos/creditos`) y navegación

**Files:**
- Create: `src/app/pos/(admin)/creditos/page.tsx`
- Modify: `src/app/pos/(admin)/layout.tsx`
- Modify: `src/app/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `calcularEstadoCredito`, `EstadoCredito` (Task 4); `rangoHoy`
  de `@/lib/informes/rango-fecha` (existente); tablas `pos_sales`,
  `credit_payments`, `credit_installments` (Task 1).

- [ ] **Paso 1: Crear `src/app/pos/(admin)/creditos/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { calcularEstadoCredito, type EstadoCredito } from "@/lib/pos/estado-credito";
import { rangoHoy } from "@/lib/informes/rango-fecha";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

const ESTADO_LABEL: Record<EstadoCredito, string> = {
  pagado: "Pagado",
  al_dia: "Al día",
  vencido: "Vencido",
};

const ESTADO_VARIANT: Record<EstadoCredito, "success" | "warning" | "danger"> = {
  pagado: "success",
  al_dia: "warning",
  vencido: "danger",
};

export default async function CreditosPage({
  searchParams,
}: PageProps<"/pos/creditos">) {
  const { estado } = await searchParams;
  const supabase = await createClient();
  const hoy = rangoHoy().desde;

  const { data: ventas } = await supabase
    .from("pos_sales")
    .select("id, created_at, total, credit_customer_name, credit_customer_phone")
    .eq("payment_method", "credito")
    .order("created_at", { ascending: false });

  const saleIds = (ventas ?? []).map((v) => v.id);

  const [{ data: pagos }, { data: cuotas }] = await Promise.all([
    saleIds.length > 0
      ? supabase.from("credit_payments").select("sale_id, amount").in("sale_id", saleIds)
      : Promise.resolve({ data: [] as { sale_id: string; amount: number }[] }),
    saleIds.length > 0
      ? supabase
          .from("credit_installments")
          .select("sale_id, status, due_date")
          .in("sale_id", saleIds)
      : Promise.resolve(
          {
            data: [] as {
              sale_id: string;
              status: "pendiente" | "parcial" | "pagada";
              due_date: string;
            }[],
          },
        ),
  ]);

  const pagadoPorVenta = new Map<string, number>();
  for (const pago of pagos ?? []) {
    pagadoPorVenta.set(pago.sale_id, (pagadoPorVenta.get(pago.sale_id) ?? 0) + pago.amount);
  }

  const cuotasPorVenta = new Map<string, { status: "pendiente" | "parcial" | "pagada"; dueDate: string }[]>();
  for (const cuota of cuotas ?? []) {
    const lista = cuotasPorVenta.get(cuota.sale_id) ?? [];
    lista.push({ status: cuota.status, dueDate: cuota.due_date });
    cuotasPorVenta.set(cuota.sale_id, lista);
  }

  const filas = (ventas ?? []).map((venta) => {
    const saldo = venta.total - (pagadoPorVenta.get(venta.id) ?? 0);
    const estadoCredito = calcularEstadoCredito(saldo, cuotasPorVenta.get(venta.id) ?? [], hoy);
    return { ...venta, saldo, estadoCredito };
  });

  const filtroEstado = typeof estado === "string" ? estado : "";
  const filasFiltradas = filtroEstado
    ? filas.filter((f) => f.estadoCredito === filtroEstado)
    : filas;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Créditos</h1>
      <div className="mb-4 flex gap-2">
        {(["", "al_dia", "vencido", "pagado"] as const).map((valor) => (
          <Link
            key={valor || "todos"}
            href={valor ? `/pos/creditos?estado=${valor}` : "/pos/creditos"}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              filtroEstado === valor
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            {valor ? ESTADO_LABEL[valor as EstadoCredito] : "Todos"}
          </Link>
        ))}
      </div>
      {filasFiltradas.length === 0 ? (
        <p className="text-brand-ciruela/70">No hay créditos para mostrar.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
              <TableHeaderCell>Saldo</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {filasFiltradas.map((venta) => (
              <TableRow key={venta.id}>
                <TableCell>
                  <Link href={`/pos/creditos/${venta.id}`} className="text-brand-rosa hover:underline">
                    {venta.credit_customer_name}
                  </Link>
                  <p className="text-xs text-brand-ciruela/60">{venta.credit_customer_phone}</p>
                </TableCell>
                <TableCell>{new Date(venta.created_at).toLocaleDateString("es-CO")}</TableCell>
                <TableCell>{formatPrice(venta.total)}</TableCell>
                <TableCell>{formatPrice(venta.saldo)}</TableCell>
                <TableCell>
                  <Badge variant={ESTADO_VARIANT[venta.estadoCredito]}>
                    {ESTADO_LABEL[venta.estadoCredito]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Paso 2: Agregar el enlace al sidebar de `/pos` en `src/app/pos/(admin)/layout.tsx`**

Modifica el array `SECTIONS`:

```ts
const SECTIONS: SidebarSection[] = [
  {
    label: "POS",
    items: [
      { href: "/pos", label: "Terminal" },
      { href: "/pos/ventas", label: "Ventas POS" },
      { href: "/pos/creditos", label: "Créditos" },
    ],
  },
];
```

- [ ] **Paso 3: Agregar el enlace cruzado en `src/app/admin/admin-nav.tsx`**

Dentro de la sección `"Ventas"`, agrega una línea después de
`{ href: "/pos/ventas", label: "Ventas POS" },`:

```ts
        { href: "/pos/ventas", label: "Ventas POS" },
        { href: "/pos/creditos", label: "Créditos" },
```

- [ ] **Paso 4: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores. Si señala que `PageProps<"/pos/creditos">` no
existe, ejecuta `pnpm dev` unos segundos y repite.

- [ ] **Paso 5: Commit**

```bash
git add "src/app/pos/(admin)/creditos/page.tsx" \
  "src/app/pos/(admin)/layout.tsx" src/app/admin/admin-nav.tsx
git commit -m "feat: listado de creditos en /pos/creditos"
```

---

## Task 9: Detalle de crédito y registro de abonos

**Files:**
- Create: `src/app/pos/(admin)/creditos/[id]/page.tsx`
- Create: `src/app/pos/(admin)/creditos/[id]/abono-form.tsx`
- Create: `src/app/pos/(admin)/creditos/[id]/actions.ts`
- Test: `src/app/pos/(admin)/creditos/[id]/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `abonoSchema`, `AbonoInput` (Task 4); RPC
  `registrar_abono_credito` (Task 2); `calcularEstadoCredito` (Task 4);
  `PrintButton` de `@/app/pos/(admin)/venta/[id]/print-button` (existente,
  reutilizado tal cual).

- [ ] **Paso 1: Escribir el test de `registrarAbono` (falla primero)**

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("registrarAbono", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza un monto invalido sin llamar al RPC", async () => {
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const { registrarAbono } = await import("../actions");
    const resultado = await registrarAbono("sale-1", { amount: 0, paymentMethod: "efectivo" });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("abono valido: llama al RPC con los parametros correctos", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: { id: "pago-1" }, error: null }));
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const { registrarAbono } = await import("../actions");
    const resultado = await registrarAbono("sale-1", { amount: 50000, paymentMethod: "efectivo" });

    expect(resultado).toEqual({});
    expect(rpc).toHaveBeenCalledWith("registrar_abono_credito", {
      p_sale_id: "sale-1",
      p_amount: 50000,
      p_payment_method: "efectivo",
    });
  });

  it("cuando el RPC rechaza (ej. sobrepago), retorna el mensaje de error", async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: { message: "El abono no puede superar el saldo pendiente." },
      }),
    );
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const { registrarAbono } = await import("../actions");
    const resultado = await registrarAbono("sale-1", { amount: 999999, paymentMethod: "efectivo" });

    expect(resultado).toEqual({ error: "El abono no puede superar el saldo pendiente." });
  });
});
```

- [ ] **Paso 2: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- --run "src/app/pos/(admin)/creditos/[id]/__tests__/actions.test.ts"`
Expected: FAIL (el módulo `../actions` no existe todavía)

- [ ] **Paso 3: Implementar `actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { abonoSchema, type AbonoInput } from "@/lib/validation/credito";

export async function registrarAbono(
  saleId: string,
  input: AbonoInput,
): Promise<{ error?: string }> {
  const parsed = abonoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del abono." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_abono_credito", {
    p_sale_id: saleId,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/pos/creditos/${saleId}`);
  revalidatePath("/pos/creditos");
  return {};
}
```

- [ ] **Paso 4: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- --run "src/app/pos/(admin)/creditos/[id]/__tests__/actions.test.ts"`
Expected: PASS

- [ ] **Paso 5: Implementar `abono-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { abonoSchema, type AbonoInput } from "@/lib/validation/credito";
import { registrarAbono } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AbonoForm({ saleId }: { saleId: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AbonoInput>({
    resolver: zodResolver(abonoSchema),
    defaultValues: { amount: 0, paymentMethod: "efectivo" },
  });

  const onSubmit = async (data: AbonoInput) => {
    setServerError(null);
    const result = await registrarAbono(saleId, data);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    reset({ amount: 0, paymentMethod: "efectivo" });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="amount" className="text-sm text-brand-ciruela">
          Monto del abono
        </label>
        <Input
          id="amount"
          type="number"
          step="1"
          {...register("amount", { valueAsNumber: true })}
        />
        {errors.amount && <p className="text-sm text-red-600">{errors.amount.message}</p>}
      </div>
      <div>
        <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
          Método de pago
        </label>
        <select
          id="paymentMethod"
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("paymentMethod")}
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
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
        {isSubmitting ? "Registrando..." : "Registrar abono"}
      </Button>
    </form>
  );
}
```

- [ ] **Paso 6: Implementar `page.tsx`**

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { calcularEstadoCredito, type EstadoCredito } from "@/lib/pos/estado-credito";
import { rangoHoy } from "@/lib/informes/rango-fecha";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { PrintButton } from "@/app/pos/(admin)/venta/[id]/print-button";
import { AbonoForm } from "./abono-form";

const ESTADO_LABEL: Record<EstadoCredito, string> = {
  pagado: "Pagado",
  al_dia: "Al día",
  vencido: "Vencido",
};

const ESTADO_VARIANT: Record<EstadoCredito, "success" | "warning" | "danger"> = {
  pagado: "success",
  al_dia: "warning",
  vencido: "danger",
};

const ESTADO_CUOTA_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagada: "Pagada",
};

export default async function CreditoDetallePage({
  params,
}: PageProps<"/pos/creditos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: venta } = await supabase
    .from("pos_sales")
    .select(
      "id, created_at, total, credit_customer_name, credit_customer_phone, payment_method",
    )
    .eq("id", id)
    .single();

  if (!venta || venta.payment_method !== "credito") {
    notFound();
  }

  const [{ data: cuotas }, { data: pagos }] = await Promise.all([
    supabase
      .from("credit_installments")
      .select("id, numero, due_date, amount, paid_amount, status")
      .eq("sale_id", id)
      .order("numero"),
    supabase
      .from("credit_payments")
      .select("id, amount, payment_method, created_at, staff_id")
      .eq("sale_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const staffIds = [...new Set((pagos ?? []).map((p) => p.staff_id))];
  const { data: staff } =
    staffIds.length > 0
      ? await supabase.from("profiles").select("id, username").in("id", staffIds)
      : { data: [] as { id: string; username: string }[] };
  const staffById = new Map((staff ?? []).map((s) => [s.id, s.username]));

  const totalPagado = (pagos ?? []).reduce((sum, p) => sum + p.amount, 0);
  const saldo = venta.total - totalPagado;
  const hoy = rangoHoy().desde;
  const estadoCredito = calcularEstadoCredito(
    saldo,
    (cuotas ?? []).map((c) => ({ status: c.status, dueDate: c.due_date })),
    hoy,
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/pos/creditos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a créditos
      </Link>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-brand-ciruela">
            {venta.credit_customer_name}
          </h1>
          <p className="text-sm text-brand-ciruela/70">{venta.credit_customer_phone}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={ESTADO_VARIANT[estadoCredito]}>{ESTADO_LABEL[estadoCredito]}</Badge>
          <PrintButton />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Total de la venta</p>
          <p className="font-heading text-2xl text-brand-ciruela">{formatPrice(venta.total)}</p>
        </div>
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Saldo pendiente</p>
          <p className="font-heading text-2xl text-brand-rosa">{formatPrice(saldo)}</p>
        </div>
      </div>

      <h2 className="mb-4 font-heading text-xl text-brand-ciruela">Cuotas</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>#</TableHeaderCell>
            <TableHeaderCell>Fecha</TableHeaderCell>
            <TableHeaderCell>Monto</TableHeaderCell>
            <TableHeaderCell>Pagado</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {(cuotas ?? []).map((cuota) => (
            <TableRow key={cuota.id}>
              <TableCell>{cuota.numero}</TableCell>
              <TableCell>{cuota.due_date}</TableCell>
              <TableCell>{formatPrice(cuota.amount)}</TableCell>
              <TableCell>{formatPrice(cuota.paid_amount)}</TableCell>
              <TableCell>{ESTADO_CUOTA_LABEL[cuota.status]}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      <h2 className="mb-4 mt-8 font-heading text-xl text-brand-ciruela">Abonos</h2>
      {(pagos ?? []).length === 0 ? (
        <p className="mb-4 text-sm text-brand-ciruela/70">Todavía no hay abonos registrados.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Monto</TableHeaderCell>
              <TableHeaderCell>Método</TableHeaderCell>
              <TableHeaderCell>Recibido por</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(pagos ?? []).map((pago) => (
              <TableRow key={pago.id}>
                <TableCell>{new Date(pago.created_at).toLocaleString("es-CO")}</TableCell>
                <TableCell>{formatPrice(pago.amount)}</TableCell>
                <TableCell className="capitalize">{pago.payment_method}</TableCell>
                <TableCell>{staffById.get(pago.staff_id) ?? "-"}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      {saldo > 0 && (
        <div className="mt-8 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <h2 className="mb-4 font-heading text-xl text-brand-ciruela">Registrar abono</h2>
          <AbonoForm saleId={venta.id} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 7: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 8: Commit**

```bash
git add "src/app/pos/(admin)/creditos/[id]/page.tsx" \
  "src/app/pos/(admin)/creditos/[id]/abono-form.tsx" \
  "src/app/pos/(admin)/creditos/[id]/actions.ts" \
  "src/app/pos/(admin)/creditos/[id]/__tests__/actions.test.ts"
git commit -m "feat: detalle de credito con registro de abonos"
```

---

## Task 10: Informe "Créditos"

**Files:**
- Create: `src/app/admin/informes/creditos/page.tsx`
- Modify: `src/app/admin/informes/page.tsx`

**Interfaces:**
- Consumes: RPC `informe_creditos_resumen` (Task 3); `RangoFechaFiltro`,
  `resolverRango` (existentes, mismo patrón que
  `src/app/admin/informes/metodos-pago/page.tsx`).

- [ ] **Paso 1: Crear `src/app/admin/informes/creditos/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";

export default async function InformeCreditosPage({
  searchParams,
}: PageProps<"/admin/informes/creditos">) {
  const params = await searchParams;
  const { desde, hasta, error: errorRango } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("informe_creditos_resumen", { p_desde: desde, p_hasta: hasta })
    .single();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Créditos</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/creditos"
        desde={desde}
        hasta={hasta}
        error={errorRango}
      />
      {error || !data ? (
        <p className="text-sm text-red-600">No se pudo cargar el informe de créditos.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Cartera pendiente</p>
            <p className="font-heading text-2xl text-brand-ciruela">
              {formatPrice(data.cartera_pendiente)}
            </p>
          </div>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Monto vencido</p>
            <p className="font-heading text-2xl text-red-600">
              {formatPrice(data.monto_vencido)}
            </p>
          </div>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Cobrado en abonos (periodo)</p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(data.cobrado_en_periodo)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 2: Agregar la tarjeta en `src/app/admin/informes/page.tsx`**

Agrega `Wallet` al import de `lucide-react` (junto a los íconos ya
importados: `AlertTriangle, CreditCard, Package, PiggyBank, Receipt,
ShoppingCart, TrendingUp`), y agrega una entrada al array `INFORMES`
(después de la de `"metodos-pago"`, que ya usa `CreditCard` — `Wallet` es
un ícono distinto para no repetir):

```ts
  {
    href: "/admin/informes/creditos",
    titulo: "Créditos",
    descripcion: "Cartera pendiente, vencida y cobrada en abonos.",
    Icono: Wallet,
  },
```

- [ ] **Paso 3: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores. Si señala que `PageProps<"/admin/informes/creditos">`
no existe, ejecuta `pnpm dev` unos segundos y repite.

- [ ] **Paso 4: Commit**

```bash
git add "src/app/admin/informes/creditos/page.tsx" src/app/admin/informes/page.tsx
git commit -m "feat: informe de creditos (cartera, vencido, cobrado)"
```

---

## Verificación final (después de la Task 10)

- [ ] `pnpm tsc --noEmit` sin errores.
- [ ] `pnpm lint` sin errores.
- [ ] `pnpm test -- --run` — toda la suite en verde.
- [ ] Prueba en vivo end-to-end contra el servidor de desarrollo
      (`pnpm dev`) y el proyecto real de Supabase, con un usuario `staff`
      o `admin`: registrar una venta a crédito con abono inicial desde
      `/pos`, verificar el recibo, abrir `/pos/creditos`, confirmar que
      aparece con el estado correcto, entrar al detalle, registrar un
      segundo abono, confirmar que el saldo baja y las cuotas se
      actualizan, intentar editar la venta desde `/pos/venta/[id]/editar`
      y confirmar que se bloquea, y revisar
      `/admin/informes/metodos-pago` y `/admin/informes/creditos` para
      confirmar que los montos cuadran. Limpiar los datos de prueba
      creados (fila de `pos_sales`, `pos_sale_items`, `credit_installments`,
      `credit_payments`) al terminar.
