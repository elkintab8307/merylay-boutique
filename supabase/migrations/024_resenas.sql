create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  body text not null,
  rating int not null check (rating between 1 and 5),
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index reviews_sort_order_idx on public.reviews(sort_order);

alter table public.reviews enable row level security;

create policy "reviews_select_active_or_admin"
  on public.reviews for select
  using (is_active or public.is_admin());
create policy "reviews_write_admin"
  on public.reviews for all
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('review-images', 'review-images', true)
on conflict (id) do nothing;

create policy "review_images_public_read"
  on storage.objects for select
  using (bucket_id = 'review-images');
create policy "review_images_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'review-images' and public.is_admin());
create policy "review_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'review-images' and public.is_admin());
create policy "review_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'review-images' and public.is_admin());
