-- Solo agrega el valor del enum, en su propia migracion/transaccion: un
-- check constraint que lo use (033_sistema_credito_schema.sql) no puede
-- ir en la misma transaccion que lo agrega. Ver
-- docs/superpowers/specs/2026-08-19-sistema-credito-pos-design.md.
alter type public.payment_method add value 'credito';
