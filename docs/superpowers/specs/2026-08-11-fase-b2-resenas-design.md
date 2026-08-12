# Rediseño — Fase B2: Reseñas

## Objetivo

Agregar un módulo de reseñas/testimonios de clientas, gestionable desde
el panel admin, con una sección en la home pública que se oculta sola
si no hay ninguna reseña activa. Es la segunda de tres sub-fases de la
Fase B (B1 Home ya implementada, B2 Reseñas, B3 Categoría/Detalle de
producto).

## Alcance

1. Tabla `reviews` con nombre, texto, calificación (1-5 estrellas),
   imagen opcional, estado activo/inactivo y orden.
2. CRUD en `/admin/resenas` (sin eñe en la ruta, igual que
   `categorias`/`productos`/`gastos`/`compras`/`informes` evitan
   tildes; la UI sí muestra "Reseñas" con eñe), calcado del patrón ya
   existente de Categorías (tabla + formulario + subida de imagen +
   activar/desactivar), gestionable por `admin`/`superadmin` — mismo
   nivel de permiso que Categorías y Productos, no exclusivo de
   superadmin.
3. Bucket de Storage `review-images` (público de lectura, escritura
   solo admin), mismo patrón que los buckets ya existentes.
4. Sección `ReviewsSection` en la home pública, después de
   "Destacados": muestra hasta 6 reseñas activas ordenadas por
   `sort_order`. Si no hay ninguna reseña activa, la sección no se
   renderiza — mismo criterio de "poco contenido" ya aplicado en la
   Fase B1 a banners y destacados.
5. Link "Reseñas" nuevo en la navegación del admin (`admin-nav.tsx`).

Fuera de alcance: reseñas enviadas por clientes reales (siguen siendo
cargadas a mano por el admin, no hay formulario público de envío);
moderación/aprobación en dos pasos (una reseña activa se publica de
inmediato); respuestas o comentarios a una reseña.

## Arquitectura

### Datos

Migración nueva `supabase/migrations/024_resenas.sql`:

```sql
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  body text not null,
  rating int not null check (rating between 1 and 5),
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index reviews_sort_order_idx on public.reviews(sort_order);

alter table public.reviews enable row level security;

create policy "reviews_select_active_or_admin"
  on public.reviews for select
  using (is_active or public.is_admin());
create policy "reviews_write_admin"
  on public.reviews for all
  using (public.is_admin()) with check (public.is_admin());
```

Mismo patrón de RLS que `categories`/`products` (lectura pública solo
si `is_active`, o si el usuario es admin; escritura solo admin).

Bucket `review-images`, mismo patrón que `category-images`: público de
lectura, escritura solo `is_admin()` (a diferencia de `banner-images`
de la Fase B1, que usa `is_superadmin()` porque `store_settings` es
exclusivo de superadmin — las reseñas viven en su propia tabla con
permiso de `admin`, igual que categorías/productos).

### Admin

`/admin/resenas` — mismo patrón de 4 archivos que Categorías
(`page.tsx` con tabla + botón "Nueva", `resena-form.tsx` con subida de
imagen igual a `CategoriaForm`, `actions.ts` con
`createResena`/`updateResena`/`toggleResenaActiva`, páginas
`nueva/page.tsx` y `[id]/editar/page.tsx`). La calificación se captura
como un `<select>` de 1 a 5 (sin componente de estrellas interactivo
por ahora — simple y consistente con el resto de formularios admin del
proyecto, que usan controles HTML nativos).

`admin-nav.tsx` gana el link "Reseñas" en `ENLACES_BASE`, entre
"Productos" y "Gastos" (mismo nivel jerárquico que el resto del
catálogo).

### Home pública

`src/components/store/reviews-section.tsx` (server component):
recibe la lista de reseñas ya cargada (consistente con el patrón de
`CategoryGrid`/`CollectionBanners`, que reciben datos ya resueltos, no
hacen su propia consulta) y no renderiza nada si la lista está vacía.
Cada tarjeta muestra: imagen (si existe, si no un ícono/inicial de
avatar), nombre, estrellas (`Star` de `lucide-react`, rellenas según
`rating`), texto de la reseña.

`src/app/(store)/page.tsx` gana una consulta más (reseñas activas,
`order by sort_order limit 6`) y renderiza `<ReviewsSection>` después
de la sección "Destacados".

## Testing

- Sin lógica de negocio pura nueva que amerite TDD estricto — es CRUD
  estándar + una sección de presentación, mismo patrón ya usado sin
  tests dedicados para Categorías/Banners en fases anteriores.
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: crear una reseña desde el panel, confirmar que
  aparece en la home; desactivarla y confirmar que desaparece; sin
  ninguna reseña activa, confirmar que la sección no se renderiza.

## UI

Mismos tokens de marca ya establecidos (`brand-rosa`, `brand-oro`,
`brand-crema`, `brand-ciruela`, `shadow-brand-sm/md`). Tarjetas de
reseña con el mismo lenguaje visual que `ProductCard`/`CategoryGrid`
de la Fase B1 (bordes suaves, sombra de marca), estrellas en
`brand-oro` (dorado, coherente con el rol de "detalle premium" de ese
color según la guía de marca).
