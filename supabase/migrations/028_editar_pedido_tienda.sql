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
