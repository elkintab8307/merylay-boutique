# Galería de imágenes en la tienda pública (tarjeta + lightbox)

## Objetivo

En la tienda pública:

1. **Tarjeta de producto**: los productos con varias fotos muestran una
   mini galería que rota sola (auto-avance) y que el cliente puede pasar
   deslizando con el dedo en móvil.
2. **Detalle de producto**: al tocar la imagen grande se abre un lightbox
   a pantalla completa con la foto ampliada y navegación (flechas en PC,
   deslizar en móvil).

## Decisiones tomadas (brainstorming)

- Tarjeta: rotan **todas las fotos no vendidas del producto, tope 5**
  (generales + de variante, en orden `is_primary` primero y luego
  `sort_order`).
- Auto-avance en la tarjeta: **todas las tarjetas visibles rotan solas**
  cada ~3 s (con un pequeño desfase aleatorio por tarjeta para que la
  grilla no pulse al unísono).
- Lightbox del detalle: **sin zoom de pellizco** — solo imagen grande +
  navegar + cerrar.

## Contexto

- **`ProductCardData`** (`src/components/store/product-card.tsx`) tiene
  `imageUrl: string | null` (una sola foto, la `is_primary`). Se arma en
  3 lugares, todos con el mismo patrón (`select` a `product_images` con
  `.eq("is_primary", true)` + un `Map<product_id, url>`):
  - `src/lib/store/fetch-catalog.ts` (`fetchCatalogProducts` — catálogo,
    categoría, búsqueda).
  - `src/app/(store)/page.tsx` (destacados del home).
  - `src/app/(store)/producto/[slug]/page.tsx` (relacionados).
- `ProductCard` es un **server component** envuelto en `<Link>`. Renderiza
  `<Image fill className="object-contain">` en un contenedor
  `aspect-square`. Lo consumen `product-grid.tsx`, `related-products.tsx`
  y el home.
- `FavoriteButton` recibe `product={{ slug, name, price, imageUrl }}` para
  el snapshot de favoritos (localStorage / tabla). Hoy usa
  `product.imageUrl`.
- **Detalle**: `src/app/(store)/producto/[slug]/page.tsx` ya trae **todas**
  las imágenes del producto (`select id, url, alt, variant_id, vendida` +
  `.order("sort_order")`) y las pasa como `ImagenProducto[]` a
  `ProductDetailInteractive`, que con `getImagesForVariant`
  (`src/lib/store/variant-images.ts`) arma la lista ordenada
  `imagenesGaleria` y se la pasa a **`ProductGallery`**
  (`src/app/(store)/producto/[slug]/product-gallery.tsx`).
- `ProductGallery` (client component) muestra una imagen grande + una tira
  de miniaturas; al tocar una miniatura cambia la imagen grande **y**
  selecciona esa variante (`onSelectVariant`). Ese comportamiento no
  cambia.
- La lista de **Favoritos** (`src/app/(store)/favoritos/*`) renderiza sus
  propias tarjetas desde un snapshot de localStorage — **no** usa
  `ProductCard` ni `ProductCardData`, así que queda fuera.
- jsdom (entorno de los tests) **no** implementa `IntersectionObserver`,
  `Element.scrollTo`/`scrollBy` ni scroll-snap. Los tests mockean esas
  APIs; la lógica de "qué índice se ve" y "cuál es el siguiente" vive en
  funciones puras testeables.

## Alcance

1. **`ProductCardData.imageUrls: string[]`** (reemplaza
   `imageUrl: string | null`), y los 3 builders traen todas las imágenes
   y aplican un helper puro de orden/filtro/tope.
2. **Hook `useCarruselTactil`** (nuevo) — mecánica compartida de
   scroll-snap + swipe + índice + auto-avance opcional.
3. **`TarjetaGaleria`** (nuevo, cliente) — mini galería de la tarjeta con
   dots y auto-avance; `ProductCard` la usa en el hueco de la imagen.
4. **`LightboxImagenes`** (nuevo, cliente) — overlay a pantalla completa;
   `ProductGallery` lo abre al tocar la imagen grande.
