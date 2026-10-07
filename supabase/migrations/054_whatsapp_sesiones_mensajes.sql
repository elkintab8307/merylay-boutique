alter table public.orders
  add column channel text not null default 'web'
  check (channel in ('web', 'whatsapp', 'pos'));

create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  customer_id uuid references public.profiles(id),
  session_data jsonb not null default '{}',
  last_interaction timestamptz not null default now()
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text unique,
  message_body text,
  created_at timestamptz not null default now()
);

create index whatsapp_messages_phone_number_idx on public.whatsapp_messages(phone_number);

alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_messages enable row level security;
-- Sin politicas: solo service_role las toca (igual que recomienda el
-- documento de referencia para tablas que no tienen panel propio).
