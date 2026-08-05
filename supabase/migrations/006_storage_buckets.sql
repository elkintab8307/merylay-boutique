insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('category-images', 'category-images', true),
  ('brand', 'brand', true)
on conflict (id) do nothing;

create policy "product_images_public_read"
  on storage.objects for select
  using (bucket_id = 'product-images');
create policy "product_images_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());

create policy "category_images_public_read"
  on storage.objects for select
  using (bucket_id = 'category-images');
create policy "category_images_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'category-images' and public.is_admin());
create policy "category_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'category-images' and public.is_admin());
create policy "category_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'category-images' and public.is_admin());

create policy "brand_public_read"
  on storage.objects for select
  using (bucket_id = 'brand');
create policy "brand_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'brand' and public.is_admin());
create policy "brand_admin_update"
  on storage.objects for update
  using (bucket_id = 'brand' and public.is_admin());
create policy "brand_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'brand' and public.is_admin());
