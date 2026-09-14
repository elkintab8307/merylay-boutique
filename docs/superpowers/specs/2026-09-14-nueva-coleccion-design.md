# Nueva Colección — toggle por variante + overlay animado en el home

## Objetivo

El admin necesita poder marcar una variante concreta (talla/color) como
**"Nueva Colección"** desde el formulario de producto. Esa marca dura
**5 días** y se apaga sola — sin que nadie tenga que volver a desmarcarla
ni depender de un job programado. Mientras esté activa, esa variante
aparece en un **overlay animado y llamativo** que se muestra en el home
(estilo TEMU: entrada de pantalla completa, con movimiento), a partir del
cual el cliente puede tocar una foto y llegar directo a la página del
producto.

## Decisiones tomadas (brainstorming)

- El overlay es una **ventana emergente de pantalla completa** (no una
  sección inline): se sobrepone al home mediante un portal
  (`position: fixed`), sin empujar ni afectar el resto de las secciones.
  Se cierra con X, `Esc`, o tocando el fondo — igual que
  `LightboxImagenes` ya construido.
- Se muestra **una vez por sesión de navegador** (marca en
  `sessionStorage`), y solo si hay al menos 1 variante activa con foto.
  No aparece de nuevo al volver al home en la misma visita; sí en una
  visita nueva (nueva pestaña/sesión).
- El auto-apagado a los 5 días es **calculado al leer**, no un job:
  `product_variants.nueva_coleccion_desde` guarda cuándo se activó; una
  variante está "activa" mientras `ahora - nueva_coleccion_desde < 5
  días`. Sin pg_cron, sin trigger de apagado — el proyecto no tiene
  `pg_cron` instalado (verificado) y este enfoque no lo necesita.
- Cuando expira, el checkbox del admin vuelve a verse desmarcado con el
  texto **"Estuvo activo, expiró hace N días"** debajo (elegido en vez
  de un desmarcado silencioso).

## Contexto

- **`product_variants`** (`002_catalogo.sql`): `id, product_id, name,
  sku, price_override, stock`. `stock` ya es calculado (trigger,
  migración 048) desde el conteo de fotos no vendidas de esa variante —
  no se toca en este diseño.
- **`product_images`**: tiene `variant_id`, `is_primary`, `sort_order`,
  `vendida`. Una variante "tiene stock/está disponible" si tiene al
  menos una foto propia con `vendida = false` — mismo criterio que ya
  usa `imagenesDeVariante.filter((img) => !img.vendida)` en
  `producto-form.tsx`.
- **`producto-form.tsx`**: cada variante se renderiza en un bloque con
  Talla / Color / Disponibles / Quitar (línea ~528-575), seguido del
  bloque de imágenes de esa variante. El checkbox nuevo va en ese primer
  bloque. El formulario usa `react-hook-form` con `varianteSchema`
  (`src/lib/validation/producto.ts`) y `useFieldArray`.
- **`admin/productos/actions.ts`**: `createProducto` inserta variantes
  nuevas; `updateProducto` usa `diffVariantes`
  (`src/lib/admin/variant-diff.ts`) para separar "actualizar" (ya
  existe, tiene `id`) de "crear" (variante nueva agregada en esta
  edición), y hace `upsert`/`insert` respectivamente.
  `variantesExistentes` hoy solo trae `id` (línea ~178) — se amplía a
  traer también `nueva_coleccion_desde` para poder decidir el nuevo
  valor sin confiar en lo que mande el cliente.
- **`[id]/editar/page.tsx`**: arma `defaultValues.variantes` mapeando
  cada fila de `product_variants` (línea ~68); ahí se calcula el
  checkbox inicial (`esNuevaColeccionActiva`) y, en un mapa aparte por
  `variantId`, los días de expiración para el texto informativo (no es
  parte de `ProductoInput`, es solo para mostrar).
- **`src/lib/store/use-carrusel-tactil.ts`** (ya existe, probado): hook
  de scroll-snap + índice + auto-avance gateado por viewport/pestaña
  visible/`prefers-reduced-motion`. El carrusel del overlay lo reutiliza
  tal cual — no hace falta nada nuevo para el movimiento táctil.