5. **Tests** de los helpers puros, el hook, y los 3 componentes.

**Fuera de alcance**: zoom de pellizco; cambiar la tira de miniaturas del
detalle o su lógica de selección de variante; video u otro media; las
tarjetas de la lista de Favoritos; precargar/optimizar más allá de lo que
ya hace `next/image`.

## Arquitectura

### 1. `ProductCardData` → `imageUrls`

`src/components/store/product-card.tsx`:

```ts
export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price: number;
  promoPrice: number | null;
  imageUrls: string[]; // primaria primero, luego sort_order; sin vendidas; máx 5
  tallas: string[];
};
```

- El bloque `<Image>` del contenedor `aspect-square` se reemplaza por
  `<TarjetaGaleria images={product.imageUrls} alt={product.name} />`.
- `FavoriteButton` recibe `imageUrl: product.imageUrls[0] ?? null`.
- El resto de la tarjeta (badge de descuento, favorito, nombre, tallas,
  precio) no cambia. El badge de descuento y el `FavoriteButton` siguen
  posicionados `absolute` **sobre** el contenedor `aspect-square`, por
  encima de la galería.

### Helper `src/lib/store/ordenar-imagenes-tarjeta.ts` (nuevo)

```ts
type ImagenTarjeta = {
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  vendida: boolean;
};

const MAX_IMAGENES_TARJETA = 5;

export function ordenarImagenesTarjeta(imagenes: ImagenTarjeta[]): string[] {
  return imagenes
    .filter((img) => !img.vendida)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, MAX_IMAGENES_TARJETA)
    .map((img) => img.url);
}
```

### Los 3 builders

Patrón idéntico en `fetch-catalog.ts`, `page.tsx` (home) y
`producto/[slug]/page.tsx` (relacionados): el `select` a `product_images`
pasa de `.select("product_id, url").eq("is_primary", true)` a
`.select("product_id, url, sort_order, is_primary, vendida")` (sin el
`.eq`), se agrupa por `product_id` en un `Map<string, ImagenTarjeta[]>`, y
`imageUrls: ordenarImagenesTarjeta(mapa.get(p.id) ?? [])`.

### 2. Hook `src/lib/store/use-carrusel-tactil.ts` (nuevo)

```ts
export function useCarruselTactil(opciones: {
  total: number;
  autoAvanceMs?: number;      // si se pasa, auto-avanza
  desfaseInicialMs?: number;  // arranque escalonado (tarjeta)
}): {
  ref: RefObject<HTMLDivElement | null>; // en el contenedor scroll-snap
  indice: number;
  irA: (i: number, opciones?: { suave?: boolean }) => void;
};
```

`irA(i)` usa `behavior: "smooth"` por defecto (o `"auto"` si
`prefers-reduced-motion`); `irA(i, { suave: false })` fuerza `"auto"` —
lo usa el lightbox para posicionarse en la imagen inicial sin animación
visible de scroll al abrir.

- `ref` va en un `<div>` `flex overflow-x-auto snap-x snap-mandatory
  [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`. Cada hijo es un
  slide `snap-start shrink-0 w-full`.
- **Swipe**: es scroll nativo del contenedor. Nada de handlers de puntero.
- **`indice`**: un listener de `scroll` (con `requestAnimationFrame` para
  no saturar) calcula `indiceDesdeScroll(el.scrollLeft, el.clientWidth,
  total)` (función pura). Se actualiza el estado solo si cambió.
- **`irA(i)`**: `el.scrollTo({ left: i * el.clientWidth, behavior:
  "smooth" })` (o `"auto"` si `prefers-reduced-motion`).
- **Auto-avance** (solo si `autoAvanceMs`): un `setInterval` que hace
  `irA(siguienteIndice(indice, total))`, **activo únicamente** mientras:
  1. el contenedor intersecta el viewport (`IntersectionObserver`,
     `threshold: 0.5`), **y**
  2. `document.visibilityState === "visible"` (listener
     `visibilitychange`), **y**
  3. `!matchMedia("(prefers-reduced-motion: reduce)").matches`.
  El primer tick espera `autoAvanceMs + (desfaseInicialMs ?? 0)`.
