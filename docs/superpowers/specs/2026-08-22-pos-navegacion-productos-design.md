# Rediseño POS — Sub-proyecto 3: Navegación de productos

> Sub-proyecto 3 de 5 del rediseño visual del POS. Los sub-proyectos 1
> (layout y navegación) y 2 (módulo de clientes) ya están en producción
> (PR #25, PR #26). El sub-proyecto 4 (carrito y métodos de pago) y el
> 5 (capa móvil) tienen su propio ciclo de spec → plan →
> implementación, por separado.

## Contexto

Hoy, buscar un producto en el POS (`venta-items-editor.tsx`) es un
único input de texto + botón "Buscar": sin categorías, sin imágenes,
sin modo "ver todo el catálogo". `searchProducts(query)`
(`src/app/pos/search-action.ts`) retorna `[]` de inmediato si el
campo está vacío — no existe ningún camino para simplemente navegar el
catálogo sin escribir. Las variantes (talla/color) se eligen con
`<select>` de texto plano, visibles siempre, en
`product-search-result.tsx`.

La tienda pública ya resuelve un problema parecido —categorías +
imágenes + variantes— en `fetchCatalogProducts`
(`src/lib/store/fetch-catalog.ts`): filtra por `category_id`, trae la
imagen principal desde `product_images` (`is_primary = true`), y
calcula tallas/colores disponibles a partir de `product_variants`. Este
sub-proyecto replica ese mismo patrón de datos para el POS, adaptado a
la interacción de "agregar al carrito" en vez de "ir al detalle".

## Decisiones de alcance (ya confirmadas con el usuario)

- **Píldoras + buscador conviven**: las píldoras de categoría (incluida
  "Todos") controlan qué categoría se navega; el buscador de texto
  filtra dentro de esa categoría (o de todo el catálogo si la píldora
  activa es "Todos").
- **Píldoras de categoría**: solo categorías de nivel superior (sin
  `parent_id`), "Todos" + cada una ordenada por `sort_order`. El
  filtro por categoría hace match exacto por `category_id` — no
  recursa en subcategorías (mismo criterio que ya usa
  `fetchCatalogProducts`).
- **Sin botón de favorito** en las tarjetas del POS — `favorites` es un
  concepto del cliente de la tienda, no aplica al staff.
- **Buscador en vivo**: filtra automáticamente con debounce de 300ms,
  sin botón "Buscar" ni Enter.
- **Selección de variante**: un clic en "Agregar" en un producto CON
  tallas/colores despliega un mini-selector (chips) dentro de la misma
  tarjeta; un segundo clic confirma y agrega. Sin variantes, un solo
  clic agrega directo.
- **Botón "Scanner"**: placeholder deshabilitado con
  `title="Próximamente"` — sin lector de código de barras real todavía.
- **Alcance del componente**: el panel nuevo reemplaza la búsqueda
  tanto en la terminal (`/pos`) como en la edición de ventas
  (`/pos/venta/[id]/editar`), porque ambos comparten
  `venta-items-editor.tsx`.

## Diseño

### 1. Modelo de datos y consulta combinada

Nueva server action `buscarProductosPos({ query, categoryId })` en
`src/app/pos/product-browser-action.ts`, que reemplaza por completo
`searchProducts` (`src/app/pos/search-action.ts`, se elimina — sin
otros consumidores fuera de `venta-items-editor.tsx`, confirmado).

```ts
export type PosProductoResult = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  variants: VariantOption[];
};

export async function buscarProductosPos(params: {
  query: string;
  categoryId: string | null;
}): Promise<PosProductoResult[]>
```

- `query` se recorta y limpia igual que hoy
  (`.trim().replace(/[%,()]/g, "")`), pero YA NO retorna `[]` si está
  vacío — un query vacío simplemente no aplica el filtro `.ilike`.
- `categoryId` es opcional: `null` = "Todos" (sin filtro), un uuid =
  `.eq("category_id", categoryId)` exacto.
- Límite: 60 productos por consulta (sin paginación en este
  sub-proyecto — el catálogo actual de la tienda no lo necesita
  todavía; se revisita si crece).
- Trae la imagen principal vía `product_images` (`is_primary = true`),
  igual que `fetchCatalogProducts`.
- Solo `is_active = true`.

Nueva server action `listarCategoriasPos(): Promise<{ id: string;
name: string }[]>` (mismo archivo) — categorías activas sin
`parent_id`, ordenadas por `sort_order`.

### 2. Componente `ProductBrowser`

Nuevo `src/app/pos/product-browser.tsx` (client component),
reemplazando el panel izquierdo actual de `venta-items-editor.tsx`
(el bloque "Buscar producto" completo). Estructura:

- Fila de píldoras de categoría (`listarCategoriasPos`, cargadas al
  montar) + "Todos" — clic cambia `categoryId` seleccionado.
- Input de búsqueda + botón "Scanner" (deshabilitado,
  `title="Próximamente"`) en la misma fila.
- Grilla de 2 columnas de `ProductCardPos` (ver sección 3), resultado
  de `buscarProductosPos({ query, categoryId })` — se vuelve a pedir
  con debounce de 300ms cada vez que cambian `query` o `categoryId`.
- Estado vacío: "Sin resultados." si hay query/categoría activa y la
  grilla queda vacía; cuando no hay ni query ni categoría (recién
  montado), se pide `buscarProductosPos({ query: "", categoryId: null
  })` igual — es decir, la grilla arranca mostrando el catálogo
  completo (hasta el límite de 60), no vacía.

`ProductBrowser` recibe `onAdd: (item: LocalCartItem) => void` como
prop, igual patrón que el `handleAdd` que ya existe en
`venta-items-editor.tsx` hoy — no cambia esa interfaz hacia el carrito.

### 3. `ProductCardPos`

Nuevo `src/app/pos/product-card-pos.tsx`. Tarjeta con imagen
(`aspect-square`, fondo `bg-brand-rosa-claro` si no hay `imageUrl`,
mismo criterio visual que `ProductCard` de la tienda), nombre, precio,
badge de stock (`Badge` ya existente: `variant="danger"` si
`stock === 0`, `"warning"` si `stock` está por debajo del umbral que
retorna `obtenerUmbralStockBajo()` (`@/lib/admin/low-stock`, ya usado
en `/admin/productos` y en la campana de notificaciones del sub-proyecto
1 — mismo umbral en todo el POS, no uno nuevo), si no `"neutral"`.

Dos estados:
- **Normal**: botón "Agregar". Si el producto no tiene variantes,
  agrega directo (mismo cálculo de `unitPrice`/`stock` que ya hace
  `product-search-result.tsx` hoy, portado tal cual).
- **Selector de variante** (solo si `variants.length > 0`): al
  presionar "Agregar" se expande dentro de la misma tarjeta un set de
  chips de talla y de color (misma lógica de `getVariantOptions`/
  `findMatchingVariant` que ya existe en `@/lib/store/variants`,
  reutilizada sin cambios), con un botón "Confirmar" que agrega la
  variante elegida y colapsa la tarjeta de vuelta a su estado normal.

Como ya existe `imageUrl` en `LocalCartItem` (hoy siempre `null` al
agregar, porque `product-search-result.tsx` nunca tuvo la imagen
disponible), `ProductCardPos` lo puebla correctamente al agregar. Esto
es un efecto colateral correcto, no un cambio de alcance: cómo se
*muestra* esa imagen dentro de la lista del carrito sigue siendo tarea
del sub-proyecto 4 (rediseño del panel de carrito).

### 4. Integración en `venta-items-editor.tsx`

El bloque actual (líneas ~126-154: título "Buscar producto", input,
botón "Buscar", lista de `ProductSearchResult`) se reemplaza por
`<ProductBrowser onAdd={handleAdd} />`. `handleAdd` ya existe y no
cambia. Se eliminan los estados `query`/`results`/`isSearching` y
`handleSearch` de `venta-items-editor.tsx` (se mudan dentro de
`ProductBrowser`). El resto del componente (carrito, descuento, método
de pago, cliente, crédito) no se toca.

## Fuera de alcance (explícitamente diferido)

- Rediseño visual del panel de carrito (mostrar imagen por línea,
  métodos de pago como botones-ícono) → sub-proyecto 4.
- Lector de código de barras real → cuando exista, reemplaza el
  placeholder del botón "Scanner".
- Paginación/scroll infinito si el catálogo supera el límite de 60 →
  se revisita si hace falta.
- Capa específica de móvil (grilla/píldoras con layout propio para
  pantallas pequeñas) → sub-proyecto 5.

## Testing

- Tests unitarios (Vitest) para `buscarProductosPos` y
  `listarCategoriasPos` (`src/app/pos/product-browser-action.ts`):
  query vacío + sin categoría trae el catálogo completo (hasta el
  límite); filtro por categoría exacto; filtro de texto combinado con
  categoría; productos inactivos excluidos.
- Verificación manual: igual que los sub-proyectos 1 y 2, `/pos/**`
  requiere sesión autenticada y la contraseña del superadmin no se
  maneja en texto plano en esta sesión — la verificación visual final
  (grilla, píldoras, selector de variante en la tarjeta) la hace el
  usuario en el preview desplegado.

## Preguntas abiertas (a resolver en el plan de implementación, no bloquean el spec)

- Nombre exacto de los archivos nuevos puede ajustarse levemente en la
  fase de plan si un nombre choca con una convención ya establecida
  que no se detectó aquí — el contrato de datos (`PosProductoResult`,
  `buscarProductosPos`, `listarCategoriasPos`) es lo que no cambia.
