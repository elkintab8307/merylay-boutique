# Selección de estampado por unidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un cliente (tienda) o vendedor (POS) elige una talla/color con más de una imagen propia (estampados distintos de la misma prenda), debe poder marcar cuáles estampados quiere — incluso varios distintos en una sola compra — y esa elección queda registrada hasta el pedido/venta final.

**Architecture:** Nueva columna `image_id` (nullable, FK a `product_images`) en `cart_items`, `order_items` y `pos_sale_items`. `LocalCartItem` (tipo compartido tienda/POS) gana `imageId`; la identidad de una línea de carrito pasa a ser `(productId, variantId, imageId)` en vez de `(productId, variantId)`. Un modal compartido (`EstampadoPickerModal`) deja marcar una o varias imágenes de la variante elegida; cada una crea su propia línea. Los RPCs que arman `order_items`/`pos_sale_items` arrastran `image_id` sin cambiar su firma pública.

**Tech Stack:** Next.js App Router + TypeScript, Supabase (Postgres/RLS vía MCP), Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-25-seleccion-estampado-design.md`

## Global Constraints

- Todo el producto (UI, mensajes) en español.
- TypeScript estricto; nada de `any` sin justificación.
- Server Components por defecto; Client Components solo donde ya lo son hoy o donde este plan lo indique explícitamente.
- RLS siempre activo; nunca `service_role` en el cliente.
- Migraciones vía Supabase MCP (`apply_migration`), tipos regenerados después con `generate_typescript_types`.
- TDD en la lógica pura nueva (`local-cart.ts`, selección del modal) — test que falla antes de implementar.
- Commits atómicos en español al final de cada tarea; `pnpm tsc --noEmit` y `pnpm vitest run` en verde antes de cada commit.
- El stock sigue siendo un solo número por variante (`product_variants.stock`), compartido entre todos sus estampados — no se agrega inventario por imagen.

---

### Task 1: Migración — `image_id` en cart_items/order_items/pos_sale_items + RPCs

**Files:**
- Create: `supabase/migrations/046_seleccion_estampado.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)

**Interfaces:**
- Produces: columna `image_id uuid null` en las tres tablas; los RPCs `create_order`, `create_order_wompi`, `update_order_items`, `create_pos_sale`, `update_pos_sale` (mismas firmas públicas, ahora leen/escriben `image_id`).

**Nota importante antes de aplicar:** el SQL del Step 1 reescribe por completo 5 funciones que ya tienen historia de migraciones (algunas con guardas de negocio no obvias — créditos, pagos Wompi pendientes). Cada bloque de función abajo ya está basado en la migración vigente más reciente de esa función (indicada en el comentario justo encima de cada `create or replace function`), con el único cambio real siendo `image_id`. Aun así, si al ejecutar este plan ha pasado tiempo desde que se escribió, antes de aplicar la migración corre `mcp__supabase__list_migrations` y compara contra `supabase/migrations/*.sql` en el repo — si hay migraciones más nuevas que tocan `create_order`, `create_order_wompi`, `update_order_items`, `create_pos_sale` o `update_pos_sale` y que no están reflejadas aquí, actualiza el cuerpo de esa función con la versión más reciente antes de aplicar (mismo criterio: solo agregar `image_id`, preservar toda la lógica de negocio existente intacta).

- [ ] **Step 1: Escribir la migración SQL**

```sql
-- 046_seleccion_estampado.sql
-- Permite registrar, por cada linea de carrito/pedido/venta, cual imagen
-- (estampado) especifico eligio el cliente/vendedor dentro de una variante
-- que tiene mas de una foto propia. null = sin estampado especifico
-- (producto sin variantes, o variante con 0-1 imagen propia).

alter table public.cart_items
  add column image_id uuid references public.product_images(id) on delete set null;
alter table public.order_items
  add column image_id uuid references public.product_images(id) on delete set null;
alter table public.pos_sale_items
  add column image_id uuid references public.product_images(id) on delete set null;

create index idx_cart_items_image_id on public.cart_items(image_id);
create index idx_order_items_image_id on public.order_items(image_id);
create index idx_pos_sale_items_image_id on public.pos_sale_items(image_id);

-- --- create_order: arrastra image_id desde cart_items ---
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

  insert into public.order_items (order_id, product_id, variant_id, image_id, name_snapshot, qty, unit_price, line_total)
  select
    v_order_id,
    ci.product_id,
    ci.variant_id,
    ci.image_id,
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

-- --- create_order_wompi: arrastra image_id desde cart_items ---
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

  insert into public.order_items (order_id, product_id, variant_id, image_id, name_snapshot, qty, unit_price, line_total)
  select
    v_order_id,
    ci.product_id,
    ci.variant_id,
    ci.image_id,
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

-- --- update_order_items: p_items acepta imageId opcional ---
-- (cuerpo base = 029_bloquear_edicion_wompi_pendiente.sql, la version
-- vigente mas reciente; unico cambio: image_id de punta a punta)
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
  v_image_id uuid;
  v_qty int;
  v_unit_price numeric(12,2);
  v_available_stock int;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2);
  v_payment_method text;
  v_wompi_transaction_id text;
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

  select shipping, payment_method, wompi_transaction_id
  into v_shipping, v_payment_method, v_wompi_transaction_id
  from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_payment_method = 'wompi' and v_wompi_transaction_id is null then
    raise exception 'Este pedido se pago con Wompi y el pago todavia no se ha confirmado. No se puede editar hasta que el pago se confirme o el pedido se cancele.';
  end if;

  for v_product_id, v_variant_id, v_qty in
    select product_id, variant_id, qty from public.order_items where order_id = p_order_id
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

  delete from public.order_items where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
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

    insert into public.order_items (order_id, product_id, variant_id, image_id, name_snapshot, qty, unit_price, line_total)
    values (p_order_id, v_product_id, v_variant_id, v_image_id, v_name_snapshot, v_qty, v_unit_price, v_qty * v_unit_price);
  end loop;

  update public.orders
  set subtotal = v_subtotal, total = v_subtotal + v_shipping
  where id = p_order_id;

  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;

-- --- create_pos_sale: p_items acepta imageId opcional ---
-- (cuerpo base = 045_pos_clientes_portal.sql, la version vigente mas
-- reciente; unico cambio: image_id de punta a punta)
create or replace function public.create_pos_sale(
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
  v_image_id uuid;
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

  if p_customer_id is null then
    raise exception 'Selecciona el cliente para la venta.';
  end if;

  if p_payment_method = 'credito' then
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
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_price := (v_item->>'unitPrice')::numeric;

    insert into public.pos_sale_items (sale_id, product_id, variant_id, image_id, qty, unit_price, line_total)
    values (v_sale_id, v_product_id, v_variant_id, v_image_id, v_qty, v_unit_price, v_qty * v_unit_price);
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

-- --- update_pos_sale: p_items acepta imageId opcional ---
-- (cuerpo base = 043_fix_update_pos_sale_credit_guards.sql, la version
-- vigente mas reciente; unico cambio: image_id de punta a punta)
create or replace function public.update_pos_sale(
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
  v_image_id uuid;
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
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_price := (v_item->>'unitPrice')::numeric;

    insert into public.pos_sale_items (sale_id, product_id, variant_id, image_id, qty, unit_price, line_total)
    values (p_sale_id, v_product_id, v_variant_id, v_image_id, v_qty, v_unit_price, v_qty * v_unit_price);
  end loop;

  update public.pos_sales
  set subtotal = v_subtotal, discount = p_discount, total = v_total,
      payment_method = p_payment_method, customer_id = p_customer_id
  where id = p_sale_id;

  select * into v_sale from public.pos_sales where id = p_sale_id;
  return v_sale;
end;
$$;
```

- [ ] **Step 2: Aplicar la migración con el MCP de Supabase**

Usa la herramienta `mcp__supabase__apply_migration` con `name: "seleccion_estampado"` y el SQL completo del Step 1.

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Usa `mcp__supabase__generate_typescript_types` y reemplaza el contenido completo de `src/lib/supabase/database.types.ts` con el resultado (mismo procedimiento que en migraciones anteriores de este proyecto — reemplazo total del archivo, no edición manual).

- [ ] **Step 4: Verificar con SQL directo que las columnas y funciones quedaron bien**

Usa `mcp__supabase__execute_sql` con:
```sql
select column_name from information_schema.columns
where table_name in ('cart_items', 'order_items', 'pos_sale_items') and column_name = 'image_id';
```
Debe devolver 3 filas.

- [ ] **Step 5: `pnpm tsc --noEmit`**

