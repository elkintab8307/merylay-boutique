-- Enum de roles
create type public.user_role as enum ('superadmin', 'admin', 'staff', 'customer');

-- Tabla profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  role public.user_role not null default 'customer',
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Funciones de rol (security definer para evitar recursion en RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function public.is_staff_or_above()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin', 'superadmin')
  );
$$;

-- Politicas RLS de profiles
create policy "profiles_select_own_or_superadmin"
  on public.profiles for select
  using (id = auth.uid() or public.is_superadmin());

create policy "profiles_update_own_or_superadmin"
  on public.profiles for update
  using (id = auth.uid() or public.is_superadmin());

-- Trigger: crea el profile al registrarse un usuario, con username
-- autogenerado desde el email y reintento numerico ante colision.
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
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));
  if base_username = '' then
    base_username := 'usuario';
  end if;

  candidate_username := base_username;

  while exists (select 1 from public.profiles where username = candidate_username) loop
    suffix := suffix + 1;
    candidate_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, role)
  values (new.id, candidate_username, 'customer');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
