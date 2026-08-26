-- Agrega la categoria de gasto "Compras productos", pedida para poder
-- registrar ahi las compras de mercancia a proveedores como un gasto mas.
-- Idempotente: no la duplica si la migracion se vuelve a aplicar.
insert into public.expense_categories (name, is_active)
select 'Compras productos', true
where not exists (
  select 1 from public.expense_categories where name = 'Compras productos'
);
