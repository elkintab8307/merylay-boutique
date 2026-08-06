# Diseño — Fase 6: Tienda pública — MeryLay Boutique

**Fecha**: 2026-08-06
**Estado**: Aprobado
**Alcance**: Roadmap del CLAUDE.md, sección 12 punto 6 ("Tienda pública: home,
categorías, detalle de producto"), implementando la sección 7.1 para estas
tres pantallas específicamente.

## Fuera de alcance

Carrito persistente y checkout (Fase 7 — el botón "Agregar al carrito" existe
visualmente pero no tiene lógica real todavía). Página "Mi cuenta" con
historial de pedidos (depende de `orders`, Fase 7). Página de catálogo
general "todos los productos" (no está en el alcance textual de esta fase;
la navegación es por categoría).

## Decisiones de diseño (confirmadas con el usuario)

- **Botón "Agregar al carrito"**: presente en el detalle de producto (respeta
  el requisito de diseño), pero deshabilitado si no hay stock y, al hacer
  click, solo muestra un mensaje "Disponible pronto" — sin persistir nada.
  Evita construir un carrito a medias que se reescribiría en la Fase 7.
- **Home**: hero (ya existente desde la Fase 1) + sección de destacados
  (`is_featured = true`, activos, máx. 8) + grilla de categorías activas.
- **Navegación**: el header (Fase 3) gana un menú con las categorías activas.
- **Filtros de categoría**: los checkboxes de talla/color se calculan
  dinámicamente desde las variantes que realmente existen entre los
  productos activos de esa categoría — nunca una lista fija, para no mostrar
  filtros que no llevan a ningún resultado.
- **Orden de categoría**: "Destacados" (default), "Precio: menor a mayor",
  "Precio: mayor a menor", "Más reciente".
- **Selector de variante**: dos `<select>` (Talla, Color) que en conjunto
  determinan la variante exacta y su stock específico; si el producto no
  tiene variantes, se usa `products.stock` directamente.
- **Filtros sin JavaScript**: la página de categoría usa un
  `<form method="get">` nativo para precio/talla/color/orden — navegación por
  query params, coherente con "Server Components por defecto".
- **Test obsoleto**: se elimina
  `src/app/(store)/__tests__/page.test.tsx` (documentado en el commit) porque
  la home pasa a ser un Server Component async con datos reales de Supabase,
  no renderizable con Testing Library sin un servidor corriendo — mismo tipo
  de limitación ya aceptada para las páginas de admin en la Fase 5.

## Arquitectura

Server Components por defecto para todas las páginas (home, categoría,
producto) — cargan datos directamente con el cliente de servidor. Client
Components solo para: galería de imágenes (cambiar imagen principal) y
selector de variante (estado de talla/color elegidos + mensaje del botón).
Lógica de negocio pura (formateo de precio, opciones de variantes, resolución
de orden) extraída a `src/lib/` para poder cubrirla con TDD.

## Archivos

- `src/lib/format.ts` — `formatPrice()`.
- `src/lib/store/variants.ts` — `getVariantOptions()`, `findMatchingVariant()`.
- `src/lib/store/sort.ts` — `resolveSort()`.
- `src/components/store/product-card.tsx` — `<ProductCard />` compartido.
- Modifica `src/components/layout/site-header.tsx` — nav de categorías.
- Modifica `src/app/(store)/page.tsx` — home dinámico. Elimina
  `src/app/(store)/__tests__/page.test.tsx`.
- `src/app/(store)/categoria/[slug]/page.tsx` — listado con filtros y orden.
- `src/app/(store)/producto/[slug]/{page.tsx, product-gallery.tsx,
  product-variant-selector.tsx}`.

## Verificación

- `pnpm test` cubre `formatPrice()`, `getVariantOptions()`/
  `findMatchingVariant()` y `resolveSort()`.
- Verificación manual/script contra el proyecto real: crear una categoría con
  2 productos (uno destacado, uno con variantes talla/color e imágenes),
  confirmar que aparece en el home (destacados), en la categoría (con
  filtros funcionando), y que el detalle de producto muestra galería, stock
  por variante y el botón deshabilitado cuando el stock de la variante
  seleccionada es 0.
- `pnpm build`, `pnpm lint`, `pnpm test` en verde antes de cerrar la fase.