Debe pasar sin errores (los tipos regenerados no cambian ninguna firma que el código actual use todavía).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/046_seleccion_estampado.sql src/lib/supabase/database.types.ts
git commit -m "feat: agrega image_id a cart_items/order_items/pos_sale_items y lo arrastra en los RPCs"
```

---

### Task 2: `local-cart.ts` — identidad de línea incluye `imageId` (TDD)

**Files:**
- Modify: `src/lib/cart/local-cart.ts`
- Modify: `src/lib/cart/__tests__/local-cart.test.ts`
- Modify: `src/app/(store)/carrito/guest-cart.tsx` (solo para seguir compilando — sin UI nueva todavía)
- Modify: `src/app/pos/venta-items-editor.tsx` (idem)

**Interfaces:**
- Produces: `LocalCartItem.imageId: string | null`; `updateItemQty(items, productId, variantId, imageId, qty)`; `removeItem(items, productId, variantId, imageId)`; `stockUsadoPorVariante(items, variantId): number` (nueva, exportada).
- Consumes: nada nuevo — es la base que las demás tareas usan.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplaza el contenido de `src/lib/cart/__tests__/local-cart.test.ts` por:

```ts
import { describe, expect, it } from "vitest";
import {
  mergeCartItem,
  updateItemQty,
  removeItem,
  computeSubtotal,
  stockUsadoPorVariante,
} from "../local-cart";
import type { LocalCartItem } from "../local-cart";

const baseItem: LocalCartItem = {
  productId: "p1",
  variantId: null,
  imageId: null,
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

  it("suma la cantidad si el producto/variante/imagen ya existe", () => {
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

  it("usa el stock mas alto entre el item existente y el entrante al fusionar (evita que bajar el stock en vivo reduzca una cantidad ya reservada)", () => {
    const result = mergeCartItem(
      [{ ...baseItem, qty: 3, stock: 5 }],
      { ...baseItem, qty: 1, stock: 2 },
    );
    expect(result[0].qty).toBe(4);
  });

  it("trata la misma variante con distinto estampado (imageId) como lineas distintas", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1", imageId: "img-a" }],
      { ...baseItem, variantId: "v1", imageId: "img-b" },
    );
    expect(result).toHaveLength(2);
  });

  it("al agregar una linea nueva de una variante que ya tiene otra linea, capa la cantidad al cupo restante del stock compartido", () => {
    const result = mergeCartItem(
      [{ ...baseItem, variantId: "v1", imageId: "img-a", qty: 4, stock: 5 }],
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 3, stock: 5 },
    );
    // Cupo restante = 5 (stock total) - 4 (ya usado por img-a) = 1
    expect(result).toHaveLength(2);
    expect(result[1].qty).toBe(1);
  });

  it("al fusionar en una linea existente, tambien respeta lo que ocupan otras lineas de la misma variante", () => {
    const result = mergeCartItem(
      [
        { ...baseItem, variantId: "v1", imageId: "img-a", qty: 2, stock: 5 },
        { ...baseItem, variantId: "v1", imageId: "img-b", qty: 2, stock: 5 },
      ],
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 5, stock: 5 },
    );
    // img-a: 2 + 5 pedidos, pero cupo = 5 (total) - 2 (usado por img-b) = 3
    const lineaA = result.find((i) => i.imageId === "img-a");
    expect(lineaA?.qty).toBe(3);
  });
});

describe("stockUsadoPorVariante", () => {
  it("suma la cantidad de todas las lineas de esa variante", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 2 },
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 3 },
      { ...baseItem, variantId: "v2", imageId: "img-c", qty: 10 },
    ];
    expect(stockUsadoPorVariante(items, "v1")).toBe(5);
  });

  it("devuelve 0 si no hay lineas de esa variante", () => {
    expect(stockUsadoPorVariante([baseItem], "v9")).toBe(0);
  });
});

describe("updateItemQty", () => {
  it("actualiza la cantidad de un item existente", () => {
    const result = updateItemQty([baseItem], "p1", null, null, 3);
    expect(result[0].qty).toBe(3);
  });

  it("capa al stock disponible", () => {
    const result = updateItemQty([baseItem], "p1", null, null, 99);
    expect(result[0].qty).toBe(5);
  });

  it("elimina el item si la cantidad es 0", () => {
    const result = updateItemQty([baseItem], "p1", null, null, 0);
    expect(result).toHaveLength(0);
  });

  it("distingue lineas por imageId: solo actualiza la que coincide", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1 },
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 1 },
    ];
    const result = updateItemQty(items, "p1", "v1", "img-a", 3);
    expect(result.find((i) => i.imageId === "img-a")?.qty).toBe(3);
    expect(result.find((i) => i.imageId === "img-b")?.qty).toBe(1);
  });

  it("capa la cantidad de una linea considerando lo que ya ocupan otras lineas de la misma variante", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a", qty: 1, stock: 5 },
      { ...baseItem, variantId: "v1", imageId: "img-b", qty: 3, stock: 5 },
    ];
    // img-a quiere subir a 10, pero cupo = 5 (total) - 3 (usado por img-b) = 2
    const result = updateItemQty(items, "p1", "v1", "img-a", 10);
    expect(result.find((i) => i.imageId === "img-a")?.qty).toBe(2);
  });
});

