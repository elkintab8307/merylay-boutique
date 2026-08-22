-- Restaura los dos guardias de credito de update_pos_sale que la
-- migracion 042 perdio al reescribir la funcion desde el cuerpo de la
-- migracion 027 (anterior al sistema de credito) en vez del cuerpo de
-- la migracion 034 (que agrego estos guardias). Sin estos guardias:
-- 1) se puede editar una venta a credito ya existente, dañando el
--    saldo ya calculado a partir de credit_payments/credit_installments.
-- 2) se puede convertir una venta normal en credito desde aqui, sin
--    generar credit_installments (create_pos_sale es el unico camino
--    valido para crear una venta a credito).
-- Se mantiene el p_customer_id agregado en 042.
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
