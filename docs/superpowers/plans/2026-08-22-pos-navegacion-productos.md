# Rediseño POS — Navegación de productos (sub-proyecto 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el buscador de texto plano del POS por un panel de
navegación real: píldoras de categoría, buscador en vivo, y una grilla
de tarjetas de producto con imagen y selección de variante inline.

**Architecture:** Una nueva server action combinada
(`buscarProductosPos`) reemplaza `searchProducts`, trayendo imagen
principal y permitiendo filtrar por categoría además de texto — mismo
patrón de datos que ya usa `fetchCatalogProducts` en la tienda. Dos
componentes nuevos (`ProductBrowser`, `ProductCardPos`) reemplazan el
panel de búsqueda dentro de `venta-items-editor.tsx`, compartido por la
terminal y la edición de ventas.

**Tech Stack:** Next.js App Router (Server + Client Components),
TypeScript, Supabase, Tailwind CSS, lucide-react, Vitest + Testing
Library.

**Spec:** `docs/superpowers/specs/2026-08-22-pos-navegacion-productos-design.md`

## Global Constraints

- Píldoras de categoría: solo categorías activas de nivel superior
  (`parent_id is null`), ordenadas por `sort_order`, más "Todos".
- Filtro por categoría: match exacto por `category_id`, sin recursar
  en subcategorías.
- Sin botón de favorito en las tarjetas del POS.
- Buscador en vivo, debounce de 300ms, sin botón "Buscar" ni Enter.
- Selección de variante: un clic en "Agregar" en un producto con
  tallas/colores despliega chips dentro de la misma tarjeta; un
  segundo clic (o clic en "Confirmar") agrega. Sin variantes, un solo
  clic agrega directo.
- Botón "Scanner": deshabilitado, `title="Próximamente"`.
- Límite de 60 productos por consulta, sin paginación.
- El panel nuevo reemplaza la búsqueda tanto en la terminal (`/pos`)
  como en `/pos/venta/[id]/editar` — ambos comparten
  `venta-items-editor.tsx`, sin tocar esos otros archivos directamente.
- Íconos: solo `lucide-react`, verificados contra la versión instalada
  antes de usarlos (`ScanBarcode` ya verificado como existente en
  `lucide-react@1.28.0` para este plan).
- `SidebarSection.items[].icon` no aplica a este plan (no se toca el
  sidebar), pero el mismo criterio de "nunca pasar una referencia a
  componente sin invocar de un Server Component a un Client Component"
  sigue vigente en todo el POS — ninguna tarea de este plan introduce
  ese patrón, pero conviene tenerlo presente si se agregan íconos en
  componentes nuevos.

---

### Task 1: `product-browser-action.ts` (búsqueda combinada, categorías, umbral de stock)

**Files:**
- Create: `src/app/pos/product-browser-action.ts`
- Test: `src/app/pos/__tests__/product-browser-action.test.ts`

**Interfaces:**
- Consumes: `precioEfectivo` (`@/lib/store/discount`), `VariantOption`
  (`@/lib/store/variants`), `obtenerUmbralStockBajo`
  (`@/lib/admin/low-stock`, ya existente).
- Produces: `type PosProductoResult = { id: string; name: string; sku:
  string; price: number; stock: number; imageUrl: string | null;
  variants: VariantOption[] }`; `type PosCategoriaResult = { id:
  string; name: string }`; `buscarProductosPos(params: { query:
  string; categoryId: string | null }): Promise<PosProductoResult[]>`;
  `listarCategoriasPos(): Promise<PosCategoriaResult[]>`;
  `obtenerUmbralStockBajoPos(): Promise<number>` — usados por la
  Task 3 (`ProductBrowser`).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/app/pos/__tests__/product-browser-action.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/admin/low-stock", () => ({
  obtenerUmbralStockBajo: vi.fn(() => Promise.resolve(7)),
}));

function crearQueryBuilderMock(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = ["select", "eq", "or", "is", "order", "limit", "in"];
  for (const metodo of chain) {
    builder[metodo] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data, error: null });
  return builder;
}

