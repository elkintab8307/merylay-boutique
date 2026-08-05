-- Corrige los hallazgos de los advisors de seguridad y rendimiento
-- detectados al cerrar la Fase 2.

-- 1) Seguridad: search_path mutable en set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 2) Seguridad: handle_new_user solo debe ejecutarse como trigger,
-- no via RPC publico (/rest/v1/rpc/handle_new_user)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3) Rendimiento: evita reevaluar auth.uid() por fila en RLS,
-- envolviendolo en (select ...) para que se resuelva una sola vez por consulta.
drop policy "profiles_select_own_or_superadmin" on public.profiles;
create policy "profiles_select_own_or_superadmin"
  on public.profiles for select
  using (id = (select auth.uid()) or public.is_superadmin());

drop policy "profiles_update_own_or_superadmin" on public.profiles;
create policy "profiles_update_own_or_superadmin"
  on public.profiles for update
  using (id = (select auth.uid()) or public.is_superadmin());

drop policy "carts_owner_or_admin" on public.carts;
create policy "carts_owner_or_admin"
  on public.carts for all
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());

drop policy "cart_items_owner_or_admin" on public.cart_items;
create policy "cart_items_owner_or_admin"
  on public.cart_items for all
  using (
    exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = (select auth.uid()) or public.is_admin()))
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = (select auth.uid()) or public.is_admin()))
  );

drop policy "orders_select_owner_or_admin" on public.orders;
create policy "orders_select_owner_or_admin"
  on public.orders for select
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy "orders_insert_owner" on public.orders;
create policy "orders_insert_owner"
  on public.orders for insert
  with check (user_id = (select auth.uid()) or public.is_admin());

drop policy "order_items_select_owner_or_admin" on public.order_items;
create policy "order_items_select_owner_or_admin"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin()))
  );

drop policy "order_items_insert_owner" on public.order_items;
create policy "order_items_insert_owner"
  on public.order_items for insert
  with check (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin()))
  );

-- 4) Rendimiento: indices de cobertura para FKs sin indice
create index if not exists cart_items_product_id_idx on public.cart_items(product_id);
create index if not exists cart_items_variant_id_idx on public.cart_items(variant_id);
create index if not exists carts_user_id_idx on public.carts(user_id);
create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_variant_id_idx on public.order_items(variant_id);
create index if not exists pos_sale_items_product_id_idx on public.pos_sale_items(product_id);
create index if not exists pos_sale_items_variant_id_idx on public.pos_sale_items(variant_id);

-- 5) Rendimiento: elimina la duplicacion de politicas permisivas en SELECT.
-- Las politicas "_write_admin" (FOR ALL) tambien cubrian SELECT, duplicando
-- evaluacion junto con "_select_active_or_admin". Se separan en
-- insert/update/delete explicitos.
drop policy "categories_write_admin" on public.categories;
create policy "categories_insert_admin" on public.categories for insert with check (public.is_admin());
create policy "categories_update_admin" on public.categories for update using (public.is_admin()) with check (public.is_admin());
create policy "categories_delete_admin" on public.categories for delete using (public.is_admin());

drop policy "products_write_admin" on public.products;
create policy "products_insert_admin" on public.products for insert with check (public.is_admin());
create policy "products_update_admin" on public.products for update using (public.is_admin()) with check (public.is_admin());
create policy "products_delete_admin" on public.products for delete using (public.is_admin());

drop policy "product_variants_write_admin" on public.product_variants;
create policy "product_variants_insert_admin" on public.product_variants for insert with check (public.is_admin());
create policy "product_variants_update_admin" on public.product_variants for update using (public.is_admin()) with check (public.is_admin());
create policy "product_variants_delete_admin" on public.product_variants for delete using (public.is_admin());

drop policy "product_images_write_admin" on public.product_images;
create policy "product_images_insert_admin" on public.product_images for insert with check (public.is_admin());
create policy "product_images_update_admin" on public.product_images for update using (public.is_admin()) with check (public.is_admin());
create policy "product_images_delete_admin" on public.product_images for delete using (public.is_admin());
