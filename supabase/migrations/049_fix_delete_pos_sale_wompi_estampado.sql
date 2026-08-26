-- Corrige dos funciones que la migracion 048 dejo fuera de su inventario
-- de "escritores de product_variants.stock" (hallazgo de la revision
-- final de rama del plan 2026-08-26-disponibilidad-por-estampado):
--
-- 1) delete_pos_sale no sabia de estampados: al eliminar una venta POS
--    con una linea de foto puntual, restauraba el stock numerico (+1)
--    SIN liberar la foto (vendida seguia en true) -- dejaba el stock
--    desincronizado del conteo real de fotos disponibles, y la foto
--    quedaba invisible para siempre en tienda/POS aunque la prenda ya
--    estuviera de vuelta en el inventario.
-- 2) create_order_wompi verificaba disponibilidad leyendo el stock
--    agregado de la variante, nunca el estampado puntual elegido --
--    permitia crear (y pagar) un pedido Wompi por una foto que ya se
--    habia vendido, sin error y sin descontar nada.

create or replace function public.delete_pos_sale(p_sale_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_payment_method public.payment_method;
  v_product_id uuid;
  v_variant_id uuid;
  v_image_id uuid;
  v_qty int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  select payment_method into v_payment_method
  from public.pos_sales where id = p_sale_id for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_payment_method = 'credito' then
    raise exception 'Esta venta es un credito y no se puede eliminar.';
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

  delete from public.pos_sales where id = p_sale_id;
end;
$function$;

create or replace function public.create_order_wompi(p_shipping_address jsonb)
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

  -- Verifica disponibilidad (sin descontar) para no aceptar un pedido
  -- Wompi de algo que ya esta agotado o de un estampado ya vendido. El
  -- descuento/marcado real ocurre en confirm_order_payment_wompi, cuando
  -- el pago se confirma.
  for v_item in
    select ci.product_id, ci.variant_id, ci.image_id, ci.qty
    from public.cart_items ci
    where ci.cart_id = v_cart_id
  loop
    if v_item.image_id is not null then
      if v_item.qty <> 1 then
        raise exception 'No se puede comprar mas de una unidad del mismo estampado en una sola linea.';
      end if;
      select vendida into v_image_vendida from public.product_images where id = v_item.image_id;
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
$function$;
