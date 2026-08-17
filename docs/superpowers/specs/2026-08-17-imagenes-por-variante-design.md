# Imágenes por variante de producto

## Objetivo

Permitir que un producto con variantes (talla/color) tenga imágenes
específicas por variante, además de sus imágenes generales, y que la
página pública de detalle de producto sincronice la galería con la
variante seleccionada en ambos sentidos: elegir una variante muestra
sus fotos, y hacer clic en una foto de una variante selecciona esa
variante.

## Contexto

- `product_images` hoy es solo a nivel de producto (`product_id`, sin
  noción de variante). `ProductGallery` (tienda pública) y
  `ProductVariantSelector` son hermanos independientes en
  `src/app/(store)/producto/[slug]/page.tsx` — no comparten estado, por
  lo que hoy no hay ninguna sincronización entre imagen seleccionada y
  variante seleccionada.
- `producto-form.tsx` (`/admin/productos/nuevo` y
  `/admin/productos/[id]/editar`) ya subió su límite de tamaño de
  subida en la fase anterior (`bodySizeLimit: "20mb"`,
  `MAX_IMAGENES_MB = 15` en el cliente) — ese límite aplica también
  aquí, sobre el total combinado de todos los grupos de imágenes de un
  mismo envío.
- **Hallazgo bloqueante**: `updateProducto`
  (`src/app/admin/productos/actions.ts:171-198`) borra y reinserta
  TODAS las variantes en cada guardado, incluso si el admin solo
  cambió el precio. Eso le da un `id` nuevo a cada variante en cada
  edición. Si las imágenes se asocian a `variant_id`, ese patrón las
  dejaría huérfanas (o las borraría, con `on delete cascade`) en
  cualquier edición no relacionada con variantes. El propio código ya
  señala esta estrategia como provisional en un comentario. Esta fase
  la reemplaza por un diff real por `id`.

## Alcance

1. **Migración**: `product_images.variant_id uuid null references
   product_variants(id) on delete cascade`. `null` = imagen general
   (se muestra siempre). No nulo = imagen de esa variante específica.
2. **Diff de variantes por `id`** en `updateProducto`, reemplazando el
   borrado-e-reinserción total: actualiza las que siguen (por `id`),
   inserta las nuevas (sin `id`), borra solo las que ya no vienen en el
   envío. `createProducto` no cambia en este punto (siempre inserta,
   no hay variantes previas).