- **`LightboxImagenes`** (`src/components/store/lightbox-imagenes.tsx`,
  ya existe): patrón de referencia para el overlay — `createPortal` a
  `document.body`, `role="dialog"`, cierre por X/Esc/backdrop
  (`e.target === e.currentTarget`), bloqueo de `document.body.style.overflow`
  restaurando el valor previo al desmontar, foco al abrir. El overlay
  nuevo sigue el mismo patrón (componente separado, no una
  generalización de `LightboxImagenes` — su contenido y estilo son muy
  distintos).
- **`src/app/(store)/page.tsx`**: ya hace varias consultas en paralelo
  (`Promise.all`) y ya construye `ProductCardData` con
  `ordenarImagenesTarjeta`. El overlay se monta ahí, con su propio fetch
  de datos (no reutiliza `fetchCatalogProducts`: la forma de los datos y
  el criterio de selección — por variante activa, no por producto — son
  distintos).
- No existe hoy ningún job/cron en el proyecto (`pg_cron` no está
  instalado, verificado con `pg_extension`). Este diseño no lo requiere.

## Alcance

1. **Migración `052_nueva_coleccion.sql`**: columna
   `product_variants.nueva_coleccion_desde timestamptz null`. Sin
   trigger, sin default distinto de `null`.
2. **`src/lib/admin/nueva-coleccion.ts`** (nuevo, puro, con tests):
   `DURACION_NUEVA_COLECCION_DIAS`, `esNuevaColeccionActiva`,
   `diasDesdeExpiracion`, `resolverNuevaColeccionDesde`.
3. **Formulario de producto**: checkbox "Nueva Colección" por variante +
   texto de expiración; `productoSchema`/`varianteSchema` ganan el campo
   `nuevaColeccion: boolean`.
4. **`actions.ts`**: `createProducto`/`updateProducto` calculan el
   `nueva_coleccion_desde` a guardar con `resolverNuevaColeccionDesde`,
   comparando contra el estado real en la base (no contra lo que venga
   del formulario).
5. **`src/lib/store/fetch-nueva-coleccion.ts`** (nuevo, con tests): trae
   las variantes activas (producto activo, con foto propia no vendida),
   tope 12.
6. **`NuevaColeccionOverlay`** (nuevo, con tests): overlay de pantalla
   completa, entrada animada, carrusel con `useCarruselTactil`, clic en
   una foto navega a `/producto/<slug>`, una vez por sesión.
7. **`src/app/(store)/page.tsx`**: monta el overlay con los datos de (5).

**Fuera de alcance**: filtro de "Nueva Colección" en catálogo/buscador;
insignia "Nuevo" en la tarjeta normal de producto; hacer configurables
los 5 días o el tope de 12 desde Ajustes; zoom o sonido en el overlay;
reservar/afectar el stock (el checkbox no toca `stock` ni `vendida`, es
puramente informativo/de marketing).

## Arquitectura

### Migración `052_nueva_coleccion.sql`

```sql
-- Marca temporal de "Nueva Coleccion" por variante. No hay trigger de
-- apagado: una variante esta "activa" mientras
-- ahora() - nueva_coleccion_desde < 5 dias (calculado al leer, ver
-- src/lib/admin/nueva-coleccion.ts). Sin pg_cron ni jobs programados.
alter table public.product_variants
  add column nueva_coleccion_desde timestamptz null;
```

Sin cambios de RLS: la columna vive en `product_variants`, ya cubierta
por las políticas existentes (lectura pública si el producto está
activo — a nivel de aplicación, igual que hoy —, escritura solo
`admin`/`superadmin`).

### `src/lib/admin/nueva-coleccion.ts`

