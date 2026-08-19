-- profiles: nuevos campos de contacto/envio para clientes
alter table public.profiles
  add column address text,
  add column whatsapp text;

-- reviews: vinculo opcional a un cliente + una resena por cliente
alter table public.reviews
  add column user_id uuid references public.profiles(id) on delete cascade;

-- Restriccion unica NORMAL (no un indice parcial): en Postgres los NULL
-- nunca se consideran duplicados entre si bajo una unique constraint, asi
-- que esto ya permite multiples resenas del admin con user_id = null,
-- mientras limita a una fila por cliente real. Se usa una constraint (no
-- un indice parcial) porque supabase-js hace
-- upsert(..., { onConflict: "user_id" }) mas adelante, y un indice
-- parcial exigiria que la clausula ON CONFLICT repita el mismo predicado
-- WHERE, algo que la libreria no permite especificar.
alter table public.reviews
  add constraint reviews_user_id_unique unique (user_id);

-- RLS: el cliente puede insertar/editar/leer SU PROPIA resena (ademas de
-- los permisos de admin ya existentes en reviews_insert_admin,
-- reviews_update_admin, reviews_select_active_or_admin, que no se tocan).
-- Mismo patron que favorites (migracion 022): auth.uid() envuelto en
-- (select ...), politicas limitadas a "authenticated".
create policy "reviews_insert_own"
  on public.reviews for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "reviews_update_own"
  on public.reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reviews_select_own"
  on public.reviews for select
  to authenticated
  using (user_id = (select auth.uid()));

-- handle_new_user: ahora puebla full_name/address/whatsapp en el mismo
-- insert (antes solo username/role), y el username se deriva del
-- whatsapp cuando esta presente en los metadatos (registro sin email),
-- o del email como antes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate_username text;
  suffix int := 1;
  base_source text;
begin
  base_source := coalesce(
    nullif(new.raw_user_meta_data->>'whatsapp', ''),
    split_part(new.email, '@', 1)
  );
  base_username := lower(regexp_replace(base_source, '[^a-z0-9]', '', 'g'));
  if base_username = '' then
    base_username := 'usuario';
  end if;

  candidate_username := base_username;

  while exists (select 1 from public.profiles where username = candidate_username) loop
    suffix := suffix + 1;
    candidate_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, full_name, address, whatsapp, role)
  values (
    new.id,
    candidate_username,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'whatsapp',
    'customer'
  );

  return new;
end;
$$;
