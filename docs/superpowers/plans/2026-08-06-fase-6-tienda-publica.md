# MeryLay Boutique — Fase 6 (Tienda pública) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home dinámico (destacados + categorías), listado de categoría con
filtros/orden, y detalle de producto (galería + selector de variante) para
la tienda pública de MeryLay Boutique.

**Architecture:** Server Components por defecto para todas las páginas
públicas nuevas; Client Components solo para la galería de imágenes y el
selector de variante. Filtros de categoría vía `<form method="get">` nativo
(sin JS). Lógica pura extraída a `src/lib/` para TDD.

**Tech Stack:** Next.js 16 (App Router, `src/`), TypeScript estricto,
`@supabase/ssr`, Vitest.

## Global Constraints

- Idioma: todo en español (UI, mensajes).
- TypeScript estricto; Server Components por defecto.
- RLS ya garantiza que solo se ven categorías/productos con `is_active = true`
  para el público (Fase 2) — las queries de este módulo no necesitan filtrar
  `is_active` en el cliente además del filtro explícito en la query, pero se
  incluye igual por claridad y para no depender solo de RLS.
- Precios se muestran con `formatPrice()`, nunca floats sin formatear.
- El botón "Agregar al carrito" no persiste nada en esta fase (ver spec).
- Commits atómicos en español al cerrar cada tarea funcional.

## Referencia del spec

Este plan implementa `docs/superpowers/specs/2026-08-06-fase-6-tienda-publica-design.md`.

---

## Mapa de archivos

- `src/lib/format.ts`
- `src/lib/store/variants.ts`
- `src/lib/store/sort.ts`
- `src/components/store/product-card.tsx`
- `src/components/layout/site-header.tsx` (modify)
- `src/app/(store)/page.tsx` (modify), elimina
  `src/app/(store)/__tests__/page.test.tsx`
- `src/app/(store)/categoria/[slug]/page.tsx`
- `src/app/(store)/producto/[slug]/{page.tsx, product-gallery.tsx,
  product-variant-selector.tsx}`

---

## Task 1: `formatPrice()` — lógica pura (TDD)

**Files:**
- Create: `src/lib/__tests__/format.test.ts`
- Create: `src/lib/format.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `formatPrice(value: number): string` — usado por Task 4
  (`ProductCard`) y Task 10 (detalle de producto).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { formatPrice } from "../format";

describe("formatPrice", () => {
  it("formatea con separador de miles y sin decimales", () => {
    expect(formatPrice(89900)).toContain("89.900");
  });

  it("formatea cero correctamente", () => {
    expect(formatPrice(0)).toContain("0");
  });

  it("no incluye decimales", () => {
    expect(formatPrice(1500)).not.toMatch(/,\d{2}$/);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test format
```

Expected: FAIL — `format` no existe todavía en `src/lib`.

- [ ] **Step 3: Implementar**

```ts
export function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test format
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/__tests__/format.test.ts
git commit -m "feat: agrega formatPrice para mostrar precios en pesos colombianos"
```

---

## Task 2: Opciones y coincidencia de variantes (TDD)

**Files:**
- Create: `src/lib/store/__tests__/variants.test.ts`
- Create: `src/lib/store/variants.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `VariantOption`, `getVariantOptions()`, `findMatchingVariant()`
  — usados por Task 7 (categoría) y Task 9 (selector de variante).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { getVariantOptions, findMatchingVariant } from "../variants";

describe("getVariantOptions", () => {
  it("extrae tallas y colores unicos y ordenados", () => {
    const variants = [
      { talla: "L", color: "Rosa", sku: "1", stock: 1, priceOverride: null },
      { talla: "M", color: "Rosa", sku: "2", stock: 1, priceOverride: null },
      { talla: "M", color: "Azul", sku: "3", stock: 1, priceOverride: null },
    ];
    expect(getVariantOptions(variants)).toEqual({
      tallas: ["L", "M"],
      colores: ["Azul", "Rosa"],
    });
  });

  it("ignora variantes sin talla o sin color", () => {
    const variants = [
      { talla: "M", color: null, sku: "1", stock: 1, priceOverride: null },
      { talla: null, color: "Rosa", sku: "2", stock: 1, priceOverride: null },
    ];
    expect(getVariantOptions(variants)).toEqual({ tallas: ["M"], colores: ["Rosa"] });
  });
});

describe("findMatchingVariant", () => {
  const variants = [
    { talla: "M", color: "Rosa", sku: "1", stock: 3, priceOverride: null },
    { talla: "L", color: "Azul", sku: "2", stock: 5, priceOverride: null },
  ];

  it("encuentra la variante exacta", () => {
    expect(findMatchingVariant(variants, "M", "Rosa")?.sku).toBe("1");
  });

  it("devuelve null si no hay coincidencia", () => {
    expect(findMatchingVariant(variants, "M", "Azul")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test src/lib/store/__tests__/variants
```

