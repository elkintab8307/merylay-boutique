-- Funcion de busqueda de perfil por telefono, con el telefono
-- normalizado (solo digitos) en ambos lados de la comparacion --
-- profiles.whatsapp se guarda tal cual el cliente lo escribio al
-- registrarse (sin normalizar), asi que comparar con .eq() directo
-- (como hacian customer-actions.ts y clientes/[id]/actions.ts) casi
-- nunca encontraba coincidencia. security definer + grant a
-- authenticated: reemplaza el uso de createAdminClient() en esos dos
-- call sites, reduciendo el uso de service role en rutas de peticion.
create or replace function public.buscar_profile_por_telefono(p_telefono text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from public.profiles
  where regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') = p_telefono
    and p_telefono <> ''
  order by created_at desc
  limit 1;
$$;

revoke execute on function public.buscar_profile_por_telefono(text) from public, anon;
grant execute on function public.buscar_profile_por_telefono(text) to authenticated;
