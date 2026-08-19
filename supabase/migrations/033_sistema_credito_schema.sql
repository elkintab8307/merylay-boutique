-- Esquema del sistema de credito para el POS: venta con pago diferido en
-- cuotas. Requiere que 032_credito_enum_value.sql ya este aplicado (usa
-- el valor 'credito' en un check constraint). Ver
-- docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md.

alter table public.pos_sales
  add column credit_customer_name text,
  add column credit_customer_phone text;

create type public.credit_installment_status as enum ('pendiente', 'parcial', 'pagada');

create table public.credit_installments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  numero int not null check (numero > 0),
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status public.credit_installment_status not null default 'pendiente',
  unique (sale_id, numero)
);

create index credit_installments_sale_id_idx on public.credit_installments(sale_id);
create index credit_installments_due_date_idx on public.credit_installments(due_date) where status <> 'pagada';

create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  staff_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint credit_payments_method_not_credito check (payment_method <> 'credito')
);

create index credit_payments_sale_id_idx on public.credit_payments(sale_id);

alter table public.credit_installments enable row level security;
alter table public.credit_payments enable row level security;

create policy "credit_installments_staff_access"
  on public.credit_installments for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());

create policy "credit_payments_staff_access"
  on public.credit_payments for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());
