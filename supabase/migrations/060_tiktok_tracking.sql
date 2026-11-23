-- Seguimiento de TikTok Ads (Pixel + Events API).
-- tiktok_tracked_at: el evento Purchase ya se envio desde el navegador (retorno de Wompi).
-- tiktok_reported_at: el evento Purchase ya se envio desde el servidor (webhook). Idempotencia.

alter table public.orders
  add column if not exists tiktok_tracked_at timestamptz,
  add column if not exists tiktok_reported_at timestamptz;

-- Datos de atribucion capturados al iniciar el pago. Contienen IP y user agent,
-- asi que quedan fuera del alcance de las clientas: RLS activo y sin politicas,
-- solo el service role (servidor) puede leer o escribir.
create table if not exists public.order_attribution (
  order_id uuid primary key references public.orders(id) on delete cascade,
  ttclid text,
  ttp text,
  client_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.order_attribution enable row level security;
