-- Endurece crear_pedido_wompi_whatsapp (migracion 055):
-- 1. Rechaza cantidades nulas, cero o negativas (antes una qty negativa
--    pasaba el chequeo de stock y producia un pedido con total negativo).
-- 2. Verifica que la variante pertenezca al producto indicado: un par
--    {product_id: A, variant_id: <variante de B>} ya no puede registrar
--    el nombre/precio de A con la variante de B.
-- 3. Verifica que la imagen (estampado) elegida pertenezca al producto.
-- Resto del cuerpo identico a la 055.
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
  v_variant_product_id uuid;
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
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'La cantidad de un producto debe ser mayor a cero.';
    end if;

    v_available_stock := null;

    if (v_item->>'variant_id') is not null then
      v_variant_product_id := null;
      select stock, product_id into v_available_stock, v_variant_product_id
        from public.product_variants
        where id = (v_item->>'variant_id')::uuid for update;

      if v_variant_product_id is not null
         and v_variant_product_id is distinct from (v_item->>'product_id')::uuid then
        raise exception 'La variante indicada no pertenece al producto indicado.';
      end if;
    else
      select stock into v_available_stock from public.products
        where id = (v_item->>'product_id')::uuid for update;
    end if;

    if v_available_stock is null or v_available_stock < (v_item->>'qty')::int then
      raise exception 'No hay stock suficiente para uno de los productos del pedido.';
    end if;

    if (v_item->>'image_id') is not null and not exists (
      select 1 from public.product_images
      where id = (v_item->>'image_id')::uuid
        and product_id = (v_item->>'product_id')::uuid
    ) then
      raise exception 'La imagen indicada no pertenece al producto indicado.';
    end if;
  end loop;

  select coalesce(sum(
    (item->>'qty')::int * coalesce(
      (select price_override from public.product_variants where id = (item->>'variant_id')::uuid),
      (select price from public.products where id = (item->>'product_id')::uuid)
    )
  ), 0) into v_subtotal
  from jsonb_array_elements(p_items) item;

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
    (item->>'product_id')::uuid,
    (item->>'variant_id')::uuid,
    (item->>'image_id')::uuid,
    case
      when pv.id is not null then p.name || ' (' || pv.name || ')'
      else p.name
    end,
    (item->>'qty')::int,
    coalesce(pv.price_override, p.price),
    (item->>'qty')::int * coalesce(pv.price_override, p.price)
  from jsonb_array_elements(p_items) item
  join public.products p on p.id = (item->>'product_id')::uuid
  left join public.product_variants pv on pv.id = (item->>'variant_id')::uuid;

  select * into v_order from public.orders where id = v_order_id;
  return v_order;
end;
$$;

revoke execute on function public.crear_pedido_wompi_whatsapp(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crear_pedido_wompi_whatsapp(uuid, jsonb, jsonb) to service_role;
