-- Permite asociar una imagen de producto a una variante especifica
-- (talla/color). NULL significa "imagen general": se muestra siempre,
-- independientemente de la variante seleccionada en la tienda publica.
alter table public.product_images
  add column variant_id uuid references public.product_variants(id) on delete cascade;

create index idx_product_images_variant_id on public.product_images(variant_id);