describe("removeItem", () => {
  it("quita el item indicado", () => {
    const result = removeItem([baseItem], "p1", null, null);
    expect(result).toHaveLength(0);
  });

  it("no afecta otros items", () => {
    const other: LocalCartItem = { ...baseItem, productId: "p2" };
    const result = removeItem([baseItem, other], "p1", null, null);
    expect(result).toEqual([other]);
  });

  it("distingue lineas por imageId", () => {
    const items: LocalCartItem[] = [
      { ...baseItem, variantId: "v1", imageId: "img-a" },
      { ...baseItem, variantId: "v1", imageId: "img-b" },
    ];
    const result = removeItem(items, "p1", "v1", "img-a");
    expect(result).toEqual([items[1]]);
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

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pnpm vitest run src/lib/cart/__tests__/local-cart.test.ts`
Expected: FAIL — `imageId` no existe en `LocalCartItem`, `stockUsadoPorVariante` no está exportada, `updateItemQty`/`removeItem` no aceptan 4-5 argumentos.

- [ ] **Step 3: Reemplazar `src/lib/cart/local-cart.ts`**

```ts
export type LocalCartItem = {
  productId: string;
  variantId: string | null;
  imageId: string | null;
  slug: string;
  name: string;
  unitPrice: number;
  qty: number;
  imageUrl: string | null;
  stock: number;
};

const STORAGE_KEY = "merylay-cart";

export const CART_UPDATED_EVENT = "merylay-cart-updated";

function sameItem(
  a: LocalCartItem,
  b: { productId: string; variantId: string | null; imageId: string | null },
): boolean {
  return a.productId === b.productId && a.variantId === b.variantId && a.imageId === b.imageId;
}

export function stockUsadoPorVariante(items: LocalCartItem[], variantId: string): number {
  return items
    .filter((i) => i.variantId === variantId)
    .reduce((sum, i) => sum + i.qty, 0);
}

export function mergeCartItem(items: LocalCartItem[], newItem: LocalCartItem): LocalCartItem[] {
  const index = items.findIndex((i) => sameItem(i, newItem));

  if (index === -1) {
    const usadoPorOtrasLineas = newItem.variantId
      ? stockUsadoPorVariante(items, newItem.variantId)
      : 0;
    const cupoDisponible = Math.max(newItem.stock - usadoPorOtrasLineas, 0);
    return [...items, { ...newItem, qty: Math.min(newItem.qty, cupoDisponible) }];
  }

  const updated = [...items];
  const usadoPorOtrasLineas = newItem.variantId
    ? stockUsadoPorVariante(items, newItem.variantId) - updated[index].qty
    : 0;
  const stockDisponible = Math.max(updated[index].stock, newItem.stock);
  const cupoDisponible = Math.max(stockDisponible - usadoPorOtrasLineas, 0);
  const combinedQty = Math.min(updated[index].qty + newItem.qty, cupoDisponible);
  updated[index] = { ...updated[index], qty: combinedQty };
  return updated;
}

export function updateItemQty(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
  imageId: string | null,
  qty: number,
): LocalCartItem[] {
  return items
    .map((i) => {
      if (!sameItem(i, { productId, variantId, imageId })) return i;
      const usadoPorOtrasLineas = variantId ? stockUsadoPorVariante(items, variantId) - i.qty : 0;
      const maximoDisponible = Math.max(i.stock - usadoPorOtrasLineas, 0);
      return { ...i, qty: Math.min(Math.max(qty, 0), maximoDisponible) };
    })
    .filter((i) => i.qty > 0);
}

export function removeItem(
  items: LocalCartItem[],
  productId: string,
  variantId: string | null,
  imageId: string | null,
): LocalCartItem[] {
  return items.filter((i) => !sameItem(i, { productId, variantId, imageId }));
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
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function clearLocalCart(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm vitest run src/lib/cart/__tests__/local-cart.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Actualizar `guest-cart.tsx` para seguir compilando**

En `src/app/(store)/carrito/guest-cart.tsx`, cambia:

```ts
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
```

por:

```ts
  const handleUpdate = (
    productId: string,
    variantId: string | null,
    imageId: string | null,
    qty: number,
  ) => {
    const next = updateItemQty(items, productId, variantId, imageId, qty);
    setItems(next);
    saveLocalCart(next);
  };

  const handleRemove = (productId: string, variantId: string | null, imageId: string | null) => {
    const next = removeItem(items, productId, variantId, imageId);
    setItems(next);
    saveLocalCart(next);
  };
```

Y en el JSX, la clave y las tres llamadas:

```ts
          <div
            key={`${item.productId}-${item.variantId ?? "base"}`}
```
por
```ts
          <div
            key={`${item.productId}-${item.variantId ?? "base"}-${item.imageId ?? "sin-estampado"}`}
```

```ts
                onClick={() => handleUpdate(item.productId, item.variantId, item.qty - 1)}
```
por
```ts
                onClick={() => handleUpdate(item.productId, item.variantId, item.imageId, item.qty - 1)}
```

(la misma sustitución para el botón `+`, y para `handleRemove(item.productId, item.variantId)` → `handleRemove(item.productId, item.variantId, item.imageId)`).

- [ ] **Step 6: Actualizar `venta-items-editor.tsx` para seguir compilando**

En `src/app/pos/venta-items-editor.tsx`, cambia:

```ts
  const handleUpdateQty = (productId: string, variantId: string | null, qty: number) => {
    setItems((prev) => updateItemQty(prev, productId, variantId, qty));
  };

  const handleRemove = (productId: string, variantId: string | null) => {
    setItems((prev) => removeItem(prev, productId, variantId));
  };
```

por:

```ts
  const handleUpdateQty = (
    productId: string,
    variantId: string | null,
    imageId: string | null,
    qty: number,
  ) => {
    setItems((prev) => updateItemQty(prev, productId, variantId, imageId, qty));
  };

  const handleRemove = (productId: string, variantId: string | null, imageId: string | null) => {
    setItems((prev) => removeItem(prev, productId, variantId, imageId));
  };
```

Y en el JSX (dentro de `items.map((item) => (...))`), la clave y las tres llamadas:

```ts
                <div
                  key={`${item.productId}-${item.variantId ?? "base"}`}
```
por
```ts
                <div
                  key={`${item.productId}-${item.variantId ?? "base"}-${item.imageId ?? "sin-estampado"}`}
```

```ts
                    onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty - 1)}
```
por
```ts
                    onClick={() =>
                      handleUpdateQty(item.productId, item.variantId, item.imageId, item.qty - 1)
                    }
```

(misma sustitución para el botón `+`, y `handleRemove(item.productId, item.variantId)` → `handleRemove(item.productId, item.variantId, item.imageId)`).

- [ ] **Step 7: `pnpm tsc --noEmit` y `pnpm vitest run`**

Ambos deben pasar sin errores (el resto del código que construye `LocalCartItem` — `ProductVariantSelector`, `ProductCardPos`, los loaders de edición, `sale-action.test.ts` — todavía NO tiene `imageId`, así que **esto SÍ va a fallar tsc** en esos archivos. Antes de continuar, agrega `imageId: null` a cada literal `LocalCartItem`/`ITEMS` que `tsc` señale como incompleto, únicamente para que compile (sin ningún comportamiento nuevo todavía — las tareas siguientes le dan el valor real):
  - `src/app/(store)/producto/[slug]/product-variant-selector.tsx`: agrega `imageId: null,` al objeto `item` en `handleAddToCart`.
  - `src/app/pos/product-card-pos.tsx`: agrega `imageId: null,` al objeto que arma `confirmarAgregar`.
  - `src/app/pos/(admin)/venta/[id]/editar/page.tsx`: agrega `imageId: null,` al objeto que retorna el `.map` de `itemsIniciales`.
  - `src/app/admin/pedidos/[id]/editar/page.tsx`: idem.
  - `src/app/pos/__tests__/sale-action.test.ts`: agrega `imageId: null,` al `const ITEMS: LocalCartItem[]`.

Vuelve a correr `pnpm tsc --noEmit` y `pnpm vitest run` hasta que ambos pasen limpios.

- [ ] **Step 8: Commit**

```bash
git add src/lib/cart/local-cart.ts src/lib/cart/__tests__/local-cart.test.ts \
  src/app/\(store\)/carrito/guest-cart.tsx src/app/pos/venta-items-editor.tsx \
  src/app/\(store\)/producto/\[slug\]/product-variant-selector.tsx \
  src/app/pos/product-card-pos.tsx \
  src/app/pos/\(admin\)/venta/\[id\]/editar/page.tsx \
  src/app/admin/pedidos/\[id\]/editar/page.tsx \
  src/app/pos/__tests__/sale-action.test.ts
git commit -m "feat: la identidad de una linea de carrito incluye el estampado (imageId)"
```

---

### Task 3: `EstampadoPickerModal` (componente compartido, nuevo)

**Files:**
- Create: `src/components/store/estampado-picker-modal.tsx`
- Create: `src/components/store/__tests__/estampado-picker-modal.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EstampadoOption = { imageId: string; url: string; alt: string | null };

  export function toggleSeleccion(
    seleccionados: string[],
    imageId: string,
    modoUnico: boolean,
  ): string[];

  export function EstampadoPickerModal(props: {
    open: boolean;
    images: EstampadoOption[];
    seleccionInicial: string[];
    modoUnico: boolean;
    onConfirm: (imageIds: string[]) => void;
    onClose: () => void;
  }): JSX.Element;
  ```
- Consumes: `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetClose` de `@/components/ui/sheet` (ya existen).

- [ ] **Step 1: Escribir el test de la función pura que falla**

```ts
// src/components/store/__tests__/estampado-picker-modal.test.ts
import { describe, expect, it } from "vitest";
import { toggleSeleccion } from "../estampado-picker-modal";

describe("toggleSeleccion", () => {
  it("modo multiple: agrega la imagen si no estaba seleccionada", () => {
    const result = toggleSeleccion([], "img-a", false);
    expect(result).toEqual(["img-a"]);
  });

  it("modo multiple: quita la imagen si ya estaba seleccionada", () => {
    const result = toggleSeleccion(["img-a", "img-b"], "img-a", false);
    expect(result).toEqual(["img-b"]);
  });

  it("modo multiple: puede tener varias imagenes seleccionadas a la vez", () => {
    const result = toggleSeleccion(["img-a"], "img-b", false);
    expect(result).toEqual(["img-a", "img-b"]);
  });

  it("modo unico: seleccionar una imagen reemplaza cualquier seleccion anterior", () => {
    const result = toggleSeleccion(["img-a"], "img-b", true);
    expect(result).toEqual(["img-b"]);
  });

  it("modo unico: click en la ya seleccionada la deja seleccionada (no se puede deseleccionar todo)", () => {
    const result = toggleSeleccion(["img-a"], "img-a", true);
    expect(result).toEqual(["img-a"]);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pnpm vitest run src/components/store/__tests__/estampado-picker-modal.test.ts`
Expected: FAIL — el módulo `../estampado-picker-modal` no existe.

- [ ] **Step 3: Crear el componente**

```tsx
// src/components/store/estampado-picker-modal.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export type EstampadoOption = { imageId: string; url: string; alt: string | null };

export function toggleSeleccion(
  seleccionados: string[],
  imageId: string,
  modoUnico: boolean,
): string[] {
  if (modoUnico) {
    return [imageId];
  }
  return seleccionados.includes(imageId)
    ? seleccionados.filter((id) => id !== imageId)
    : [...seleccionados, imageId];
}

export function EstampadoPickerModal({
  open,
  images,
  seleccionInicial,
  modoUnico,
  onConfirm,
  onClose,
}: {
  open: boolean;
  images: EstampadoOption[];
  seleccionInicial: string[];
  modoUnico: boolean;
  onConfirm: (imageIds: string[]) => void;
  onClose: () => void;
}) {
  const [seleccionados, setSeleccionados] = useState<string[]>(seleccionInicial);

  // Reinicia la seleccion cada vez que el modal se abre de nuevo (por
  // ejemplo, al reabrirlo para otra variante o para "Cambiar estampado" de
  // otra linea) — sin esto quedaria la seleccion de la apertura anterior.
  useEffect(() => {
    if (open) {
      setSeleccionados(seleccionInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const confirmar = () => {
    if (seleccionados.length === 0) return;
    onConfirm(seleccionados);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[80vh] max-w-lg rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-brand-ciruela">
            {modoUnico ? "Cambiar estampado" : "Elige el estampado"}
          </SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3 overflow-y-auto px-4 pb-4 sm:grid-cols-4">
          {images.map((image) => {
            const marcada = seleccionados.includes(image.imageId);
            return (
              <button
                key={image.imageId}
                type="button"
                onClick={() =>
                  setSeleccionados((prev) => toggleSeleccion(prev, image.imageId, modoUnico))
                }
                aria-pressed={marcada}
                className={`relative aspect-square overflow-hidden rounded-md border-2 ${
                  marcada ? "border-brand-rosa" : "border-brand-rosa-claro"
                }`}
              >
                <Image
                  src={image.url}
                  alt={image.alt ?? ""}
                  fill
                  className="object-cover"
                />
                {marcada && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-rosa text-brand-crema">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-brand-rosa-claro p-4">
          <Button
            type="button"
            disabled={seleccionados.length === 0}
            onClick={confirmar}
            className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
          >
            {modoUnico ? "Cambiar" : `Agregar ${seleccionados.length || ""} al carrito`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pnpm vitest run src/components/store/__tests__/estampado-picker-modal.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: `pnpm tsc --noEmit` y `pnpm lint`**

Ambos en verde. Si `Sheet` no acepta `open`/`onOpenChange` como props controladas, revisa `src/components/ui/sheet.tsx` — `Sheet` reexporta `SheetPrimitive.Root` de Base UI, que sí las soporta (uso controlado estándar de Base UI Dialog).

- [ ] **Step 6: Commit**

```bash
git add src/components/store/estampado-picker-modal.tsx src/components/store/__tests__/estampado-picker-modal.test.ts
git commit -m "feat: agrega EstampadoPickerModal compartido para elegir estampado"
```

---

### Task 4: Tienda — imágenes con `id` disponible para el selector de variante

**Files:**
- Modify: `src/lib/store/variant-images.ts`
- Modify: `src/app/(store)/producto/[slug]/page.tsx`
- Modify: `src/app/(store)/producto/[slug]/product-detail-interactive.tsx`

**Interfaces:**
- Produces: `ImagenProducto.id: string`; `ProductDetailInteractive` pasa `imagenesDeVarianteActual: EstampadoOption[]` a `ProductVariantSelector`.
- Consumes: `EstampadoOption` de `@/components/store/estampado-picker-modal` (Task 3).

- [ ] **Step 1: `ImagenProducto` gana `id`**

En `src/lib/store/variant-images.ts`:

```ts
export type ImagenProducto = {
  id: string;
  url: string;
  alt: string | null;
  variantId: string | null;
};

export function getImagesForVariant(
  images: ImagenProducto[],
  variantId: string | null,
): ImagenProducto[] {
  const deVarianteActual = variantId ? images.filter((img) => img.variantId === variantId) : [];
  const deOtrasVariantes = images.filter(
    (img) => img.variantId !== null && img.variantId !== variantId,
  );
  const generales = images.filter((img) => img.variantId === null);
  return [...deVarianteActual, ...deOtrasVariantes, ...generales];
}
```

(Solo se agregó el campo `id` al tipo — la lógica de `getImagesForVariant` no cambia.)

- [ ] **Step 2: El loader selecciona e incluye `id`**

En `src/app/(store)/producto/[slug]/page.tsx`, cambia:

```ts
    supabase
      .from("product_images")
      .select("url, alt, variant_id")
      .eq("product_id", producto.id)
      .order("sort_order"),
```
por
```ts
    supabase
      .from("product_images")
      .select("id, url, alt, variant_id")
      .eq("product_id", producto.id)
      .order("sort_order"),
```

y:

```ts
  const imagenesGaleria: ImagenProducto[] = (imagenes ?? []).map((img) => ({
    url: img.url,
    alt: img.alt,
    variantId: img.variant_id,
  }));
```
por
```ts
  const imagenesGaleria: ImagenProducto[] = (imagenes ?? []).map((img) => ({
    id: img.id,
    url: img.url,
    alt: img.alt,
    variantId: img.variant_id,
  }));
```

- [ ] **Step 3: `product-detail-interactive.tsx` calcula las imágenes propias de la variante elegida**

En `src/app/(store)/producto/[slug]/product-detail-interactive.tsx`, importa el tipo y agrega el cálculo:

```ts
import type { EstampadoOption } from "@/components/store/estampado-picker-modal";
```

Después de la línea `const imagenesGaleria = getImagesForVariant(images, variantSeleccionada?.id ?? null);`, agrega:

```ts
  const imagenesDeVarianteActual: EstampadoOption[] = variantSeleccionada
    ? images
        .filter((img) => img.variantId === variantSeleccionada.id)
        .map((img) => ({ imageId: img.id, url: img.url, alt: img.alt }))
    : [];
```

Y pasa la nueva prop a `ProductVariantSelector`:

```tsx
        <ProductVariantSelector
          productId={productId}
          productSlug={productSlug}
          productName={productName}
          imageUrl={imagenPrincipal}
          basePrice={precioMostrado}
          variants={variants}
          baseStock={baseStock}
          currentUserId={currentUserId}
          talla={talla}
          color={color}
          onTallaChange={setTalla}
          onColorChange={setColor}
          imagenesDeVarianteActual={imagenesDeVarianteActual}
        />
```

- [ ] **Step 4: `pnpm tsc --noEmit`**

Va a fallar en `ProductVariantSelector` (todavía no acepta esa prop) — se corrige en la Task 5. Confírmalo (el error debe ser exactamente sobre la prop `imagenesDeVarianteActual` no reconocida) y sigue a la Task 5 sin hacer commit todavía.

---

### Task 5: Tienda — `ProductVariantSelector` usa el modal

**Files:**
- Modify: `src/app/(store)/producto/[slug]/product-variant-selector.tsx`

**Interfaces:**
- Consumes: `EstampadoPickerModal`, `EstampadoOption` (Task 3); `imagenesDeVarianteActual` (Task 4).
- Produces: sin cambios de tipo público — mismo componente, mismo `handleAddToCart` como punto de entrada.

- [ ] **Step 1: Reemplazar el componente completo**

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
import { EstampadoPickerModal, type EstampadoOption } from "@/components/store/estampado-picker-modal";

export function ProductVariantSelector({
  productId,
  productSlug,
  productName,
  imageUrl,
  basePrice,
  variants,
  baseStock,
  currentUserId,
  talla,
  color,
  onTallaChange,
  onColorChange,
  imagenesDeVarianteActual,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  basePrice: number;
  variants: VariantOption[];
  baseStock: number;
  currentUserId: string | null;
  talla: string | null;
  color: string | null;
  onTallaChange: (talla: string | null) => void;
  onColorChange: (color: string | null) => void;
  imagenesDeVarianteActual: EstampadoOption[];
}) {
  const { tallas, colores } = useMemo(() => getVariantOptions(variants), [variants]);
  const [message, setMessage] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
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

  const agregarItems = (imageIds: (string | null)[]) => {
    setMessage(null);
    const items: LocalCartItem[] = imageIds.map((imageId) => {
      const imagenElegida = imageId
        ? imagenesDeVarianteActual.find((img) => img.imageId === imageId)
        : undefined;
      return {
        productId,
        variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
        imageId: imageId ?? null,
        slug: productSlug,
        name: displayName,
        unitPrice,
        qty: 1,
        imageUrl: imagenElegida?.url ?? imageUrl,
        stock: stockDisponible,
      };
    });

    if (currentUserId) {
      startTransition(async () => {
        for (const item of items) {
          const result = await addToCart(item.productId, item.variantId, item.imageId, 1, item.unitPrice);
          if (result?.error) {
            setMessage(result.error);
            return;
          }
        }
        setMessage(items.length > 1 ? "Agregados al carrito." : "Agregado al carrito.");
      });
    } else {
      let current = getLocalCart();
      for (const item of items) {
        current = mergeCartItem(current, item);
      }
      saveLocalCart(current);
      setMessage(items.length > 1 ? "Agregados al carrito." : "Agregado al carrito.");
    }
  };

  const handleAddToCart = () => {
    if (imagenesDeVarianteActual.length > 1) {
      setModalAbierto(true);
      return;
    }
    agregarItems([imagenesDeVarianteActual[0]?.imageId ?? null]);
  };

  return (
    <div className="flex flex-col gap-4">
      {tallas.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Talla</label>
          <select
            value={talla ?? ""}
            onChange={(e) => onTallaChange(e.target.value || null)}
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
            onChange={(e) => onColorChange(e.target.value || null)}
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

      <EstampadoPickerModal
        open={modalAbierto}
        images={imagenesDeVarianteActual}
        seleccionInicial={[]}
        modoUnico={false}
        onClose={() => setModalAbierto(false)}
        onConfirm={(imageIds) => {
          setModalAbierto(false);
          agregarItems(imageIds);
        }}
      />
    </div>
  );
}
```

Nota: `addToCart` todavía no acepta `imageId` como tercer parámetro — eso se agrega en la Task 6. Este archivo va a fallar `tsc` hasta completar esa tarea; es esperado, sigue de inmediato a la Task 6 sin hacer commit todavía.

- [ ] **Step 2: `pnpm tsc --noEmit`**

Confirma que el único error restante es la firma de `addToCart` (Task 6 lo resuelve).

---

### Task 6: `addToCart` gana `imageId` + `updateCartItemImage` + `mergeGuestCart`

**Files:**
- Modify: `src/app/(store)/carrito/actions.ts`
- Modify: `src/lib/cart/merge-guest-cart-action.ts`

**Interfaces:**
- Produces: `addToCart(productId, variantId, imageId, qty, unitPrice)`; `updateCartItemImage(cartItemId, imageId): Promise<{ error?: string }>` (nueva).
- Consumes: nada nuevo de tareas anteriores más allá de la columna `image_id` (Task 1).

- [ ] **Step 1: Actualizar `addToCart` y agregar `updateCartItemImage`**

En `src/app/(store)/carrito/actions.ts`, reemplaza `addToCart` por:

```ts
export async function addToCart(
  productId: string,
  variantId: string | null,
  imageId: string | null,
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
  existingQuery = imageId
    ? existingQuery.eq("image_id", imageId)
    : existingQuery.is("image_id", null);
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
      image_id: imageId,
      qty,
      unit_price: unitPrice,
    });
    if (error) return { error: "No se pudo agregar al carrito." };
  }

  revalidatePath("/carrito");
  revalidatePath("/", "layout");
  return {};
}

export async function updateCartItemImage(
  cartItemId: string,
  imageId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cart_items")
    .update({ image_id: imageId })
    .eq("id", cartItemId);
  if (error) return { error: "No se pudo cambiar el estampado." };
  revalidatePath("/carrito");
  return {};
}
```

Deja `updateCartItemQty` y `removeCartItem` sin cambios (operan por `cartItemId`, ya único por fila).

- [ ] **Step 2: `mergeGuestCart` arrastra `imageId`**

En `src/lib/cart/merge-guest-cart-action.ts`, cambia:

```ts
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
```

por:

```ts
  for (const item of items) {
    let existingQuery = supabase
      .from("cart_items")
      .select("id, qty")
      .eq("cart_id", cartId)
      .eq("product_id", item.productId);
    existingQuery = item.variantId
      ? existingQuery.eq("variant_id", item.variantId)
      : existingQuery.is("variant_id", null);
    existingQuery = item.imageId
      ? existingQuery.eq("image_id", item.imageId)
      : existingQuery.is("image_id", null);
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
        image_id: item.imageId,
        qty: item.qty,
        unit_price: item.unitPrice,
      });
    }
  }
```

- [ ] **Step 3: `pnpm tsc --noEmit`**

`product-variant-selector.tsx` (Task 5) ahora debe compilar limpio — confirma que no quedan errores.

- [ ] **Step 4: `pnpm vitest run` y `pnpm lint`**

Ambos en verde.

- [ ] **Step 5: Commit (Tasks 4, 5 y 6 juntas)**

```bash
git add src/lib/store/variant-images.ts \
  src/app/\(store\)/producto/\[slug\]/page.tsx \
  src/app/\(store\)/producto/\[slug\]/product-detail-interactive.tsx \
  src/app/\(store\)/producto/\[slug\]/product-variant-selector.tsx \
  src/app/\(store\)/carrito/actions.ts \
  src/lib/cart/merge-guest-cart-action.ts
git commit -m "feat: la tienda abre el selector de estampado al agregar al carrito una variante con varias imagenes"
```

---

### Task 7: Carrito — miniatura y "Cambiar estampado"

**Files:**
- Modify: `src/app/(store)/carrito/page.tsx`
- Modify: `src/app/(store)/carrito/authenticated-cart.tsx`
- Modify: `src/app/(store)/carrito/cart-item-controls.tsx`
- Modify: `src/app/(store)/carrito/guest-cart.tsx`

**Interfaces:**
- Consumes: `updateCartItemImage` (Task 6), `EstampadoPickerModal`/`EstampadoOption` (Task 3).
- Produces: `CartItemView` gana `imageUrl: string | null` y `estampadosDisponibles: EstampadoOption[]`.

- [ ] **Step 1: `carrito/page.tsx` trae imágenes**

Reemplaza el bloque de queries y el `map` final:

```ts
  const { data: cartItems } = cart
    ? await supabase
        .from("cart_items")
        .select("id, product_id, variant_id, image_id, qty, unit_price")
        .eq("cart_id", cart.id)
    : { data: [] };

  const productIds = (cartItems ?? []).map((i) => i.product_id);
  const variantIds = (cartItems ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }, { data: imagenesDeVariantes }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, slug").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    variantIds.length > 0
      ? supabase.from("product_variants").select("id, talla, color").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; talla: string | null; color: string | null }[] }),
    variantIds.length > 0
      ? supabase
          .from("product_images")
          .select("id, url, alt, variant_id")
          .in("variant_id", variantIds)
      : Promise.resolve({ data: [] as { id: string; url: string; alt: string | null; variant_id: string | null }[] }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));
  const imagenPorId = new Map((imagenesDeVariantes ?? []).map((img) => [img.id, img.url]));

  const items: CartItemView[] = (cartItems ?? []).map((item) => {
    const product = productById.get(item.product_id);
    const variant = item.variant_id ? variantById.get(item.variant_id) : null;
    const estampadosDeEstaVariante = item.variant_id
      ? (imagenesDeVariantes ?? [])
          .filter((img) => img.variant_id === item.variant_id)
          .map((img) => ({ imageId: img.id, url: img.url, alt: img.alt }))
      : [];
    return {
      id: item.id,
      name: product?.name ?? "Producto",
      slug: product?.slug ?? "",
      variantLabel: variant
        ? [variant.talla, variant.color].filter(Boolean).join(" / ")
        : null,
      qty: item.qty,
      unitPrice: item.unit_price,
      imageUrl: item.image_id ? (imagenPorId.get(item.image_id) ?? null) : null,
      estampadosDisponibles: estampadosDeEstaVariante,
    };
  });
```

- [ ] **Step 2: `CartItemView` y `AuthenticatedCart` muestran la miniatura y el botón**

Reemplaza `src/app/(store)/carrito/authenticated-cart.tsx` completo:

```tsx
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CartItemControls } from "./cart-item-controls";
import type { EstampadoOption } from "@/components/store/estampado-picker-modal";

export type CartItemView = {
  id: string;
  name: string;
  slug: string;
  variantLabel: string | null;
  qty: number;
  unitPrice: number;
  imageUrl: string | null;
  estampadosDisponibles: EstampadoOption[];
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
            {item.imageUrl && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-brand-rosa-claro">
                <Image src={item.imageUrl} alt="" fill className="object-cover" />
              </div>
            )}
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
            <CartItemControls
              cartItemId={item.id}
              qty={item.qty}
              estampadosDisponibles={item.estampadosDisponibles}
            />
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

- [ ] **Step 3: `CartItemControls` gana el botón "Cambiar estampado"**

Reemplaza `src/app/(store)/carrito/cart-item-controls.tsx` completo:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItemQty, removeCartItem, updateCartItemImage } from "./actions";
import { EstampadoPickerModal, type EstampadoOption } from "@/components/store/estampado-picker-modal";

export function CartItemControls({
  cartItemId,
  qty,
  estampadosDisponibles,
}: {
  cartItemId: string;
  qty: number;
  estampadosDisponibles: EstampadoOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);

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

  const handleCambiarEstampado = (imageIds: string[]) => {
    setModalAbierto(false);
    startTransition(async () => {
      await updateCartItemImage(cartItemId, imageIds[0]);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
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
      {estampadosDisponibles.length > 1 && (
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="text-xs text-brand-rosa hover:underline"
        >
          Cambiar estampado
        </button>
      )}
      <EstampadoPickerModal
        open={modalAbierto}
        images={estampadosDisponibles}
        seleccionInicial={[]}
        modoUnico
        onClose={() => setModalAbierto(false)}
        onConfirm={handleCambiarEstampado}
      />
    </div>
  );
}
```

- [ ] **Step 4: `GuestCart` — miniatura y "Cambiar estampado" client-side**

Reemplaza `src/app/(store)/carrito/guest-cart.tsx` completo:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { EstampadoPickerModal, type EstampadoOption } from "@/components/store/estampado-picker-modal";

export function GuestCart() {
  const [items, setItems] = useState<LocalCartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lineaEditando, setLineaEditando] = useState<{
    productId: string;
    variantId: string | null;
    imageId: string | null;
    estampados: EstampadoOption[];
  } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(getLocalCart());
    setLoaded(true);
  }, []);

  const handleUpdate = (
    productId: string,
    variantId: string | null,
    imageId: string | null,
    qty: number,
  ) => {
    const next = updateItemQty(items, productId, variantId, imageId, qty);
    setItems(next);
    saveLocalCart(next);
  };

  const handleRemove = (productId: string, variantId: string | null, imageId: string | null) => {
    const next = removeItem(items, productId, variantId, imageId);
    setItems(next);
    saveLocalCart(next);
  };

  const handleCambiarEstampado = (nuevoImageId: string) => {
    if (!lineaEditando) return;
    const nuevaImagen = lineaEditando.estampados.find((e) => e.imageId === nuevoImageId);
    const next = items.map((item) =>
      item.productId === lineaEditando.productId &&
      item.variantId === lineaEditando.variantId &&
      item.imageId === lineaEditando.imageId
        ? { ...item, imageId: nuevoImageId, imageUrl: nuevaImagen?.url ?? item.imageUrl }
        : item,
    );
    setItems(next);
    saveLocalCart(next);
    setLineaEditando(null);
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
            key={`${item.productId}-${item.variantId ?? "base"}-${item.imageId ?? "sin-estampado"}`}
            className="flex items-center gap-4 py-4"
          >
            {item.imageUrl && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-brand-rosa-claro">
                <Image src={item.imageUrl} alt="" fill className="object-cover" />
              </div>
            )}
            <div className="flex-1">
              <Link
                href={`/producto/${item.slug}`}
                className="font-body text-brand-ciruela hover:text-brand-rosa"
              >
                {item.name}
              </Link>
              <p className="text-sm text-brand-rosa">{formatPrice(item.unitPrice)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate(item.productId, item.variantId, item.imageId, item.qty - 1)
                  }
                  className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm text-brand-ciruela">{item.qty}</span>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate(item.productId, item.variantId, item.imageId, item.qty + 1)
                  }
                  className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.productId, item.variantId, item.imageId)}
                  className="ml-2 text-sm text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
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
      {lineaEditando && (
        <EstampadoPickerModal
          open
          images={lineaEditando.estampados}
          seleccionInicial={lineaEditando.imageId ? [lineaEditando.imageId] : []}
          modoUnico
          onClose={() => setLineaEditando(null)}
          onConfirm={(imageIds) => handleCambiarEstampado(imageIds[0])}
        />
      )}
    </div>
  );
}
```

Nota: `GuestCart` no tiene, hoy, forma de saber qué otros estampados existen para la variante de una línea (el carrito de invitado no re-consulta la base de datos) — por eso esta versión omite el botón "Cambiar estampado" para invitados (queda disponible solo logueado, donde `carrito/page.tsx` sí trae `estampadosDisponibles` desde el servidor). Esto es una limitación aceptable: el invitado puede lograr el mismo resultado quitando la línea y agregándola de nuevo desde la página del producto.

- [ ] **Step 5: `pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm lint`**

Los tres en verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(store\)/carrito/page.tsx \
  src/app/\(store\)/carrito/authenticated-cart.tsx \
  src/app/\(store\)/carrito/cart-item-controls.tsx \
  src/app/\(store\)/carrito/guest-cart.tsx
git commit -m "feat: el carrito muestra el estampado elegido y permite cambiarlo (cliente logueado)"
```

