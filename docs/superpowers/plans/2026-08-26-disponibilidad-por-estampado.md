# Disponibilidad de stock por estampado (foto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una foto de estampado deje de aparecer como opción en tienda/POS/inventario en cuanto se vende esa unidad física puntual, con el stock de la variante calculado automáticamente a partir de las fotos disponibles en vez de escrito a mano.

**Architecture:** `product_images` gana `vendida boolean`; un trigger recalcula `product_variants.stock` como el conteo de fotos no vendidas de esa variante. Los RPCs de venta marcan/desmarcan la foto puntual (`image_id`, ya presente desde la fase de selección de estampado) en vez de restar un número. El resto del sistema (reportes, tarjetas) sigue leyendo `product_variants.stock` sin cambios.

**Tech Stack:** Next.js App Router + TypeScript, Supabase (Postgres/RLS vía MCP), Vitest + Testing Library, zod + react-hook-form.

**Spec:** `docs/superpowers/specs/2026-08-26-disponibilidad-por-estampado-design.md`

## Global Constraints

- Todo el producto (mensajes de error, UI) en español, sin tildes en los mensajes `raise exception` de SQL — mismo estilo que las funciones existentes (`create_order`, `create_pos_sale`, etc.).
- El stock de productos SIN variantes (`products.stock`) no cambia en absoluto — solo `product_variants.stock` pasa a ser calculado.
- Una línea de venta con `image_id` representa exactamente 1 unidad física — `qty` debe ser siempre `1` en esas líneas, validado tanto en los RPCs (server, autoritativo) como en la UI (cliente, evita el error innecesariamente).
- Ningún componente que hoy lee `product_variants.stock` (`low-stock.ts`, tarjetas de catálogo/POS, modal de inventario POS) cambia — siguen leyendo la misma columna, que ahora se mantiene sola.
- Migraciones se aplican con el MCP de Supabase (`mcp__supabase__apply_migration`), nunca a mano en el dashboard. Los tipos (`database.types.ts`) se regeneran con el MCP tras aplicar el esquema nuevo.
- Commits atómicos en español al final de cada tarea.

---

## Task 1: Migración — columna `vendida`, trigger de stock, backfill y RPCs de venta

**Files:**
- Create: `supabase/migrations/048_disponibilidad_por_estampado.sql`
- Regenerate: `src/lib/supabase/database.types.ts` (vía MCP, no a mano)

**Interfaces:**
- Produce: columna `product_images.vendida boolean not null default false`; `product_variants.stock` pasa a mantenerse solo (nunca se escribe a mano para variantes con fotos); función `create_order`, `confirm_order_payment_wompi`, `update_order_items`, `create_pos_sale`, `update_pos_sale` reescritas para marcar/desmarcar `product_images.vendida` en líneas con `image_id`, y rechazar `qty <> 1` en esas líneas.

- [ ] **Paso 1: Escribir la migración completa**

Crea `supabase/migrations/048_disponibilidad_por_estampado.sql` con este contenido exacto:

