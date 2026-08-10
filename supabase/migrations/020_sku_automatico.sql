create table public.sku_counters (
  prefix text primary key,
  siguiente int not null default 1
);

alter table public.sku_counters enable row level security;

-- Genera el siguiente SKU de producto: prefijo de hasta 3 letras
-- derivado del nombre de la categoria (sin tildes, solo letras;
-- "GEN" si no hay categoria o su nombre no aporta letras utilizables)
-- mas un secuencial de 6 digitos que solo sube, nunca se repite. El
-- incremento del contador usa upsert con ON CONFLICT para que dos
-- llamadas concurrentes con el mismo prefijo nunca reciban el mismo
-- numero (mismo principio de atomicidad que create_purchase).
create function public.generar_sku_producto(p_category_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_categoria text;
  v_prefijo text;
  v_numero int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_category_id is not null then
    select name into v_nombre_categoria
    from public.categories
    where id = p_category_id;
  end if;

  v_prefijo := upper(left(
    regexp_replace(
      translate(
        coalesce(v_nombre_categoria, 'General'),
        'áéíóúÁÉÍÓÚñÑ',
        'aeiouAEIOUnN'
      ),
      '[^a-zA-Z]', '', 'g'
    ),
    3
  ));

  if v_prefijo = '' then
    v_prefijo := 'GEN';
  end if;

  insert into public.sku_counters (prefix, siguiente)
  values (v_prefijo, 1)
  on conflict (prefix) do update set siguiente = sku_counters.siguiente + 1
  returning siguiente into v_numero;

  return v_prefijo || '-' || lpad(v_numero::text, 6, '0');
end;
$$;

revoke execute on function public.generar_sku_producto(uuid) from public, anon;
grant execute on function public.generar_sku_producto(uuid) to authenticated;
