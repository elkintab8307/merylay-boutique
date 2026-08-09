-- Ventas por dia y canal (tienda/pos). Un pedido de tienda solo cuenta
-- como venta real si ya esta pagado, enviado o entregado; una venta POS
-- siempre es un hecho consumado (no tiene estado "pendiente").
create function public.informe_ventas_serie(p_desde date, p_hasta date)
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
  select o.created_at::date as fecha, 'tienda'::text as canal, sum(o.total) as monto
  from public.orders o
  where o.status in ('pagado', 'enviado', 'entregado')
    and o.created_at::date between p_desde and p_hasta
  group by o.created_at::date
  union all
  select s.created_at::date as fecha, 'pos'::text as canal, sum(s.total) as monto
  from public.pos_sales s
  where s.created_at::date between p_desde and p_hasta
  group by s.created_at::date
  order by fecha;
end;
$$;

revoke execute on function public.informe_ventas_serie(date, date) from public, anon;
grant execute on function public.informe_ventas_serie(date, date) to authenticated;

-- Top N productos por unidades e ingreso, combinando order_items
-- (pedidos calificados) y pos_sale_items en el rango de fechas.
create function public.informe_productos_vendidos(
  p_desde date, p_hasta date, p_limit int default 10
)
returns table (product_id uuid, nombre text, qty numeric, ingreso numeric)
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
  select p.id as product_id, p.name as nombre, sum(x.qty)::numeric as qty, sum(x.line_total) as ingreso
  from (
    select oi.product_id, oi.qty, oi.line_total
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
      and oi.product_id is not null
    union all
    select psi.product_id, psi.qty, psi.line_total
    from public.pos_sale_items psi
    join public.pos_sales s on s.id = psi.sale_id
    where s.created_at::date between p_desde and p_hasta
      and psi.product_id is not null
  ) x
  join public.products p on p.id = x.product_id
  group by p.id, p.name
  order by qty desc
  limit p_limit;
end;
$$;

revoke execute on function public.informe_productos_vendidos(date, date, int) from public, anon;
grant execute on function public.informe_productos_vendidos(date, date, int) to authenticated;

-- Ingreso por metodo de pago, combinando ambos canales. "efectivo" y
-- "transferencia" existen en orders.payment_method y en el enum de
-- pos_sales.payment_method, y se combinan naturalmente bajo la misma
-- clave; "wompi" (solo tienda) y "tarjeta"/"nequi"/"daviplata" (solo POS)
-- quedan separados por ser rieles de pago distintos.
create function public.informe_metodos_pago(p_desde date, p_hasta date)
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

  -- Calificado con "x." para evitar ambiguedad: "metodo" tambien es el
  -- nombre del primer parametro de salida de esta funcion (RETURNS TABLE lo
  -- declara como variable implicita visible en todo el cuerpo plpgsql), y
  -- una referencia sin calificar en SELECT/GROUP BY aqui rompe con
  -- "column reference \"metodo\" is ambiguous".
  return query
  select x.metodo, sum(x.monto) as total
  from (
    select coalesce(o.payment_method, 'sin especificar') as metodo, o.total as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
    union all
    select s.payment_method::text as metodo, s.total as monto
    from public.pos_sales s
    where s.created_at::date between p_desde and p_hasta
  ) x
  group by x.metodo
  order by total desc;
end;
$$;

revoke execute on function public.informe_metodos_pago(date, date) from public, anon;
grant execute on function public.informe_metodos_pago(date, date) to authenticated;

-- Gastos por dia y categoria.
create function public.informe_gastos_serie(p_desde date, p_hasta date)
returns table (fecha date, categoria text, monto numeric)
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
  select e.expense_date as fecha, ec.name as categoria, sum(e.amount) as monto
  from public.expenses e
  join public.expense_categories ec on ec.id = e.category_id
  where e.expense_date between p_desde and p_hasta
  group by e.expense_date, ec.name
  order by fecha;
end;
$$;

revoke execute on function public.informe_gastos_serie(date, date) from public, anon;
grant execute on function public.informe_gastos_serie(date, date) to authenticated;

-- Compras por dia y proveedor.
create function public.informe_compras_serie(p_desde date, p_hasta date)
returns table (fecha date, proveedor text, monto numeric)
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
  select pu.purchase_date as fecha, s.name as proveedor, sum(pi.line_total) as monto
  from public.purchase_items pi
  join public.purchases pu on pu.id = pi.purchase_id
  join public.suppliers s on s.id = pu.supplier_id
  where pu.purchase_date between p_desde and p_hasta
  group by pu.purchase_date, s.name
  order by fecha;
end;
$$;

revoke execute on function public.informe_compras_serie(date, date) from public, anon;
grant execute on function public.informe_compras_serie(date, date) to authenticated;

-- Ganancia real por dia: ventas calificadas, costo de productos vendidos
-- (qty x product_costs.cost_price VIGENTE, sin costo registrado = 0),
-- gastos, y unidades vendidas sin costo registrado (para la advertencia
-- visible del informe). La resta se calcula aqui, no en el cliente.
create function public.informe_ganancia_serie(p_desde date, p_hasta date)
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
    select o.created_at::date as fecha, sum(o.total) as monto
    from public.orders o
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
    group by o.created_at::date
    union all
    select s.created_at::date as fecha, sum(s.total) as monto
    from public.pos_sales s
    where s.created_at::date between p_desde and p_hasta
    group by s.created_at::date
  ),
  ventas_agrupadas as (
    -- Calificado con "ventas_dia." para evitar ambiguedad: "fecha" tambien
    -- es el nombre del primer parametro de salida de esta funcion
    -- (RETURNS TABLE lo declara como variable implicita visible en todo el
    -- cuerpo plpgsql), y una referencia sin calificar aqui rompe con
    -- "column reference \"fecha\" is ambiguous".
    select ventas_dia.fecha, sum(ventas_dia.monto) as monto
    from ventas_dia
    group by ventas_dia.fecha
  ),
  items_vendidos as (
    select o.created_at::date as fecha, oi.product_id, oi.qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('pagado', 'enviado', 'entregado')
      and o.created_at::date between p_desde and p_hasta
      and oi.product_id is not null
    union all
    select s.created_at::date as fecha, psi.product_id, psi.qty
    from public.pos_sale_items psi
    join public.pos_sales s on s.id = psi.sale_id
    where s.created_at::date between p_desde and p_hasta
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

revoke execute on function public.informe_ganancia_serie(date, date) from public, anon;
grant execute on function public.informe_ganancia_serie(date, date) to authenticated;