```sql
-- Disponibilidad de stock por estampado (foto): cada foto de una
-- variante representa una unidad fisica unica. product_images.vendida
-- marca si esa unidad puntual ya se vendio; product_variants.stock deja
-- de escribirse a mano y pasa a calcularse solo (trigger) como el
-- conteo de fotos no vendidas de esa variante.

alter table public.product_images
  add column vendida boolean not null default false;

create or replace function public.recalcular_stock_variante()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- NEW/OLD no estan asignados fuera de su operacion (referenciar
  -- new.* en un DELETE, u old.* en un INSERT, lanza error en plpgsql) --
  -- por eso cada bloque se guarda primero con TG_OP.
  -- Recalcula la variante nueva (insert/update) y, si un update reasigna
  -- variant_id a otra variante, tambien la variante vieja que perdio la
  -- foto -- sin esto, mover una foto de variante dejaria el stock de la
  -- variante de origen desactualizado hasta el proximo cambio ahi.
  if TG_OP in ('INSERT', 'UPDATE') and new.variant_id is not null then
    update public.product_variants
    set stock = (
      select count(*) from public.product_images
      where variant_id = new.variant_id and vendida = false
    )
    where id = new.variant_id;
  end if;

  if TG_OP in ('DELETE', 'UPDATE') and old.variant_id is not null
     and (TG_OP = 'DELETE' or old.variant_id is distinct from new.variant_id) then
    update public.product_variants
    set stock = (
      select count(*) from public.product_images
      where variant_id = old.variant_id and vendida = false
    )
    where id = old.variant_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_stock_variante on public.product_images;
create trigger trg_recalcular_stock_variante
after insert or update of vendida, variant_id or delete on public.product_images
for each row execute function public.recalcular_stock_variante();

-- Backfill: marca como vendidas las fotos que sobrepasan el stock
-- actual de cada variante (hoy, solo afecta las 2 filas ya
-- identificadas: "Camiseta tela Fria" talla S, colores Negra y Blanco).
with fotos_ordenadas as (
  select
    pi.id,
    pv.stock,
    row_number() over (partition by pi.variant_id order by pi.sort_order, pi.id) as posicion
  from public.product_images pi
  join public.product_variants pv on pv.id = pi.variant_id
)
update public.product_images
set vendida = true
where id in (select id from fotos_ordenadas where posicion > stock);

-- Recalculo final de cierre: garantiza que product_variants.stock quede
-- exactamente igual al conteo de fotos no vendidas para toda variante
-- con fotos propias.
update public.product_variants pv
set stock = (
  select count(*) from public.product_images pi
  where pi.variant_id = pv.id and pi.vendida = false
)
where exists (select 1 from public.product_images pi where pi.variant_id = pv.id);

-- create_order: lineas con image_id marcan esa foto vendida en vez de
-- restar el numero de stock; lineas sin image_id no cambian.
create or replace function public.create_order(p_shipping_address jsonb, p_payment_method text)
 returns orders
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2) := 0;
  v_item record;
  v_available_stock int;
  v_image_vendida boolean;
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

  -- Verificar disponibilidad por cada item, bloqueando las filas para
  -- evitar sobreventa con checkouts concurrentes. Lineas con estampado
  -- elegido (image_id) verifican esa foto puntual en vez del numero de
  -- stock de la variante.
  for v_item in
    select ci.product_id, ci.variant_id, ci.image_id, ci.qty
    from public.cart_items ci
    where ci.cart_id = v_cart_id
  loop
    if v_item.image_id is not null then
      if v_item.qty <> 1 then
        raise exception 'No se puede comprar mas de una unidad del mismo estampado en una sola linea.';
      end if;
      select vendida into v_image_vendida from public.product_images where id = v_item.image_id for update;
      if v_image_vendida is null or v_image_vendida then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_item.variant_id is not null then
      select stock into v_available_stock from public.product_variants where id = v_item.variant_id for update;
      if v_available_stock is null or v_available_stock < v_item.qty then
        raise exception 'No hay stock suficiente para uno de los productos del carrito.';
      end if;
    else
      select stock into v_available_stock from public.products where id = v_item.product_id for update;
      if v_available_stock is null or v_available_stock < v_item.qty then
        raise exception 'No hay stock suficiente para uno de los productos del carrito.';
      end if;
    end if;
  end loop;

  -- Descontar: lineas con estampado marcan esa foto vendida (el
  -- trigger recalcula el stock de la variante); el resto resta el
  -- numero como antes.
  for v_item in
    select ci.product_id, ci.variant_id, ci.image_id, ci.qty
    from public.cart_items ci
    where ci.cart_id = v_cart_id
  loop
    if v_item.image_id is not null then
      update public.product_images set vendida = true
      where id = v_item.image_id and vendida = false;
      if not found then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_item.variant_id is not null then
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
$function$;

-- confirm_order_payment_wompi: mismo tratamiento en su loop de
-- descuento (que es donde un pedido Wompi realmente se hace efectivo).
-- No re-lanza si la foto ya estaba vendida (mismo criterio "no bloquear
-- la confirmacion de un pago ya realizado" que greatest(stock-qty,0)
-- usa para el caso numerico).
create or replace function public.confirm_order_payment_wompi(p_order_id uuid, p_wompi_transaction_id text)
 returns orders
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    select product_id, variant_id, image_id, qty from public.order_items where order_id = p_order_id
  loop
    if v_item.image_id is not null then
      update public.product_images set vendida = true
      where id = v_item.image_id and vendida = false;
    elsif v_item.variant_id is not null then
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
$function$;

-- update_order_items: restaura las fotos de las lineas actuales antes
-- de aplicar el nuevo conjunto (mismo patron "restaurar todo, verificar
-- lo nuevo, descontar lo nuevo, borrar e insertar" que ya usa).
create or replace function public.update_order_items(p_order_id uuid, p_items jsonb)
 returns orders
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_image_id uuid;
  v_qty int;
  v_unit_price numeric(12,2);
  v_available_stock int;
  v_image_vendida boolean;
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

  -- Restaura el estado de los items ACTUALES del pedido.
  for v_product_id, v_variant_id, v_image_id, v_qty in
    select product_id, variant_id, image_id, qty from public.order_items where order_id = p_order_id
  loop
    if v_image_id is not null then
      update public.product_images set vendida = false where id = v_image_id;
    elsif v_variant_id is not null then
      update public.product_variants set stock = stock + v_qty where id = v_variant_id;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
    end if;
  end loop;

  -- Verifica disponibilidad para el NUEVO conjunto de items.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en el pedido.';
    end if;

    if v_image_id is not null then
      if v_qty <> 1 then
        raise exception 'No se puede comprar mas de una unidad del mismo estampado en una sola linea.';
      end if;
      select vendida into v_image_vendida from public.product_images where id = v_image_id for update;
      if v_image_vendida is null or v_image_vendida then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_variant_id is not null then
      select stock into v_available_stock from public.product_variants where id = v_variant_id for update;
      if v_available_stock is null or v_available_stock < v_qty then
        raise exception 'No hay stock suficiente para uno de los productos.';
      end if;
    else
      select stock into v_available_stock from public.products where id = v_product_id for update;
      if v_available_stock is null or v_available_stock < v_qty then
        raise exception 'No hay stock suficiente para uno de los productos.';
      end if;
    end if;

    v_subtotal := v_subtotal + v_qty * (v_item->>'unitPrice')::numeric;
  end loop;

  -- Aplica el nuevo conjunto.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_image_id is not null then
      update public.product_images set vendida = true where id = v_image_id and vendida = false;
      if not found then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_variant_id is not null then
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
$function$;

-- create_pos_sale: mismo tratamiento en su loop de verificacion y en su
-- loop de descuento.
create or replace function public.create_pos_sale(p_items jsonb, p_payment_method payment_method, p_discount numeric DEFAULT 0, p_customer_id uuid DEFAULT NULL::uuid, p_credit_num_cuotas integer DEFAULT NULL::integer, p_credit_abono_inicial numeric DEFAULT 0, p_credit_abono_metodo payment_method DEFAULT NULL::payment_method)
 returns pos_sales
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_staff_id uuid := auth.uid();
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_image_id uuid;
  v_qty int;
  v_unit_price numeric(12,2);
  v_available_stock int;
  v_image_vendida boolean;
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
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en la venta.';
    end if;

    if v_image_id is not null then
      if v_qty <> 1 then
        raise exception 'No se puede vender mas de una unidad del mismo estampado en una sola linea.';
      end if;
      select vendida into v_image_vendida from public.product_images where id = v_image_id for update;
      if v_image_vendida is null or v_image_vendida then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_variant_id is not null then
      select stock into v_available_stock from public.product_variants where id = v_variant_id for update;
      if v_available_stock is null or v_available_stock < v_qty then
        raise exception 'No hay stock suficiente para uno de los productos.';
      end if;
    else
      select stock into v_available_stock from public.products where id = v_product_id for update;
      if v_available_stock is null or v_available_stock < v_qty then
        raise exception 'No hay stock suficiente para uno de los productos.';
      end if;
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
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_image_id is not null then
      update public.product_images set vendida = true where id = v_image_id and vendida = false;
      if not found then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_variant_id is not null then
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
$function$;

-- update_pos_sale: mismo tratamiento que update_order_items.
create or replace function public.update_pos_sale(p_sale_id uuid, p_items jsonb, p_payment_method payment_method, p_discount numeric DEFAULT 0, p_customer_id uuid DEFAULT NULL::uuid)
 returns pos_sales
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_image_id uuid;
  v_qty int;
  v_unit_price numeric(12,2);
  v_available_stock int;
  v_image_vendida boolean;
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

  for v_product_id, v_variant_id, v_image_id, v_qty in
    select product_id, variant_id, image_id, qty from public.pos_sale_items where sale_id = p_sale_id
  loop
    if v_image_id is not null then
      update public.product_images set vendida = false where id = v_image_id;
    elsif v_variant_id is not null then
      update public.product_variants set stock = stock + v_qty where id = v_variant_id;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en la venta.';
    end if;

    if v_image_id is not null then
      if v_qty <> 1 then
        raise exception 'No se puede vender mas de una unidad del mismo estampado en una sola linea.';
      end if;
      select vendida into v_image_vendida from public.product_images where id = v_image_id for update;
      if v_image_vendida is null or v_image_vendida then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_variant_id is not null then
      select stock into v_available_stock from public.product_variants where id = v_variant_id for update;
      if v_available_stock is null or v_available_stock < v_qty then
        raise exception 'No hay stock suficiente para uno de los productos.';
      end if;
    else
      select stock into v_available_stock from public.products where id = v_product_id for update;
      if v_available_stock is null or v_available_stock < v_qty then
        raise exception 'No hay stock suficiente para uno de los productos.';
      end if;
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
    v_image_id := nullif(v_item->>'imageId', '')::uuid;
    v_qty := (v_item->>'qty')::int;

    if v_image_id is not null then
      update public.product_images set vendida = true where id = v_image_id and vendida = false;
      if not found then
        raise exception 'Uno de los estampados elegidos ya no esta disponible.';
      end if;
    elsif v_variant_id is not null then
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
$function$;
```

