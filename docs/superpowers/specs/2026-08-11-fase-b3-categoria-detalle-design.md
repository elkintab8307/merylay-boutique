# Rediseño — Fase B3: Categoría y Detalle de producto

## Objetivo

Aplicar el lenguaje visual ya establecido en la Fase B1 (sombras de
marca, banners con degradado de respaldo, tarjetas de producto) a las
dos páginas de la tienda que todavía no lo tienen: el listado por
categoría y el detalle de producto. Es la tercera y última sub-fase de
la Fase B (B1 Home y B2 Reseñas ya implementadas).

## Alcance

1. **Banner de categoría** (`CategoryBanner`): reemplaza el `<h1>`
   plano de `categoria/[slug]/page.tsx` por un banner ancho que usa
   `categories.image_url` (ya cargado desde la Fase B1) con el nombre
   superpuesto. Sin imagen, cae a un degradado de marca — mismo
   criterio de "poco contenido" ya aplicado en toda la Fase B.
2. **Migas de pan** (`Breadcrumbs`): "Inicio > [Categoría]" en la
   página de categoría, "Inicio > [Categoría] > [Producto]" en el
   detalle de producto. Componente genérico compartido.
3. **Filtros con estilo de marca**: los checkboxes de talla/color en
   el sidebar de filtros pasan de casillas nativas del navegador a
   "pills" con estilo de marca — checkbox nativo oculto + etiqueta que
   cambia de color al marcarse (`has-[:checked]:` de Tailwind),
   preservando la semántica y accesibilidad del control nativo. Los
   inputs de precio y el `<select>` de orden ya tienen estilo de
   marca, no se tocan.
4. **Franja de confianza compacta** en el detalle de producto, junto
   al botón "Agregar al carrito": 3 íconos en línea (envío, pago
   seguro, cambios) — versión reducida de `BenefitsBar` de la Fase B1.
5. **Productos relacionados** (`RelatedProducts`): sección "También te
   puede gustar" al final del detalle de producto, hasta 4 productos
   activos de la misma categoría (excluyendo el actual), reutilizando
   `ProductCard`. Si el producto no tiene categoría o no hay más
   productos activos en ella, la sección no se renderiza.

Fuera de alcance: cambios a la lógica de filtrado/orden ya existente
(solo cambia el aspecto visual de los controles, no su comportamiento);
rediseño del carrito o checkout; paginación del listado de categoría
(no existe hoy, no se agrega en esta fase).

## Arquitectura

### Componentes nuevos compartidos

`src/components/store/breadcrumbs.tsx`:

```ts
export type BreadcrumbItem = { label: string; href?: string };
```

Recibe `items: BreadcrumbItem[]`; el último elemento (sin `href`) se
renderiza como texto plano (página actual), los anteriores como
`<Link>`. Separador visual simple (`/` o similar) entre elementos.

`src/components/store/category-banner.tsx`: recibe
`{ name: string; description: string | null; imageUrl: string | null }`.
Con imagen: imagen de fondo + degradado + nombre superpuesto (mismo
patrón visual que `CollectionBanners`/`CategoryGrid` de la Fase B1).
Sin imagen: degradado de marca (`brand-rosa`/`brand-oro`) con el mismo
contenido de texto — nunca una sección vacía o rota.

### Página de categoría

`categoria/[slug]/page.tsx`: agrega `Breadcrumbs` + `CategoryBanner` al
principio (reemplazando el `<h1>` actual), usando los datos de
categoría que la página ya consulta (`image_url` ya se trae desde B1,
`description` se agrega a esa misma consulta — ya existe en el esquema
desde la migración inicial, no se usaba). Los checkboxes de talla/color
del formulario de filtros ganan la clase de estilo pill, sin cambiar
`name`/`value`/lógica de submit.

### Página de detalle de producto

`producto/[slug]/page.tsx`:
- Se agrega una consulta a `categories` (nombre + slug) usando el
  `category_id` del producto, para las migas de pan. Si el producto no
  tiene categoría, las migas de pan muestran solo "Inicio > [Producto]".
- Se agrega una franja de confianza compacta (3 íconos, JSX estático
  directo en la página — no necesita ser un componente reutilizable
  aparte, es contenido fijo de una sola línea) justo debajo de
  `ProductVariantSelector`.
- Se agrega `RelatedProducts`, que recibe la lista ya resuelta de
  productos relacionados (mismo patrón que `ReviewsSection`/
  `CollectionBanners`: la página hace la consulta, el componente solo
  presenta). La consulta filtra `category_id` igual al del producto
  actual, `is_active = true`, excluye el producto actual, límite 4 —
  con las mismas sub-consultas de imagen principal y tallas que ya usan
  home/categoría para construir `ProductCardData`.

## Testing

- Sin lógica de negocio pura nueva que amerite TDD estricto — es
  composición de UI y una consulta adicional, mismo patrón sin tests
  dedicados ya usado para banners/categorías en fases anteriores.
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: navegar a una categoría con y sin imagen configurada
  (confirma el banner y su degradado de respaldo), marcar un filtro de
  talla/color (confirma que el pill cambia de estilo y el filtrado
  sigue funcionando), entrar a un producto con y sin categoría (confirma
  las migas de pan y que la sección de relacionados se oculta cuando
  corresponde).

## UI

Mismos tokens de marca ya establecidos en toda la Fase B
(`brand-rosa`, `brand-oro`, `brand-crema`, `brand-ciruela`,
`shadow-brand-sm/md`). El banner de categoría y la franja de confianza
reutilizan exactamente el lenguaje visual de `CollectionBanners` y
`BenefitsBar` de la Fase B1, no inventan un estilo nuevo.