```ts
export const DURACION_NUEVA_COLECCION_DIAS = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function esNuevaColeccionActiva(
  desde: string | null,
  ahora: Date = new Date(),
): boolean {
  if (!desde) return false;
  const transcurridoMs = ahora.getTime() - new Date(desde).getTime();
  return transcurridoMs < DURACION_NUEVA_COLECCION_DIAS * MS_POR_DIA;
}

/** Dias completos desde que expiro, o null si sigue activa o nunca se activo. */
export function diasDesdeExpiracion(
  desde: string | null,
  ahora: Date = new Date(),
): number | null {
  if (!desde || esNuevaColeccionActiva(desde, ahora)) return null;
  const expiroEnMs = new Date(desde).getTime() + DURACION_NUEVA_COLECCION_DIAS * MS_POR_DIA;
  return Math.floor((ahora.getTime() - expiroEnMs) / MS_POR_DIA);
}

/**
 * Decide que guardar al enviar el formulario. `actual` es el valor real
 * en la base (no lo que mande el cliente); `deseado` es el checkbox
 * enviado. Si no hay cambio de estado activo/inactivo, conserva `actual`
 * tal cual (para no reiniciar el contador ni perder la fecha que permite
 * mostrar "expiro hace N dias").
 */
export function resolverNuevaColeccionDesde(
  actual: string | null,
  deseado: boolean,
  ahora: Date = new Date(),
): string | null {
  const activaActualmente = esNuevaColeccionActiva(actual, ahora);
  if (deseado && !activaActualmente) return ahora.toISOString();
  if (!deseado && activaActualmente) return null;
  return actual;
}
```

### Formulario de producto

`src/lib/validation/producto.ts`: `varianteSchema` gana
`nuevaColeccion: z.boolean()`. `nuevo/page.tsx` (variante por defecto) y
todo literal de test que construya una variante agregan
`nuevaColeccion: false`.

`producto-form.tsx`, dentro del bloque de cada variante (junto a
Talla/Color/Disponibles/Quitar):

```tsx
<label className="flex items-center gap-2 text-xs text-brand-ciruela">
  <input type="checkbox" {...register(`variantes.${index}.nuevaColeccion` as const)} />
  Nueva Colección
</label>
{nuevaColeccionInfoPorVariante[variantId ?? ""]?.expiroHaceDias != null && (
  <p className="text-xs text-brand-ciruela/60">
    Estuvo activo, expiró hace{" "}
    {nuevaColeccionInfoPorVariante[variantId ?? ""]!.expiroHaceDias} día
    {nuevaColeccionInfoPorVariante[variantId ?? ""]!.expiroHaceDias === 1 ? "" : "s"}.
  </p>
)}
```

`ProductoForm` recibe una prop nueva, opcional:
`nuevaColeccionInfoPorVariante?: Record<string, { expiroHaceDias: number }>`
(default `{}`), calculada en `[id]/editar/page.tsx` a partir de
`diasDesdeExpiracion`. No es parte de `ProductoInput` — es solo texto
informativo, con la misma clave (`variantId`) que ya usa
`imagenesDeVariante`.

`[id]/editar/page.tsx`: el `select` de `product_variants` agrega
`nueva_coleccion_desde`; `defaultValues.variantes[].nuevaColeccion =
esNuevaColeccionActiva(v.nueva_coleccion_desde)`; se arma
`nuevaColeccionInfoPorVariante` solo con las entradas donde
`diasDesdeExpiracion` no sea `null`.

### `actions.ts`

`updateProducto`: el `select` de `variantesExistentes` (línea ~178)
pasa de `.select("id")` a `.select("id, nueva_coleccion_desde")`. Para
cada `actualizarItems` (ya existe) y `crearItems` (nueva), el `upsert`/
`insert` de `product_variants` agrega:

```ts
nueva_coleccion_desde: resolverNuevaColeccionDesde(
  variantesExistentesPorId.get(item.id)?.nueva_coleccion_desde ?? null, // null para "crear"
  item.variante.nuevaColeccion,
),
```

`createProducto`: todas las variantes son nuevas, así que
`resolverNuevaColeccionDesde(null, variante.nuevaColeccion)` — si el
checkbox llega marcado en la creación, se guarda `ahora()`.

### `src/lib/store/fetch-nueva-coleccion.ts`

```ts
export type NuevaColeccionItem = {
  variantId: string;
  productSlug: string;
  productName: string;
  price: number;
  promoPrice: number | null;
  imageUrl: string;
};

const MAX_ITEMS_NUEVA_COLECCION = 12;

export async function fetchNuevaColeccion(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<NuevaColeccionItem[]> { ... }
```

Mismo estilo manual (sin embeds de Supabase) que `fetch-catalog.ts`:

1. `product_variants.select("id, product_id, price_override,
   nueva_coleccion_desde").not("nueva_coleccion_desde", "is", null)` —
   traer candidatas (el filtro de 5 días se aplica en TS con
   `esNuevaColeccionActiva`, para que la regla viva en un solo lugar).
2. De las que sigan activas, `products.select("id, slug, name, price,
   promo_price").eq("is_active", true).in("id", productIds)`.
3. `product_images.select("variant_id, url, sort_order,
   is_primary").eq("vendida", false).in("variant_id", variantIds)` →
   agrupar por `variant_id`, tomar la primera por `is_primary` luego
   `sort_order` (reutilizar el mismo criterio de orden que
   `ordenarImagenesTarjeta`, no hace falta una función nueva: basta
   ordenar y tomar `[0]`).
4. Descartar variantes sin producto activo o sin ninguna foto no
   vendida. Cortar a `MAX_ITEMS_NUEVA_COLECCION`.
5. `price`/`promoPrice` = `variant.price_override ?? product.price` /
   `product.promo_price` (mismo criterio de precio efectivo que ya
   existe en `src/lib/store/discount.ts`, se reutiliza
   `precioEfectivo`/`calcularDescuento` en el componente, no aquí).

### `NuevaColeccionOverlay`

`src/components/store/nueva-coleccion-overlay.tsx`, `"use client"`:

```tsx
export function NuevaColeccionOverlay({ items }: { items: NuevaColeccionItem[] }) { ... }
```

- Si `items.length === 0`, no renderiza nada (ni siquiera el chequeo de
  sessionStorage).
- Estado `mostrar`, inicializado en `false`; un `useEffect` en el
  montaje revisa `sessionStorage.getItem("nueva-coleccion-vista")` — si
  no está, `setMostrar(true)` y lo marca. Guard `typeof window ===
  "undefined"` no hace falta (client component, corre solo en browser).
- Si `!mostrar`, no renderiza nada.
- Igual que `LightboxImagenes`: `createPortal(…, document.body)`,
  `role="dialog" aria-modal="true"`, cierre por X / `Escape` /
  clic en el fondo (`e.target === e.currentTarget`), bloqueo de
  `document.body.style.overflow` restaurando el valor previo, foco al
  botón de cerrar al montar.
- Estructura visual:
  - Fondo `bg-black/70`.
  - Panel central con entrada animada (`@keyframes nueva-coleccion-in`
    nuevo en `globals.css`, mismo patrón que `caer-nieve`/`marquesina`
    ya existentes: `scale(0.85) → scale(1.03) → scale(1)` con
    `cubic-bezier` de rebote, ~450ms, una sola vez al montar — no en
    bucle).
  - Título `"✨ Nueva Colección ✨"` con degradado dorado
    (`bg-gradient-to-r from-brand-oro via-brand-rosa to-brand-oro
    bg-clip-text text-transparent`).
  - Carrusel horizontal vía `useCarruselTactil({ total: items.length,
    autoAvanceMs: 2500 })` (mismo hook que `TarjetaGaleria`).
  - Cada tarjeta: foto (`next/image`, `object-cover`), insignia
    **"NUEVO"** (`bg-brand-rosa text-brand-crema`, `animate-pulse` de
    Tailwind — sin keyframe nuevo), nombre + precio (reutilizando
    `formatPrice`/`precioEfectivo`/`calcularDescuento`). Cada tarjeta
    entra con `animation-delay` escalonado
    (`style={{ animationDelay: `${i * 80}ms` }}`, mismo keyframe de
    entrada aplicado por tarjeta en vez de al panel completo — se aplica
    a AMBOS: el panel entra, y dentro las tarjetas hacen su propio
    stagger con el mismo keyframe reutilizado a menor escala).
  - La tarjeta completa es un `<Link href={`/producto/${item.productSlug}`}>`
    — clic navega, no hace falta cerrar el overlay a mano (la navegación
    lo desmonta).
  - Respeta `prefers-reduced-motion`: si está activo, se omite la
    animación de entrada del panel y de las tarjetas (clase condicional
    `motion-reduce:animate-none`, patrón ya usado en `marquesina`), y el
    auto-avance del carrusel ya lo respeta internamente
    `useCarruselTactil`.