- [ ] **Paso 2: Aplicar la migración**

Usa `mcp__supabase__apply_migration` con `name: "disponibilidad_por_estampado"` y el contenido de arriba.

- [ ] **Paso 3: Verificar el resultado con consultas directas**

Ejecuta con `mcp__supabase__execute_sql`:

```sql
-- Las 2 anomalias conocidas deben quedar con su foto vendida y stock 0.
select pv.talla, pv.color, pv.stock, pi.vendida
from public.product_variants pv
join public.product_images pi on pi.variant_id = pv.id
where pv.talla = 'S' and pv.color in ('Negra', 'Blanco');
-- Esperado: stock = 0, vendida = true en ambas filas.

-- Ninguna variante con fotos debe quedar con stock distinto al conteo
-- de fotos no vendidas.
select pv.id
from public.product_variants pv
where exists (select 1 from public.product_images pi where pi.variant_id = pv.id)
  and pv.stock <> (
    select count(*) from public.product_images pi
    where pi.variant_id = pv.id and pi.vendida = false
  );
-- Esperado: 0 filas.
```

Si la segunda consulta devuelve filas, el trigger o el recalculo final
tiene un error — no continúes hasta que devuelva 0 filas.

- [ ] **Paso 4: Regenerar los tipos de Supabase**