function crearSupabaseMock(tablas: {
  products?: unknown[];
  product_variants?: unknown[];
  product_images?: unknown[];
  categories?: unknown[];
}) {
  const builders = {
    products: crearQueryBuilderMock(tablas.products ?? []),
    product_variants: crearQueryBuilderMock(tablas.product_variants ?? []),
    product_images: crearQueryBuilderMock(tablas.product_images ?? []),
    categories: crearQueryBuilderMock(tablas.categories ?? []),
  };
  const from = vi.fn((tabla: keyof typeof builders) => builders[tabla]);
  return { from, builders };
}

const PRODUCTO_BASE = {
  id: "prod-1",
  name: "Pijama Rosa",
  sku: "PIJ-001",
  price: 80000,
  promo_price: null,
  stock: 12,
  category_id: "cat-1",
};

describe("buscarProductosPos", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("query vacio y sin categoria: trae el catalogo activo, sin aplicar .or()", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(supabase.builders.products.or).not.toHaveBeenCalled();
    expect(supabase.builders.products.eq).toHaveBeenCalledWith("is_active", true);
    expect(supabase.builders.products.limit).toHaveBeenCalledWith(60);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("prod-1");
  });

  it("con categoria: filtra por category_id exacto", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "", categoryId: "cat-1" });

    expect(supabase.builders.products.eq).toHaveBeenCalledWith("category_id", "cat-1");
  });

  it("con texto: aplica .or() con nombre y sku", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "pijama", categoryId: null });

    expect(supabase.builders.products.or).toHaveBeenCalledWith(
      expect.stringContaining("name.ilike.%pijama%"),
    );
  });

  it("texto y categoria combinados: aplica ambos filtros a la vez", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "pijama", categoryId: "cat-1" });

    expect(supabase.builders.products.or).toHaveBeenCalled();
    expect(supabase.builders.products.eq).toHaveBeenCalledWith("category_id", "cat-1");
  });

  it("siempre filtra por is_active, sin importar los demas filtros", async () => {
    const supabase = crearSupabaseMock({ products: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "algo", categoryId: "cat-9" });

    expect(supabase.builders.products.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("mapea imagen principal y variantes al resultado", async () => {
    const supabase = crearSupabaseMock({
      products: [PRODUCTO_BASE],
      product_variants: [
        {
          id: "var-1",
          product_id: "prod-1",
          talla: "M",
          color: "Rosa",
          sku: "PIJ-001-M-ROS",
          stock: 5,
          price_override: null,
        },
      ],
      product_images: [{ product_id: "prod-1", url: "https://cdn.example.com/img.jpg" }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado[0].imageUrl).toBe("https://cdn.example.com/img.jpg");
    expect(resultado[0].variants).toEqual([
      {
        id: "var-1",
        talla: "M",
        color: "Rosa",
        sku: "PIJ-001-M-ROS",
        stock: 5,
        priceOverride: null,
      },
    ]);
  });

  it("sin productos, retorna [] sin consultar variantes ni imagenes", async () => {
    const supabase = crearSupabaseMock({ products: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalledWith("product_variants");
  });
});

describe("listarCategoriasPos", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filtra activas, sin parent_id, ordenadas por sort_order", async () => {
    const supabase = crearSupabaseMock({
      categories: [{ id: "cat-1", name: "Pijamas" }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { listarCategoriasPos } = await import("../product-browser-action");
    const resultado = await listarCategoriasPos();

    expect(supabase.builders.categories.eq).toHaveBeenCalledWith("is_active", true);
    expect(supabase.builders.categories.is).toHaveBeenCalledWith("parent_id", null);
    expect(supabase.builders.categories.order).toHaveBeenCalledWith("sort_order");
    expect(resultado).toEqual([{ id: "cat-1", name: "Pijamas" }]);
  });
});

describe("obtenerUmbralStockBajoPos", () => {
  it("retorna el umbral de obtenerUmbralStockBajo", async () => {
    const { obtenerUmbralStockBajoPos } = await import("../product-browser-action");
    const resultado = await obtenerUmbralStockBajoPos();

    expect(resultado).toBe(7);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm vitest run src/app/pos/__tests__/product-browser-action.test.ts`
Expected: FAIL — el módulo `../product-browser-action` no existe todavía.

- [ ] **Step 3: Implementar**

Crear `src/app/pos/product-browser-action.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { VariantOption } from "@/lib/store/variants";
import { precioEfectivo } from "@/lib/store/discount";
import { obtenerUmbralStockBajo } from "@/lib/admin/low-stock";

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
}): Promise<PosProductoResult[]> {
  const trimmed = params.query.trim().replace(/[%,()]/g, "");

  const supabase = await createClient();
  let productsQuery = supabase
    .from("products")
    .select("id, name, sku, price, promo_price, stock, category_id")
    .eq("is_active", true)
    .limit(60);

  if (trimmed) {
    productsQuery = productsQuery.or(`name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`);
  }
  if (params.categoryId) {
    productsQuery = productsQuery.eq("category_id", params.categoryId);
  }

  const { data: products } = await productsQuery;
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const [{ data: variants }, { data: images }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, product_id, talla, color, sku, stock, price_override")
      .in("product_id", productIds),
    supabase
      .from("product_images")
      .select("product_id, url")
      .in("product_id", productIds)
      .eq("is_primary", true),
  ]);

  const imagenPorProducto = new Map((images ?? []).map((img) => [img.product_id, img.url]));

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: precioEfectivo(p.price, p.promo_price),
    stock: p.stock,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
    variants: (variants ?? [])
      .filter((v) => v.product_id === p.id)
      .map((v) => ({
        id: v.id,
        talla: v.talla,
        color: v.color,
        sku: v.sku,
        stock: v.stock,
        priceOverride: v.price_override,
      })),
  }));
}

export type PosCategoriaResult = {
  id: string;
  name: string;
};

export async function listarCategoriasPos(): Promise<PosCategoriaResult[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .is("parent_id", null)
    .order("sort_order");

  return data ?? [];
}

export async function obtenerUmbralStockBajoPos(): Promise<number> {
  return obtenerUmbralStockBajo();
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm vitest run src/app/pos/__tests__/product-browser-action.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/product-browser-action.ts src/app/pos/__tests__/product-browser-action.test.ts
git commit -m "feat: server actions de navegacion de productos del POS (buscar, categorias, umbral)"
```

---

### Task 2: `ProductCardPos` (tarjeta con imagen y selector de variante inline)

**Files:**
- Create: `src/app/pos/product-card-pos.tsx`

**Interfaces:**
- Consumes: `PosProductoResult` (Task 1); `getVariantOptions`,
  `findMatchingVariant` (`@/lib/store/variants`, ya existentes);
  `LocalCartItem` (`@/lib/cart/local-cart`, ya existente).
- Produces: componente `<ProductCardPos product={...}
  umbralStockBajo={number} onAdd={(item: LocalCartItem) => void} />` —
  usado por la Task 3 (`ProductBrowser`).

- [ ] **Step 1: Crear el componente**

Crear `src/app/pos/product-card-pos.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getVariantOptions, findMatchingVariant } from "@/lib/store/variants";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { PosProductoResult } from "./product-browser-action";

export function ProductCardPos({
  product,
  umbralStockBajo,
  onAdd,
}: {
  product: PosProductoResult;
  umbralStockBajo: number;
  onAdd: (item: LocalCartItem) => void;
}) {
  const { tallas, colores } = getVariantOptions(product.variants);
  const hasVariants = product.variants.length > 0;
  const [seleccionando, setSeleccionando] = useState(false);
  const [talla, setTalla] = useState<string | null>(product.variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(product.variants[0]?.color ?? null);

  const variantSeleccionada = hasVariants
    ? findMatchingVariant(product.variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : product.stock;
  const unitPrice = variantSeleccionada?.priceOverride ?? product.price;
  const agotado = stockDisponible <= 0;

  const stockBadge =
    stockDisponible === 0
      ? { variant: "danger" as const, label: "Agotado" }
      : stockDisponible <= umbralStockBajo
        ? { variant: "warning" as const, label: `${stockDisponible} unidades` }
        : { variant: "neutral" as const, label: `${stockDisponible} unidades` };

  const confirmarAgregar = () => {
    const variantLabel = [talla, color].filter(Boolean).join(" / ");
    onAdd({
      productId: product.id,
      variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
      slug: "",
      name: hasVariants && variantLabel ? `${product.name} (${variantLabel})` : product.name,
      unitPrice,
      qty: 1,
      imageUrl: product.imageUrl,
      stock: stockDisponible,
    });
    setSeleccionando(false);
  };

  const handleAgregarClick = () => {
    if (hasVariants && !seleccionando) {
      setSeleccionando(true);
      return;
    }
    confirmarAgregar();
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-3 shadow-brand-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-brand-rosa-claro">
        {product.imageUrl && (
          <Image src={product.imageUrl} alt={product.name} fill className="object-contain" />
        )}
      </div>
      <p className="text-sm text-brand-ciruela">{product.name}</p>
      <div className="flex items-center justify-between">
        <span className="font-heading text-brand-rosa">{formatPrice(unitPrice)}</span>
        <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>
      </div>

      {seleccionando && hasVariants && (
        <div className="flex flex-col gap-2 rounded-md border border-brand-rosa-claro bg-brand-crema p-2">
          {tallas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tallas.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTalla(t)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    talla === t
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {colores.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {colores.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    color === c
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={agotado}
            onClick={confirmarAgregar}
            className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      )}

      {!seleccionando && (
        <button
          type="button"
          disabled={agotado}
          onClick={handleAgregarClick}
          className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
        >
          Agregar
        </button>
      )}
    </div>
  );
}
```

No lleva test dedicado (componente presentacional con interacción, mismo
criterio ya usado en `ClienteSelector`/`NotificacionesStockBajo` en los
sub-proyectos 1 y 2 — sin test unitario propio).

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos en este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/app/pos/product-card-pos.tsx
git commit -m "feat: tarjeta de producto del POS con imagen y selector de variante inline"
```

---

### Task 3: `ProductBrowser` (píldoras, buscador en vivo, grilla)

**Files:**
- Create: `src/app/pos/product-browser.tsx`

**Interfaces:**
- Consumes: `buscarProductosPos`, `listarCategoriasPos`,
  `obtenerUmbralStockBajoPos`, `PosProductoResult`, `PosCategoriaResult`
  (Task 1); `ProductCardPos` (Task 2); `LocalCartItem`
  (`@/lib/cart/local-cart`, ya existente).
- Produces: componente `<ProductBrowser onAdd={(item: LocalCartItem)
  => void} />` — usado por la Task 4 en `venta-items-editor.tsx`.

- [ ] **Step 1: Crear el componente**

Crear `src/app/pos/product-browser.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ScanBarcode } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  buscarProductosPos,
  listarCategoriasPos,
  obtenerUmbralStockBajoPos,
  type PosProductoResult,
  type PosCategoriaResult,
} from "./product-browser-action";
import { ProductCardPos } from "./product-card-pos";
import type { LocalCartItem } from "@/lib/cart/local-cart";

export function ProductBrowser({ onAdd }: { onAdd: (item: LocalCartItem) => void }) {
  const [categorias, setCategorias] = useState<PosCategoriaResult[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [productos, setProductos] = useState<PosProductoResult[]>([]);
  const [umbralStockBajo, setUmbralStockBajo] = useState(5);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    listarCategoriasPos().then(setCategorias);
    obtenerUmbralStockBajoPos().then(setUmbralStockBajo);
  }, []);

  useEffect(() => {
    setCargando(true);
    const timeout = setTimeout(() => {
      buscarProductosPos({ query, categoryId }).then((resultado) => {
        setProductos(resultado);
        setCargando(false);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, categoryId]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
      <h2 className="font-heading text-xl text-brand-ciruela">Productos</h2>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={`rounded-full border px-3 py-1 text-sm ${
            categoryId === null
              ? "border-brand-rosa bg-brand-rosa text-brand-crema"
              : "border-brand-rosa-claro text-brand-ciruela"
          }`}
        >
          Todos
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryId(cat.id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              categoryId === cat.id
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre o SKU"
        />
        <button
          type="button"
          disabled
          title="Próximamente"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-brand-rosa-claro px-3 py-2 text-sm text-brand-ciruela/50 opacity-50"
        >
          <ScanBarcode className="h-4 w-4" />
          Scanner
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {productos.map((product) => (
          <ProductCardPos
            key={product.id}
            product={product}
            umbralStockBajo={umbralStockBajo}
            onAdd={onAdd}
          />
        ))}
      </div>
      {!cargando && productos.length === 0 && (
        <p className="text-sm text-brand-ciruela/60">Sin resultados.</p>
      )}
    </div>
  );
}
```

No lleva test dedicado (mismo criterio de la Task 2 — componente de
interacción/orquestación, sin lógica de negocio propia más allá de lo
ya cubierto por los tests de `product-browser-action.ts`).

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos en este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/app/pos/product-browser.tsx
git commit -m "feat: panel de navegacion de productos del POS (pildoras, buscador en vivo, grilla)"
```

---

### Task 4: Integrar `ProductBrowser` en `venta-items-editor.tsx` y eliminar el buscador viejo

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx`
- Delete: `src/app/pos/search-action.ts`
- Delete: `src/app/pos/product-search-result.tsx`

**Interfaces:**
- Consumes: `ProductBrowser` (Task 3).

- [ ] **Step 1: Actualizar imports en `venta-items-editor.tsx`**

Reemplazar:

```tsx
import { searchProducts, type PosSearchResult } from "./search-action";
import { ProductSearchResult } from "./product-search-result";
```

por:

```tsx
import { ProductBrowser } from "./product-browser";
```

- [ ] **Step 2: Quitar el estado y el handler de búsqueda vieja**

Quitar estas dos líneas del bloque de `useState` (ya no se usan):

```tsx
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosSearchResult[]>([]);
```

Quitar `isSearching`/`startSearch` de la línea:

```tsx
  const [isSearching, startSearch] = useTransition();
```

(queda solo `const [isSubmitting, startSubmit] = useTransition();` —
la otra línea de `useTransition` para `isSubmitting` ya existe aparte y
no se toca).

Quitar el handler completo `handleSearch`:

```tsx
  const handleSearch = () => {
    startSearch(async () => {
      const found = await searchProducts(query);
      setResults(found);
    });
  };
```

`handleAdd` no cambia — sigue igual.

- [ ] **Step 3: Reemplazar el panel de búsqueda en el JSX**

Reemplazar todo este bloque:

```tsx
      <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        <h2 className="font-heading text-xl text-brand-ciruela">Buscar producto</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o SKU"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button
            type="button"
            onClick={handleSearch}
            disabled={isSearching}
            className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
          >
            {isSearching ? "Buscando..." : "Buscar"}
          </Button>
        </div>
        <div className="flex flex-col">
          {results.map((product) => (
            <ProductSearchResult key={product.id} product={product} onAdd={handleAdd} />
          ))}
          {results.length === 0 && query && !isSearching && (
            <p className="text-sm text-brand-ciruela/60">Sin resultados.</p>
          )}
        </div>
      </div>
```

por:

```tsx
      <ProductBrowser onAdd={handleAdd} />
```

- [ ] **Step 4: Eliminar los archivos ya superados**

```bash
git rm src/app/pos/search-action.ts src/app/pos/product-search-result.tsx
```

(confirmado sin otros consumidores fuera de `venta-items-editor.tsx` —
el único archivo que los importaba es el que se acaba de actualizar en
los Steps 1-3).

- [ ] **Step 5: Verificar que compila y que la suite completa pasa**

Run: `pnpm tsc --noEmit`
Expected: sin errores en todo el repo.

Run: `pnpm vitest run`
Expected: todos los tests pasan (incluidos los nuevos de la Task 1).

- [ ] **Step 6: Verificar el build de producción**

Antes de correr `pnpm build`, detener cualquier `pnpm dev` corriendo en
este worktree (`tasklist /FI "IMAGENAME eq node.exe"`, mismo patrón
usado en los sub-proyectos 1 y 2).

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 7: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx
git commit -m "feat: integra el panel de navegacion de productos en el carrito del POS"
```

---

## Nota de verificación manual (no automatizable en esta sesión)

Igual que los sub-proyectos 1 y 2: `/pos/**` requiere sesión
autenticada de `staff`/`admin`/`superadmin`, y el manejo en texto
plano de la contraseña del superadmin está prohibido en esta sesión.
La verificación visual final — que las píldoras, el buscador en vivo,
la grilla con imágenes y el selector de variante inline se vean y
funcionen como se espera en un navegador real — la hace el usuario en
el preview desplegado.