3. **Formulario admin** (`producto-form.tsx`, create y edit): cada fila
   de variante gana su propio input de archivos ("Imágenes de esta
   variante"); el input existente pasa a etiquetarse "Imágenes
   generales". En modo edición, además lista las imágenes ya guardadas
   agrupadas por variante (mismos controles Eliminar/Marcar principal
   de hoy).
4. **`uploadProductImages`** gana un tercer parámetro opcional
   `variantId: string | null` (default `null`).
5. **Galería pública ↔ selector de variante**: nuevo componente
   cliente que levanta el estado talla/color (hoy vive dentro de
   `ProductVariantSelector`) y lo comparte con `ProductGallery`.
6. Primaria (`is_primary`) sigue siendo una sola por producto, sin
   importar si la imagen es general o de variante — sin cambios a esa
   lógica ni a `product-card.tsx` / `FavoriteButton`.

**Fuera de alcance**: `product-card.tsx` y cualquier listado (siguen
usando solo la imagen principal, sin variante); imagen "principal" por
variante; reordenar imágenes por drag-and-drop (no existe hoy, no se
agrega); cambios al carrito o al checkout.

## Arquitectura

### Migración `product_images.variant_id`

```sql
alter table public.product_images
  add column variant_id uuid references public.product_variants(id) on delete cascade;

create index idx_product_images_variant_id on public.product_images(variant_id);
```

RLS de `product_images` no cambia (ya filtra por `product_id`
perteneciente a un producto activo para lectura pública, y por
`is_admin()`/`is_superadmin()` para escritura) — la nueva columna no
necesita política propia.

### Diff de variantes (`updateProducto`)

`varianteSchema` (`src/lib/validation/producto.ts`) gana:

```ts
id: z.string().uuid().optional(),
```

`src/app/admin/productos/[id]/editar/page.tsx` (el loader que construye
`defaultValues` para el form) incluye el `id` real de cada variante
existente al mapearlas.

`updateProducto` reemplaza el bloque de borrado total (líneas 165-203
actuales) por:

1. `select id from product_variants where product_id = :id` → ids
   existentes.
2. Particiona `parsed.data.variantes` en `conId` (tienen `id`, están en
   los existentes) y `sinId` (nuevas).
3. `upsert` en un solo llamado (`onConflict: "id"`) con los campos
   completos de cada variante en `conId`, incluyendo su `id`.
4. `insert` para `sinId`, `.select("id")` para obtener sus ids nuevos
   en el mismo orden del array enviado.
5. `delete ... where product_id = :id and id not in (<ids
   conservados>)` para las que el admin quitó — mismo comportamiento de
   error que hoy si una ya tiene compras (FK sin cascade en
   `order_items`/`cart_items`).
6. Construye `variantIdPorIndice: (string | null)[]` alineado con el
   array `parsed.data.variantes` original (usando el `id` ya existente
   o el recién insertado), para el paso de subida de imágenes.

`createProducto` no necesita diff (todo es inserción), pero sí necesita
el mismo `variantIdPorIndice` — lo obtiene directo del `.select("id")`
del insert existente, en el mismo orden.

### Envío de imágenes por variante desde el formulario

El cliente ya no manda un solo `File[]`. Nueva forma:

```ts
type ImagenesPorGrupo = {
  general: File[];
  porVariante: File[][]; // mismo índice que el array `variantes` enviado
};
```

`producto-form.tsx` mantiene un estado
`variantImageFiles: File[][]` (una entrada por fila de variante,
inicializada vacía, `splice`d junto con `remove(index)`/`append(...)`
del `useFieldArray` para no desalinearse) además del `imageFiles`
general ya existente. `MAX_IMAGENES_MB` se valida sobre la suma de
`imageFiles` + todos los `variantImageFiles[i]` combinados.

`createProducto`/`updateProducto` reciben `imageFiles: File[]` (general,
sin cambios de nombre) y un nuevo parámetro `variantImageFiles:
File[][]` alineado por índice con `input.variantes`. Tras resolver
`variantIdPorIndice`, para cada índice con archivos:
`uploadProductImages(productId, variantImageFiles[i], variantIdPorIndice[i])`.
Para el grupo general: `uploadProductImages(productId, imageFiles,
null)`.

### `uploadProductImages`

```ts
export async function uploadProductImages(
  productId: string,
  files: File[],
  variantId: string | null = null,
): Promise<{ error?: string }>
```

Único cambio: el `insert` en `product_images` agrega `variant_id:
variantId`. El cálculo de `sortOrder`/`is_primary` sigue contando TODAS
las imágenes del producto (`eq("product_id", productId)`, sin filtrar
por variante) — consistente con "primaria es una sola por producto".

### Formulario admin — UI

Dentro de cada fila de variante (`fields.map(...)` en
`producto-form.tsx`), debajo de los inputs de talla/color/stock:

- Input de archivos propio: `<input type="file" accept="image/*"
  multiple onChange={(e) => handleVariantImageChange(index, e)} />`.
- En modo edición (`productoId` presente), lista las imágenes ya
  guardadas de esa variante (`existingImages.filter(img => img.variant_id
  === variant.id)`) con los mismos controles Eliminar/Marcar principal
  que ya existen para las generales.

La sección "Imágenes" a nivel de producto (fuera del bloque de
variantes) pasa a titularse "Imágenes generales" y muestra
`existingImages.filter(img => img.variant_id === null)`.

`ProductImage` (tipo ya usado por el form) gana `variant_id: string |
null`. El loader de la página de edición
(`src/app/admin/productos/[id]/editar/page.tsx`) selecciona esa
columna al leer `product_images`.

### Galería pública ↔ selector de variante

Nuevo componente cliente
`src/app/(store)/producto/[slug]/product-detail-interactive.tsx`,
reemplaza en `page.tsx` el bloque actual que renderiza
`ProductGallery` + el div con nombre/precio/`ProductVariantSelector`
como hermanos. Recibe todo lo que hoy reciben esos dos componentes
(imágenes ya con `variantId`, `variants`, `basePrice`, etc.) y:

- Levanta `talla`/`color` (con los mismos valores iniciales
  `variants[0]?.talla`/`variants[0]?.color` que hoy fija
  `ProductVariantSelector`).
- Calcula `variantSeleccionada = findMatchingVariant(variants, talla,
  color)`.
- Calcula la lista de imágenes a mostrar: imágenes con
  `variantId === variantSeleccionada?.id` primero, luego las generales
  (`variantId === null`) — mismo orden para todas las variantes,
  siempre incluye las generales aunque la variante tenga fotos
  propias.
- Pasa a `ProductGallery`: la lista calculada, y un callback
  `onSelectImage` que recibe el `variantId` de la imagen clickeada (o
  `null` si es general); si no es `null`, actualiza `talla`/`color` a
  los de esa variante.
- Pasa a `ProductVariantSelector`: `talla`/`color`/`setTalla`/`setColor`
  como props controladas en vez de estado interno (hoy los declara con
  `useState` — se elevan al padre).
- Al cambiar de variante (por el selector o por clic en imagen), el
  índice de imagen seleccionada en la galería se reinicia a 0.

`ProductGallery` gana:
- `images: { url: string; alt: string | null; variantId: string | null
  }[]` (antes sin `variantId`).
- `onSelectVariant?: (variantId: string | null) => void`, invocado
  además de `setSelected(index)` en el `onClick` de cada miniatura.

`ProductVariantSelector` pierde su `useState` de talla/color; recibe
`talla`, `color`, `onTallaChange`, `onColorChange` como props. El resto
de su lógica (stock, precio, agregar al carrito) no cambia.

`page.tsx` pasa a `product-detail-interactive.tsx` las imágenes ya
mapeadas con `variantId: img.variant_id` desde la query de
`product_images` (que ya selecciona `variant_id` gracias al select
`*`/columnas agregadas ahí).

### `lib/store/variants.ts`

Sin cambios — `findMatchingVariant`/`getVariantOptions` siguen
sirviendo tal cual.

## Testing

- Tests unitarios nuevos para la lógica de selección de imágenes por
  variante (función pura extraída, ej. `getImagesForVariant(images,
  variantId)`, en vez de probarla solo a través del componente React).
- Tests unitarios para el diff de variantes si la lógica de
  partición/mapeo de índices se extrae a una función pura testeable
  (ej. `src/lib/admin/variant-diff.ts`); si queda inline en la server
  action, se valida solo con verificación manual (mismo criterio usado
  para otras server actions de este proyecto).
- Verificación manual en navegador:
  1. Crear un producto con 2 variantes, subiendo imágenes generales y
     de cada variante — confirmar que las 3 (o más) imágenes se ven
     agrupadas correctamente al editar.
  2. Editar ese producto cambiando solo el precio (sin tocar
     variantes) — confirmar que los `id` de variante y sus imágenes
     siguen intactos (no se borran ni se re-crean).
  3. Quitar una variante en edición — confirmar que sus imágenes de
     variante desaparecen (cascade) y las generales permanecen.
  4. En la tienda pública: seleccionar cada variante y confirmar que
     la galería muestra sus fotos + las generales; hacer clic en una
     foto de otra variante y confirmar que el selector de talla/color
     cambia a esa variante.
- `pnpm build && pnpm lint && pnpm test` en verde.

## UI

Mismos tokens de marca. Los inputs de archivo por variante usan el
mismo estilo (`<input type="file">` sin componente custom) que el
input general ya existente — sin nuevo diseño visual, solo
reorganización de las secciones existentes.