---

### Task 8: POS — `buscarProductosPos` trae imágenes por variante

**Files:**
- Modify: `src/app/pos/product-browser-action.ts`
- Modify: `src/app/pos/__tests__/product-browser-action.test.ts`

**Interfaces:**
- Produces: `PosProductoResult.variants[].images: EstampadoOption[]` (nuevo campo en `VariantOption` — ver Step 1).
- Consumes: `EstampadoOption` (Task 3).

- [ ] **Step 1: Extender `VariantOption` con `images`**

`VariantOption` vive en `src/lib/store/variants.ts` y la usan también la tienda pública y `ProductCardPos`. Agrégale un campo opcional para no romper a nadie que no lo necesite:

```ts
// src/lib/store/variants.ts — agrega el campo al tipo existente
export type VariantOption = {
  id: string;
  talla: string | null;
  color: string | null;
  sku: string;
  stock: number;
  priceOverride: number | null;
  images?: { imageId: string; url: string; alt: string | null }[];
};
```

(Revisa el archivo real antes de editar: agrega solo el campo `images?`, sin tocar el resto de campos existentes ni `getVariantOptions`/`findMatchingVariant`.)

- [ ] **Step 2: Escribir el test que falla**

Agrega este `it` dentro de `describe("buscarProductosPos", ...)` en `src/app/pos/__tests__/product-browser-action.test.ts`, justo después del test `"mapea imagen principal y variantes al resultado"`:

