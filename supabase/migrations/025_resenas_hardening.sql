-- Corrige la duplicacion de politicas permisivas en SELECT para reviews,
-- siguiendo el mismo patron que 007_hardening.sql (seccion 5) establecio
-- para categories/products/product_variants/product_images: la politica
-- "reviews_write_admin" (FOR ALL) tambien cubria SELECT, duplicando
-- evaluacion junto con "reviews_select_active_or_admin". Se separa en
-- insert/update/delete explicitos.

drop policy "reviews_write_admin" on public.reviews;

create policy "reviews_insert_admin"
  on public.reviews for insert
  with check (public.is_admin());
create policy "reviews_update_admin"
  on public.reviews for update
  using (public.is_admin());
create policy "reviews_delete_admin"
  on public.reviews for delete
  using (public.is_admin());
