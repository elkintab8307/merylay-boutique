-- Invierte la semantica del precio de comparacion: en vez de guardar un
-- precio de referencia MAS ALTO (compare_at_price), el campo pasa a
-- guardar el precio de promocion MAS BAJO que se le cobra al cliente
-- cuando esta activo. 0 (o null) significa "sin promocion" -- para
-- desactivar una promocion, el admin solo pone el campo en 0 de nuevo.
alter table public.products
  rename column compare_at_price to promo_price;

-- Limpieza de datos de prueba existentes bajo la semantica vieja:
-- 0.01 es ruido (nadie fija un precio de comparacion de un centavo por
-- encima del precio real), se resetea a 0. El otro valor (36000 con
-- price=40000) ya es una promocion valida bajo la semantica nueva
-- (promo_price < price), se deja tal cual.
update public.products set promo_price = 0 where promo_price = 0.01;
