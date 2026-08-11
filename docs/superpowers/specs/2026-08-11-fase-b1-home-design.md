# Rediseño — Fase B1: Home

## Objetivo

Rediseñar la página de inicio de la tienda pública siguiendo tendencias de
e-commerce de moda (referencia: vidamia.co) para verse más profesional,
creativa y "compartible" en redes, manteniendo la identidad de marca de
MeryLay (paleta, tipografía, logo). Es la primera de tres sub-fases de la
Fase B (B1 Home, B2 Reseñas, B3 Categoría/Detalle de producto), cada una
con su propio ciclo diseño → plan → implementación.

## Contexto

- La tienda hoy tiene contenido real mínimo: 1 producto activo, 1 imagen,
  2 categorías, 0 destacados. El diseño debe verse bien tanto con catálogo
  lleno como con poco contenido — no se asume que el dueño cargará fotos
  profesionales antes de esta fase.
- `categories.image_url` existe en el esquema desde la migración inicial
  pero ningún formulario admin lo usa — es un cable suelto que esta fase
  conecta.
- `store_settings` (jsonb por `key`) ya existe, lectura pública, escritura
  solo `superadmin` — es el lugar natural para el contenido del hero y los
  banners, sin crear una tabla nueva.
- Buckets de Storage existentes (`product-images`, `category-images`,
  `brand`) siguen el mismo patrón: público de lectura, escritura solo
  `admin`, políticas declaradas en una migración de buckets.

## Alcance

1. **Hero** gestionable desde Ajustes: imagen, título, subtítulo, texto de
   botón, link del botón. Si no está configurado, se muestra un hero de
   marca por defecto (fondo con la paleta MeryLay, logo, tagline
   "Inspiración Femenina", botón a `/categoria` o a la primera categoría
   activa) — nunca una sección vacía o rota.
2. **Barra de beneficios**: franja fija de 4 íconos con texto, sin gestión
   desde el panel (contenido fijo, en español, con íconos de
   `lucide-react`): "Envío a toda Colombia", "Pago seguro", "Cambios y
   devoluciones", "Hecha con amor en Colombia".
3. **"Compra por categoría"**: grid de botones grandes con imagen de fondo
   por categoría (usa `categories.image_url`, ya en el esquema). Si una
   categoría no tiene imagen, el botón cae a un fondo con gradiente de
   marca (`brand-rosa`/`brand-oro`) en vez de romperse.
4. **Banners de colección**: hasta 2 banners lado a lado (imagen + título +
   link a una categoría), gestionables desde Ajustes. La sección completa
   se oculta si no hay ninguno configurado.
5. **Tarjeta de producto (`ProductCard`)** mejorada:
   - Badge "-X%" superpuesto en la imagen cuando `compare_at_price` >
     `price` (cálculo: `round((1 - price/compareAtPrice) * 100)`).
   - Etiquetas de talla disponible (ej. "XS S M") debajo del nombre,
     solo si el producto tiene variantes con `talla` no nula. Sin
     variantes, no se muestra esa fila (no dejar espacio vacío).
6. **Sección "Destacados"**: si no hay productos con `is_featured = true`,
   cae automáticamente a mostrar los más recientes activos, para que la
   home nunca se vea vacía por falta de curaduría manual.
7. **Cableado de `categories.image_url`**: se agrega subida de imagen al
   formulario de categorías (`CategoriaForm`), que hoy no lo tiene.

Fuera de alcance de esta sub-fase (van en B2/B3 o quedan permanentes):
sección de reseñas/testimonios (B2, tabla y CRUD propios), rediseño de la
página de categoría y de detalle de producto (B3), carrusel/múltiples
heroes (solo 1 hero fijo por ahora), edición de la barra de beneficios
desde el panel (contenido fijo por decisión del dueño).

## Arquitectura

### Datos

`store_settings` gana dos keys nuevas, mismo patrón que las existentes
(`nombreTienda`, `contactoEmail`, etc. ya usan esta tabla vía
`STORE_SETTINGS_KEYS`):

- `home_hero`: `{ imageUrl: string | null, titulo: string, subtitulo: string, textoBoton: string, linkBoton: string }`
- `home_banners`: `{ imageUrl: string; titulo: string; link: string }[]` (0 a 2 elementos)

Ambas de lectura pública (política ya existente `store_settings_select_public`),
escritura solo `superadmin` (políticas ya existentes).

Migración nueva de Storage: bucket `banner-images` (público, escritura
`admin`), mismas 4 políticas que los buckets existentes
(`select`/`insert`/`update`/`delete`), siguiendo exactamente el patrón de
`006_storage_buckets.sql`.

### Admin

- **`AjustesForm`**: gana una sección "Hero" (imagen + 4 campos de texto)
  y una sección "Banners de colección" (hasta 2, cada uno imagen + título
  + selector de categoría para el link). Sube imágenes a `banner-images`
  siguiendo el patrón de `uploadProductImages` (path único con
  `crypto.randomUUID()`, `getPublicUrl`, guardar la URL). Persiste en
  `store_settings` vía `upsert` por `key`.
- **`CategoriaForm`**: gana un campo de subida de imagen (input file +
  preview), sube a `category-images` con el mismo patrón, guarda la URL
  en `categories.image_url` al crear/actualizar.

### Home pública

`src/app/(store)/page.tsx` reestructurado en este orden:
1. Hero (configurado o por defecto).
2. Barra de beneficios (siempre visible, contenido fijo).
3. "Compra por categoría" (grid de categorías activas).
4. Banners de colección (solo si `home_banners` tiene elementos).
5. Destacados (con fallback a recientes si no hay `is_featured`).

Las consultas a Supabase para tallas por producto (para las etiquetas de
la tarjeta) se resuelven agrupando `product_variants` por
`product_id` en una sola consulta adicional, igual que ya se hace con
imágenes principales (`imagenPorProducto` map) — mismo patrón, un mapa
`tallasPorProducto: Map<string, string[]>`.

### `ProductCard`

Gana dos elementos visuales nuevos, sin cambiar su contrato de props más
allá de lo que ya trae de la fase de Favoritos (`id`, `currentUserId`,
`initialFavorite`):
- Badge de descuento: posicionado en la esquina opuesta al corazón de
  favorito (esquina superior izquierda, ya que el favorito ocupa la
  derecha), solo si aplica.
- Fila de tallas: texto pequeño debajo del nombre, ej. `XS · S · M`,
  solo si el producto tiene variantes con talla.

## Testing

- Sin lógica de negocio pura nueva que amerite TDD estricto — es
  principalmente composición de UI y un cálculo simple (% de descuento,
  que si se extrae a una función pura sí se testea: `calcularDescuento(precio, compareAtPrice): number | null`).
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: confirmar que el hero por defecto se ve bien sin
  configuración, que la sección de banners se oculta sin configurar,
  que "Destacados" muestra productos recientes con la única categoría/
  producto real que existe hoy en la base de datos.

## UI

Paleta y tipografía sin cambios respecto a lo ya establecido
(`brand-rosa`, `brand-oro`, `brand-crema`, `brand-ciruela`, fuentes
`Playfair Display`/`Cinzel`/`Montserrat`/`Great Vibes` de la Fase A).
El lenguaje visual se inspira en la estructura de vidamia.co (hero grande,
banners de colección, categorías en botones grandes, barra de confianza,
tarjetas con badges) pero con la paleta rosa/dorado/crema de MeryLay en
vez de los colores de esa referencia.