```ts
  it("agrupa las imagenes de cada variante por variant_id", async () => {
    const supabase = crearSupabaseMock({
      products: [PRODUCTO_BASE],
      product_variants: [
        {
          id: "var-1",
          product_id: "prod-1",
          talla: "M",
          color: "Rosa",
          sku: "PIJ-001-M-ROS",
          stock: 5,
          price_override: null,
        },
      ],
      product_images: [
        { id: "img-1", url: "https://cdn.example.com/1.jpg", alt: null, variant_id: "var-1", is_primary: true },
        { id: "img-2", url: "https://cdn.example.com/2.jpg", alt: null, variant_id: "var-1", is_primary: false },
        { id: "img-3", url: "https://cdn.example.com/3.jpg", alt: null, variant_id: null, is_primary: false },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado[0].imageUrl).toBe("https://cdn.example.com/1.jpg");
    expect(resultado[0].variants[0].images).toEqual([
      { imageId: "img-1", url: "https://cdn.example.com/1.jpg", alt: null },
      { imageId: "img-2", url: "https://cdn.example.com/2.jpg", alt: null },
    ]);
  });
```

También actualiza el test existente `"mapea imagen principal y variantes al resultado"`: su mock de `product_images` (`[{ product_id: "prod-1", url: "..." }]`) ahora debe incluir `id` e `is_primary` porque la consulta real va a seleccionar esas columnas:

