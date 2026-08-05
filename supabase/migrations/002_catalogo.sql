create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  sku text unique not null,
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text unique not null,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  stock int not null default 0 check (stock >= 0)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order int not null default 0,
  is_primary boolean not null default false
);

create index products_category_id_idx on public.products(category_id);
create index product_variants_product_id_idx on public.product_variants(product_id);
create index product_images_product_id_idx on public.product_images(product_id);

-- updated_at automatico en products
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;

create policy "categories_select_active_or_admin"
  on public.categories for select
  using (is_active or public.is_admin());
create policy "categories_write_admin"
  on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy "products_select_active_or_admin"
  on public.products for select
  using (is_active or public.is_admin());
create policy "products_write_admin"
  on public.products for all
  using (public.is_admin()) with check (public.is_admin());

create policy "product_variants_select_active_or_admin"
  on public.product_variants for select
  using (
    exists (select 1 from public.products p where p.id = product_id and (p.is_active or public.is_admin()))
  );
create policy "product_variants_write_admin"
  on public.product_variants for all
  using (public.is_admin()) with check (public.is_admin());

create policy "product_images_select_active_or_admin"
  on public.product_images for select
  using (
    exists (select 1 from public.products p where p.id = product_id and (p.is_active or public.is_admin()))
  );
create policy "product_images_write_admin"
  on public.product_images for all
  using (public.is_admin()) with check (public.is_admin());
