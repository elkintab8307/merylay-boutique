insert into storage.buckets (id, name, public)
values ('banner-images', 'banner-images', true)
on conflict (id) do nothing;

create policy "banner_images_public_read"
  on storage.objects for select
  using (bucket_id = 'banner-images');
create policy "banner_images_superadmin_write"
  on storage.objects for insert
  with check (bucket_id = 'banner-images' and public.is_superadmin());
create policy "banner_images_superadmin_update"
  on storage.objects for update
  using (bucket_id = 'banner-images' and public.is_superadmin());
create policy "banner_images_superadmin_delete"
  on storage.objects for delete
  using (bucket_id = 'banner-images' and public.is_superadmin());
