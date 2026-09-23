-- Permite editar (cambio de producto) una venta a credito ya existente.
--
-- Hasta ahora update_pos_sale bloqueaba por completo cualquier venta a
-- credito (migraciones 034/043) porque editar el total descuadraba las
-- cuotas. El saldo real de un credito NO depende de las cuotas sino de
-- pos_sales.total - sum(credit_payments.amount) (ver
-- registrar_abono_credito), asi que cambiar el total mantiene el saldo
-- correcto; solo hay que reconstruir las cuotas PENDIENTES para que sumen
-- el saldo nuevo.
--
-- Reglas:
--   * Un credito sigue siendo credito: no cambia de metodo de pago, y una
--     venta normal tampoco se convierte en credito desde aqui.
--   * El nuevo total no puede ser menor a lo ya abonado (evita saldo a
--     favor / reembolsos, que no estan modelados).
--   * Los abonos (credit_payments) nunca se tocan.
--   * Las cuotas 'pagada' se conservan. Las no pagadas (pendiente/parcial)
--     se reemplazan por el mismo numero de cuotas, con las mismas fechas de
--     vencimiento, repartiendo el saldo nuevo en partes iguales (el
--     residuo de centavos va a la ultima, igual que en create_pos_sale).
--   * Eliminar un credito sigue bloqueado (delete_pos_sale no cambia).

-- Reconstruye las cuotas no pagadas de un credito para que sumen
-- (nuevo total - abonado). Interna: solo la llama update_pos_sale.
create or replace function public.reprogramar_cuotas_credito(p_sale_id uuid, p_nuevo_total numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abonado numeric(12,2);
  v_saldo numeric(12,2);
  v_pendientes int;
  v_numeros int[];
  v_fechas date[];
  v_max_numero int;
  v_cuota_monto numeric(12,2);
  v_cuota_residuo numeric(12,2);
  v_i int;
begin
  select coalesce(sum(amount), 0) into v_abonado
  from public.credit_payments where sale_id = p_sale_id;

  if p_nuevo_total < v_abonado then
    raise exception 'El nuevo total no puede ser menor a lo ya abonado.';
  end if;

  v_saldo := p_nuevo_total - v_abonado;

  select count(*), array_agg(numero order by numero), array_agg(due_date order by numero)
    into v_pendientes, v_numeros, v_fechas
  from public.credit_installments
  where sale_id = p_sale_id and status <> 'pagada';

  delete from public.credit_installments
  where sale_id = p_sale_id and status <> 'pagada';

  if v_saldo = 0 then
    -- Nada pendiente. Si no queda ninguna cuota (nunca se pago una
    -- completa), se deja una simbolica ya pagada, como hace
    -- create_pos_sale cuando el abono inicial cubre el 100%.
    if not exists (select 1 from public.credit_installments where sale_id = p_sale_id) then
      insert into public.credit_installments (sale_id, numero, due_date, amount, paid_amount, status)
      values (
        p_sale_id, 1, (now() at time zone 'America/Bogota')::date,
        p_nuevo_total, p_nuevo_total, 'pagada'
      );
    end if;
    return;
  end if;

  if v_pendientes = 0 then
    -- Todas las cuotas estaban pagadas y el total subio: una cuota nueva.
    select coalesce(max(numero), 0) into v_max_numero
    from public.credit_installments where sale_id = p_sale_id;

    insert into public.credit_installments (sale_id, numero, due_date, amount)
    values (
      p_sale_id, v_max_numero + 1,
      (now() at time zone 'America/Bogota')::date + 15, v_saldo
    );
    return;
  end if;

  v_cuota_monto := trunc(v_saldo / v_pendientes, 2);
  if v_cuota_monto <= 0 then
    raise exception 'El saldo pendiente es muy bajo para dividirlo en % cuotas.', v_pendientes;
  end if;
  v_cuota_residuo := v_saldo - (v_cuota_monto * v_pendientes);

  for v_i in 1..v_pendientes loop
    insert into public.credit_installments (sale_id, numero, due_date, amount)
    values (
      p_sale_id,
      v_numeros[v_i],
      v_fechas[v_i],
      case when v_i = v_pendientes then v_cuota_monto + v_cuota_residuo else v_cuota_monto end
    );
  end loop;
end;
$$;

revoke execute on function public.reprogramar_cuotas_credito(uuid, numeric) from public, anon, authenticated;

-- update_pos_sale: cuerpo base = 048_disponibilidad_por_estampado.sql. Los
-- cambios respecto a esa version estan marcados con "-- [credito]".
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
  v_abonado numeric(12,2); -- [credito]
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

  -- [credito] Un credito puede editarse, pero sigue siendo credito.
  if v_current_payment_method = 'credito' and p_payment_method <> 'credito' then
    raise exception 'Un credito no puede cambiar su metodo de pago.';
  end if;

  if v_current_payment_method <> 'credito' and p_payment_method = 'credito' then
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

  -- [credito] El total de un credito debe seguir siendo positivo y no
  -- puede quedar por debajo de lo que el cliente ya abono.
  if v_current_payment_method = 'credito' then
    if v_total <= 0 then
      raise exception 'El total de una venta a credito debe ser mayor a cero.';
    end if;

    select coalesce(sum(amount), 0) into v_abonado
    from public.credit_payments where sale_id = p_sale_id;

    if v_total < v_abonado then
      raise exception 'El nuevo total ($%) no puede ser menor a lo ya abonado ($%).',
        replace(to_char(v_total, 'FM999,999,999'), ',', '.'),
        replace(to_char(v_abonado, 'FM999,999,999'), ',', '.');
    end if;
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

  -- [credito] En un credito, si no llega cliente se conserva el que ya
  -- tenia (ventas antiguas pueden no tener customer_id).
  update public.pos_sales
  set subtotal = v_subtotal, discount = p_discount, total = v_total,
      payment_method = p_payment_method,
      customer_id = case
        when v_current_payment_method = 'credito' then coalesce(p_customer_id, customer_id)
        else p_customer_id
      end
  where id = p_sale_id;

  -- [credito] Las cuotas pendientes deben sumar el saldo nuevo.
  if v_current_payment_method = 'credito' then
    perform public.reprogramar_cuotas_credito(p_sale_id, v_total);
  end if;

  select * into v_sale from public.pos_sales where id = p_sale_id;
  return v_sale;
end;
$function$;
