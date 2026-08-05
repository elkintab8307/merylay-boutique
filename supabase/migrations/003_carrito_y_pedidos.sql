create type public.order_status as enum ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado');

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  session_id text,
  created_at timestamptz not null default now(),
  constraint carts_owner_check check (user_id is not null or session_id is not null)
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  user_id uuid not null references public.profiles(id),
  status public.order_status not null default 'pendiente',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  shipping numeric(12,2) not null default 0 check (shipping >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method text,
  shipping_address jsonb,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  name_snapshot text not null,
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index cart_items_cart_id_idx on public.cart_items(cart_id);
create index orders_user_id_idx on public.orders(user_id);
create index order_items_order_id_idx on public.order_items(order_id);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- El acceso de carritos de invitados (session_id, sin user_id) se implementa
-- server-side en la Fase 7 (Route Handler con el cliente de servidor), no con
-- una politica RLS abierta por session_id: exponer esa columna directamente
-- via RLS permitiria a cualquier anon listar carritos de otros invitados.
create policy "carts_owner_or_admin"
  on public.carts for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "cart_items_owner_or_admin"
  on public.cart_items for all
  using (
    exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = auth.uid() or public.is_admin()))
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = auth.uid() or public.is_admin()))
  );

create policy "orders_select_owner_or_admin"
  on public.orders for select
  using (user_id = auth.uid() or public.is_admin());
create policy "orders_insert_owner"
  on public.orders for insert
  with check (user_id = auth.uid() or public.is_admin());
create policy "orders_update_admin"
  on public.orders for update
  using (public.is_admin());

create policy "order_items_select_owner_or_admin"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
  );
create policy "order_items_insert_owner"
  on public.order_items for insert
  with check (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
  );
