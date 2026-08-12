# Fase D3 — Buscador y catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el ícono de búsqueda del header a una página `/buscar` real (por nombre de producto), y llevar los mismos filtros de precio/talla/color/orden que hoy solo existen en `/categoria/[slug]` a `/productos` y a `/buscar`, sin triplicar la lógica de resolución de catálogo.

**Architecture:** Se extrae la lógica de resolución de catálogo (query + imágenes + favoritos + variantes) de `/categoria/[slug]/page.tsx` a una función de servidor compartida `fetchCatalogProducts`, junto con dos componentes presentacionales (`CatalogFilterSidebar`, `ProductGrid`) y una función pura de parsing de `searchParams` (`parseCatalogSearchParams`). Las tres páginas de listado (`/categoria/[slug]`, `/productos`, `/buscar`) consumen esa capa compartida.

**Tech Stack:** Next.js 16 App Router (Server Components, `searchParams` async), TypeScript, Supabase JS client tipado con `Database`, Tailwind v4 (tokens de marca existentes), Vitest.

## Global Constraints

- Todo el texto visible en español (labels, placeholders, mensajes de estado vacío).
- Sin JavaScript de cliente en los formularios de filtro/búsqueda — mismo patrón `<form method="get">` server-rendered ya usado en `/categoria/[slug]`.
- La búsqueda solo compara contra el nombre del producto (`ilike` sobre `products.name`) — no descripción, no SKU.
- No modificar `ProductCard`, `Breadcrumbs`, `CategoryBanner`, `src/lib/store/discount.ts` ni `src/lib/store/variants.ts` (solo se leen/consumen, no se editan).
- El comportamiento visible actual de `/categoria/[slug]` (filtros, orden, resultados) no debe cambiar tras el refactor — es una migración de implementación, no un cambio de UX.
- `pnpm build && pnpm lint && pnpm test` deben quedar en verde al final de cada tarea que toque código.

---

### Task 1: `parseCatalogSearchParams` (parsing puro de filtros)

**Files:**
- Create: `src/lib/store/catalog-search-params.ts`
- Test: `src/lib/store/__tests__/catalog-search-params.test.ts`

**Interfaces:**
- Consumes: `resolveSort` de `src/lib/store/sort.ts` (ya existe, no se modifica — firma: `resolveSort(value: string | undefined): { key: SortKey; column: "is_featured" | "price" | "created_at"; ascending: boolean }`).
- Produces: `parseCatalogSearchParams(search: Record<string, string | string[] | undefined>): CatalogSearchParams`, donde:
  ```ts
  export type CatalogSearchParams = {
    tallas: string[];
    colores: string[];
    minPrice: number | undefined;
    maxPrice: number | undefined;
    sort: ReturnType<typeof resolveSort>;
    q: string;
  };
  ```
  Task 2 y las páginas de las Tasks 4-6 consumen este tipo y esta función tal cual.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { parseCatalogSearchParams } from "../catalog-search-params";