### `src/app/(store)/page.tsx`

Se agrega `fetchNuevaColeccion(supabase)` al `Promise.all` inicial (o
justo después, en paralelo con las demás consultas independientes), y
se monta `<NuevaColeccionOverlay items={nuevaColeccionItems} />` como
hijo directo de `<main>`, en cualquier posición del JSX (es un overlay,
no ocupa espacio en el documento — se sugiere justo después de
`<HeroSection />` por cercanía semántica, sin que importe para el
render).

## Testing

- **`nueva-coleccion.test.ts`**: `esNuevaColeccionActiva` — `null` →
  false; recién activada → true; justo en el límite de 5 días (antes/
  después) → true/false; `diasDesdeExpiracion` — activa o nunca activada
  → `null`; expirada hace exactamente 1/3 días → valor correcto;
  `resolverNuevaColeccionDesde` — activar algo apagado → `ahora()`;
  desactivar algo activo → `null`; dejar activo sin tocar → conserva
  `actual`; dejar apagado/expirado sin tocar → conserva `actual` (no
  se pierde el dato para "expiró hace N días").
- **`actions.test.ts`** (extender el existente): `createProducto` con
  una variante con `nuevaColeccion: true` → el `insert` de
  `product_variants` lleva `nueva_coleccion_desde` no nulo;
  `updateProducto` — variante ya activa que se guarda sin tocar el
  checkbox → mismo `nueva_coleccion_desde` que traía; variante activa a
  la que se le desmarca el checkbox → `nueva_coleccion_desde: null`;
  variante inactiva a la que se le marca → `nueva_coleccion_desde` nuevo
  (no null, no el valor viejo).
- **`producto-form.test.tsx`** (extender): con una variante cuyo
  `nuevaColeccion` en `defaultValues` es `true`, el checkbox aparece
  marcado; con `nuevaColeccionInfoPorVariante` indicando
  `expiroHaceDias: 3` para esa variante, se muestra el texto "expiró
  hace 3 días".
- **`fetch-nueva-coleccion.test.ts`** (mismo patrón de mocks que
  `fetch-catalog.test.ts`): excluye variantes con `nueva_coleccion_desde`
  a más de 5 días; excluye variantes sin ninguna foto no vendida;
  excluye productos inactivos; respeta el tope de 12; usa
  `price_override` cuando existe.
- **`nueva-coleccion-overlay.test.tsx`** (mismo patrón de mocks jsdom
  que `lightbox-imagenes.test.tsx`: `IntersectionObserver`, `matchMedia`,
  `scrollTo`, `clientWidth`, `next/image`): con `items: []` no renderiza
  nada (ni siquiera toca `sessionStorage`); con items y sessionStorage
  vacío, se muestra y marca `sessionStorage`; si `sessionStorage` ya
  tiene la marca, no se muestra; cierra con X/Esc/clic en el fondo;
  cada tarjeta es un link a `/producto/<slug>` correcto.
- Verificación manual en navegador: crear/editar un producto, activar
  "Nueva Colección" en una variante con foto, entrar al home en una
  pestaña nueva → aparece el overlay con esa foto animada; clic → llega
  al producto; volver al home en la misma pestaña → no vuelve a
  aparecer; abrir el home en una pestaña realmente nueva (nueva sesión)
  → vuelve a aparecer; con `prefers-reduced-motion` activo, aparece sin
  la animación de rebote/stagger pero el carrusel se puede deslizar.
- `pnpm build && pnpm lint && pnpm test` en verde.

## UI

- Overlay: fondo `bg-black/70`, panel `bg-brand-crema` con borde
  `border-brand-oro`, esquinas `rounded-2xl`, sombra fuerte. Título con
  degradado dorado/rosa. Tarjetas del carrusel `bg-white rounded-xl`
  con la insignia "NUEVO" en `brand-rosa` pulsante — mismo lenguaje
  visual que el resto de la tienda (nada de colores fuera de la
  paleta), pero con más movimiento que cualquier otra sección: es la
  única parte del sitio con una animación de entrada con rebote.
- Checkbox del formulario: mismo estilo que los demás checkboxes de
  `producto-form.tsx` (`isActive`, `isFeatured`).
