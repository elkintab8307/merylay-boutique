-- Finding critico: la politica UPDATE de profiles no tiene WITH CHECK, por lo que
-- cualquier usuario autenticado podia modificar su propia columna `role` y
-- auto-promoverse a superadmin via PATCH /rest/v1/profiles.
-- Un trigger BEFORE UPDATE bloquea el cambio de rol salvo que lo haga un
-- superadmin o el service_role (necesario para scripts/seed-superadmin.ts).

create or replace function public.prevent_unauthorized_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and not public.is_superadmin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado para cambiar el rol.';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_unauthorized_role_change() from public, anon, authenticated;

drop trigger if exists profiles_role_change_guard on public.profiles;

create trigger profiles_role_change_guard
  before update on public.profiles
  for each row execute function public.prevent_unauthorized_role_change();
