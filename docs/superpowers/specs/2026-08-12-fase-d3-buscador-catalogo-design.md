# Rediseño — Fase D3: Buscador y catálogo

## Objetivo

Conectar el ícono de búsqueda del header a un buscador real por nombre de
producto, y llevar los mismos filtros (precio, talla, color, orden) que
hoy solo existen en `/categoria/[slug]` a `/productos` y a la nueva
página de búsqueda. Es la tercera y última sub-fase de la Fase D (D1
Chrome, D2 Home, D3 Buscador y catálogo).

## Contexto

- El ícono de lupa del header enlaza hoy a `/productos` (`site-header.tsx:79`)
  — comportamiento explícitamente temporal, decidido durante el
  brainstorming de D1.
- `/categoria/[slug]/page.tsx` ya implementa filtros completos (precio,
  talla, color, orden vía `resolveSort`) en un sidebar `<form method="get">`
  server-rendered, sin JavaScript de cliente.
- `/productos/page.tsx` es un listado mínimo: todos los productos activos,
  sin filtros ni orden.
- No existe ninguna página de búsqueda por texto.
- La lógica de resolución de catálogo (query de productos + imágenes +
  favoritos + variantes) está duplicada entre `/productos` y
  `/categoria/[slug]`, y se triplicaría si `/buscar` se implementa de
  forma aislada — se centraliza antes de agregar el tercer consumidor.

## Alcance

1. **Capa de datos compartida**: `fetchCatalogProducts` centraliza la
   resolución de productos + imágenes + favoritos + variantes + filtros +
   orden, parametrizada por categoría (opcional) y texto de búsqueda
   (opcional).
2. **Parsing de filtros compartido**: extracción pura y testeable de
   `{ tallas, colores, minPrice, maxPrice, sort, q }` desde `searchParams`.
3. **Componentes de UI compartidos**: el sidebar de filtros y el grid de
   resultados, extraídos del código ya existente en `/categoria/[slug]`.
4. **Página `/buscar`** (nueva): input de texto + filtros + resultados.
5. **`/productos`**: gana los mismos filtros que `/categoria/[slug]`.
6. **`/categoria/[slug]`**: se refactoriza para consumir la capa
   compartida, sin cambiar su comportamiento visible.
7. **Header**: el ícono de lupa pasa a enlazar a `/buscar`.

Fuera de alcance: búsqueda por descripción o SKU (solo nombre); buscador
con JavaScript de cliente, autocompletado o debounce (se mantiene el
patrón de formularios GET server-rendered ya usado en `/categoria/[slug]`);
cualquier cambio a `ProductCard`, `Breadcrumbs`, `CategoryBanner` o a la
lógica de variantes/descuentos ya existente.

## Arquitectura

### `fetchCatalogProducts`

`src/lib/store/fetch-catalog.ts` (nuevo, server-only):

```ts
type FetchCatalogParams = {
  categoryId?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  tallas: string[];
  colores: string[];
  sort: ReturnType<typeof resolveSort>;
  userId: string | null;
};

async function fetchCatalogProducts(
  supabase: SupabaseClient,
  params: FetchCatalogParams,
): Promise<{
  productos: ProductCardData[];
  tallas: string[];
  colores: string[];
}>;
```

Internamente reproduce, sin cambiar el comportamiento, la secuencia que
hoy vive en `/categoria/[slug]/page.tsx`: query base a `products`
(`is_active = true`), `.eq("category_id", ...)` si `categoryId` está
presente, `.ilike("name", "%" + searchQuery + "%")` si `searchQuery` está
presente y no vacío, rango de precio, orden vía `sort.column`/`sort.ascending`
+ `created_at` como desempate; luego resuelve `product_variants` (para
`getVariantOptions` y el filtro por talla/color ya existente en
`variants.ts`), `product_images` (imagen principal) y `favorites` (si hay
usuario). No se le agrega paginación ni límite — mismo comportamiento
actual (todos los resultados que cumplan el filtro).

### `catalog-search-params.ts`

`src/lib/store/catalog-search-params.ts` (nuevo, puro):

