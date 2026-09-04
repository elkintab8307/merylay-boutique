-- Franja promocional: pasa de un solo "mensaje_promocional" a 4 frases
-- que rotan en una marquesina. Siembra las 4 frases por defecto si la
-- clave todavia no existe. La fila vieja `mensaje_promocional` se deja
-- como esta (ya no la lee ni la escribe nadie; el nuevo formulario de
-- ajustes solo maneja `frases_promocionales`).

insert into public.store_settings (key, value)
values (
  'frases_promocionales',
  '["Domicilios Gratis en Armenia","Nuevas Colecciones Cada Semana","Estampados Originales y Novedosos","Alta Calidad en Cada Prenda"]'::jsonb
)
on conflict (key) do nothing;
