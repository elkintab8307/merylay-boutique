create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories(id),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index expenses_expense_date_idx on public.expenses(expense_date);
create index expenses_category_id_idx on public.expenses(category_id);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy "expense_categories_all_admin"
  on public.expense_categories for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "expenses_all_admin"
  on public.expenses for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.expense_categories (name) values
  ('Renta'),
  ('Servicios'),
  ('Nómina'),
  ('Insumos/Empaques'),
  ('Marketing'),
  ('Transporte/Domicilios'),
  ('Mantenimiento'),
  ('Otros');
