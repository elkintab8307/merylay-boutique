-- Aviso de venta nueva a los dos numeros del dueño (Elkin y Mary), en
-- cualquier canal (web, WhatsApp o POS). El plan original asumia que el
-- esquema `supabase_functions` (y su funcion `http_request`) ya existia
-- en el proyecto -- eso solo pasa si ya se uso la funcion "Database
-- Webhooks" del dashboard antes, y aqui no era el caso. Se logra lo
-- mismo directo con la extension pg_net (net.http_post), construyendo a
-- mano el mismo payload {type, table, record} que notificar-pedido ya
-- espera.
create extension if not exists pg_net;

create or replace function public.notificar_pedido_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://umnyolwszwvavwcxzyfy.supabase.co/functions/v1/notificar-pedido',
    body := jsonb_build_object('type', 'INSERT', 'table', TG_TABLE_NAME, 'record', to_jsonb(NEW)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notificar-pedido-secret', 'cf7eb7e9a0a7147903e75c0fab3ebc9a')
  );
  return NEW;
end;
$$;

create trigger whatsapp_notificar_pedido_orders
  after insert on public.orders
  for each row
  execute function public.notificar_pedido_trigger();

create trigger whatsapp_notificar_pedido_pos_sales
  after insert on public.pos_sales
  for each row
  execute function public.notificar_pedido_trigger();
