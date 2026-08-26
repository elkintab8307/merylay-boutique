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
