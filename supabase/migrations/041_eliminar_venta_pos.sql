-- Elimina una venta POS, reponiendo el stock de sus items (mismo criterio
-- de reversion que ya usa update_pos_sale). Las ventas a credito no se
-- pueden eliminar: credit_payments.sale_id tiene "on delete restrict"
-- (033_sistema_credito_schema.sql) si ya hubo abonos, y aunque no los haya
-- borrar igual daria de baja las cuotas generadas sin dejar rastro -- mismo
-- bloqueo explicito que ya usa update_pos_sale para editar creditos.
create or replace function public.delete_pos_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_method public.payment_method;
  v_product_id uuid;
  v_variant_id uuid;
  v_qty int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  select payment_method into v_payment_method
  from public.pos_sales where id = p_sale_id for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_payment_method = 'credito' then
    raise exception 'Esta venta es un credito y no se puede eliminar.';
  end if;

  for v_product_id, v_variant_id, v_qty in
    select product_id, variant_id, qty from public.pos_sale_items where sale_id = p_sale_id
  loop
    if v_variant_id is not null then
      update public.product_variants set stock = stock + v_qty where id = v_variant_id;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
    end if;
  end loop;

  delete from public.pos_sales where id = p_sale_id;
end;
$$;

revoke execute on function public.delete_pos_sale(uuid) from public, anon;
grant execute on function public.delete_pos_sale(uuid) to authenticated;