- Limpieza: quita interval, IO, y los listeners de scroll/visibility al
  desmontar.

Funciones puras exportadas (testeables sin DOM):

```ts
export function indiceDesdeScroll(scrollLeft: number, anchoSlide: number, total: number): number;
// Math.round(scrollLeft / anchoSlide), recortado a [0, total-1]; 0 si anchoSlide <= 0

export function siguienteIndice(actual: number, total: number): number;
// (actual + 1) % total  (0 si total <= 1)
```

### 3. `src/components/store/tarjeta-galeria.tsx` (nuevo, `"use client"`)

```tsx
export function TarjetaGaleria({ images, alt }: { images: string[]; alt: string }) { ... }
```

- **0 imágenes**: `<div>` placeholder "Sin imagen" (mismo markup que hoy).
- **1 imagen**: un solo `<Image fill className="object-contain">`, sin
  carrusel ni dots.
- **≥2 imágenes**:
  - Contenedor `absolute inset-0` (llena el `aspect-square` del padre).
  - `useCarruselTactil({ total: images.length, autoAvanceMs: 3000,
    desfaseInicialMs })` donde `desfaseInicialMs` es un
    `useRef(Math.floor(Math.random() * 1500))` (estable entre renders).
  - Track scroll-snap con un slide por imagen
    (`<Image fill className="object-contain">`).
  - **Dots**: fila `absolute bottom-2 left-1/2 -translate-x-1/2`, un
    `<button>` por imagen (`h-1.5 w-1.5 rounded-full`, activo =
    `bg-brand-crema`, inactivo = `bg-brand-crema/50`), `onClick` →
    `irA(i)` + `e.preventDefault()`/`e.stopPropagation()` para no navegar
    el `<Link>`. `aria-label={`Ver imagen ${i + 1}`}`.
  - El track NO intercepta el clic de navegación: un tap sin desplazamiento
    deja pasar el click al `<Link>` padre; un swipe hace scroll y el
    navegador no dispara click. (Comportamiento nativo del scroll.)
- `product-card.tsx` sigue siendo server component; solo cambia el hijo del
  contenedor `aspect-square`.

### 4. `src/components/store/lightbox-imagenes.tsx` (nuevo, `"use client"`)

```tsx
export function LightboxImagenes({
  images,          // { url: string; alt: string | null }[]
  indiceInicial,
  productName,
  onClose,
}: { ... }) { ... }
```

- `createPortal(…, document.body)`.
- `<div role="dialog" aria-modal="true" aria-label={`Imágenes de ${productName}`}
  className="fixed inset-0 z-50 flex flex-col bg-black/95">`.
- **Track** scroll-snap a pantalla completa; cada slide
  `flex items-center justify-center` con `<Image fill className="object-contain">`.
  Al montar, `scrollTo({ left: indiceInicial * clientWidth, behavior: "auto" })`
  (vía `useCarruselTactil` + un `useEffect` de arranque, o `irA(indiceInicial)`
  sin smooth).
- **Chrome**:
  - `<button>` **X** `absolute top-3 right-3` — `aria-label="Cerrar"`.
  - `<button>` **‹** y **›** `absolute top-1/2 -translate-y-1/2` (izq/der),
    `hidden sm:flex` (en móvil se desliza), `onClick` → `irA(indice ∓ 1)`
    recortado a rango.
  - **Contador** `absolute bottom-3 left-1/2 -translate-x-1/2 text-brand-crema
    text-sm`: `{indice + 1} / {images.length}`.
- **Cerrar**:
  - clic en el backdrop (el `div[role=dialog]` directamente, no en la
    imagen ni en los botones — se comprueba `e.target === e.currentTarget`).
  - tecla **Escape** (listener en `document`, `keydown`).
  - botón X.
