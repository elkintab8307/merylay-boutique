create type public.payment_method as enum ('efectivo', 'tarjeta', 'transferencia', 'nequi', 'daviplata');

create table public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text unique not null,
  staff_id uuid not null references public.profiles(id),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method public.payment_method not null,
  created_at timestamptz not null default now()
);

create table public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index pos_sales_staff_id_idx on public.pos_sales(staff_id);
create index pos_sale_items_sale_id_idx on public.pos_sale_items(sale_id);

alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;

create policy "pos_sales_staff_access"
  on public.pos_sales for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());

create policy "pos_sale_items_staff_access"
  on public.pos_sale_items for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());
