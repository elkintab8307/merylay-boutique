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
