create table public.store_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null
);

alter table public.store_settings enable row level security;

create policy "store_settings_select_public"
  on public.store_settings for select
  using (true);

create policy "store_settings_insert_superadmin"
  on public.store_settings for insert
  with check (public.is_superadmin());

create policy "store_settings_update_superadmin"
  on public.store_settings for update
  using (public.is_superadmin());

create policy "store_settings_delete_superadmin"
  on public.store_settings for delete
  using (public.is_superadmin());