```ts
      product_images: [
        { id: "img-0", product_id: "prod-1", url: "https://cdn.example.com/img.jpg", variant_id: null, is_primary: true },
      ],
```

y su expectativa `resultado[0].variants` debe incluir `images: []` (esa variante no tiene imágenes propias en este test):

```ts
    expect(resultado[0].variants).toEqual([
      {
        id: "var-1",
        talla: "M",
        color: "Rosa",
        sku: "PIJ-001-M-ROS",
        stock: 5,
        priceOverride: null,
        images: [],
      },
    ]);
```

- [ ] **Step 3: Correr los tests y confirmar que fallan**

Run: `pnpm vitest run src/app/pos/__tests__/product-browser-action.test.ts`
Expected: FAIL — `buscarProductosPos` todavía consulta `product_images` con `.eq("is_primary", true)` y no selecciona `id`/`variant_id`/`is_primary`, así que ni la imagen principal por múltiples variantes ni `images` existen en el resultado.

- [ ] **Step 4: Reescribir `buscarProductosPos`**

En `src/app/pos/product-browser-action.ts`, reemplaza el bloque de consultas e mapeo:

```ts
  const productIds = products.map((p) => p.id);
  const [
    { data: variants, error: variantsError },
    { data: images, error: imagesError },
  ] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, product_id, talla, color, sku, stock, price_override")
      .in("product_id", productIds)
      .order("talla"),
    supabase
      .from("product_images")
      .select("id, product_id, variant_id, url, alt, is_primary")
      .in("product_id", productIds)
      .order("sort_order"),
  ]);
  if (variantsError) throw variantsError;
  if (imagesError) throw imagesError;

  const imagenPrincipalPorProducto = new Map<string, string>();
  for (const img of images ?? []) {
    if (img.is_primary && !imagenPrincipalPorProducto.has(img.product_id)) {
      imagenPrincipalPorProducto.set(img.product_id, img.url);
    }
  }
  // Si ningun producto tiene una imagen marcada como principal, usa la
  // primera imagen general disponible (mismo criterio de respaldo que la
  // tienda publica).
  for (const img of images ?? []) {
    if (!imagenPrincipalPorProducto.has(img.product_id)) {
      imagenPrincipalPorProducto.set(img.product_id, img.url);
    }
  }

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: precioEfectivo(p.price, p.promo_price),
    stock: p.stock,
    imageUrl: imagenPrincipalPorProducto.get(p.id) ?? null,
    variants: (variants ?? [])
      .filter((v) => v.product_id === p.id)
      .map((v) => ({
        id: v.id,
        talla: v.talla,
        color: v.color,
        sku: v.sku,
        stock: v.stock,
        priceOverride: v.price_override,
        images: (images ?? [])
          .filter((img) => img.variant_id === v.id)
          .map((img) => ({ imageId: img.id, url: img.url, alt: img.alt })),
      })),
  }));
```

Revisa que el resto de la función (la parte que arma `productsQuery` y valida `trimmed`/`categoryId`) no cambia.

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `pnpm vitest run src/app/pos/__tests__/product-browser-action.test.ts`
Expected: PASS (todos, incluidos los 6 anteriores que no debían romperse).

- [ ] **Step 6: `pnpm tsc --noEmit` y `pnpm lint`**

