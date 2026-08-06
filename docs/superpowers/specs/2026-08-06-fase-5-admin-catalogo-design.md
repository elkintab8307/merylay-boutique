# Diseño — Fase 5: Admin (categorías y productos) — MeryLay Boutique

**Fecha**: 2026-08-06
**Estado**: Aprobado
**Alcance**: Roadmap del CLAUDE.md, sección 12 punto 5 ("Admin — catálogo: CRUD
de categorías y productos con imágenes/variantes"). No incluye gestión de
pedidos, inventario como módulo separado, ni dashboard de métricas (esos son
fases posteriores según el propio roadmap).

## Fuera de alcance

Gestión de pedidos admin (Fase 7, depende de que existan pedidos reales),
dashboard de métricas (Fase 11, "Extras"), asignación de roles (Fase 9,
superadmin).

## Decisiones de diseño (confirmadas con el usuario)

- **Variantes con Talla y Color estructurados**: `product_variants` gana
  columnas `talla` y `color` (texto libre, nullable a nivel de BD). El
  formulario de admin siempre muestra ambos campos por variante (no un
  `name` de texto libre genérico) — así lo pidió el usuario explícitamente:
  "importante que producto tenga las variantes Talla y Color por defecto".
  `name` se sigue guardando (columna ya existente, requerida) pero se
  autogenera en el servidor concatenando talla/color (ej. "M / Rosa"), nunca
  se pide directamente en el formulario.
- **Talla como texto libre**: sin un set fijo de opciones, para no limitar el
  catálogo a un solo sistema de tallas (letra, número, "Única", etc.).
- **Borrado de categorías y productos**: soft-delete (`is_active = false`),
  nunca `DELETE` real. Preserva historial y evita huérfanos en cascada
  accidentales; se puede reactivar.
- **Slug**: autogenerado desde el nombre al escribir (cliente), editable
  manualmente, con reintento por sufijo numérico en el servidor si colisiona
  al guardar (mismo patrón que el username de la Fase 2).
- **Imágenes de producto**: subida múltiple sin drag-and-drop. La primera
  imagen subida en una tanda queda `is_primary`; el orden sigue el orden de
  subida (`sort_order` incremental). Se pueden eliminar imágenes o marcar otra
  como principal desde la edición del producto.
- **Subida a Storage**: ocurre en una Server Action usando el cliente Supabase
  del propio admin autenticado (`src/lib/supabase/server.ts`, sesión vía
  cookies) — NO el cliente admin con service role. Las políticas RLS de
  `storage.objects` de la Fase 2 (`bucket_id = 'product-images' AND
  public.is_admin()`) ya autorizan esto de forma natural, sin necesidad de
  bypasear RLS.
- **Seguridad en capas**: el proxy (Fase 1) ya bloquea `/admin/**` a roles sin
  autorización, incluyendo las llamadas POST de Server Actions (coincide por
  pathname). Cada Server Action de este módulo además valida
  `requireAdmin()` como defensa adicional, no como único mecanismo.
- **Layout de admin**: `src/app/admin/layout.tsx` con navegación simple
  (Categorías, Productos), temado con la marca — base reutilizable para las
  fases 8 (POS) y 9 (superadmin).

## Arquitectura

Server Components por defecto para listados y páginas de edición (cargan
datos server-side); Client Components solo para los formularios interactivos
(`CategoriaForm`, `ProductoForm`) con react-hook-form + zod. Server Actions
para crear/actualizar/desactivar, todas con `requireAdmin()` al inicio.

## Archivos

- `supabase/migrations/009_variantes_talla_color.sql`
- `src/lib/slug.ts` — `slugify()`.
- `src/lib/admin/require-admin.ts` — `requireAdmin()`.
- `src/lib/validation/categoria.ts` — `categoriaSchema`.
- `src/lib/validation/producto.ts` — `productoSchema` (incluye `variantes[]`).
- `src/app/admin/layout.tsx`, `src/app/admin/admin-nav.tsx`.
- `src/app/admin/categorias/{page.tsx, actions.ts, categoria-form.tsx,
  nueva/page.tsx, [id]/editar/page.tsx}`.
- `src/app/admin/productos/{page.tsx, actions.ts, producto-form.tsx,
  nuevo/page.tsx, [id]/editar/page.tsx}`.

## Verificación

- `pnpm test` cubre `slugify()` y los schemas zod (categoría, producto,
  variante — incluyendo la regla "al menos talla o color").
- Verificación manual end-to-end: login como `adminsu`, crear una categoría,
  crear un producto con 2 variantes (talla/color) y 2 imágenes, confirmar
  `is_primary` en la primera imagen, editar el producto (cambiar precio,
  eliminar una imagen, marcar la otra como principal), desactivar la
  categoría y el producto, confirmar que desaparecen de una consulta pública
  simulando `anon`/`is_active=true`.
- Confirmar que un usuario `customer` no puede acceder a `/admin/**` (ya
  cubierto por el proxy, se revalida aquí porque ahora hay páginas reales
  detrás de esas rutas).
- `pnpm build`, `pnpm lint`, `pnpm test` en verde antes de cerrar la fase.
