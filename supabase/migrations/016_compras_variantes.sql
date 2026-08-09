alter table public.purchase_items add column variant_id uuid references public.product_variants(id);
create index purchase_items_variant_id_idx on public.purchase_items(variant_id);

-- Registra una compra a un proveedor: crea la cabecera, cada linea, suma
-- stock (al producto o a la variante segun corresponda) y sobrescribe el
-- costo vigente del producto con el costo de esta compra (el mas reciente
-- gana; el costo se registra siempre a nivel de producto general, nunca
-- por variante). Bloquea cada fila de producto/variante antes de sumar
-- stock para evitar condiciones de carrera con otra compra o venta
-- concurrente del mismo producto/variante. Recorre los items en un orden
-- deterministico antes de bloquear, para que dos compras concurrentes con
-- productos superpuestos en distinto orden no terminen en deadlock.
create or replace function public.create_purchase(
  p_supplier_id uuid,
  p_purchase_date date,
  p_items jsonb
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_purchase public.purchases;
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_qty int;
  v_unit_cost numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene productos.';
  end if;

  insert into public.purchases (supplier_id, purchase_date, created_by)
  values (p_supplier_id, p_purchase_date, auth.uid())
  returning id into v_purchase_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by coalesce(value->>'variantId', value->>'productId')
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_cost := (v_item->>'unitCost')::numeric;

    if v_qty <= 0 then
      raise exception 'La cantidad debe ser mayor a cero.';
    end if;
    if v_unit_cost <= 0 then
      raise exception 'El costo unitario debe ser mayor a cero.';
    end if;

    -- Bloquea la fila de la variante o del producto antes de sumar stock,
    -- para que dos compras (o una compra y una venta) concurrentes del
    -- mismo producto/variante no se pisen entre si.
    if v_variant_id is not null then
      perform 1 from public.product_variants where id = v_variant_id for update;
      if not found then
        raise exception 'Variante no encontrada.';
      end if;
    else
      perform 1 from public.products where id = v_product_id for update;
      if not found then
        raise exception 'Producto no encontrado.';
      end if;
    end if;

    insert into public.purchase_items (purchase_id, product_id, variant_id, qty, unit_cost, line_total)
    values (v_purchase_id, v_product_id, v_variant_id, v_qty, v_unit_cost, v_qty * v_unit_cost);

    if v_variant_id is not null then
      update public.product_variants set stock = stock + v_qty where id = v_variant_id;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
    end if;

    insert into public.product_costs (product_id, cost_price, updated_at)
    values (v_product_id, v_unit_cost, now())
    on conflict (product_id) do update
      set cost_price = excluded.cost_price, updated_at = excluded.updated_at;
  end loop;

  select * into v_purchase from public.purchases where id = v_purchase_id;
  return v_purchase;
end;
$$;

revoke execute on function public.create_purchase(uuid, date, jsonb) from public, anon;
grant execute on function public.create_purchase(uuid, date, jsonb) to authenticated;