```ts
function parseCatalogSearchParams(
  search: Record<string, string | string[] | undefined>,
): {
  tallas: string[];
  colores: string[];
  minPrice: number | undefined;
  maxPrice: number | undefined;
  sort: ReturnType<typeof resolveSort>;
  q: string;
};
```

Reutiliza `resolveSort` (`src/lib/store/sort.ts`, sin cambios) y las
mismas funciones `toArray`/`firstValue` que hoy están inline en
`/categoria/[slug]/page.tsx` (se mueven aquí).

### `CatalogFilterSidebar`

`src/components/store/catalog-filter-sidebar.tsx` (nuevo, presentacional):
mismo markup y clases que el `<aside><form method="get">...</form></aside>`
que hoy vive en `/categoria/[slug]/page.tsx:156-245`, parametrizado por
props (`minPriceStr`, `maxPriceStr`, `tallasSeleccionadas`,
`coloresSeleccionadas`, `tallas`, `colores`, `sortKey`, y un `q?` opcional
que se renderiza como `<input type="hidden" name="q" value={q} />` cuando
está presente, para no perder el texto buscado al aplicar filtros en
`/buscar`).

### `ProductGrid`

`src/components/store/product-grid.tsx` (nuevo, presentacional): el grid
responsive (`grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4` en
`/productos`, `sm:grid-cols-3` en `/categoria/[slug]` — se mantiene el
breakpoint más ancho de `/productos` para las tres páginas, ya que
`/categoria/[slug]` convive con el sidebar y `/productos`/`/buscar`
también) + mapeo a `ProductCard` + mensaje de vacío configurable por prop
(`emptyMessage: string`).

### Página `/buscar`

`src/app/(store)/buscar/page.tsx` (nueva):

- Input de texto arriba (`<form method="get"><input type="search" name="q" defaultValue={q} placeholder="Buscar productos" />...</form>`),
  fuera del sidebar de filtros — al enviarlo, navega a `/buscar?q=...`
  (sin preservar filtros previos: una búsqueda nueva empieza sin filtros).
- Si `q` está vacío tras recortar espacios: mensaje "Escribe algo para
  buscar", sin llamar a `fetchCatalogProducts` ni mostrar el sidebar.
- Si `q` tiene texto: llama a `fetchCatalogProducts({ searchQuery: q, ... })`,
  muestra `CatalogFilterSidebar` (con el `q` oculto) + `ProductGrid` con
  `emptyMessage` = `` No encontramos productos que coincidan con «${q}». ``.

### `/productos`

Se reescribe para usar `fetchCatalogProducts` (sin `categoryId` ni
`searchQuery`) + `CatalogFilterSidebar` + `ProductGrid`, replicando el
layout de dos columnas (`aside` + resultados) que ya usa
`/categoria/[slug]`.

### `/categoria/[slug]`

Se reescribe para usar `fetchCatalogProducts` (con `categoryId`) +
`CatalogFilterSidebar` + `ProductGrid`. `CategoryBanner` y `Breadcrumbs`
no cambian.

### Header

`src/components/layout/site-header.tsx:79` — `href="/productos"` →
`href="/buscar"`. Sin otros cambios en el componente.

## Testing

- `parseCatalogSearchParams`: tests unitarios (valores por defecto,
  arrays únicos vs. múltiples, precios inválidos/ausentes, `q` recortado),
  mismo patrón que `sort.test.ts` y `variants.test.ts`.
- `fetchCatalogProducts`: sin tests dedicados (integración con Supabase,
  mismo criterio ya usado en el proyecto para código que solo compone
  queries reales).
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: buscar un producto por nombre parcial desde el header,
  combinar la búsqueda con un filtro de talla, confirmar que `/productos`
  y `/categoria/[slug]` se ven y filtran igual que antes del refactor.

## UI

Mismos tokens de marca ya establecidos (`brand-rosa`, `brand-ciruela`,
`brand-rosa-claro`, `shadow-brand-*`). Sin colores, tipografías ni
componentes de UI nuevos — el input de búsqueda reutiliza el mismo
lenguaje visual (bordes `brand-rosa-claro`, foco `brand-oro`) que los
inputs del sidebar de filtros.
