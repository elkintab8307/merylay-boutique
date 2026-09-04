-- Stock del producto automatico: para productos CON variantes,
-- products.stock deja de escribirse a mano y pasa a ser la suma del
-- stock de todas sus variantes (que a su vez ya se calcula solo del
-- conteo de fotos no vendidas -- migracion 048). Productos SIN
-- variantes: products.stock sigue siendo manual, este trigger nunca los
-- toca porque no tienen filas en product_variants.

create or replace function public.recalcular_stock_producto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- NEW/OLD solo estan asignados dentro de su operacion.
  if TG_OP in ('INSERT', 'UPDATE') and new.product_id is not null then
    update public.products
    set stock = (
      select coalesce(sum(stock), 0)
      from public.product_variants
      where product_id = new.product_id
    )
    where id = new.product_id;
  end if;

  -- DELETE, o UPDATE que reasigna product_id: recalcula tambien el
  -- producto viejo que perdio la variante.
  if TG_OP in ('DELETE', 'UPDATE') and old.product_id is not null
     and (TG_OP = 'DELETE' or old.product_id is distinct from new.product_id) then
    update public.products
    set stock = (
      select coalesce(sum(stock), 0)
      from public.product_variants
      where product_id = old.product_id
    )
    where id = old.product_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_stock_producto on public.product_variants;
create trigger trg_recalcular_stock_producto
after insert or update of stock, product_id or delete on public.product_variants
for each row execute function public.recalcular_stock_producto();

-- Backfill unico: deja products.stock igual a la suma de sus variantes
-- para todo producto que tenga al menos una variante.
update public.products p
set stock = (
  select coalesce(sum(pv.stock), 0)
  from public.product_variants pv
  where pv.product_id = p.id
)
where exists (select 1 from public.product_variants pv where pv.product_id = p.id);
