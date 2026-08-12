# Rediseño — Fase B3: Categoría y Detalle de producto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el lenguaje visual de la Fase B1 (banners con
degradado de respaldo, sombras de marca) a la página de categoría y a
la de detalle de producto: banner de categoría, migas de pan en ambas
páginas, filtros con estilo de marca, franja de confianza y productos
relacionados en el detalle.

**Architecture:** Dos componentes presentacionales nuevos y
compartidos (`Breadcrumbs`, `CategoryBanner`) siguiendo el mismo patrón
ya establecido en B1/B2: reciben datos ya resueltos por la página
(Server Component), degradan con gracia sin imagen/sin contenido. Las
dos páginas existentes ganan ediciones puntuales (no reemplazos
arquitectónicos) que reutilizan consultas y patrones de mapeo a
`ProductCardData` ya usados tres veces en el proyecto (home, categoría,
y ahora relacionados).

**Tech Stack:** Next.js App Router (Server Components), Supabase
(Postgres), `lucide-react`, Tailwind v4 (`has-[:checked]:`).

## Global Constraints

- Todo el producto en español (UI, mensajes).
- No se cambia la lógica de filtrado/orden ya existente en la página
  de categoría — solo el aspecto visual de los controles.
- Sin paginación nueva, sin rediseño de carrito/checkout — fuera de
  alcance.
- Los componentes nuevos degradan con gracia (banner de categoría sin
  imagen → degradado de marca; productos relacionados vacío → sección
  oculta) — mismo criterio ya aplicado en toda la Fase B.
- Los checkboxes de talla/color siguen siendo `<input type="checkbox">`
  nativos (semántica y accesibilidad intactas) — solo cambia su
  presentación visual.

---

## Task 1: Componentes compartidos — `Breadcrumbs` y `CategoryBanner`

**Files:**
- Create: `src/components/store/breadcrumbs.tsx`
- Create: `src/components/store/category-banner.tsx`

**Interfaces:**
- Produces: `Breadcrumbs({ items })`, `BreadcrumbItem` — consumidos por
  las Tasks 2 y 3. `CategoryBanner({ name, description, imageUrl })` —
  consumido por la Task 2.

- [ ] **Step 1: Crear `Breadcrumbs`**

Crea `src/components/store/breadcrumbs.tsx`:

```tsx
import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Migas de pan"
      className="flex flex-wrap items-center gap-1 text-sm text-brand-ciruela/70"
    >
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-brand-rosa">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="text-brand-ciruela">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Crear `CategoryBanner`**

Crea `src/components/store/category-banner.tsx`:

```tsx
import Image from "next/image";

