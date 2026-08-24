-- Unifica clientes POS y clientes del portal en la ventana de clientes:
-- listar_clientes_pos() une pos_customers con los profiles de rol
-- customer que aun no tienen fila en pos_customers (para no duplicar),
-- y vincular_cliente_portal() materializa esa fila la primera vez que
-- el staff selecciona o abre a un cliente del portal. Ambas funciones
-- son security definer porque profiles solo se puede leer para la
-- propia fila (o superadmin) via RLS -- el mismo motivo por el que ya
-- existe buscar_profile_por_telefono().

create or replace function public.listar_clientes_pos(p_query text default null, p_limit int default 50)
returns table (
  origen text,
  id uuid,
  profile_id uuid,
  nombre text,
  telefono text
)
language sql
security definer
stable
set search_path = public
as $$
  select origen, id, profile_id, nombre, telefono
  from (
    select
      'pos'::text as origen,
      pc.id,
      pc.profile_id,
      pc.nombre,
      pc.telefono,
      pc.created_at
    from public.pos_customers pc
    where public.is_staff_or_above()
      and (
        p_query is null or p_query = ''
        or pc.nombre ilike '%' || p_query || '%'
        or pc.telefono ilike '%' || p_query || '%'
      )

    union all

    select
      'portal'::text as origen,
      p.id,
      p.id as profile_id,
      coalesce(p.full_name, p.username) as nombre,
      coalesce(p.whatsapp, p.phone, '') as telefono,
      p.created_at
    from public.profiles p
    where public.is_staff_or_above()
      and p.role = 'customer'
      and not exists (
        select 1 from public.pos_customers pc2 where pc2.profile_id = p.id
      )
      and (
        p_query is null or p_query = ''
        or p.full_name ilike '%' || p_query || '%'
        or p.username ilike '%' || p_query || '%'
        or regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') ilike '%' || p_query || '%'
        or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') ilike '%' || p_query || '%'
      )
  ) clientes
  order by nombre
  limit p_limit;
$$;

revoke execute on function public.listar_clientes_pos(text, int) from public, anon;
grant execute on function public.listar_clientes_pos(text, int) to authenticated;

create or replace function public.vincular_cliente_portal(p_profile_id uuid)
returns public.pos_customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_telefono text;
  v_cliente public.pos_customers;
begin
  if not public.is_staff_or_above() then
    raise exception 'No autorizado.';
  end if;

  select full_name, username, phone, whatsapp, role
  into v_profile
  from public.profiles
  where id = p_profile_id;

  if not found or v_profile.role <> 'customer' then
    raise exception 'Cliente del portal no encontrado.';
  end if;

  v_telefono := regexp_replace(coalesce(v_profile.whatsapp, v_profile.phone, ''), '\D', '', 'g');
  if length(v_telefono) < 7 then
    raise exception 'Este cliente no tiene un telefono valido registrado.';
  end if;

  insert into public.pos_customers (nombre, telefono, profile_id)
  values (coalesce(v_profile.full_name, v_profile.username), v_telefono, p_profile_id)
  on conflict (telefono) do update
    set profile_id = excluded.profile_id
  returning * into v_cliente;

  return v_cliente;
end;
$$;

revoke execute on function public.vincular_cliente_portal(uuid) from public, anon;
grant execute on function public.vincular_cliente_portal(uuid) to authenticated;

-- create_pos_sale: el cliente ahora es obligatorio para toda venta
-- nueva, no solo a credito (antes del cambio, p_customer_id null era
-- valido para pagos de contado).
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
    v_qty := (v_item->>'qty')::int;
    v_unit_price := (v_item->>'unitPrice')::numeric;

    insert into public.pos_sale_items (sale_id, product_id, variant_id, qty, unit_price, line_total)
    values (v_sale_id, v_product_id, v_variant_id, v_qty, v_unit_price, v_qty * v_unit_price);
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
