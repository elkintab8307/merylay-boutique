# Rediseño — Fase D2: Home (hero circular, categorías destacadas, mensaje promocional)

## Objetivo

Aplicar el patrón visual de las tiendas de referencia (Aura Glam y
similares) a la home: hero con insignia circular del logo superpuesta,
categorías destacadas en íconos circulares (en vez del grid rectangular
actual), y una barra de mensaje promocional editable arriba de todo.
Es la segunda de tres sub-fases de la Fase D (D1 Chrome ya implementada,
D2 Home, D3 Buscador y catálogo).

## Contexto

- La home actual (Fase B1) tiene: Hero rectangular con texto
  superpuesto, `BenefitsBar` (4 íconos de confianza), `CategoryGrid`
  (grid rectangular de categorías con imagen de fondo), `CollectionBanners`
  (hasta 2 banners editables), sección "Destacados", `ReviewsSection`.
- El usuario confirmó: `BenefitsBar`, `CollectionBanners` y
  `ReviewsSection` se mantienen tal cual — no aparecen en las capturas
  de referencia pero aportan valor real y no se tocan en esta fase.
- Solo se rediseñan: el Hero (gana insignia circular) y las categorías
  (pasan de grid rectangular a íconos circulares, y de "todas las
  categorías activas" a un subconjunto curado que el admin marca como
  destacado).
- `products.is_featured` ya existe en el esquema — esta fase agrega el
  mismo patrón a `categories`.
- El mensaje promocional es solo texto libre editable, sin lógica de
  cupones reales (decisión ya tomada en una ronda de preguntas
  anterior, antes de escribir el plan de D1).

## Alcance

1. **`categories.is_featured`** (columna nueva, `boolean default false`),
   con su casilla "Destacar en inicio" en `CategoriaForm`, junto a la
   casilla "Activa" ya existente.
2. **`FeaturedCategories`** (componente nuevo): reemplaza `CategoryGrid`
   en la home. Muestra "Ver todo" (ícono genérico, enlaza a `/productos`)
   + las categorías activas marcadas como destacadas (ordenadas por
   `sort_order`), cada una en un círculo — imagen de categoría si tiene,
   si no la inicial del nombre sobre un fondo de degradado de marca —
   con el nombre debajo. Si no hay ninguna categoría destacada, la
   sección se oculta (mismo criterio "poco contenido" de siempre),
   salvo por "Ver todo" que siempre aparece.
3. **`HeroSection`**: gana una insignia circular con el logo
   (`/brand/logo-principal.png`, el mismo archivo ya usado en el
   header), superpuesta y centrada sobre el borde inferior de la
   imagen/degradado del hero — funciona igual con o sin imagen de hero
   configurada.
4. **Barra de mensaje promocional**: franja de texto arriba de todo en
   la home (antes del header, o inmediatamente después — ver
   Arquitectura), editable desde Ajustes. Vacía por defecto → oculta.

Fuera de alcance: cualquier cambio a `BenefitsBar`, `CollectionBanners`,
`ReviewsSection`, la sección "Destacados" de productos, o el
`CategoryGrid` en sí (el componente se mantiene en el código por si
se usa en otro lado, no se elimina, solo deja de usarse en la home).
Cupones de descuento reales con validación — fuera de alcance
permanente, ya decidido.

## Arquitectura

### Datos

Migración nueva `supabase/migrations/026_categorias_destacadas.sql`:

```sql
alter table public.categories add column is_featured boolean not null default false;
```

`store_settings` gana una key nueva, `mensaje_promocional` (texto
simple), mismo patrón que el resto de campos de esa tabla.

### `CategoriaForm` y acciones

`categoriaSchema`/`CategoriaInput` gana `isFeatured: z.boolean()`.
`CategoriaForm` gana la casilla "Destacar en inicio" junto a "Activa".
`createCategoria`/`updateCategoria` persisten `is_featured`.

### `FeaturedCategories`

`src/components/store/featured-categories.tsx` (nuevo, presentacional):
recibe la lista ya resuelta de categorías destacadas (con imagen/slug/
nombre) — mismo patrón que `CategoryGrid`, la página resuelve los
datos, el componente solo presenta. Círculos con `shadow-brand-sm`,
mismo lenguaje visual del resto de la Fase B/D.

### `HeroSection`

Se agrega la insignia circular (imagen del logo dentro de un círculo
con borde/sombra de marca) como elemento posicionado absolutamente,
centrado horizontalmente, con su centro alineado al borde inferior de
la sección del hero (mitad dentro, mitad fuera) — mismo efecto visual
de las capturas de referencia.

### Barra de mensaje promocional

`src/components/layout/promo-bar.tsx` (nuevo): franja simple con el
texto de `store_settings.mensaje_promocional`, se agrega a
`PublicLayoutShell` antes de `SiteHeader`. Oculta si el mensaje está
vacío.

### Admin

`AjustesForm` gana el campo "Mensaje promocional" (texto libre, sección
"Datos generales").

## Testing

- Sin lógica de negocio pura nueva — es composición de UI y un flag
  booleano nuevo, mismo criterio sin tests dedicados ya usado para
  cambios similares en fases anteriores.
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: marcar una categoría como destacada y confirmar que
  aparece en el círculo de la home, confirmar que la insignia del logo
  se ve bien centrada con y sin imagen de hero, escribir un mensaje
  promocional desde Ajustes y confirmar que aparece en la barra.

## UI

Mismos tokens de marca ya establecidos. La insignia circular del logo
y los círculos de categoría reutilizan `shadow-brand-sm`/`shadow-brand-md`
ya definidos desde la Fase A — sin colores ni tipografía nuevos.