Expected: FAIL — `variants` no existe todavía en `src/lib/store`.

- [ ] **Step 3: Implementar**

```ts
export type VariantOption = {
  talla: string | null;
  color: string | null;
  sku: string;
  stock: number;
  priceOverride: number | null;
};

export function getVariantOptions(variants: VariantOption[]) {
  const tallas = Array.from(
    new Set(variants.map((v) => v.talla).filter((t): t is string => Boolean(t))),
  ).sort();
  const colores = Array.from(
    new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c))),
  ).sort();
  return { tallas, colores };
}

export function findMatchingVariant(
  variants: VariantOption[],
  talla: string | null,
  color: string | null,
) {
  return (
    variants.find(
      (v) => (v.talla || null) === (talla || null) && (v.color || null) === (color || null),
    ) ?? null
  );
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test src/lib/store/__tests__/variants
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/variants.ts src/lib/store/__tests__/variants.test.ts
git commit -m "feat: agrega getVariantOptions y findMatchingVariant"
```

---

## Task 3: `resolveSort()` — lógica pura (TDD)

**Files:**
- Create: `src/lib/store/__tests__/sort.test.ts`
- Create: `src/lib/store/sort.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `SortKey`, `resolveSort()` — usado por Task 7 (página de
  categoría).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { resolveSort } from "../sort";

describe("resolveSort", () => {
  it("resuelve precio-asc", () => {
    expect(resolveSort("precio-asc")).toEqual({
      key: "precio-asc",
      column: "price",
      ascending: true,
    });
  });

  it("resuelve precio-desc", () => {
    expect(resolveSort("precio-desc")).toEqual({
      key: "precio-desc",
      column: "price",
      ascending: false,
    });
  });

  it("resuelve recientes", () => {
    expect(resolveSort("recientes")).toEqual({
      key: "recientes",
      column: "created_at",
      ascending: false,
    });
  });

  it("usa destacados por defecto ante un valor desconocido", () => {
    expect(resolveSort("algo-invalido")).toEqual({
      key: "destacados",
      column: "is_featured",
      ascending: false,
    });
  });

  it("usa destacados por defecto si no se pasa valor", () => {
    expect(resolveSort(undefined)).toEqual({
      key: "destacados",
      column: "is_featured",
      ascending: false,
    });
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test src/lib/store/__tests__/sort
```

Expected: FAIL — `sort` no existe todavía en `src/lib/store`.

- [ ] **Step 3: Implementar**

```ts
export type SortKey = "destacados" | "precio-asc" | "precio-desc" | "recientes";

export function resolveSort(value: string | undefined): {
  key: SortKey;
  column: "is_featured" | "price" | "created_at";
  ascending: boolean;
} {
  switch (value) {
    case "precio-asc":
      return { key: "precio-asc", column: "price", ascending: true };
    case "precio-desc":
      return { key: "precio-desc", column: "price", ascending: false };
    case "recientes":
      return { key: "recientes", column: "created_at", ascending: false };
    default:
      return { key: "destacados", column: "is_featured", ascending: false };
  }
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test src/lib/store/__tests__/sort
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/sort.ts src/lib/store/__tests__/sort.test.ts
git commit -m "feat: agrega resolveSort para el orden de listados de categoria"
```

---

## Task 4: `ProductCard` — componente compartido

**Files:**
- Create: `src/components/store/product-card.tsx`

**Interfaces:**
- Consumes: `formatPrice()` (Task 1).
- Produces: `<ProductCard />`, tipo `ProductCardData` — usados por Task 6
  (home) y Task 7 (categoría).

- [ ] **Step 1: Implementar**

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