- **Efectos al abrir**: `document.body.style.overflow = "hidden"` (restaurar
  al cerrar); `foco` al botón X (`ref.current?.focus()`), y al cerrar
  devolver el foco al elemento que lo abrió (el `ProductGallery` guarda un
  `ref` al botón de la imagen grande y lo re-enfoca).

### `ProductGallery` — disparador del lightbox

`src/app/(store)/producto/[slug]/product-gallery.tsx`:

- La imagen grande (`<div className="relative aspect-square …"><Image …/></div>`)
  pasa a `<button type="button" onClick={() => setLightbox(activeIndex)}
  aria-label="Ver imagen ampliada" className="relative aspect-square …
  cursor-zoom-in">…</button>`.
- Estado nuevo: `const [lightboxIndice, setLightboxIndice] = useState<number | null>(null)`.
- Cuando `lightboxIndice !== null`, renderiza
  `<LightboxImagenes images={images.map(i => ({ url: i.url, alt: i.alt }))}
  indiceInicial={lightboxIndice} productName={productName}
  onClose={() => setLightbox(null)} />`.
- Las miniaturas y `onSelectVariant` **no cambian**.

## Testing

- **`ordenar-imagenes-tarjeta.test.ts`**: primaria primero aunque su
  `sort_order` sea mayor; orden por `sort_order` entre no-primarias;
  excluye `vendida`; recorta a 5; lista vacía → `[]`.
- **`use-carrusel-tactil` (parte pura)** `siguiente-indice.test.ts` /
  `indice-desde-scroll.test.ts`: `siguienteIndice` cicla y maneja
  `total <= 1`; `indiceDesdeScroll` redondea, recorta al rango y maneja
  `anchoSlide <= 0`.
- **`use-carrusel-tactil` (hook)**: con `vi.useFakeTimers()` +
  `IntersectionObserver`/`matchMedia`/`scrollTo` mockeados — auto-avanza
  tras `autoAvanceMs`; NO avanza si el IO reporta fuera de viewport; NO
  avanza con `prefers-reduced-motion`; limpia el interval al desmontar.
- **`tarjeta-galeria.test.tsx`**: 3 imágenes → 3 slides + 3 dots; 1 imagen
  → sin dots, sin track; 0 → placeholder "Sin imagen"; clic en un dot
  llama `scrollTo` con el offset de ese índice y no propaga el click.
- **`lightbox-imagenes.test.tsx`**: abre en `indiceInicial` (scrollTo con
  ese offset); Escape llama `onClose`; clic en el backdrop llama
  `onClose`; clic en la imagen NO llama `onClose`; botón X llama
  `onClose`; ‹ › mueven el índice y el contador; bloquea el scroll del
  body mientras está montado.
- **`product-card.test.tsx`** (nuevo): con `imageUrls` de 2+ renderiza
  `TarjetaGaleria` (hay slides); `FavoriteButton` recibe `imageUrls[0]`;
  con `imageUrls: []` muestra "Sin imagen".
- **Verificación manual**: catálogo en PC (tarjetas rotan, se pausa al
  salir del viewport) y en móvil (deslizar tarjeta, rota sola la visible);
  detalle: abrir imagen grande, deslizar/flechas, cerrar con X/Esc/fondo,
  el foco vuelve a la imagen; `prefers-reduced-motion` activo → nada rota
  solo pero sí se puede deslizar.
- `pnpm build && pnpm lint && pnpm test` en verde.

## UI

- **Tarjeta**: dots pequeños (`brand-crema` / `brand-crema/50`) abajo-centro
  sobre la foto. Sin flechas (la tarjeta es chica; se rota sola y se
  desliza). El contenedor sigue `aspect-square … object-contain`, fondo
  `bg-brand-rosa-claro`.
- **Lightbox**: fondo `bg-black/95`, imagen `object-contain` a viewport
  completo, X y flechas en `brand-crema` con `bg-black/40 rounded-full`
  p-2, contador `brand-crema`. Sin animación de entrada más allá de un
  `transition-opacity` simple.
- Todo respeta `prefers-reduced-motion`: sin auto-avance, `scrollTo`
  con `behavior: "auto"`.