Usa `mcp__supabase__generate_typescript_types` y guarda el resultado en
`src/lib/supabase/database.types.ts` (reemplaza el archivo completo).

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/048_disponibilidad_por_estampado.sql src/lib/supabase/database.types.ts
git commit -m "feat: stock de variante calculado por fotos disponibles (estampado vendido)"
```

---

## Task 2: Quitar el stock manual de variante; mostrar disponibilidad calculada

**Files:**
- Modify: `src/lib/validation/producto.ts`
- Modify: `src/app/admin/productos/actions.ts`
- Modify: `src/app/admin/productos/nuevo/page.tsx`
- Modify: `src/app/admin/productos/[id]/editar/page.tsx`
- Modify: `src/app/admin/productos/producto-form.tsx`
- Modify: `src/app/admin/productos/__tests__/producto-form.test.tsx`

**Interfaces:**
- Consume: nada de Task 1 directamente (usa `product_variants.stock`, que ya se calcula solo desde ahora).
- Produce: `VarianteInput` ya no tiene `stock`. `ProductImage` (tipo local del formulario) gana `vendida: boolean`, usado por Task 3.

- [ ] **Paso 1: Actualizar los fixtures de test que ya no pueden traer `stock` en `variantes`**

En `src/app/admin/productos/__tests__/producto-form.test.tsx`, en las 2
pruebas que declaran `variantes` con objetos (no arrays vacíos), quita
`stock` de cada uno:

```ts
variantes: [
  { talla: "M", color: "Rosa", priceOverride: null },
  { talla: "M", color: "Rosa", priceOverride: null },
],
```

(y lo mismo en la segunda prueba, con `talla: "M"`/`talla: "L"`).

- [ ] **Paso 2: Quitar `stock` de `varianteSchema`**

En `src/lib/validation/producto.ts`, quita la línea `stock: z.number().int().min(0),`
del objeto de `varianteSchema` (línea 10). El resto del archivo no cambia.

- [ ] **Paso 3: Dejar de escribir `stock` de variante en `actions.ts`**

En `src/app/admin/productos/actions.ts`, quita la línea `stock: variante.stock,`
de los 3 lugares donde se arma el insert/upsert de `product_variants`:
dentro de `createProducto` (el `.insert(parsed.data.variantes.map(...))`,
línea ~96), y dentro de `updateProducto` en `actualizarItems.map(...)`
(línea ~236) y en `crearItems.map(...)` (línea ~265). La columna
`product_variants.stock` queda con su valor por defecto (calculado por
el trigger de Task 1) para variantes nuevas sin fotos todavía.

- [ ] **Paso 4: Quitar `stock` del array de variantes por defecto en la página de creación**

En `src/app/admin/productos/nuevo/page.tsx`, en el array `variantes`,
cambia:

```ts
variantes: [
  { talla: "", color: "", priceOverride: null },
],
```

- [ ] **Paso 5: Quitar `stock` del mapeo de variantes y agregar `vendida` al select de imágenes en la página de edición**

En `src/app/admin/productos/[id]/editar/page.tsx`:
- En el `.map((v) => ({ ... }))` de `variantes` (línea ~68-74), quita la
  línea `stock: v.stock,`.
- En el `.select("id, url, is_primary, variant_id")` de `product_images`
  (línea 37), agrégale `vendida`: `.select("id, url, is_primary, variant_id, vendida")`.

- [ ] **Paso 6: Actualizar `producto-form.tsx`**

- El tipo `ProductImage` (línea 22) gana el campo:
  ```ts
  type ProductImage = { id: string; url: string; is_primary: boolean; variant_id: string | null; vendida: boolean };
  ```
- En `handleAppendVariante` (línea 76-79), quita `stock: 0` del objeto
  que se agrega: `append({ talla: "", color: "", priceOverride: null })`.
- Reemplaza el bloque del input numérico de Stock (líneas ~389-397):
  ```tsx
  <div>
    <label className="text-xs text-brand-ciruela">Stock</label>
    <Input
      type="number"
      {...register(`variantes.${index}.stock` as const, {
        valueAsNumber: true,
      })}
    />
  </div>
  ```
  por un texto de solo lectura calculado a partir de `imagenesDeVariante`
  (ya disponible en ese `.map`, línea 365-367):
  ```tsx
  <div>
    <label className="text-xs text-brand-ciruela">Disponibles</label>
    <p className="flex h-9 items-center text-sm text-brand-ciruela">
      {imagenesDeVariante.length > 0
        ? `${imagenesDeVariante.filter((img) => !img.vendida).length} disponibles`
        : "Sin fotos"}
    </p>
  </div>
  ```

- [ ] **Paso 7: Verificar y confirmar**

```bash
pnpm exec tsc --noEmit
pnpm test producto-form
```

Ambos deben pasar sin errores.

- [ ] **Paso 8: Commit**

```bash
git add src/lib/validation/producto.ts src/app/admin/productos/actions.ts src/app/admin/productos/nuevo/page.tsx src/app/admin/productos/[id]/editar/page.tsx src/app/admin/productos/producto-form.tsx src/app/admin/productos/__tests__/producto-form.test.tsx
git commit -m "feat: quita el stock manual de variante, se muestra la disponibilidad calculada por fotos"
```

---

## Task 3: Botón manual "Marcar vendida / Marcar disponible" por foto

**Files:**
- Modify: `src/app/admin/productos/actions.ts`
- Modify: `src/app/admin/productos/__tests__/actions.test.ts`
- Modify: `src/app/admin/productos/producto-form.tsx`

**Interfaces:**
- Consume: `ProductImage.vendida` (Task 2).
- Produce: `toggleImagenVendida(imageId: string, vendida: boolean, productId: string): Promise<{ error?: string }>`, exportada de `actions.ts`, usada por `producto-form.tsx`.

- [ ] **Paso 1: Escribir la prueba que falla**

En `src/app/admin/productos/__tests__/actions.test.ts`, agrega (mismo
mock simple ya usado para acciones sin dependencias externas — no
requiere `crearSupabaseMock`, solo un builder directo):

```ts
describe("toggleImagenVendida", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("actualiza product_images.vendida y no falla si todo sale bien", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })) };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { toggleImagenVendida } = await import("../actions");
    const resultado = await toggleImagenVendida("img-1", true, "prod-1");

    expect(resultado).toEqual({});
    expect(supabase.from).toHaveBeenCalledWith("product_images");
    expect(update).toHaveBeenCalledWith({ vendida: true });
    expect(eq).toHaveBeenCalledWith("id", "img-1");
  });

  it("retorna error si la actualizacion falla", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: { message: "boom" } }));
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })) };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { toggleImagenVendida } = await import("../actions");
    const resultado = await toggleImagenVendida("img-1", false, "prod-1");

    expect(resultado).toEqual({ error: expect.any(String) });
  });
});
```

- [ ] **Paso 2: Ejecutar y confirmar que falla**

Run: `pnpm test admin/productos/__tests__/actions`
Expected: FAIL con `toggleImagenVendida is not a function` (o similar).

- [ ] **Paso 3: Implementar `toggleImagenVendida` en `actions.ts`**

Agrega, junto a `setPrimaryProductImage`:

```ts
export async function toggleImagenVendida(
  imageId: string,
  vendida: boolean,
  productId: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_images")
    .update({ vendida })
    .eq("id", imageId);

  if (error) {
    return { error: "No se pudo actualizar la disponibilidad de la foto." };
  }

  revalidatePath(`/admin/productos/${productId}/editar`);
  return {};
}
```

- [ ] **Paso 4: Ejecutar y confirmar que pasa**

Run: `pnpm test admin/productos/__tests__/actions`
Expected: PASS

- [ ] **Paso 5: Wirear el botón en `producto-form.tsx`**

- Importa `toggleImagenVendida` junto a los demás imports de `./actions`.
- Agrega el handler, junto a `handleSetPrimary`/`handleDeleteImage`:
  ```ts
  const handleToggleVendida = async (imageId: string, vendidaActual: boolean) => {
    if (!productoId) return;
    const result = await toggleImagenVendida(imageId, !vendidaActual, productoId);
    if (!result.error) {
      setExistingImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, vendida: !vendidaActual } : img)),
      );
    }
  };
  ```
- En el bloque de fotos DE VARIANTE (dentro de `imagenesDeVariante.map(...)`,
  líneas ~421-452 — NO en el bloque de "Imágenes generales" que sigue
  después, esas no tienen stock asociado), agrega un tercer botón junto
  a "Marcar principal"/"Eliminar":
  ```tsx
  <button
    type="button"
    onClick={() => handleToggleVendida(image.id, image.vendida)}
    className="text-brand-rosa hover:underline"
  >
    {image.vendida ? "Marcar disponible" : "Marcar vendida"}
  </button>
  ```

- [ ] **Paso 6: Verificar y confirmar**

```bash
pnpm exec tsc --noEmit
pnpm test admin/productos
```

- [ ] **Paso 7: Commit**

```bash
git add src/app/admin/productos/actions.ts src/app/admin/productos/__tests__/actions.test.ts src/app/admin/productos/producto-form.tsx
git commit -m "feat: permite marcar una foto de variante vendida/disponible manualmente"
```

---

## Task 4: POS — excluir fotos vendidas del selector de estampado

**Files:**
- Modify: `src/app/pos/product-browser-action.ts`
- Modify: `src/app/pos/__tests__/product-browser-action.test.ts`

**Interfaces:**
- Consume: `product_images.vendida` (Task 1).
- Produce: sin cambio de firma — `PosProductoResult.variants[].images` simplemente excluye las fotos vendidas.

- [ ] **Paso 1: Escribir la prueba que falla**

En `src/app/pos/__tests__/product-browser-action.test.ts`, agrega junto
a "agrupa las imagenes de cada variante por variant_id":

```ts
it("excluye del listado de estampados las fotos marcadas como vendidas", async () => {
  const supabase = crearSupabaseMock({
    products: [PRODUCTO_BASE],
    product_variants: [
      {
        id: "var-1",
        product_id: "prod-1",
        talla: "M",
        color: "Rosa",
        sku: "PIJ-001-M-ROS",
        stock: 1,
        price_override: null,
      },
    ],
    product_images: [
      { id: "img-1", product_id: "prod-1", url: "https://cdn.example.com/1.jpg", alt: null, variant_id: "var-1", is_primary: true, vendida: false },
      { id: "img-2", product_id: "prod-1", url: "https://cdn.example.com/2.jpg", alt: null, variant_id: "var-1", is_primary: false, vendida: true },
    ],
  });
  vi.mocked(createClient).mockResolvedValue(supabase as never);

  const { buscarProductosPos } = await import("../product-browser-action");
  const resultado = await buscarProductosPos({ query: "", categoryId: null });

  expect(resultado[0].variants[0].images).toEqual([
    { imageId: "img-1", url: "https://cdn.example.com/1.jpg", alt: null },
  ]);
});
```

- [ ] **Paso 2: Ejecutar y confirmar que falla**

Run: `pnpm test pos/__tests__/product-browser-action`
Expected: FAIL (el resultado incluye también `img-2`).

- [ ] **Paso 3: Implementar el filtro**

En `src/app/pos/product-browser-action.ts`:
- Agrega `vendida` al select de `product_images` (línea 57):
  `.select("id, product_id, variant_id, url, alt, is_primary, vendida")`.
- En el `.map` de `variants` (líneas 93-105), en el `images:` filtra
  también por `!img.vendida`:
  ```ts
  images: (images ?? [])
    .filter((img) => img.variant_id === v.id && !img.vendida)
    .map((img) => ({ imageId: img.id, url: img.url, alt: img.alt })),
  ```

- [ ] **Paso 4: Ejecutar y confirmar que pasa**

Run: `pnpm test pos/__tests__/product-browser-action`
Expected: PASS, y las demás pruebas del archivo siguen en verde (sus
fixtures no traen `vendida`, así que `!undefined` es `true` y no se
filtran).

- [ ] **Paso 5: Commit**

```bash
git add src/app/pos/product-browser-action.ts src/app/pos/__tests__/product-browser-action.test.ts
git commit -m "feat: el POS deja de ofrecer fotos de estampado ya vendidas"
```

---

## Task 5: Tienda (detalle de producto) — excluir fotos vendidas del selector de estampado

**Files:**
- Modify: `src/lib/store/variant-images.ts`
- Modify: `src/app/(store)/producto/[slug]/page.tsx`
- Modify: `src/app/(store)/producto/[slug]/product-detail-interactive.tsx`

**Interfaces:**
- Produce: `ImagenProducto` gana `vendida: boolean`.

No existe archivo de test para estos componentes (proyecto usa
verificación manual en navegador para esta capa, ver Testing). Sin TDD
aquí.

- [ ] **Paso 1: Agregar `vendida` a `ImagenProducto`**

En `src/lib/store/variant-images.ts`:

```ts
export type ImagenProducto = {
  id: string;
  url: string;
  alt: string | null;
  variantId: string | null;
  vendida: boolean;
};
```

(`getImagesForVariant` no cambia — sigue mostrando todas las fotos de
la galería general, incluidas vendidas; el filtro es solo para el
selector de estampado, Paso 3).

- [ ] **Paso 2: Agregar `vendida` al select y al mapeo en `page.tsx`**

En `src/app/(store)/producto/[slug]/page.tsx`:
- Select de `product_images` (línea 38): `.select("id, url, alt, variant_id, vendida")`.
- En `imagenesGaleria` (línea 183-188), agrega `vendida: img.vendida`.

- [ ] **Paso 3: Filtrar en `product-detail-interactive.tsx`**

En `imagenesDeVarianteActual` (líneas 56-60), agrega la condición:

```ts
const imagenesDeVarianteActual: EstampadoOption[] = variantSeleccionada
  ? images
      .filter((img) => img.variantId === variantSeleccionada.id && !img.vendida)
      .map((img) => ({ imageId: img.id, url: img.url, alt: img.alt }))
  : [];
