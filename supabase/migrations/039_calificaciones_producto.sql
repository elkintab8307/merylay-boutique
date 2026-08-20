create table public.product_ratings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_ratings_unique_per_customer unique (product_id, user_id)
);

create index product_ratings_product_id_idx on public.product_ratings(product_id);

alter table public.product_ratings enable row level security;

create policy product_ratings_public_read
  on public.product_ratings for select
  using (true);

create policy product_ratings_owner_write
  on public.product_ratings for insert
  with check (user_id = auth.uid());

create policy product_ratings_owner_update
  on public.product_ratings for update
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

create policy product_ratings_owner_or_admin_delete
  on public.product_ratings for delete
  using (user_id = auth.uid() or is_admin());