describe("parseCatalogSearchParams", () => {
  it("usa valores por defecto sin parametros", () => {
    expect(parseCatalogSearchParams({})).toEqual({
      tallas: [],
      colores: [],
      minPrice: undefined,
      maxPrice: undefined,
      sort: { key: "destacados", column: "is_featured", ascending: false },
      q: "",
    });
  });

  it("convierte un solo valor de talla/color en array", () => {
    const result = parseCatalogSearchParams({ talla: "M", color: "Rosa" });
    expect(result.tallas).toEqual(["M"]);
    expect(result.colores).toEqual(["Rosa"]);
  });

  it("preserva multiples valores de talla/color", () => {
    const result = parseCatalogSearchParams({
      talla: ["M", "L"],
      color: ["Rosa", "Dorado"],
    });
    expect(result.tallas).toEqual(["M", "L"]);
    expect(result.colores).toEqual(["Rosa", "Dorado"]);
  });

  it("parsea precios validos", () => {
    const result = parseCatalogSearchParams({ minPrice: "10000", maxPrice: "50000" });
    expect(result.minPrice).toBe(10000);
    expect(result.maxPrice).toBe(50000);
  });

  it("descarta precios invalidos", () => {
    const result = parseCatalogSearchParams({ minPrice: "abc" });
    expect(result.minPrice).toBeUndefined();
  });

  it("recorta espacios en el texto de busqueda", () => {
    expect(parseCatalogSearchParams({ q: "  pijama  " }).q).toBe("pijama");
  });

  it("usa string vacio si no hay texto de busqueda", () => {
    expect(parseCatalogSearchParams({}).q).toBe("");
  });

  it("resuelve el orden via resolveSort", () => {
    expect(parseCatalogSearchParams({ sort: "precio-asc" }).sort).toEqual({
      key: "precio-asc",
      column: "price",
      ascending: true,
    });
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pnpm vitest run src/lib/store/__tests__/catalog-search-params.test.ts`
Expected: FAIL — el módulo `../catalog-search-params` no existe todavía.

- [ ] **Step 3: Implementación mínima**

```ts
import { resolveSort } from "./sort";

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export type CatalogSearchParams = {
  tallas: string[];
  colores: string[];
  minPrice: number | undefined;
  maxPrice: number | undefined;
  sort: ReturnType<typeof resolveSort>;
  q: string;
};

export function parseCatalogSearchParams(
  search: Record<string, string | string[] | undefined>,
): CatalogSearchParams {
  const tallas = toArray(search.talla);
  const colores = toArray(search.color);

  const minPriceStr = firstValue(search.minPrice);
  const maxPriceStr = firstValue(search.maxPrice);
  const minPriceNum = minPriceStr ? Number(minPriceStr) : undefined;
  const maxPriceNum = maxPriceStr ? Number(maxPriceStr) : undefined;

  const sort = resolveSort(firstValue(search.sort));
  const q = (firstValue(search.q) ?? "").trim();

  return {
    tallas,
    colores,
    minPrice: minPriceNum !== undefined && Number.isNaN(minPriceNum) ? undefined : minPriceNum,
    maxPrice: maxPriceNum !== undefined && Number.isNaN(maxPriceNum) ? undefined : maxPriceNum,
    sort,
    q,
  };
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pnpm vitest run src/lib/store/__tests__/catalog-search-params.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/catalog-search-params.ts src/lib/store/__tests__/catalog-search-params.test.ts
git commit -m "feat: parseCatalogSearchParams para filtros de catalogo compartidos"
```

---

### Task 2: `fetchCatalogProducts` (capa de datos compartida)

**Files:**
- Create: `src/lib/store/fetch-catalog.ts`

**Interfaces:**
- Consumes: `getVariantOptions` de `src/lib/store/variants.ts` (ya existe, no se modifica). `ProductCardData` de `src/components/store/product-card.tsx` (ya existe: `{ id, slug, name, price, compareAtPrice, imageUrl, tallas }`). `Database` de `src/lib/supabase/database.types.ts`. `createClient` de `src/lib/supabase/server.ts` — se usa solo para el tipo `Awaited<ReturnType<typeof createClient>>`, no se invoca desde este archivo (la conexión la crea cada página y se la pasa como parámetro).
- Produces:
  ```ts
  export type FetchCatalogParams = {
    categoryId?: string;
    searchQuery?: string;
    minPrice?: number;
    maxPrice?: number;
    tallas: string[];
    colores: string[];
    sort: { key: string; column: "is_featured" | "price" | "created_at"; ascending: boolean };
    userId: string | null;
  };

  export type CatalogResult = {
    productos: ProductCardData[];
    tallas: string[];
    colores: string[];
    favoritosSet: Set<string>;
  };

  export async function fetchCatalogProducts(
    supabase: Awaited<ReturnType<typeof createClient>>,
    params: FetchCatalogParams,
  ): Promise<CatalogResult>;
  ```
  Las Tasks 4, 5 y 6 llaman a esta función tal cual, pasándole el resultado de `parseCatalogSearchParams` (Task 1) más `categoryId`/`searchQuery`/`userId` según la página.

No hay test dedicado para esta tarea (integración con Supabase — mismo criterio ya usado en el proyecto para código que solo compone queries reales, ver Testing del spec `docs/superpowers/specs/2026-08-12-fase-d3-buscador-catalogo-design.md`).

- [ ] **Step 1: Crear el archivo con la implementación completa**

```ts
import type { createClient } from "@/lib/supabase/server";
import { getVariantOptions } from "./variants";
import type { ProductCardData } from "@/components/store/product-card";

export type FetchCatalogParams = {
  categoryId?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  tallas: string[];
  colores: string[];
  sort: { key: string; column: "is_featured" | "price" | "created_at"; ascending: boolean };
  userId: string | null;
};

export type CatalogResult = {
  productos: ProductCardData[];
  tallas: string[];
  colores: string[];
  favoritosSet: Set<string>;
};

export async function fetchCatalogProducts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: FetchCatalogParams,
): Promise<CatalogResult> {
  const {
    categoryId,
    searchQuery,
    minPrice,
    maxPrice,
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    sort,
    userId,
  } = params;

  let query = supabase
    .from("products")
    .select("id, name, slug, price, compare_at_price")
    .eq("is_active", true);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  if (searchQuery) {
    query = query.ilike("name", `%${searchQuery}%`);
  }
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
  const { data: variantes } =
    productIds.length > 0
      ? await supabase
          .from("product_variants")
          .select("product_id, talla, color")
          .in("product_id", productIds)
      : { data: [] as { product_id: string; talla: string | null; color: string | null }[] };

  const { tallas, colores } = getVariantOptions(
    (variantes ?? []).map((v) => ({
      id: "",
      talla: v.talla,
      color: v.color,
      sku: "",
      stock: 0,
      priceOverride: null,
    })),
  );

  let productosFiltrados = productosBase ?? [];
  if (tallasSeleccionadas.length > 0 || coloresSeleccionadas.length > 0) {
    const idsConVariante = new Set(
      (variantes ?? [])
        .filter(
          (v) =>
            (tallasSeleccionadas.length === 0 ||
              (v.talla && tallasSeleccionadas.includes(v.talla))) &&
            (coloresSeleccionadas.length === 0 ||
              (v.color && coloresSeleccionadas.includes(v.color))),
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
    userId && idsFiltrados.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", userId)
          .in("product_id", idsFiltrados)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
  ]);

  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));
  const tallasPorProducto = new Map<string, string[]>();
  for (const variante of variantes ?? []) {
    if (!variante.talla || !idsFiltrados.includes(variante.product_id)) continue;
    const actuales = tallasPorProducto.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorProducto.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallasProducto] of tallasPorProducto) {
    tallasPorProducto.set(productId, [...tallasProducto].sort());
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

  return { productos, tallas, colores, favoritosSet };
}
```

Nota: esta función reproduce exactamente la secuencia de queries que hoy vive
en `src/app/(store)/categoria/[slug]/page.tsx` (líneas 50-144), generalizada
con `categoryId`/`searchQuery` opcionales. No cambia ningún nombre de campo
ni el orden de las operaciones.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores nuevos atribuibles a este archivo (puede haber errores
preexistentes no relacionados si el build completo no se ha corrido antes;
si `tsc --noEmit` falla solo por tipos de rutas de Next no generados aún,
ignóralo — se resuelve en la Task 6 cuando exista `/buscar` y se corra
`pnpm build`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/store/fetch-catalog.ts
git commit -m "feat: fetchCatalogProducts como capa de datos compartida del catalogo"
```

---

### Task 3: `CatalogFilterSidebar` y `ProductGrid` (componentes compartidos)

**Files:**
- Create: `src/components/store/catalog-filter-sidebar.tsx`
- Create: `src/components/store/product-grid.tsx`

**Interfaces:**
- Consumes: `SortKey` de `src/lib/store/sort.ts`. `ProductCard`, `ProductCardData` de `src/components/store/product-card.tsx` (ya existen, no se modifican).
- Produces:
  ```ts
  export function CatalogFilterSidebar(props: {
    minPrice: number | undefined;
    maxPrice: number | undefined;
    tallasSeleccionadas: string[];
    coloresSeleccionadas: string[];
    tallas: string[];
    colores: string[];
    sortKey: SortKey;
    q?: string;
  }): JSX.Element;

  export function ProductGrid(props: {
    productos: ProductCardData[];
    currentUserId: string | null;
    favoritosSet: Set<string>;
    emptyMessage: string;
  }): JSX.Element;
  ```
  Las Tasks 4, 5 y 6 renderizan ambos componentes con estas props exactas.

Sin tests dedicados — son componentes presentacionales extraídos verbatim
del markup que ya existe y funciona en `/categoria/[slug]`.

- [ ] **Step 1: Crear `catalog-filter-sidebar.tsx`**

```tsx
import type { SortKey } from "@/lib/store/sort";

export function CatalogFilterSidebar({
  minPrice,
  maxPrice,
  tallasSeleccionadas,
  coloresSeleccionadas,
  tallas,
  colores,
  sortKey,
  q,
}: {
  minPrice: number | undefined;
  maxPrice: number | undefined;
  tallasSeleccionadas: string[];
  coloresSeleccionadas: string[];
  tallas: string[];
  colores: string[];
  sortKey: SortKey;
  q?: string;
}) {
  return (
    <aside className="w-full shrink-0 md:w-56">
      <form method="get" className="flex flex-col gap-6">
        {q !== undefined && <input type="hidden" name="q" value={q} />}
        <div>
          <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Precio</h2>
          <div className="flex gap-2">
            <input
              type="number"
              name="minPrice"
              placeholder="Mín"
              defaultValue={minPrice}
              className="w-1/2 rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
            />
            <input
              type="number"
              name="maxPrice"
              placeholder="Máx"
              defaultValue={maxPrice}
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
                  className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-oro has-[:focus-visible]:ring-offset-2"
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
                  className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-oro has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="checkbox"
                    name="color"
                    value={color}
                    defaultChecked={coloresSeleccionadas.includes(color)}
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
            defaultValue={sortKey}
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
  );
}
```

- [ ] **Step 2: Crear `product-grid.tsx`**

```tsx
import { ProductCard, type ProductCardData } from "./product-card";

export function ProductGrid({
  productos,
  currentUserId,
  favoritosSet,
  emptyMessage,
}: {
  productos: ProductCardData[];
  currentUserId: string | null;
  favoritosSet: Set<string>;
  emptyMessage: string;
}) {
  if (productos.length === 0) {
    return <p className="text-brand-ciruela/70">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {productos.map((producto) => (
        <ProductCard
          key={producto.slug}
          product={producto}
          currentUserId={currentUserId}
          initialFavorite={favoritosSet.has(producto.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/store/catalog-filter-sidebar.tsx src/components/store/product-grid.tsx
git commit -m "feat: componentes compartidos CatalogFilterSidebar y ProductGrid"
```

---

### Task 4: Refactorizar `/categoria/[slug]` para usar la capa compartida

**Files:**
- Modify: `src/app/(store)/categoria/[slug]/page.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `parseCatalogSearchParams`/`CatalogSearchParams` (Task 1), `fetchCatalogProducts`/`FetchCatalogParams`/`CatalogResult` (Task 2), `CatalogFilterSidebar`/`ProductGrid` (Task 3). `Breadcrumbs` y `CategoryBanner` (ya existen, sin cambios).

**IMPORTANTE:** el comportamiento visible de esta página (qué filtros
aparecen, cómo se combinan, qué se muestra) no debe cambiar. Este es un
refactor de implementación puro.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CategoryBanner } from "@/components/store/category-banner";
import { CatalogFilterSidebar } from "@/components/store/catalog-filter-sidebar";
import { ProductGrid } from "@/components/store/product-grid";
import { parseCatalogSearchParams } from "@/lib/store/catalog-search-params";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";

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

  const {
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    minPrice,
    maxPrice,
    sort,
  } = parseCatalogSearchParams(search);

  const { productos, tallas, colores, favoritosSet } = await fetchCatalogProducts(supabase, {
    categoryId: categoria.id,
    minPrice,
    maxPrice,
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    sort,
    userId: user?.id ?? null,
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: categoria.name }]} />
      <CategoryBanner
        name={categoria.name}
        description={categoria.description}
        imageUrl={categoria.image_url}
      />

      <div className="flex flex-col gap-8 md:flex-row">
        <CatalogFilterSidebar
          minPrice={minPrice}
          maxPrice={maxPrice}
          tallasSeleccionadas={tallasSeleccionadas}
          coloresSeleccionadas={coloresSeleccionadas}
          tallas={tallas}
          colores={colores}
          sortKey={sort.key}
        />
        <div className="flex-1">
          <ProductGrid
            productos={productos}
            currentUserId={user?.id ?? null}
            favoritosSet={favoritosSet}
            emptyMessage="No hay productos que coincidan con los filtros seleccionados."
          />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verificar que compila y los tests siguen en verde**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos nuevos, 224+ tests en verde (los mismos de
antes — esta tarea no agrega tests nuevos, es refactor puro).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/categoria/[slug]/page.tsx"
git commit -m "refactor: categoria/[slug] usa fetchCatalogProducts y componentes compartidos"
```

---

### Task 5: Reescribir `/productos` con filtros

**Files:**
- Modify: `src/app/(store)/productos/page.tsx` (reescritura completa)

**Interfaces:**
- Consumes: igual que Task 4 (`parseCatalogSearchParams`, `fetchCatalogProducts`, `CatalogFilterSidebar`, `ProductGrid`).

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```tsx
import { createClient } from "@/lib/supabase/server";
import { CatalogFilterSidebar } from "@/components/store/catalog-filter-sidebar";
import { ProductGrid } from "@/components/store/product-grid";
import { parseCatalogSearchParams } from "@/lib/store/catalog-search-params";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";

export default async function ProductosPage({
  searchParams,
}: PageProps<"/productos">) {
  const search = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    minPrice,
    maxPrice,
    sort,
  } = parseCatalogSearchParams(search);

  const { productos, tallas, colores, favoritosSet } = await fetchCatalogProducts(supabase, {
    minPrice,
    maxPrice,
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    sort,
    userId: user?.id ?? null,
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Todos los productos</h1>
      <div className="flex flex-col gap-8 md:flex-row">
        <CatalogFilterSidebar
          minPrice={minPrice}
          maxPrice={maxPrice}
          tallasSeleccionadas={tallasSeleccionadas}
          coloresSeleccionadas={coloresSeleccionadas}
          tallas={tallas}
          colores={colores}
          sortKey={sort.key}
        />
        <div className="flex-1">
          <ProductGrid
            productos={productos}
            currentUserId={user?.id ?? null}
            favoritosSet={favoritosSet}
            emptyMessage="Todavía no hay productos disponibles."
          />
        </div>
      </div>
    </main>
  );
}
```

Nota de comportamiento (esperada, no es un bug): antes `/productos` ordenaba
solo por `created_at` descendente. Con el orden compartido, el default pasa
a ser "Destacados" (`is_featured` descendente, luego `created_at`
descendente) — mismo default que `/categoria/[slug]` ya usa hoy. Es
consecuencia directa de unificar el criterio de orden entre las tres
páginas, decidido en el spec de esta fase.

- [ ] **Step 2: Verificar que compila y los tests siguen en verde**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos nuevos, tests en verde.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/productos/page.tsx"
git commit -m "feat: filtros de precio/talla/color/orden en /productos"
```

---

### Task 6: Página `/buscar` + enlace del header

**Files:**
- Create: `src/app/(store)/buscar/page.tsx`
- Modify: `src/components/layout/site-header.tsx:79`

**Interfaces:**
- Consumes: igual que Task 4/5, más `ProductCardData` (tipo, de `src/components/store/product-card.tsx`) para las variables locales de estado sin resultados.

- [ ] **Step 1: Crear `src/app/(store)/buscar/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { CatalogFilterSidebar } from "@/components/store/catalog-filter-sidebar";
import { ProductGrid } from "@/components/store/product-grid";
import type { ProductCardData } from "@/components/store/product-card";
import { parseCatalogSearchParams } from "@/lib/store/catalog-search-params";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";

export default async function BuscarPage({
  searchParams,
}: PageProps<"/buscar">) {
  const search = await searchParams;
  const {
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    minPrice,
    maxPrice,
    sort,
    q,
  } = parseCatalogSearchParams(search);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let productos: ProductCardData[] = [];
  let tallas: string[] = [];
  let colores: string[] = [];
  let favoritosSet = new Set<string>();

  if (q) {
    const resultado = await fetchCatalogProducts(supabase, {
      searchQuery: q,
      minPrice,
      maxPrice,
      tallas: tallasSeleccionadas,
      colores: coloresSeleccionadas,
      sort,
      userId: user?.id ?? null,
    });
    productos = resultado.productos;
    tallas = resultado.tallas;
    colores = resultado.colores;
    favoritosSet = resultado.favoritosSet;
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Buscar productos</h1>
      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar productos"
          className="w-full rounded-md border border-brand-rosa-claro px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-oro"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-brand-rosa px-4 py-2 text-sm text-brand-crema hover:bg-brand-rosa/90"
        >
          Buscar
        </button>
      </form>

      {!q ? (
        <p className="text-brand-ciruela/70">Escribe algo para buscar.</p>
      ) : (
        <div className="flex flex-col gap-8 md:flex-row">
          <CatalogFilterSidebar
            minPrice={minPrice}
            maxPrice={maxPrice}
            tallasSeleccionadas={tallasSeleccionadas}
            coloresSeleccionadas={coloresSeleccionadas}
            tallas={tallas}
            colores={colores}
            sortKey={sort.key}
            q={q}
          />
          <div className="flex-1">
            <ProductGrid
              productos={productos}
              currentUserId={user?.id ?? null}
              favoritosSet={favoritosSet}
              emptyMessage={`No encontramos productos que coincidan con «${q}».`}
            />
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Cambiar el enlace del header**

En `src/components/layout/site-header.tsx`, el `<Link>` del ícono de lupa
(actualmente línea 79, `href="/productos"`) pasa a:

```tsx
<Link
  href="/buscar"
  aria-label="Buscar productos"
  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
>
  <Search className="h-5 w-5" />
</Link>
```

Solo cambia el valor de `href` (`"/productos"` → `"/buscar"`); el resto del
`<Link>` (aria-label, className, ícono) queda igual.

- [ ] **Step 3: Verificar build completo**

Run: `pnpm build`
Expected: build exitoso, incluida la nueva ruta `/buscar` en la lista de
rutas generadas. (Este es el primer punto del plan donde `PageProps<"/buscar">`
y `PageProps<"/productos">` se resuelven correctamente vía el typegen de
Next.js — si `tsc --noEmit` se corrió antes en Tasks 2/4/5 y se quejó de
esos tipos, este build los resuelve).

- [ ] **Step 4: Correr lint y tests**

Run: `pnpm lint && pnpm test`
Expected: 0 errores de lint (pueden persistir los 3 warnings preexistentes
de `react-hooks/incompatible-library`, no relacionados). Tests en verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(store)/buscar/page.tsx" src/components/layout/site-header.tsx
git commit -m "feat: pagina /buscar y enlace del header al buscador"
```

---

### Task 7: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-6.

- [ ] **Step 1: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 y arranca uno limpio con `pnpm dev` en segundo
plano si hace falta.

- [ ] **Step 2: Verificar `/buscar` sin texto**

```bash
curl -s http://localhost:3000/buscar | grep -o "Escribe algo para buscar"
```
Expected: imprime la coincidencia.

- [ ] **Step 3: Verificar `/buscar` con texto**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/buscar?q=a"
```
Expected: `200`.

- [ ] **Step 4: Verificar que `/productos` ahora expone el formulario de filtros**

```bash
curl -s http://localhost:3000/productos | grep -o "Aplicar filtros"
```
Expected: imprime la coincidencia (confirma que `CatalogFilterSidebar` se
renderiza en `/productos`).

- [ ] **Step 5: Verificar que el header enlaza a `/buscar`**

```bash
curl -s http://localhost:3000/ | grep -o 'href="/buscar"'
```
Expected: imprime la coincidencia.

- [ ] **Step 6: Verificar que `/categoria/[slug]` sigue respondiendo**

Toma el slug de cualquier categoría activa existente (consulta la tabla
`categories` si hace falta) y confirma `200`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/categoria/<slug-real>"
```

- [ ] **Step 7: Detener el servidor**

- [ ] **Step 8: Nota para el reporte final**

Deja anotado que la verificación visual completa (buscar un producto real
por nombre parcial, combinar la búsqueda con un filtro de talla, confirmar
que `/productos` y `/categoria/[slug]` se ven igual que antes del
refactor) no se hizo de forma interactiva en navegador — recomienda al
usuario ese recorrido manual.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 7, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