```

- [ ] **Paso 4: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Paso 5: Commit**

```bash
git add src/lib/store/variant-images.ts "src/app/(store)/producto/[slug]/page.tsx" "src/app/(store)/producto/[slug]/product-detail-interactive.tsx"
git commit -m "feat: la tienda deja de ofrecer fotos de estampado ya vendidas"
```

---

## Task 6: Carrito de tienda — excluir fotos vendidas y limitar a 1 unidad por estampado elegido

**Files:**
- Modify: `src/app/(store)/carrito/page.tsx`
- Modify: `src/app/(store)/carrito/authenticated-cart.tsx`
- Modify: `src/app/(store)/carrito/cart-item-controls.tsx`
- Modify: `src/app/(store)/carrito/guest-cart.tsx`

**Interfaces:**
- Produce: `CartItemView` gana `imageId: string | null`. `CartItemControls` gana el prop `imageId: string | null`.

Sin archivo de test para estos componentes — verificación manual (ver
Testing).

- [ ] **Paso 1: `carrito/page.tsx` — filtrar fotos vendidas y exponer `imageId`**

- Select de `product_images` (línea 48): `.select("id, url, alt, variant_id, vendida")`.
- En `estampadosDeEstaVariante` (líneas 60-64), mantiene visible la foto
  ya elegida de esa línea aunque esté vendida, pero excluye las demás
  fotos vendidas como opción:
  ```ts
  const estampadosDeEstaVariante = item.variant_id
    ? (imagenesDeVariantes ?? [])
        .filter(
          (img) =>
            img.variant_id === item.variant_id && (!img.vendida || img.id === item.image_id),
        )
        .map((img) => ({ imageId: img.id, url: img.url, alt: img.alt }))
    : [];
  ```
- En el objeto `CartItemView` que se retorna (líneas 65-77), agrega
  `imageId: item.image_id,`.

- [ ] **Paso 2: `authenticated-cart.tsx` — propagar `imageId`**

- En el tipo `CartItemView` (líneas 8-17), agrega `imageId: string | null;`.
- Al invocar `<CartItemControls>` (líneas 57-61), agrega `imageId={item.imageId}`.

- [ ] **Paso 3: `cart-item-controls.tsx` — deshabilitar "+" cuando ya hay estampado elegido**

- Agrega `imageId: string | null` a los props del componente.
- En el botón "+" (líneas 55-62), agrega `disabled={isPending || Boolean(imageId)}`.

- [ ] **Paso 4: `guest-cart.tsx` — mismo límite, sin prop nueva (ya tiene `item.imageId`)**

En el botón "+" del render de cada item (líneas 115-123), agrega
`disabled={Boolean(item.imageId)}`.

- [ ] **Paso 5: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Paso 6: Commit**

```bash
git add "src/app/(store)/carrito/page.tsx" "src/app/(store)/carrito/authenticated-cart.tsx" "src/app/(store)/carrito/cart-item-controls.tsx" "src/app/(store)/carrito/guest-cart.tsx"
git commit -m "feat: el carrito oculta fotos de estampado vendidas y limita a 1 unidad por linea con estampado"
```

---

## Task 7: POS — limitar a 1 unidad por línea con estampado en la venta en curso

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx`

