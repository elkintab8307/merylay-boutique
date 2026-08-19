-- Cambia la periodicidad de las cuotas de credito de mensual (30 dias)
-- a quincenal (15 dias). Unico cambio respecto a la version anterior de
-- create_pos_sale (036_sistema_credito_final_review_fixes.sql): el
-- offset de dias al calcular due_date, en las dos ramas donde se genera
-- el calendario de cuotas. Nada mas cambia (montos, FIFO, validaciones,
-- bloqueo de edicion, informes).

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
      values (v_sale_id, 1, (now() at time zone 'America/Bogota')::date + 15, v_total);
    else
      -- Las cuotas ya nacen NETAS del abono inicial (representan solo el
      -- saldo a financiar, spec S4.2) -- por eso el abono inicial NO se
      -- reparte otra vez contra ellas mas abajo.
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
          -- Quincenal: cuota 1 vence a los 15 dias, cuota 2 a los 30, etc.
          (now() at time zone 'America/Bogota')::date + (15 * v_i),
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