export function CategoryBanner({
  name,
  description,
  imageUrl,
}: {
  name: string;
  description: string | null;
  imageUrl: string | null;
}) {
  return (
    <section className="relative flex min-h-[180px] items-center overflow-hidden rounded-2xl">
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill priority className="object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa to-brand-oro" />
      )}
      {imageUrl && (
        <div className="absolute inset-0 bg-gradient-to-t from-brand-ciruela/70 via-brand-ciruela/20 to-transparent" />
      )}
      <div
        className={`relative z-10 flex flex-col gap-2 px-8 py-10 ${
          imageUrl ? "text-brand-crema" : "text-brand-ciruela"
        }`}
      >
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{name}</h1>
        {description && <p className="max-w-xl text-sm sm:text-base">{description}</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/components/store/breadcrumbs.tsx src/components/store/category-banner.tsx
git commit -m "feat: componentes de migas de pan y banner de categoria"
```

---

## Task 2: Página de categoría — banner, migas de pan y filtros con estilo de marca

**Files:**
- Modify: `src/app/(store)/categoria/[slug]/page.tsx`

**Interfaces:**
- Consumes: `Breadcrumbs`, `BreadcrumbItem`, `CategoryBanner` (Task 1).
- Produces: nada consumido por otra task de este plan.

- [ ] **Step 1: Reemplazar el contenido completo de la página**

Reemplaza el contenido completo de
`src/app/(store)/categoria/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CategoryBanner } from "@/components/store/category-banner";
import { getVariantOptions } from "@/lib/store/variants";
import { resolveSort } from "@/lib/store/sort";

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function CategoriaPage({
  params,
  searchParams,
}: PageProps<"/categoria/[slug]">) {
  const { slug } = await params;
  const search = await searchParams;

  const supabase = await createClient();

  const [{ data: categoria }, { data: { user } }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, image_url, description")
      .eq("slug", slug)
      .eq("is_active", true)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!categoria) {
    notFound();
  }

  const tallasSeleccionadas = toArray(search.talla);
  const coloresSeleccionados = toArray(search.color);
  const minPriceStr = firstValue(search.minPrice);
  const maxPriceStr = firstValue(search.maxPrice);
  const minPrice = minPriceStr ? Number(minPriceStr) : undefined;
  const maxPrice = maxPriceStr ? Number(maxPriceStr) : undefined;
  const sort = resolveSort(firstValue(search.sort));

  let query = supabase
    .from("products")
    .select("id, name, slug, price, compare_at_price")
    .eq("category_id", categoria.id)
    .eq("is_active", true);

  if (minPrice !== undefined && !Number.isNaN(minPrice)) {
    query = query.gte("price", minPrice);
  }
  if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
    query = query.lte("price", maxPrice);
  }

  query = query
    .order(sort.column, { ascending: sort.ascending })
    .order("created_at", { ascending: false });

  const { data: productosBase } = await query;

  const productIds = (productosBase ?? []).map((p) => p.id);
  const { data: variantesCategoria } =
    productIds.length > 0
      ? await supabase
          .from("product_variants")
          .select("product_id, talla, color")
          .in("product_id", productIds)
      : { data: [] };

  const { tallas, colores } = getVariantOptions(
    (variantesCategoria ?? []).map((v) => ({
      id: "",
      talla: v.talla,
      color: v.color,
      sku: "",
      stock: 0,
      priceOverride: null,
    })),
  );

  let productosFiltrados = productosBase ?? [];
  if (tallasSeleccionadas.length > 0 || coloresSeleccionados.length > 0) {
    const idsConVariante = new Set(
      (variantesCategoria ?? [])
        .filter(
          (v) =>
            (tallasSeleccionadas.length === 0 ||
              (v.talla && tallasSeleccionadas.includes(v.talla))) &&
            (coloresSeleccionados.length === 0 ||
              (v.color && coloresSeleccionados.includes(v.color))),
        )
        .map((v) => v.product_id),
    );
    productosFiltrados = productosFiltrados.filter((p) => idsConVariante.has(p.id));
  }

  const idsFiltrados = productosFiltrados.map((p) => p.id);
  const [{ data: imagenes }, { data: favoritos }] = await Promise.all([
    idsFiltrados.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", idsFiltrados)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
    user && idsFiltrados.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user.id)
          .in("product_id", idsFiltrados)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
  ]);
  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));
  const tallasPorProducto = new Map<string, string[]>();
  for (const variante of variantesCategoria ?? []) {
    if (!variante.talla || !idsFiltrados.includes(variante.product_id)) continue;
    const actuales = tallasPorProducto.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorProducto.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallas] of tallasPorProducto) {
    tallasPorProducto.set(productId, [...tallas].sort());
  }
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));

  const productos: ProductCardData[] = productosFiltrados.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
    tallas: tallasPorProducto.get(p.id) ?? [],
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: categoria.name }]} />
      <CategoryBanner
        name={categoria.name}
        description={categoria.description}
        imageUrl={categoria.image_url}
      />

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <form method="get" className="flex flex-col gap-6">
            <div>
              <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Precio</h2>
              <div className="flex gap-2">
                <input
                  type="number"
                  name="minPrice"
                  placeholder="Mín"
                  defaultValue={minPriceStr}
                  className="w-1/2 rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  name="maxPrice"
                  placeholder="Máx"
                  defaultValue={maxPriceStr}
                  className="w-1/2 rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
                />
              </div>
            </div>

            {tallas.length > 0 && (
              <div>
                <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Talla</h2>
                <div className="flex flex-wrap gap-2">
                  {tallas.map((talla) => (
                    <label
                      key={talla}
                      className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema"
                    >
                      <input
                        type="checkbox"
                        name="talla"
                        value={talla}
                        defaultChecked={tallasSeleccionadas.includes(talla)}
                        className="sr-only"
                      />
                      {talla}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {colores.length > 0 && (
              <div>
                <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Color</h2>
                <div className="flex flex-wrap gap-2">
                  {colores.map((color) => (
                    <label
                      key={color}
                      className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema"
                    >
                      <input
                        type="checkbox"
                        name="color"
                        value={color}
                        defaultChecked={coloresSeleccionados.includes(color)}
                        className="sr-only"
                      />
                      {color}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Ordenar por</h2>
              <select
                name="sort"
                defaultValue={sort.key}
                className="w-full rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
              >
                <option value="destacados">Destacados</option>
                <option value="precio-asc">Precio: menor a mayor</option>
                <option value="precio-desc">Precio: mayor a menor</option>
                <option value="recientes">Más reciente</option>
              </select>
            </div>

            <button
              type="submit"
              className="rounded-md bg-brand-rosa px-4 py-2 text-sm text-brand-crema hover:bg-brand-rosa/90"
            >
              Aplicar filtros
            </button>
          </form>
        </aside>

        <div className="flex-1">
          {productos.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {productos.map((producto) => (
                <ProductCard
                  key={producto.slug}
                  product={producto}
                  currentUserId={user?.id ?? null}
                  initialFavorite={favoritosSet.has(producto.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-brand-ciruela/70">
              No hay productos que coincidan con los filtros seleccionados.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
```

Cambios respecto a la versión actual: la consulta de `categories` gana
`image_url, description`; el `<h1>` plano se reemplaza por
`<Breadcrumbs>` + `<CategoryBanner>`; los `<label>` de talla/color
ganan clases de estilo pill (`rounded-full border ... has-[:checked]:...`)
y su `<input>` gana `className="sr-only"`; el contenedor de esos
checkboxes pasa de `flex flex-col gap-1` a `flex flex-wrap gap-2`. Toda
la lógica de consultas, filtrado, orden y el resto del JSX quedan
idénticos.

- [ ] **Step 2: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/categoria/[slug]/page.tsx"
git commit -m "feat: banner de categoria, migas de pan y filtros con estilo de marca"
```

---

## Task 3: Página de detalle de producto — migas de pan, franja de confianza y relacionados

**Files:**
- Create: `src/components/store/related-products.tsx`
- Modify: `src/app/(store)/producto/[slug]/page.tsx`

**Interfaces:**
- Consumes: `Breadcrumbs`, `BreadcrumbItem` (Task 1); `ProductCard`,
  `ProductCardData` (ya existentes).
- Produces: `RelatedProducts({ productos, currentUserId, favoritosSet })`
  — no lo consume ninguna otra task de este plan.

- [ ] **Step 1: Crear `RelatedProducts`**

Crea `src/components/store/related-products.tsx`:

```tsx
import { ProductCard, type ProductCardData } from "@/components/store/product-card";

export function RelatedProducts({
  productos,
  currentUserId,
  favoritosSet,
}: {
  productos: ProductCardData[];
  currentUserId: string | null;
  favoritosSet: Set<string>;
}) {
  if (productos.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl text-brand-ciruela">También te puede gustar</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {productos.map((producto) => (
          <ProductCard
            key={producto.slug}
            product={producto}
            currentUserId={currentUserId}
            initialFavorite={favoritosSet.has(producto.id)}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Reemplazar el contenido completo de la página de detalle**

Reemplaza el contenido completo de
`src/app/(store)/producto/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Truck, ShieldCheck, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";
import { FavoriteButton } from "@/components/store/favorite-button";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/store/breadcrumbs";
import { RelatedProducts } from "@/components/store/related-products";
import type { ProductCardData } from "@/components/store/product-card";

export default async function ProductoPage({
  params,
}: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!producto) {
    notFound();
  }

  const [{ data: imagenes }, { data: variantes }, { data: { user } }] = await Promise.all([
    supabase
      .from("product_images")
      .select("url, alt")
      .eq("product_id", producto.id)
      .order("sort_order"),
    supabase
      .from("product_variants")
      .select("id, talla, color, sku, stock, price_override")
      .eq("product_id", producto.id),
    supabase.auth.getUser(),
  ]);

  const { data: favorito } = user
    ? await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", producto.id)
        .maybeSingle()
    : { data: null };

  const { data: categoriaProducto } = producto.category_id
    ? await supabase
        .from("categories")
        .select("name, slug")
        .eq("id", producto.category_id)
        .maybeSingle()
    : { data: null };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Inicio", href: "/" },
    ...(categoriaProducto
      ? [{ label: categoriaProducto.name, href: `/categoria/${categoriaProducto.slug}` }]
      : []),
    { label: producto.name },
  ];

  const { data: relacionadosBase } = producto.category_id
    ? await supabase
        .from("products")
        .select("id, name, slug, price, compare_at_price")
        .eq("category_id", producto.category_id)
        .eq("is_active", true)
        .neq("id", producto.id)
        .order("created_at", { ascending: false })
        .limit(4)
    : {
        data: [] as {
          id: string;
          name: string;
          slug: string;
          price: number;
          compare_at_price: number | null;
        }[],
      };

  const relacionadosIds = (relacionadosBase ?? []).map((p) => p.id);

  const [{ data: imagenesRelacionados }, { data: favoritosRelacionados }, { data: variantesRelacionados }] =
    await Promise.all([
      relacionadosIds.length > 0
        ? supabase
            .from("product_images")
            .select("product_id, url")
            .in("product_id", relacionadosIds)
            .eq("is_primary", true)
        : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
      user && relacionadosIds.length > 0
        ? supabase
            .from("favorites")
            .select("product_id")
            .eq("user_id", user.id)
            .in("product_id", relacionadosIds)
        : Promise.resolve({ data: [] as { product_id: string }[] }),
      relacionadosIds.length > 0
        ? supabase
            .from("product_variants")
            .select("product_id, talla")
            .in("product_id", relacionadosIds)
        : Promise.resolve({ data: [] as { product_id: string; talla: string | null }[] }),
    ]);

  const imagenPorRelacionado = new Map(
    (imagenesRelacionados ?? []).map((img) => [img.product_id, img.url]),
  );
  const favoritosRelacionadosSet = new Set(
    (favoritosRelacionados ?? []).map((f) => f.product_id),
  );
  const tallasPorRelacionado = new Map<string, string[]>();
  for (const variante of variantesRelacionados ?? []) {
    if (!variante.talla) continue;
    const actuales = tallasPorRelacionado.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorRelacionado.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallas] of tallasPorRelacionado) {
    tallasPorRelacionado.set(productId, [...tallas].sort());
  }

  const relacionados: ProductCardData[] = (relacionadosBase ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorRelacionado.get(p.id) ?? null,
    tallas: tallasPorRelacionado.get(p.id) ?? [],
  }));

  const variantesMapeadas = (variantes ?? []).map((v) => ({
    id: v.id,
    talla: v.talla,
    color: v.color,
    sku: v.sku,
    stock: v.stock,
    priceOverride: v.price_override,
  }));

  const imagenPrincipal = imagenes && imagenes.length > 0 ? imagenes[0].url : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="grid gap-10 md:grid-cols-2">
        <ProductGallery images={imagenes ?? []} productName={producto.name} />

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-heading text-3xl text-brand-ciruela">{producto.name}</h1>
            <FavoriteButton
              productId={producto.id}
              currentUserId={user?.id ?? null}
              initialFavorite={Boolean(favorito)}
              product={{
                slug: producto.slug,
                name: producto.name,
                price: producto.price,
                imageUrl: imagenPrincipal,
              }}
            />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-heading text-2xl text-brand-rosa">
              {formatPrice(producto.price)}
            </span>
            {producto.compare_at_price && producto.compare_at_price > producto.price && (
              <span className="text-brand-ciruela/50 line-through">
                {formatPrice(producto.compare_at_price)}
              </span>
            )}
          </div>
          {producto.description && (
            <p className="text-brand-ciruela/80">{producto.description}</p>
          )}
          <ProductVariantSelector
            productId={producto.id}
            productSlug={producto.slug}
            productName={producto.name}
            imageUrl={imagenPrincipal}
            basePrice={producto.price}
            variants={variantesMapeadas}
            baseStock={producto.stock}
            currentUserId={user?.id ?? null}
          />
          <div className="flex flex-wrap items-center gap-4 border-t border-brand-rosa-claro pt-4 text-xs text-brand-ciruela/70">
            <span className="flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-brand-rosa" />
              Envío a toda Colombia
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-rosa" />
              Pago seguro
            </span>
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-brand-rosa" />
              Cambios y devoluciones
            </span>
          </div>
        </div>
      </div>

      <RelatedProducts
        productos={relacionados}
        currentUserId={user?.id ?? null}
        favoritosSet={favoritosRelacionadosSet}
      />
    </main>
  );
}
```

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/components/store/related-products.tsx "src/app/(store)/producto/[slug]/page.tsx"
git commit -m "feat: migas de pan, franja de confianza y productos relacionados en el detalle"
```

---

## Task 4: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-3.

- [ ] **Step 1: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 (Windows) y arranca uno limpio con `pnpm dev`
en segundo plano si hace falta.

- [ ] **Step 2: Verificar que la página de categoría carga**

Con el único producto/categoría reales que existen hoy en la base de
datos:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/categoria/<slug-real>
```

Expected: `200`. Sustituye `<slug-real>` por un slug de categoría
activa real (consulta la base con el MCP de Supabase si no lo conoces,
o revisa `supabase/migrations/002_catalogo.sql`/datos de prueba). Si no
hay ninguna categoría activa con productos, documenta esa limitación en
el reporte en vez de inventar una URL.

```bash
curl -s http://localhost:3000/categoria/<slug-real> | grep -o "Migas de pan" | head -1
```

Expected: no imprime nada directamente (ese es el `aria-label`, no
texto visible) — en su lugar, verifica que la respuesta contiene
`Inicio` como texto de link:

```bash
curl -s http://localhost:3000/categoria/<slug-real> | grep -o ">Inicio<" | head -1
```

Expected: imprime `>Inicio<`.

- [ ] **Step 3: Verificar que la página de detalle de producto carga**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/producto/<slug-real>
```

Expected: `200`. Usa un slug de producto activo real.

```bash
curl -s http://localhost:3000/producto/<slug-real> | grep -o "Env.o a toda Colombia" | head -1
```

Expected: imprime la coincidencia — confirma que la franja de confianza
se renderiza.

- [ ] **Step 4: Confirmar en código que `/admin`, `/pos` y `/superadmin` no importan nada de estos componentes**

Búsqueda de texto (`Breadcrumbs|CategoryBanner|RelatedProducts`) dentro
de `src/app/admin`, `src/app/pos` y `src/app/superadmin` — no debe
haber ningún resultado.

- [ ] **Step 5: Detener el servidor**

Detener el servidor de desarrollo si se levantó en el Step 1.

- [ ] **Step 6: Nota para el reporte final**

Deja anotado en tu reporte que la verificación visual completa
(confirmar que el banner de categoría se ve bien con y sin imagen, que
los pills de talla/color cambian de estilo al marcarse y que el
filtrado sigue funcionando, que la sección de relacionados aparece
correctamente cuando hay más de un producto en la misma categoría) no
se hizo de forma interactiva en navegador — recomienda al usuario ese
recorrido manual, igual que en fases anteriores de este proyecto.
Anota también que, con solo 1 producto real en la base de datos hoy, la
sección "También te puede gustar" no tiene forma de mostrar contenido
en la verificación actual (no hay un segundo producto en la misma
categoría) — esto es esperado, no un bug, y se podrá probar
visualmente en cuanto haya más catálogo cargado.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 4, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir. Esta es
la última sub-fase de la Fase B (B1 Home, B2 Reseñas, B3 Categoría y
Detalle) — al cerrarla, la Fase B completa queda terminada.