**Interfaces:** ninguna nueva — mismo `LocalCartItem.imageId` ya existente.

- [ ] **Paso 1: Deshabilitar el botón "+" cuando la línea ya tiene estampado**

En el botón "+" del render de cada item (líneas 271-279), agrega
`disabled={Boolean(item.imageId)}`.

- [ ] **Paso 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Paso 3: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx
git commit -m "feat: el POS limita a 1 unidad por linea con estampado elegido"
```

---

## Task 8: Verificación end-to-end y cierre

**Files:** ninguno (solo verificación).

- [ ] **Paso 1: Suite completa**

```bash
pnpm build && pnpm lint && pnpm test
```

Todo debe quedar en verde.

- [ ] **Paso 2: Verificación manual en navegador (tienda)**

1. Abre un producto cuya variante tenga 2+ fotos propias. Confirma que
   el selector de estampado muestra todas las fotos disponibles.
2. Completa una compra (pago manual) eligiendo 1 de esas fotos.
3. Vuelve al detalle del producto: esa foto ya no debe aparecer como
   opción; el stock mostrado bajó en 1.
4. En el carrito, con otra línea que tenga estampado elegido, confirma
   que el botón "+" está deshabilitado.

- [ ] **Paso 3: Verificación manual en navegador (POS)**

1. Repite el flujo de compra desde el POS (`ProductCardPos` +
   `venta-items-editor`), completa la venta.
2. Confirma que la foto vendida ya no aparece en el selector del POS.
3. Edita esa venta y quita la línea con estampado: la foto debe volver
   a aparecer como opción y el stock debe subir en 1.
4. Confirma que el botón "+" está deshabilitado en una línea con
   estampado ya elegido, en la venta en curso.

- [ ] **Paso 4: Verificación manual en navegador (admin)**

1. En `/admin/productos/[id]/editar`, confirma que el campo de stock
   numérico por variante ya no existe, y que se ve "N disponibles" (o
   "Sin fotos").
2. Usa "Marcar vendida" en una foto sin pasar por una venta real:
   confirma que desaparece de los selectores de estampado y que el
   contador baja. Usa "Marcar disponible" para revertirlo.

- [ ] **Paso 5: Confirmar las 2 anomalías originales quedaron resueltas**

Con `mcp__supabase__execute_sql`, repite la consulta del Task 1 Paso 3
una vez más para confirmar que sigue en 0 filas (nada se desincronizó
durante las pruebas manuales de los pasos anteriores).