Ambos en verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/store/variants.ts src/app/pos/product-browser-action.ts src/app/pos/__tests__/product-browser-action.test.ts
git commit -m "feat: buscarProductosPos agrupa las imagenes de cada variante"
```

---

### Task 9: POS — `ProductCardPos` usa el modal

**Files:**
- Modify: `src/app/pos/product-card-pos.tsx`

**Interfaces:**
- Consumes: `EstampadoPickerModal` (Task 3), `product.variants[].images` (Task 8).
- Produces: sin cambios de tipo público — `onAdd` puede llamarse varias veces por confirmación.

- [ ] **Step 1: Reemplazar el componente completo**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getVariantOptions, findMatchingVariant } from "@/lib/store/variants";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { PosProductoResult } from "./product-browser-action";
import { EstampadoPickerModal } from "@/components/store/estampado-picker-modal";

export function ProductCardPos({
  product,
  umbralStockBajo,
  onAdd,
}: {
  product: PosProductoResult;
  umbralStockBajo: number;
  onAdd: (item: LocalCartItem) => void;
}) {
  const { tallas, colores } = getVariantOptions(product.variants);
  const hasVariants = product.variants.length > 0;
  const [seleccionando, setSeleccionando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [talla, setTalla] = useState<string | null>(product.variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(product.variants[0]?.color ?? null);

  const variantSeleccionada = hasVariants
    ? findMatchingVariant(product.variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : product.stock;
  const unitPrice = variantSeleccionada?.priceOverride ?? product.price;
  const agotado = stockDisponible <= 0;
  const imagenesDeVariante = variantSeleccionada?.images ?? [];

  const stockColapsado = hasVariants
    ? Math.max(0, ...product.variants.map((v) => v.stock))
    : product.stock;
  const hayStockEnAlgunaVariante = hasVariants
    ? product.variants.some((v) => v.stock > 0)
    : product.stock > 0;
  const agotadoColapsado = !hayStockEnAlgunaVariante;

  const stockMostrado = seleccionando ? stockDisponible : stockColapsado;
  const stockBadge =
    stockMostrado === 0
      ? { variant: "danger" as const, label: "Agotado" }
      : stockMostrado <= umbralStockBajo
        ? { variant: "warning" as const, label: `${stockMostrado} unidades` }
        : { variant: "neutral" as const, label: `${stockMostrado} unidades` };

  const agregarItems = (imageIds: (string | null)[]) => {
    const variantLabel = [talla, color].filter(Boolean).join(" / ");
    for (const imageId of imageIds) {
      const imagenElegida = imageId
        ? imagenesDeVariante.find((img) => img.imageId === imageId)
        : undefined;
      onAdd({
        productId: product.id,
        variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
        imageId: imageId ?? null,
        slug: "",
        name: hasVariants && variantLabel ? `${product.name} (${variantLabel})` : product.name,
        unitPrice,
        qty: 1,
        imageUrl: imagenElegida?.url ?? product.imageUrl,
        stock: stockDisponible,
      });
    }
    setSeleccionando(false);
  };

  const confirmarAgregar = () => {
    if (imagenesDeVariante.length > 1) {
      setModalAbierto(true);
      return;
    }
    agregarItems([imagenesDeVariante[0]?.imageId ?? null]);
  };

  const handleAgregarClick = () => {
    if (hasVariants && !seleccionando) {
      setSeleccionando(true);
      return;
    }
    confirmarAgregar();
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-3 shadow-brand-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-brand-rosa-claro">
        {product.imageUrl && (
          <Image src={product.imageUrl} alt={product.name} fill className="object-contain" />
        )}
      </div>
      <p className="text-sm text-brand-ciruela">{product.name}</p>
      <div className="flex items-center justify-between">
        <span className="font-heading text-brand-rosa">{formatPrice(unitPrice)}</span>
        <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>
      </div>

      {seleccionando && hasVariants && (
        <div className="flex flex-col gap-2 rounded-md border border-brand-rosa-claro bg-brand-crema p-2">
          {tallas.length > 0 && (
            <div role="group" aria-label="Talla" className="flex flex-wrap gap-1">
              {tallas.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTalla(t)}
                  aria-pressed={talla === t}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    talla === t
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {colores.length > 0 && (
            <div role="group" aria-label="Color" className="flex flex-wrap gap-1">
              {colores.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    color === c
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={agotado}
            onClick={confirmarAgregar}
            className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      )}

      {!seleccionando && (
        <button
          type="button"
          disabled={agotadoColapsado}
          onClick={handleAgregarClick}
          className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
        >
          Agregar
        </button>
      )}

      <EstampadoPickerModal
        open={modalAbierto}
        images={imagenesDeVariante}
        seleccionInicial={[]}
        modoUnico={false}
        onClose={() => setModalAbierto(false)}
        onConfirm={(imageIds) => {
          setModalAbierto(false);
          agregarItems(imageIds);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: `pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm lint`**

Los tres en verde.

- [ ] **Step 3: Commit**

```bash
git add src/app/pos/product-card-pos.tsx
git commit -m "feat: el POS abre el selector de estampado al agregar una variante con varias imagenes"
```

---

### Task 10: POS — `sale-action.ts` arrastra `imageId`

**Files:**
- Modify: `src/app/pos/sale-action.ts`
- Modify: `src/app/pos/__tests__/sale-action.test.ts`

**Interfaces:**
- Consumes: `LocalCartItem.imageId` (Task 2).
- Produces: sin cambios de firma pública de `registrarVenta`.

- [ ] **Step 1: Extender el test existente que verifica el payload del RPC**

En `src/app/pos/__tests__/sale-action.test.ts`, el `ITEMS` constante (ya tiene `imageId: null` desde la Task 2) — agrega un test nuevo dentro de `describe("registrarVenta", ...)`:

```ts
  it("venta con estampado elegido: envia imageId por item", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const itemsConEstampado = [{ ...ITEMS[0], imageId: "img-1" }];

    const { registrarVenta } = await import("../sale-action");
    await expect(
      registrarVenta(itemsConEstampado, "efectivo", 0, null, "cust-1"),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_pos_sale",
      expect.objectContaining({
        p_items: [expect.objectContaining({ imageId: "img-1" })],
      }),
    );
  });
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pnpm vitest run src/app/pos/__tests__/sale-action.test.ts`
Expected: FAIL — el objeto que arma `p_items` hoy no incluye `imageId`.

- [ ] **Step 3: Actualizar `registrarVenta`**

En `src/app/pos/sale-action.ts`, cambia el `.map` dentro de la llamada a `create_pos_sale`:

```ts
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
```
por
```ts
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      imageId: item.imageId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm vitest run src/app/pos/__tests__/sale-action.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: `pnpm tsc --noEmit` y `pnpm lint`**

Ambos en verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/pos/sale-action.ts src/app/pos/__tests__/sale-action.test.ts
git commit -m "feat: registrarVenta envia el estampado elegido de cada item al RPC"
```

---

### Task 11: Editores de venta/pedido — preservan `image_id` sin agregar selector nuevo

**Files:**
- Modify: `src/app/pos/(admin)/venta/[id]/editar/page.tsx`
- Modify: `src/app/pos/(admin)/venta/[id]/editar/actions.ts`
- Modify: `src/app/admin/pedidos/[id]/editar/page.tsx`
- Modify: `src/app/admin/pedidos/[id]/editar/actions.ts`

**Interfaces:**
- Consumes: `LocalCartItem.imageId` (Task 2).
- Produces: sin cambios de firma pública — solo evita que editar una venta/pedido borre el estampado ya elegido.

- [ ] **Step 1: `pos/venta/[id]/editar/page.tsx` — selecciona y mapea `image_id`**

Cambia:
```ts
  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("qty, unit_price, product_id, variant_id")
    .eq("sale_id", venta.id);
```
por
```ts
  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("qty, unit_price, product_id, variant_id, image_id")
    .eq("sale_id", venta.id);
```

Y dentro del `.map` que arma `itemsIniciales`, cambia la línea `imageUrl: null,` (agregada como fix de compilación en la Task 2) por `imageId: item.image_id,` y agrega `imageUrl: null,` inmediatamente después (el editor no necesita mostrar la miniatura, solo preservar el id):

```ts
    return {
      productId: item.product_id ?? "",
      variantId: item.variant_id,
      imageId: item.image_id,
      slug: "",
      name: varianteLabel ? `${nombreBase} (${varianteLabel})` : nombreBase,
      unitPrice: item.unit_price,
      qty: item.qty,
      imageUrl: null,
      stock: stockActual + item.qty,
    };
```

- [ ] **Step 2: `pos/venta/[id]/editar/actions.ts` — envía `imageId` al RPC**

Cambia:
```ts
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
```
por
```ts
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      imageId: item.imageId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
```

- [ ] **Step 3: `admin/pedidos/[id]/editar/page.tsx` — mismo tratamiento**

Cambia:
```ts
  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, product_id, variant_id")
    .eq("order_id", pedido.id);
