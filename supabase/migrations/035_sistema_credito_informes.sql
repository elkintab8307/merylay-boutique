-- Ajusta los informes de ingreso para que una venta a credito no cuente
-- como ingreso al momento de venderse: su total se excluye, y cada abono
-- (credit_payments) se suma en su lugar, fechado el dia que se recibe.
-- Ver docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md §6.
--
-- Nota de consistencia temporal (intencional, ver spec §6.2): el costo de
-- producto vendido (informe_ganancia_serie, items_vendidos/costo_dia) NO
-- cambia y se sigue reconociendo el dia de la venta, no del abono. Para
-- un credito, esto significa que el dia de la venta puede mostrar
-- ganancia negativa (costo sin ingreso todavia) y los dias de abono
-- ganancia sin costo asociado — es el criterio de caja que se pidio
-- explicitamente para el ingreso, aplicado de forma consistente.

create or replace function public.informe_ventas_serie(p_desde date, p_hasta date)
returns table (fecha date, canal text, monto numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  select x.fecha, x.canal, sum(x.monto) as monto
  from (
    select (o.created_at at time zone 'America/Bogota')::date as fecha, 'tienda'::text as canal, o.total as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    union all
    select (s.created_at at time zone 'America/Bogota')::date as fecha, 'pos'::text as canal, s.total as monto
    from public.pos_sales s
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and s.payment_method <> 'credito'
    union all
    select (cp.created_at at time zone 'America/Bogota')::date as fecha, 'pos'::text as canal, cp.amount as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  ) x
  group by x.fecha, x.canal
  order by x.fecha;
end;
$$;

create or replace function public.informe_metodos_pago(p_desde date, p_hasta date)
returns table (metodo text, total numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  select x.metodo, sum(x.monto) as total
  from (
    select coalesce(o.payment_method, 'sin especificar') as metodo, o.total as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    union all
    select s.payment_method::text as metodo, s.total as monto
    from public.pos_sales s
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and s.payment_method <> 'credito'
    union all
    select cp.payment_method::text as metodo, cp.amount as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  ) x
  group by x.metodo
  order by total desc;
end;
$$;

create or replace function public.informe_ganancia_serie(p_desde date, p_hasta date)
returns table (
  fecha date,
  ventas numeric,
  costo_productos numeric,
  gastos numeric,
  ganancia numeric,
  unidades_sin_costo int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  ventas_dia as (
    select (o.created_at at time zone 'America/Bogota')::date as fecha, sum(o.total) as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    group by (o.created_at at time zone 'America/Bogota')::date
    union all
    select (s.created_at at time zone 'America/Bogota')::date as fecha, sum(s.total) as monto
    from public.pos_sales s
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and s.payment_method <> 'credito'
    group by (s.created_at at time zone 'America/Bogota')::date
    union all
    select (cp.created_at at time zone 'America/Bogota')::date as fecha, sum(cp.amount) as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
    group by (cp.created_at at time zone 'America/Bogota')::date
  ),
  ventas_agrupadas as (
    select ventas_dia.fecha, sum(ventas_dia.monto) as monto
    from ventas_dia
    group by ventas_dia.fecha
  ),
  items_vendidos as (
    select (o.created_at at time zone 'America/Bogota')::date as fecha, oi.product_id, oi.qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('pagado', 'enviado', 'entregado')
      and (o.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and oi.product_id is not null
    union all
    select (s.created_at at time zone 'America/Bogota')::date as fecha, psi.product_id, psi.qty
    from public.pos_sale_items psi
    join public.pos_sales s on s.id = psi.sale_id
    where (s.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
      and psi.product_id is not null
  ),
  costo_dia as (
    select
      iv.fecha,
      sum(iv.qty * coalesce(pc.cost_price, 0)) as costo,
      sum(iv.qty) filter (where pc.cost_price is null)::int as unidades_sin_costo
    from items_vendidos iv
    left join public.product_costs pc on pc.product_id = iv.product_id
    group by iv.fecha
  ),
  gastos_dia as (
    select e.expense_date as fecha, sum(e.amount) as monto
    from public.expenses e
    where e.expense_date between p_desde and p_hasta
    group by e.expense_date
  )
  select
    d.fecha,
    coalesce(v.monto, 0) as ventas,
    coalesce(c.costo, 0) as costo_productos,
    coalesce(g.monto, 0) as gastos,
    coalesce(v.monto, 0) - coalesce(c.costo, 0) - coalesce(g.monto, 0) as ganancia,
    coalesce(c.unidades_sin_costo, 0) as unidades_sin_costo
  from dias d
  left join ventas_agrupadas v on v.fecha = d.fecha
  left join costo_dia c on c.fecha = d.fecha
  left join gastos_dia g on g.fecha = d.fecha
  order by d.fecha;
end;
$$;

-- Resumen de cartera de creditos: cartera_pendiente y monto_vencido son
-- una fotografia (no dependen del rango de fechas); cobrado_en_periodo si.
create or replace function public.informe_creditos_resumen(p_desde date, p_hasta date)
returns table (cartera_pendiente numeric, monto_vencido numeric, cobrado_en_periodo numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
  with saldos as (
    select s.id, s.total - coalesce(sum(cp.amount), 0) as saldo
    from public.pos_sales s
    left join public.credit_payments cp on cp.sale_id = s.id
    where s.payment_method = 'credito'
    group by s.id, s.total
  ),
  vencido as (
    select coalesce(sum(ci.amount - ci.paid_amount), 0) as monto
    from public.credit_installments ci
    where ci.status <> 'pagada' and ci.due_date < current_date
  ),
  cobrado as (
    select coalesce(sum(cp.amount), 0) as monto
    from public.credit_payments cp
    where (cp.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  )
  select
    coalesce((select sum(saldo) from saldos where saldo > 0), 0) as cartera_pendiente,
    (select monto from vencido) as monto_vencido,
    (select monto from cobrado) as cobrado_en_periodo;
end;
$$;

revoke execute on function public.informe_creditos_resumen(date, date) from public, anon;
grant execute on function public.informe_creditos_resumen(date, date) to authenticated;
