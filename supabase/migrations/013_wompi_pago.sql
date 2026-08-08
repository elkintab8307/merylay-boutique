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
