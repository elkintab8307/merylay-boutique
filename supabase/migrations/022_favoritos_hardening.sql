drop policy "favorites_owner_only" on public.favorites;

create policy "favorites_owner_only"
  on public.favorites for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop index public.favorites_user_id_idx;
create index favorites_product_id_idx on public.favorites(product_id);