export type ProductCardData = {
  slug: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <Link
      href={`/producto/${product.slug}`}
      className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-3 transition hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-brand-rosa-claro">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-brand-ciruela/50">
            Sin imagen
          </div>
        )}
      </div>
      <span className="font-body text-sm text-brand-ciruela">{product.name}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-brand-rosa">{formatPrice(product.price)}</span>
        {product.compareAtPrice && product.compareAtPrice > product.price && (
          <span className="text-xs text-brand-ciruela/50 line-through">
            {formatPrice(product.compareAtPrice)}
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/store/product-card.tsx
git commit -m "feat: agrega ProductCard compartido para home y categoria"
```

---

## Task 5: `SiteHeader` con navegación de categorías

**Files:**
- Modify: `src/components/layout/site-header.tsx`

**Interfaces:**
- Consumes: `createClient()` de `src/lib/supabase/server.ts`,
  `getCurrentProfile()` (Fase 3), `logout()` (Fase 3).
- Produces: header con nav de categorías, usado globalmente vía
  `src/app/layout.tsx` (sin cambios ahí).

- [ ] **Step 1: Actualizar el componente**

```tsx
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { logout } from "@/lib/auth/logout-action";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const supabase = await createClient();
  const [currentUser, { data: categorias }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("categories")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <header className="border-b border-brand-rosa-claro bg-brand-crema/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/isotipo-placeholder.svg"
              alt="MeryLay Boutique"
              width={40}
              height={40}
            />
            <span className="font-script text-3xl text-brand-rosa">
              MeryLay Boutique
            </span>
          </Link>
          <div className="flex items-center gap-4 font-body text-sm text-brand-ciruela">
            <span className="hidden sm:inline">Inspiración Femenina</span>
            {currentUser ? (
              <div className="flex items-center gap-3">
                <span>{currentUser.profile.username}</span>
                <form action={logout}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
                  >
                    Cerrar sesión
                  </Button>
                </form>
              </div>
            ) : (
              <Link href="/login">
                <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
                  Iniciar sesión
                </Button>
              </Link>
            )}
          </div>
        </div>
        {categorias && categorias.length > 0 && (
          <nav className="flex gap-4 text-sm text-brand-ciruela">
            {categorias.map((categoria) => (
              <Link
                key={categoria.id}
                href={`/categoria/${categoria.slug}`}
                className="hover:text-brand-rosa"
              >
                {categoria.name}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/site-header.tsx
git commit -m "feat: header agrega navegacion de categorias activas"
```

---

## Task 6: Home dinámico (destacados + categorías)

**Files:**
- Modify: `src/app/(store)/page.tsx`
- Delete: `src/app/(store)/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `<ProductCard />`/`ProductCardData` (Task 4), `createClient()`
  de `src/lib/supabase/server.ts`.
- Produces: home pública dinámica en `/`.

- [ ] **Step 1: Eliminar el smoke test obsoleto**

```bash
rm "src/app/(store)/__tests__/page.test.tsx"
```

Ver spec: la home pasa a ser un Server Component async con datos reales de
Supabase, no renderizable con Testing Library sin un servidor corriendo
(misma limitación aceptada para las páginas de admin en la Fase 5).

- [ ] **Step 2: Reescribir la página**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: destacados } = await supabase
    .from("products")
    .select("id, name, slug, price, compare_at_price")
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(8);

  const destacadoIds = (destacados ?? []).map((p) => p.id);
  const { data: imagenesDestacados } =
    destacadoIds.length > 0
      ? await supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", destacadoIds)
          .eq("is_primary", true)
      : { data: [] };

  const imagenPorProducto = new Map(
    (imagenesDestacados ?? []).map((img) => [img.product_id, img.url]),
  );

  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order");

  const productosDestacados: ProductCardData[] = (destacados ?? []).map((p) => ({
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <p className="font-script text-2xl text-brand-oro">Bienvenida a</p>
        <h1 className="font-heading text-5xl font-semibold text-brand-ciruela">
          MeryLay Boutique
        </h1>
        <p className="max-w-xl font-body text-lg text-brand-ciruela/80">
          Pijamas y ropa femenina pensadas para ti. Elegancia, comodidad y un
          toque romántico en cada prenda.
        </p>
      </section>

      {productosDestacados.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl text-brand-ciruela">Destacados</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {productosDestacados.map((producto) => (
              <ProductCard key={producto.slug} product={producto} />
            ))}
          </div>
        </section>
      )}

      {categorias && categorias.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl text-brand-ciruela">Categorías</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {categorias.map((categoria) => (
              <Link
                key={categoria.id}
                href={`/categoria/${categoria.slug}`}
                className="flex items-center justify-center rounded-lg border border-brand-rosa-claro bg-white px-4 py-8 text-center font-heading text-brand-ciruela transition hover:border-brand-rosa"
              >
                {categoria.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 4: Commit**

```bash
git add -A "src/app/(store)"
git commit -m "feat: home dinamico con destacados y categorias, elimina smoke test obsoleto"
```

---

## Task 7: Página de categoría (listado, filtros y orden)

**Files:**
- Create: `src/app/(store)/categoria/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getVariantOptions()` (Task 2), `resolveSort()` (Task 3),
  `<ProductCard />`/`ProductCardData` (Task 4), `createClient()` de
  `src/lib/supabase/server.ts`.
- Produces: ruta `/categoria/[slug]`.

- [ ] **Step 1: Implementar**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";
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

  const { data: categoria } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

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
  const { data: imagenes } =
    idsFiltrados.length > 0
      ? await supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", idsFiltrados)
          .eq("is_primary", true)
      : { data: [] };
  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));

  const productos: ProductCardData[] = productosFiltrados.map((p) => ({
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">{categoria.name}</h1>

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
                <div className="flex flex-col gap-1">
                  {tallas.map((talla) => (
                    <label
                      key={talla}
                      className="flex items-center gap-2 text-sm text-brand-ciruela"
                    >
                      <input
                        type="checkbox"
                        name="talla"
                        value={talla}
                        defaultChecked={tallasSeleccionadas.includes(talla)}
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
                <div className="flex flex-col gap-1">
                  {colores.map((color) => (
                    <label
                      key={color}
                      className="flex items-center gap-2 text-sm text-brand-ciruela"
                    >
                      <input
                        type="checkbox"
                        name="color"
                        value={color}
                        defaultChecked={coloresSeleccionados.includes(color)}
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
                <ProductCard key={producto.slug} product={producto} />
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

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/categoria"
git commit -m "feat: pagina de categoria con filtros de precio/talla/color y orden"
```

---

## Task 8: Galería de imágenes de producto

**Files:**
- Create: `src/app/(store)/producto/[slug]/product-gallery.tsx`

**Interfaces:**
- Consumes: nada nuevo (usa `next/image`).
- Produces: `<ProductGallery />` — usado por Task 10.

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";

export function ProductGallery({
  images,
  productName,
}: {
  images: { url: string; alt: string | null }[];
  productName: string;
}) {
  const [selected, setSelected] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-brand-rosa-claro text-brand-ciruela/50">
        Sin imagen
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-brand-rosa-claro">
        <Image
          src={images[selected].url}
          alt={images[selected].alt ?? productName}
          fill
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setSelected(index)}
              className={`relative h-16 w-16 overflow-hidden rounded-md border ${
                index === selected ? "border-brand-rosa" : "border-brand-rosa-claro"
              }`}
            >
              <Image
                src={image.url}
                alt={image.alt ?? productName}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/producto/[slug]/product-gallery.tsx"
git commit -m "feat: agrega galeria de imagenes del detalle de producto"
```

---

## Task 9: Selector de variante (talla/color, stock, botón placeholder)

**Files:**
- Create: `src/app/(store)/producto/[slug]/product-variant-selector.tsx`

**Interfaces:**
- Consumes: `getVariantOptions()`, `findMatchingVariant()`, `VariantOption`
  (Task 2), `Button` de `@/components/ui/button`.
- Produces: `<ProductVariantSelector />` — usado por Task 10.

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getVariantOptions,
  findMatchingVariant,
  type VariantOption,
} from "@/lib/store/variants";

export function ProductVariantSelector({
  variants,
  baseStock,
}: {
  variants: VariantOption[];
  baseStock: number;
}) {
  const { tallas, colores } = useMemo(() => getVariantOptions(variants), [variants]);
  const [talla, setTalla] = useState<string | null>(variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(variants[0]?.color ?? null);
  const [message, setMessage] = useState<string | null>(null);

  const hasVariants = variants.length > 0;
  const variantSeleccionada = hasVariants
    ? findMatchingVariant(variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : baseStock;
  const agotado = stockDisponible <= 0;

  return (
    <div className="flex flex-col gap-4">
      {tallas.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Talla</label>
          <select
            value={talla ?? ""}
            onChange={(e) => setTalla(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {tallas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      {colores.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Color</label>
          <select
            value={color ?? ""}
            onChange={(e) => setColor(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {colores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-sm text-brand-ciruela/70">
        {agotado ? "Agotado" : `Stock disponible: ${stockDisponible}`}
      </p>

      <Button
        type="button"
        disabled={agotado}
        onClick={() =>
          setMessage("Disponible pronto: el carrito se habilita en la próxima fase.")
        }
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
      >
        Agregar al carrito
      </Button>
      {message && <p className="text-sm text-brand-oro">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/producto/[slug]/product-variant-selector.tsx"
git commit -m "feat: agrega selector de variante con stock y boton placeholder de carrito"
```

---

## Task 10: Página de detalle de producto

**Files:**
- Create: `src/app/(store)/producto/[slug]/page.tsx`

**Interfaces:**
- Consumes: `<ProductGallery />` (Task 8), `<ProductVariantSelector />`
  (Task 9), `formatPrice()` (Task 1), `createClient()` de
  `src/lib/supabase/server.ts`.
- Produces: ruta `/producto/[slug]`.

- [ ] **Step 1: Implementar**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";

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

  const [{ data: imagenes }, { data: variantes }] = await Promise.all([
    supabase
      .from("product_images")
      .select("url, alt")
      .eq("product_id", producto.id)
      .order("sort_order"),
    supabase
      .from("product_variants")
      .select("talla, color, sku, stock, price_override")
      .eq("product_id", producto.id),
  ]);

  const variantesMapeadas = (variantes ?? []).map((v) => ({
    talla: v.talla,
    color: v.color,
    sku: v.sku,
    stock: v.stock,
    priceOverride: v.price_override,
  }));

  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2">
      <ProductGallery images={imagenes ?? []} productName={producto.name} />

      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl text-brand-ciruela">{producto.name}</h1>
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
        <ProductVariantSelector variants={variantesMapeadas} baseStock={producto.stock} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/producto/[slug]/page.tsx"
git commit -m "feat: pagina de detalle de producto con galeria y selector de variante"
```

---

## Task 11: Verificación manual end-to-end

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: Tasks 1–10 y los datos ya existentes en el proyecto Supabase
  real (categorías/productos de la Fase 5, o datos de prueba nuevos).

- [ ] **Step 1: Levantar el servidor**

```bash
pnpm dev
```

- [ ] **Step 2: Crear datos de prueba (si no existen)**

Como `adminsu`, crear en `/admin`: una categoría "Pijamas", un producto
destacado (`is_featured = true`) con 2 variantes (talla/color) y 2 imágenes,
uno de cuyos variantes tenga stock 0.

- [ ] **Step 3: Verificar el home**

Ir a `/`. Confirmar que el producto aparece en "Destacados" y la categoría
"Pijamas" aparece en la grilla de categorías, con el precio formateado
correctamente (ej. "$99.900").

- [ ] **Step 4: Verificar el header**

Confirmar que el link "Pijamas" aparece en la navegación del header y lleva
a `/categoria/pijamas`.

- [ ] **Step 5: Verificar filtros de categoría**

En `/categoria/pijamas`, confirmar que los checkboxes de talla/color
muestran solo las tallas/colores reales del producto creado. Filtrar por una
talla y confirmar que el listado se actualiza (vía query params en la URL).
Cambiar el orden a "Precio: mayor a menor" y confirmar el cambio.

- [ ] **Step 6: Verificar el detalle de producto**

Ir a `/producto/<slug>`. Confirmar la galería (cambiar de imagen con las
miniaturas), que el selector de talla/color muestra el stock correcto al
cambiar de variante, que la variante con stock 0 deshabilita el botón
"Agregar al carrito" y muestra "Agotado", y que en una variante con stock
el botón muestra el mensaje "Disponible pronto" al hacer click.

- [ ] **Step 7: Detener el servidor**

```bash
# Ctrl+C o kill del proceso de pnpm dev
```

No requiere commit (verificación manual).

---

## Task 12: Verificación final y cierre de Fase 6

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: Tasks 1–11.

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Tests**

```bash
pnpm test
```

Expected: PASS (incluye los 12 tests nuevos de esta fase: 3 de `formatPrice`,
4 de `getVariantOptions`/`findMatchingVariant`, 5 de `resolveSort`, más los
38 existentes de fases anteriores menos el smoke test de home eliminado en
Task 6 → total esperado 49).

- [ ] **Step 4: Commit de cierre de fase**

```bash
git add -A
git commit -m "chore: cierra Fase 6 (tienda publica) - build, lint y tests en verde" --allow-empty
```
