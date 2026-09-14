-- Marca temporal de "Nueva Coleccion" por variante. No hay trigger de
-- apagado: una variante esta "activa" mientras
-- ahora() - nueva_coleccion_desde < 5 dias (calculado al leer, ver
-- src/lib/admin/nueva-coleccion.ts). Sin pg_cron ni jobs programados.
alter table public.product_variants
  add column nueva_coleccion_desde timestamptz null;
