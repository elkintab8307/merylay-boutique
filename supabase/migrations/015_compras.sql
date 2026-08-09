create table public.product_costs (
  product_id uuid primary key references public.products(id),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  purchase_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  product_id uuid not null references public.products(id),
  qty integer not null check (qty > 0),
  unit_cost numeric(12,2) not null check (unit_cost > 0),
  line_total numeric(12,2) not null check (line_total > 0)
);

create index purchase_items_purchase_id_idx on public.purchase_items(purchase_id);
create index purchase_items_product_id_idx on public.purchase_items(product_id);
create index purchases_supplier_id_idx on public.purchases(supplier_id);

alter table public.product_costs enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "product_costs_all_admin"
  on public.product_costs for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "suppliers_all_admin"
  on public.suppliers for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "purchases_all_admin"
  on public.purchases for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "purchase_items_all_admin"
  on public.purchase_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- Registra una compra a un proveedor: crea la cabecera, cada linea, suma
-- stock al producto y sobrescribe su costo vigente con el costo de esta
-- compra (el mas reciente gana). Bloquea cada fila de producto antes de
-- sumar stock para evitar condiciones de carrera con otra compra o venta
-- concurrente del mismo producto.
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_cost := (v_item->>'unitCost')::numeric;

    if v_qty <= 0 then
      raise exception 'La cantidad debe ser mayor a cero.';
    end if;
    if v_unit_cost <= 0 then
      raise exception 'El costo unitario debe ser mayor a cero.';
    end if;

    -- Bloquea la fila del producto antes de sumar stock, para que dos
    -- compras (o una compra y una venta) concurrentes del mismo producto
    -- no se pisen entre si.
    perform 1 from public.products where id = v_product_id for update;
    if not found then
      raise exception 'Producto no encontrado.';
    end if;

    insert into public.purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
    values (v_purchase_id, v_product_id, v_qty, v_unit_cost, v_qty * v_unit_cost);

    update public.products set stock = stock + v_qty where id = v_product_id;

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
