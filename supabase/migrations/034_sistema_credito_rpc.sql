-- RPCs del sistema de credito. Ver
-- docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md §4.

-- Reparto FIFO compartido entre create_pos_sale (abono inicial) y
-- registrar_abono_credito (abonos posteriores). No se expone a
-- "authenticated": solo se llama desde otras funciones SECURITY DEFINER,
-- que ejecutan como el rol dueño de la funcion (bypassa el chequeo de
-- grant). Revocarla de authenticated impide que se llame directamente
-- saltandose la validacion de saldo de registrar_abono_credito.
create or replace function public.aplicar_abono_fifo(p_sale_id uuid, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restante numeric(12,2) := p_monto;
  v_cuota record;
  v_aplicado numeric(12,2);
begin
  for v_cuota in
    select id, amount, paid_amount
    from public.credit_installments
    where sale_id = p_sale_id and status <> 'pagada'
    order by numero
    for update
  loop
    exit when v_restante <= 0;

    v_aplicado := least(v_restante, v_cuota.amount - v_cuota.paid_amount);

    update public.credit_installments
    set paid_amount = paid_amount + v_aplicado,
        status = (case when paid_amount + v_aplicado >= amount then 'pagada' else 'parcial' end)::public.credit_installment_status
    where id = v_cuota.id;

    v_restante := v_restante - v_aplicado;
  end loop;
end;
$$;

revoke execute on function public.aplicar_abono_fifo(uuid, numeric) from public, anon, authenticated;

-- create_pos_sale extendido: 5 parametros nuevos, todos con default, para
-- no romper las llamadas existentes (venta normal, sin credito).
--
-- IMPORTANTE: Postgres identifica una funcion por su lista de tipos de
-- parametros, no por nombre ni por los defaults -- un "create or replace"
-- con una firma de mas parametros NO reemplaza la funcion original de 3
-- parametros (de 011_pos_sale_rpc.sql), crea un OVERLOAD adicional. Con
-- ambas firmas vivas, cualquier llamada con exactamente 3 parametros (el
-- flujo normal de venta sin credito, como en src/app/pos/sale-action.ts)
-- queda ambigua para Postgres y falla con "is not unique". Hay que borrar
-- la firma vieja de 3 parametros para que solo quede esta, que ya cubre
-- ese mismo caso via los defaults.
drop function if exists public.create_pos_sale(jsonb, public.payment_method, numeric);

create or replace function public.create_pos_sale(
  p_items jsonb,
  p_payment_method public.payment_method,
  p_discount numeric default 0,
  p_credit_customer_name text default null,
  p_credit_customer_phone text default null,
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

  if p_payment_method = 'credito' then
    if coalesce(trim(p_credit_customer_name), '') = '' then
      raise exception 'Ingresa el nombre del cliente para la venta a credito.';
    end if;
    if coalesce(trim(p_credit_customer_phone), '') = '' then
      raise exception 'Ingresa el telefono del cliente para la venta a credito.';
    end if;
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

  -- Verificar stock, bloqueando filas para evitar sobreventa concurrente.
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

  -- Descontar stock
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
    sale_number, staff_id, subtotal, discount, total, payment_method,
    credit_customer_name, credit_customer_phone
  )
  values (
    v_sale_number, v_staff_id, v_subtotal, p_discount, v_total, p_payment_method,
    case when p_payment_method = 'credito' then trim(p_credit_customer_name) else null end,
    case when p_payment_method = 'credito' then trim(p_credit_customer_phone) else null end
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
      -- El abono inicial cubre el 100% del total: una sola cuota
      -- simbolica (check (amount > 0) impide generar cuotas de $0), que el
      -- reparto FIFO de abajo marca 'pagada' de inmediato.
      insert into public.credit_installments (sale_id, numero, due_date, amount)
      values (v_sale_id, 1, (now() at time zone 'America/Bogota')::date + 30, v_total);
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
          (now() at time zone 'America/Bogota')::date + (30 * v_i),
          case when v_i = p_credit_num_cuotas then v_cuota_monto + v_cuota_residuo else v_cuota_monto end
        );
      end loop;
    end if;

    if p_credit_abono_inicial > 0 then
      insert into public.credit_payments (sale_id, amount, payment_method, staff_id)
      values (v_sale_id, p_credit_abono_inicial, p_credit_abono_metodo, v_staff_id);

      -- Solo se reparte FIFO contra las cuotas cuando estas SI incluyen
      -- el abono inicial (rama "cubre el 100%" de arriba). En la rama
      -- financiada, las cuotas ya nacieron netas del abono -- aplicarlo
      -- aqui tambien duplicaria el descuento.
      if v_saldo_financiar <= 0 then
        perform public.aplicar_abono_fifo(v_sale_id, p_credit_abono_inicial);
      end if;
    end if;
  end if;

  select * into v_sale from public.pos_sales where id = v_sale_id;
  return v_sale;
end;
$$;

revoke execute on function public.create_pos_sale(jsonb, public.payment_method, numeric, text, text, int, numeric, public.payment_method) from public, anon;
grant execute on function public.create_pos_sale(jsonb, public.payment_method, numeric, text, text, int, numeric, public.payment_method) to authenticated;

-- Registrar un abono contra un credito existente.
create or replace function public.registrar_abono_credito(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method
)
returns public.credit_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := auth.uid();
  v_payment_method public.payment_method;
  v_total numeric(12,2);
  v_pagado numeric(12,2);
  v_saldo numeric(12,2);
  v_payment public.credit_payments;
begin
  if v_staff_id is null or not public.is_staff_or_above() then
    raise exception 'No autorizado.';
  end if;

  if p_payment_method = 'credito' then
    raise exception 'El metodo de pago del abono no puede ser "credito".';
  end if;

  if p_amount <= 0 then
    raise exception 'El monto del abono debe ser mayor a cero.';
  end if;

  select payment_method, total into v_payment_method, v_total
  from public.pos_sales where id = p_sale_id for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_payment_method <> 'credito' then
    raise exception 'Esta venta no es un credito.';
  end if;

  select coalesce(sum(amount), 0) into v_pagado
  from public.credit_payments where sale_id = p_sale_id;

  v_saldo := v_total - v_pagado;

  if p_amount > v_saldo then
    raise exception 'El abono no puede superar el saldo pendiente (%).', v_saldo;
  end if;

  insert into public.credit_payments (sale_id, amount, payment_method, staff_id)
  values (p_sale_id, p_amount, p_payment_method, v_staff_id)
  returning * into v_payment;

  perform public.aplicar_abono_fifo(p_sale_id, p_amount);

  return v_payment;
end;
$$;

revoke execute on function public.registrar_abono_credito(uuid, numeric, public.payment_method) from public, anon;
grant execute on function public.registrar_abono_credito(uuid, numeric, public.payment_method) to authenticated;

-- update_pos_sale: bloquea por completo la edicion de una venta a
-- credito (en cualquiera de los dos sentidos: ni editar una que ya es
-- credito, ni convertir una existente en credito desde aqui). Mismo
-- criterio que 029_bloquear_edicion_wompi_pendiente.sql: editar
-- danaria el saldo ya calculado a partir de credit_payments.
create or replace function public.update_pos_sale(
  p_sale_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_discount numeric default 0
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

  -- Restaura el stock de los items ACTUALES de la venta (revierte el
  -- descuento que se aplico cuando se creo/edito por ultima vez).
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
  set subtotal = v_subtotal, discount = p_discount, total = v_total, payment_method = p_payment_method
  where id = p_sale_id;

  select * into v_sale from public.pos_sales where id = p_sale_id;
  return v_sale;
end;
$$;

revoke execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric) from public, anon;
grant execute on function public.update_pos_sale(uuid, jsonb, public.payment_method, numeric) to authenticated;