```
por
```ts
  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, product_id, variant_id, image_id")
    .eq("order_id", pedido.id);
```

Y en el `.map`:
```ts
    return {
      productId: item.product_id ?? "",
      variantId: item.variant_id,
      imageId: item.image_id,
      slug: "",
      name: varianteLabel ? `${nombreBase} (${varianteLabel})` : nombreBase,
      unitPrice: item.unit_price,
      qty: item.qty,
      imageUrl: null,
      stock: stockActual + item.qty,
    };
```

- [ ] **Step 4: `admin/pedidos/[id]/editar/actions.ts` — envía `imageId` al RPC**

Cambia:
```ts
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
```
por
```ts
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      imageId: item.imageId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
```

- [ ] **Step 5: `pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm lint`**

Los tres en verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/pos/\(admin\)/venta/\[id\]/editar/page.tsx \
  src/app/pos/\(admin\)/venta/\[id\]/editar/actions.ts \
  src/app/admin/pedidos/\[id\]/editar/page.tsx \
  src/app/admin/pedidos/\[id\]/editar/actions.ts
git commit -m "fix: editar una venta o pedido ya no borra el estampado que el cliente habia elegido"
```

---

### Task 12: Miniaturas en detalle de pedido/venta

**Files:**
- Modify: `src/app/admin/pedidos/[id]/page.tsx`
- Modify: `src/app/(store)/cuenta/pedidos/[id]/page.tsx`
- Modify: `src/app/pos/(admin)/venta/[id]/page.tsx`

**Interfaces:**
- Consumes: `image_id` en `order_items`/`pos_sale_items` (Task 1).
- Produces: sin tipos nuevos exportados — cambio visual local a cada página.

- [ ] **Step 1: `admin/pedidos/[id]/page.tsx`**

Cambia:
```ts
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, unit_price, line_total")
    .eq("order_id", pedido.id);
```
por
```ts
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, unit_price, line_total, image_id")
    .eq("order_id", pedido.id);

  const imageIds = (items ?? [])
    .map((i) => i.image_id)
    .filter((v): v is string => Boolean(v));
  const { data: imagenes } =
    imageIds.length > 0
      ? await supabase.from("product_images").select("id, url").in("id", imageIds)
      : { data: [] as { id: string; url: string }[] };
  const urlPorImagen = new Map((imagenes ?? []).map((img) => [img.id, img.url]));
```

Y en el JSX, cambia:
```tsx
            {(items ?? []).map((item, index) => (
              <div
                key={index}
                className="flex justify-between py-2 text-sm text-brand-ciruela"
              >
                <span>
                  {item.name_snapshot} × {item.qty}
                </span>
                <span>{formatPrice(item.line_total)}</span>
              </div>
            ))}
```
por
```tsx
            {(items ?? []).map((item, index) => {
              const miniatura = item.image_id ? urlPorImagen.get(item.image_id) : null;
              return (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 text-sm text-brand-ciruela"
                >
                  <span className="flex items-center gap-2">
                    {miniatura && (
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-brand-rosa-claro">
                        <Image src={miniatura} alt="" fill className="object-cover" />
                      </span>
                    )}
                    {item.name_snapshot} × {item.qty}
                  </span>
                  <span>{formatPrice(item.line_total)}</span>
                </div>
              );
            })}
```

Y agrega el import al inicio del archivo:
```ts
import Image from "next/image";
```

- [ ] **Step 2: `cuenta/pedidos/[id]/page.tsx` — mismo tratamiento**

Aplica exactamente el mismo cambio de query, cálculo de `urlPorImagen` y JSX que en el Step 1, sobre `src/app/(store)/cuenta/pedidos/[id]/page.tsx` (misma estructura de tabla, mismo bloque `items.map`). Agrega el import `import Image from "next/image";`.

- [ ] **Step 3: `pos/venta/[id]/page.tsx` — mismo tratamiento sobre `pos_sale_items`**

El recibo POS ya construye `productById`/`variantById` a partir de `pos_sale_items` (columnas `qty, unit_price, line_total, product_id, variant_id`). Cambia el select:

```ts
    supabase
      .from("pos_sale_items")
      .select("qty, unit_price, line_total, product_id, variant_id")
      .eq("sale_id", venta.id),
```
por
```ts
    supabase
      .from("pos_sale_items")
      .select("qty, unit_price, line_total, product_id, variant_id, image_id")
      .eq("sale_id", venta.id),
```

Después de donde se calculan `productById`/`variantById`, agrega:

```ts
  const imageIds = (items ?? [])
    .map((i) => i.image_id)
    .filter((v): v is string => Boolean(v));
  const { data: imagenesEstampado } =
    imageIds.length > 0
      ? await supabase.from("product_images").select("id, url").in("id", imageIds)
      : { data: [] as { id: string; url: string }[] };
  const urlPorImagen = new Map((imagenesEstampado ?? []).map((img) => [img.id, img.url]));
```

Y en el JSX donde se renderiza cada línea del recibo:
```tsx
          {(items ?? []).map((item, index) => {
            const nombre = item.product_id
              ? (productById.get(item.product_id) ?? "Producto")
              : "Producto";
            const variante = item.variant_id ? variantById.get(item.variant_id) : null;
            const varianteLabel = variante
              ? [variante.talla, variante.color].filter(Boolean).join(" / ")
              : null;
            return (
              <div key={index} className="flex justify-between py-1">
                <span>
                  {nombre}
                  {varianteLabel ? ` (${varianteLabel})` : ""} × {item.qty}
                </span>
                <span>{formatPrice(item.line_total)}</span>
              </div>
            );
          })}
```
por
```tsx
          {(items ?? []).map((item, index) => {
            const nombre = item.product_id
              ? (productById.get(item.product_id) ?? "Producto")
              : "Producto";
            const variante = item.variant_id ? variantById.get(item.variant_id) : null;
            const varianteLabel = variante
              ? [variante.talla, variante.color].filter(Boolean).join(" / ")
              : null;
            const miniatura = item.image_id ? urlPorImagen.get(item.image_id) : null;
            return (
              <div key={index} className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2">
                  {miniatura && (
                    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-brand-rosa-claro">
                      <Image src={miniatura} alt="" fill className="object-cover" />
                    </span>
                  )}
                  {nombre}
                  {varianteLabel ? ` (${varianteLabel})` : ""} × {item.qty}
                </span>
                <span>{formatPrice(item.line_total)}</span>
              </div>
            );
          })}
```

(El archivo ya importa `next/image` — confírmalo antes de agregar un segundo import.)

- [ ] **Step 4: `pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm lint`, `pnpm build`**

Los cuatro en verde.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/pedidos/\[id\]/page.tsx \
  src/app/\(store\)/cuenta/pedidos/\[id\]/page.tsx \
  "src/app/pos/(admin)/venta/[id]/page.tsx"
git commit -m "feat: muestra la miniatura del estampado elegido en pedidos y ventas"
```

---

### Task 13: Verificación final end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa**

```bash
pnpm tsc --noEmit
pnpm lint
pnpm vitest run
pnpm build
```

Los cuatro deben terminar sin errores.

- [ ] **Step 2: Verificación manual — tienda**

Con `pnpm dev` corriendo y sesión de `adminsu` (o un producto de prueba con una variante de ≥2 imágenes propias, creado/editado desde `/admin/productos`):

1. Ir a la página del producto, elegir esa talla/color, clic en "Agregar al carrito" → se abre el modal con las imágenes de esa variante.
2. Marcar 2 de las imágenes, confirmar → el carrito debe tener 2 líneas separadas, cada una con su miniatura.
3. Subir la cantidad de una de esas líneas hasta el tope — confirmar que el tope respeta la suma de ambas líneas (usa el stock total de la variante, no el doble).
4. "Cambiar estampado" en una línea (usuario logueado) → cambia solo esa línea.
5. Completar el checkout (pago manual) y confirmar que `/cuenta/pedidos/[id]` y `/admin/pedidos/[id]` muestran la miniatura correcta por línea.

- [ ] **Step 3: Verificación manual — POS**

En `/pos`, buscar ese mismo producto, elegir talla/color, clic en "Confirmar" → se abre el modal; repetir los pasos 2-3 anteriores dentro del carrito de la venta en curso. Completar la venta y confirmar la miniatura en `/pos/venta/[id]`.

- [ ] **Step 4: Verificación manual — producto/variante sin varias imágenes**

Con un producto de una sola imagen (o sin variantes), confirmar que agregar al carrito (tienda y POS) sigue funcionando exactamente igual que antes — sin modal, sin fricción nueva.

- [ ] **Step 5: Limpieza de datos de prueba**

Si se creó algún pedido/venta de prueba durante la verificación manual, revertirlo (borrar la fila o restaurar el stock) siguiendo el mismo criterio ya usado en fases anteriores de este proyecto — no dejar datos de prueba en la base de datos real.
