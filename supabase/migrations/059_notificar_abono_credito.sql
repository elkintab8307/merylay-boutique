-- Aviso a los dueños cuando se registra un abono a un credito (ya sea el
-- abono inicial de create_pos_sale o uno posterior via
-- registrar_abono_credito -- ambos insertan en credit_payments). Reutiliza
-- notificar_pedido_trigger(), que ya reenvia {type, table, record} de forma
-- generica segun TG_TABLE_NAME -- notificar-pedido/index.ts distingue el
-- mensaje por tabla.
create trigger whatsapp_notificar_pedido_credit_payments
  after insert on public.credit_payments
  for each row
  execute function public.notificar_pedido_trigger();
