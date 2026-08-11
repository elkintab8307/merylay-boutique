# Favoritos (lista de deseos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar productos como favoritos, tanto para
invitados (localStorage) como para usuarios registrados (Supabase),
con fusión automática al iniciar sesión, corazón en tarjetas/detalle de
producto, y una página `/favoritos` dedicada.

**Architecture:** Replica exactamente el patrón ya existente del
carrito: invitado = `localStorage` puro (nunca toca Supabase),
registrado = tabla propia con RLS por dueño, fusión del `localStorage`
a la tabla en el momento del login. El punto de entrada (`FavoriteButton`)
bifurca en el cliente según haya o no `currentUserId`, igual que
`ProductVariantSelector` ya bifurca para "Agregar al carrito".

**Tech Stack:** Next.js App Router (Server + Client Components),
Supabase (Postgres + RLS, vía MCP), react (`useTransition`), `lucide-react`.

## Global Constraints

- Todo el producto en español (UI, mensajes).
- Un favorito es por producto, sin variante (talla/color) — a
  diferencia del carrito.
- Invitado: SOLO `localStorage`, nunca la tabla `favorites` (mismo
  criterio que el carrito de invitado ya implementado).
- Registrado: tabla `favorites` con RLS estricta por
  `user_id = auth.uid()`, sin bypass de `is_admin()`.
- Toda migración de Supabase se crea y aplica con el MCP de Supabase,
  no a mano en el dashboard. Los tipos de TypeScript
  (`database.types.ts`) se regeneran después de la migración.
- No se rediseña visualmente ninguna página existente en este plan —
  se usan los componentes/tokens de marca ya existentes (`Button`,
  paleta `brand-*`, `shadow-brand-*`). El rediseño visual de la tienda
  es la Fase B, fuera de este plan.
- Sin gestión de favoritos desde el panel admin, sin notificaciones de
  stock/precio — fuera de alcance.

---

## Task 1: Migración de base de datos y lógica local de invitado

**Files:**
- Create: `supabase/migrations/021_favoritos.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado vía MCP)
- Create: `src/lib/favorites/local-favorites.ts`
- Create: `src/lib/favorites/__tests__/local-favorites.test.ts`

**Interfaces:**
- Produces: tabla `favorites(id, user_id, product_id, created_at)` con
  RLS por dueño — consumida por la Task 2.
- Produces: `LocalFavoriteItem`, `getLocalFavorites()`,
  `saveLocalFavorites(items)`, `toggleLocalFavorite(items, item)`,
  `isFavorite(items, productId)`, `clearLocalFavorites()` — consumidos
  por la Task 2 (fusión), Task 3 (`FavoriteButton`) y Task 4 (página
  de favoritos de invitado).

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/021_favoritos.sql`:

```sql
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index favorites_user_id_idx on public.favorites(user_id);

alter table public.favorites enable row level security;

create policy "favorites_owner_only"
  on public.favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Aplicar la migración con el MCP de Supabase**

Usa `ToolSearch` con `"select:mcp__supabase__apply_migration,mcp__supabase__list_tables,mcp__supabase__generate_typescript_types,mcp__supabase__get_advisors"`
para cargar las herramientas. Aplica la migración con
`mcp__supabase__apply_migration` (nombre `021_favoritos`, contenido
exactamente el SQL del Step 1). Si la herramienta requiere un
`project_id` que no conoces, descúbrelo con las herramientas de
Supabase disponibles (por ejemplo listando proyectos) antes de aplicar.

- [ ] **Step 3: Verificar la tabla y la seguridad**

Confirma con `mcp__supabase__list_tables` que `favorites` existe con
RLS habilitada. Corre `mcp__supabase__get_advisors` (tipo `security`) y
confirma que no aparece ninguna advertencia nueva relacionada con
`favorites` (tabla sin RLS, política faltante, etc.). Si aparece algo,
corrígelo antes de continuar.

- [ ] **Step 4: Regenerar los tipos de TypeScript**

Corre `mcp__supabase__generate_typescript_types` y sobrescribe
`src/lib/supabase/database.types.ts` con el resultado completo, para
que incluya la tabla `favorites`.

- [ ] **Step 5: Escribir el test que falla**

Crea `src/lib/favorites/__tests__/local-favorites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isFavorite, toggleLocalFavorite } from "../local-favorites";
import type { LocalFavoriteItem } from "../local-favorites";

const baseItem: LocalFavoriteItem = {
  productId: "p1",
  slug: "producto-1",
  name: "Producto 1",
  price: 10000,
  imageUrl: null,
};

describe("isFavorite", () => {
  it("devuelve true si el producto esta en la lista", () => {
    expect(isFavorite([baseItem], "p1")).toBe(true);
  });

  it("devuelve false si el producto no esta en la lista", () => {
    expect(isFavorite([baseItem], "p2")).toBe(false);
  });

  it("devuelve false para una lista vacia", () => {
    expect(isFavorite([], "p1")).toBe(false);
  });
});

describe("toggleLocalFavorite", () => {
  it("agrega el producto si no estaba marcado", () => {
    const result = toggleLocalFavorite([], baseItem);
    expect(result).toEqual([baseItem]);
  });

  it("quita el producto si ya estaba marcado", () => {
    const result = toggleLocalFavorite([baseItem], baseItem);
    expect(result).toEqual([]);
  });

  it("no afecta otros productos favoritos", () => {
    const other: LocalFavoriteItem = { ...baseItem, productId: "p2" };
    const result = toggleLocalFavorite([baseItem, other], baseItem);
    expect(result).toEqual([other]);
  });
});
```

- [ ] **Step 6: Correr el test y confirmar que falla**

Run: `pnpm test local-favorites`
Expected: FAIL — no existe el módulo `../local-favorites`.

- [ ] **Step 7: Implementar `local-favorites.ts`**

Crea `src/lib/favorites/local-favorites.ts`:

```ts
export type LocalFavoriteItem = {
  productId: string;
  slug: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

const STORAGE_KEY = "merylay-favoritos";

export function isFavorite(items: LocalFavoriteItem[], productId: string): boolean {
  return items.some((i) => i.productId === productId);
}

export function toggleLocalFavorite(
  items: LocalFavoriteItem[],
  item: LocalFavoriteItem,
): LocalFavoriteItem[] {
  if (isFavorite(items, item.productId)) {
    return items.filter((i) => i.productId !== item.productId);
  }
  return [...items, item];
}

export function getLocalFavorites(): LocalFavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalFavoriteItem[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalFavorites(items: LocalFavoriteItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function clearLocalFavorites(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 8: Correr el test y confirmar que pasa**

Run: `pnpm test local-favorites`
Expected: PASS — 6 tests.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/021_favoritos.sql src/lib/supabase/database.types.ts src/lib/favorites/local-favorites.ts src/lib/favorites/__tests__/local-favorites.test.ts
git commit -m "feat: tabla de favoritos con RLS y logica local de invitado"
```

---

## Task 2: Server actions y fusión al iniciar sesión

**Files:**
- Create: `src/app/(store)/favoritos/actions.ts`
- Create: `src/lib/favorites/merge-guest-favorites-action.ts`
- Modify: `src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `LocalFavoriteItem`, `getLocalFavorites`,
  `clearLocalFavorites` (Task 1).
- Produces: `addFavorite(productId)`, `removeFavorite(productId)`
  (`src/app/(store)/favoritos/actions.ts`) — consumidos por la Task 3
  (`FavoriteButton`) y la Task 4 (página de favoritos, control de
  "Quitar" para usuarios registrados). `mergeGuestFavorites(items)` — no
  lo consume ninguna otra task, solo `login-form.tsx`.

- [ ] **Step 1: Crear los server actions de favoritos**

Crea `src/app/(store)/favoritos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addFavorite(productId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, product_id: productId });

  if (error && error.code !== "23505") {
    return { error: "No se pudo agregar a favoritos." };
  }

  revalidatePath("/favoritos");
  return {};
}

export async function removeFavorite(productId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);

  if (error) return { error: "No se pudo quitar de favoritos." };

  revalidatePath("/favoritos");
  return {};
}
```

`error.code !== "23505"` deja pasar en silencio un intento de agregar un
favorito que ya existía (violación de la restricción única) — evita un
error visible si el usuario hace doble clic rápido en el corazón.

- [ ] **Step 2: Crear la fusión de favoritos de invitado**

Crea `src/lib/favorites/merge-guest-favorites-action.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { LocalFavoriteItem } from "@/lib/favorites/local-favorites";

export async function mergeGuestFavorites(
  items: LocalFavoriteItem[],
): Promise<{ error?: string }> {
  if (items.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase.from("favorites").upsert(
    items.map((item) => ({ user_id: user.id, product_id: item.productId })),
    { onConflict: "user_id,product_id", ignoreDuplicates: true },
  );

  if (error) return { error: "No se pudieron fusionar los favoritos." };

  return {};
}
```

- [ ] **Step 3: Conectar la fusión al login**

Reemplaza el contenido completo de
`src/app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "./actions";
import { getLocalCart, clearLocalCart } from "@/lib/cart/local-cart";
import { mergeGuestCart } from "@/lib/cart/merge-guest-cart-action";
import { getLocalFavorites, clearLocalFavorites } from "@/lib/favorites/local-favorites";
import { mergeGuestFavorites } from "@/lib/favorites/merge-guest-favorites-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    const result = await login(data);
    if ("error" in result) {
      setServerError(result.error);
      return;
    }

    const guestCart = getLocalCart();
    if (guestCart.length > 0) {
      await mergeGuestCart(guestCart);
      clearLocalCart();
    }

    const guestFavorites = getLocalFavorites();
    if (guestFavorites.length > 0) {
      await mergeGuestFavorites(guestFavorites);
      clearLocalFavorites();
    }

    router.push(redirectTo ?? result.destinoPorDefecto);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="identifier" className="text-sm text-brand-ciruela">
          Usuario o correo electrónico
        </label>
        <Input id="identifier" {...register("identifier")} />
        {errors.identifier && (
          <p className="text-sm text-red-600">{errors.identifier.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="text-sm text-brand-ciruela">
          Contraseña
        </label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && (
          <p className="text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(store\)/favoritos/actions.ts src/lib/favorites/merge-guest-favorites-action.ts "src/app/(auth)/login/login-form.tsx"
git commit -m "feat: acciones de favoritos y fusion de invitado al iniciar sesion"
```

---

## Task 3: `FavoriteButton` y su integración en tarjetas y detalle de producto

**Files:**
- Create: `src/components/store/favorite-button.tsx`
- Modify: `src/components/store/product-card.tsx`
- Modify: `src/app/(store)/page.tsx`
- Modify: `src/app/(store)/categoria/[slug]/page.tsx`
- Modify: `src/app/(store)/producto/[slug]/page.tsx`

**Interfaces:**
- Consumes: `addFavorite`, `removeFavorite` (Task 2);
  `getLocalFavorites`, `saveLocalFavorites`, `toggleLocalFavorite`,
  `isFavorite` (Task 1).
- Produces: `FavoriteButton({ productId, currentUserId, initialFavorite, product })`
  — no lo consume ninguna otra task de este plan (la Task 4 no reutiliza
  `ProductCard`/`FavoriteButton`, construye su propia lista). `ProductCardData`
  gana el campo `id: string` — cambio de contrato que esta misma task
  aplica en sus tres consumidores (`ProductCard`, home, categoría).

- [ ] **Step 1: Crear `FavoriteButton`**

Crea `src/components/store/favorite-button.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { addFavorite, removeFavorite } from "@/app/(store)/favoritos/actions";
import {
  getLocalFavorites,
  saveLocalFavorites,
  toggleLocalFavorite,
  isFavorite,
  type LocalFavoriteItem,
} from "@/lib/favorites/local-favorites";

export function FavoriteButton({
  productId,
  currentUserId,
  initialFavorite,
  product,
}: {
  productId: string;
  currentUserId: string | null;
  initialFavorite: boolean;
  product: { slug: string; name: string; price: number; imageUrl: string | null };
}) {
  const [favorito, setFavorito] = useState(initialFavorite);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (currentUserId) return;
    // Un invitado no tiene favoritos en el servidor; el estado real vive
    // en localStorage y solo se conoce tras montar en el navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorito(isFavorite(getLocalFavorites(), productId));
  }, [currentUserId, productId]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (currentUserId) {
      const next = !favorito;
      setFavorito(next);
      startTransition(async () => {
        const result = next ? await addFavorite(productId) : await removeFavorite(productId);
        if (result?.error) setFavorito(!next);
      });
      return;
    }

    const item: LocalFavoriteItem = {
      productId,
      slug: product.slug,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    };
    const current = getLocalFavorites();
    const next = toggleLocalFavorite(current, item);
    saveLocalFavorites(next);
    setFavorito(isFavorite(next, productId));
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
      aria-pressed={favorito}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-brand-rosa shadow-brand-sm backdrop-blur transition hover:bg-white disabled:opacity-50"
    >
      <Heart className="h-4 w-4" fill={favorito ? "currentColor" : "none"} />
    </button>
  );
}
```

- [ ] **Step 2: Actualizar `ProductCard`**

Reemplaza el contenido completo de
`src/components/store/product-card.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { FavoriteButton } from "@/components/store/favorite-button";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
};

export function ProductCard({
  product,
  currentUserId,
  initialFavorite,
}: {
  product: ProductCardData;
  currentUserId: string | null;
  initialFavorite: boolean;
}) {
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
        <div className="absolute right-2 top-2">
          <FavoriteButton
            productId={product.id}
            currentUserId={currentUserId}
            initialFavorite={initialFavorite}
            product={{
              slug: product.slug,
              name: product.name,
              price: product.price,
              imageUrl: product.imageUrl,
            }}
          />
        </div>
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

- [ ] **Step 3: Actualizar la página de inicio**

Reemplaza el contenido completo de `src/app/(store)/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";

export default async function HomePage() {
  const supabase = await createClient();

  const [{ data: destacados }, { data: { user } }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, price, compare_at_price")
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.auth.getUser(),
  ]);

  const destacadoIds = (destacados ?? []).map((p) => p.id);
  const [{ data: imagenesDestacados }, { data: favoritos }] = await Promise.all([
    destacadoIds.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", destacadoIds)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
    user && destacadoIds.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user.id)
          .in("product_id", destacadoIds)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
  ]);

  const imagenPorProducto = new Map(
    (imagenesDestacados ?? []).map((img) => [img.product_id, img.url]),
  );
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));

  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order");

  const productosDestacados: ProductCardData[] = (destacados ?? []).map((p) => ({
    id: p.id,
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
              <ProductCard
                key={producto.slug}
                product={producto}
                currentUserId={user?.id ?? null}
                initialFavorite={favoritosSet.has(producto.id)}
              />
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

- [ ] **Step 4: Actualizar la página de categoría**

Reemplaza el contenido completo de
`src/app/(store)/categoria/[slug]/page.tsx`:

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

  const [{ data: categoria }, { data: { user } }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug")
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
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));

  const productos: ProductCardData[] = productosFiltrados.map((p) => ({
    id: p.id,
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

- [ ] **Step 5: Actualizar la página de detalle de producto**

Reemplaza el contenido completo de
`src/app/(store)/producto/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";
import { FavoriteButton } from "@/components/store/favorite-button";

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
    <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2">
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
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos. Presta atención a errores de tipo en
`ProductCard` si algún consumidor no listado arriba también lo usa
(confirmado en el diseño que solo home y categoría lo usan, pero
verifícalo con una búsqueda antes de dar la task por terminada).

- [ ] **Step 7: Commit**

```bash
git add src/components/store/favorite-button.tsx src/components/store/product-card.tsx "src/app/(store)/page.tsx" "src/app/(store)/categoria/[slug]/page.tsx" "src/app/(store)/producto/[slug]/page.tsx"
git commit -m "feat: boton de favorito en tarjetas y detalle de producto"
```

---

## Task 4: Página `/favoritos` y link en el header

**Files:**
- Create: `src/app/(store)/favoritos/page.tsx`
- Create: `src/app/(store)/favoritos/authenticated-favorites.tsx`
- Create: `src/app/(store)/favoritos/favorite-item-controls.tsx`
- Create: `src/app/(store)/favoritos/guest-favorites.tsx`
- Modify: `src/components/layout/site-header.tsx`

**Interfaces:**
- Consumes: `removeFavorite` (Task 2, para el control de usuarios
  registrados); `addToCart` (`src/app/(store)/carrito/actions.ts`, ya
  existente); `getLocalFavorites`, `saveLocalFavorites`,
  `toggleLocalFavorite`, `LocalFavoriteItem` (Task 1); `getLocalCart`,
  `saveLocalCart`, `mergeCartItem` (`src/lib/cart/local-cart.ts`, ya
  existente).
- Produces: nada consumido por otra task de este plan.

- [ ] **Step 1: Crear el control de ítem para usuarios registrados**

Crea `src/app/(store)/favoritos/favorite-item-controls.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeFavorite } from "./actions";
import { addToCart } from "@/app/(store)/carrito/actions";

export function FavoriteItemControls({
  productId,
  unitPrice,
}: {
  productId: string;
  unitPrice: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleAddToCart = () => {
    startTransition(async () => {
      await addToCart(productId, null, 1, unitPrice);
      router.refresh();
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      await removeFavorite(productId);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={handleAddToCart}
        className="rounded-md border border-brand-rosa px-3 py-1.5 text-sm text-brand-rosa hover:bg-brand-rosa/10"
      >
        Agregar al carrito
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleRemove}
        className="text-sm text-red-600 hover:underline"
      >
        Quitar
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Crear la lista para usuarios registrados**

Crea `src/app/(store)/favoritos/authenticated-favorites.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { FavoriteItemControls } from "./favorite-item-controls";

export type FavoriteItemView = {
  productId: string;
  name: string;
  slug: string;
  price: number;
  imageUrl: string | null;
};

export function AuthenticatedFavorites({ items }: { items: FavoriteItemView[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Aún no tienes productos favoritos.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-brand-rosa-claro">
      {items.map((item) => (
        <div key={item.productId} className="flex items-center gap-4 py-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
            {item.imageUrl && (
              <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
            )}
          </div>
          <div className="flex-1">
            <Link
              href={`/producto/${item.slug}`}
              className="font-body text-brand-ciruela hover:text-brand-rosa"
            >
              {item.name}
            </Link>
            <p className="text-sm text-brand-rosa">{formatPrice(item.price)}</p>
          </div>
          <FavoriteItemControls productId={item.productId} unitPrice={item.price} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Crear la lista para invitados**

Crea `src/app/(store)/favoritos/guest-favorites.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  getLocalFavorites,
  saveLocalFavorites,
  toggleLocalFavorite,
  type LocalFavoriteItem,
} from "@/lib/favorites/local-favorites";
import { getLocalCart, saveLocalCart, mergeCartItem } from "@/lib/cart/local-cart";

export function GuestFavorites() {
  const [items, setItems] = useState<LocalFavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(getLocalFavorites());
    setLoaded(true);
  }, []);

  const handleRemove = (item: LocalFavoriteItem) => {
    const next = toggleLocalFavorite(items, item);
    setItems(next);
    saveLocalFavorites(next);
  };

  const handleAddToCart = (item: LocalFavoriteItem) => {
    const current = getLocalCart();
    // El stock real se valida en el checkout (RPC atomica del servidor);
    // aqui no se conoce el stock del producto porque no se guarda al
    // marcarlo como favorito, asi que no se limita la cantidad local.
    const next = mergeCartItem(current, {
      productId: item.productId,
      variantId: null,
      slug: item.slug,
      name: item.name,
      unitPrice: item.price,
      qty: 1,
      imageUrl: item.imageUrl,
      stock: Number.MAX_SAFE_INTEGER,
    });
    saveLocalCart(next);
    setMessage("Agregado al carrito.");
  };

  if (!loaded) return null;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Aún no tienes productos favoritos.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <p className="text-sm text-brand-oro">{message}</p>}
      <div className="flex flex-col divide-y divide-brand-rosa-claro">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center gap-4 py-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
              {item.imageUrl && (
                <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
              )}
            </div>
            <div className="flex-1">
              <Link
                href={`/producto/${item.slug}`}
                className="font-body text-brand-ciruela hover:text-brand-rosa"
              >
                {item.name}
              </Link>
              <p className="text-sm text-brand-rosa">{formatPrice(item.price)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddToCart(item)}
                className="rounded-md border border-brand-rosa px-3 py-1.5 text-sm text-brand-rosa hover:bg-brand-rosa/10"
              >
                Agregar al carrito
              </button>
              <button
                type="button"
                onClick={() => handleRemove(item)}
                className="text-sm text-red-600 hover:underline"
              >
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Crear la página `/favoritos`**

Crea `src/app/(store)/favoritos/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { GuestFavorites } from "./guest-favorites";
import { AuthenticatedFavorites, type FavoriteItemView } from "./authenticated-favorites";

export default async function FavoritosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tus favoritos</h1>
        <GuestFavorites />
      </main>
    );
  }

  const { data: favoritos } = await supabase
    .from("favorites")
    .select("product_id")
    .eq("user_id", user.id);

  const productIds = (favoritos ?? []).map((f) => f.product_id);

  const [{ data: productos }, { data: imagenes }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, slug, price").in("id", productIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; slug: string; price: number }[],
        }),
    productIds.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", productIds)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
  ]);

  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));

  const items: FavoriteItemView[] = (productos ?? []).map((p) => ({
    productId: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Tus favoritos</h1>
      <AuthenticatedFavorites items={items} />
    </main>
  );
}
```

- [ ] **Step 5: Agregar el link "Favoritos" al header**

En `src/components/layout/site-header.tsx`, agrega un `<Link>` a
`/favoritos` inmediatamente después del `<Link href="/carrito">` ya
existente (mismo nivel, mismas clases):

```tsx
            <Link href="/carrito" className="hover:text-brand-rosa">
              Carrito
            </Link>
            <Link href="/favoritos" className="hover:text-brand-rosa">
              Favoritos
            </Link>
```

- [ ] **Step 6: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos, y `/favoritos` aparece en la lista de
rutas del build.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(store)/favoritos" src/components/layout/site-header.tsx
git commit -m "feat: pagina de favoritos y link en el header de la tienda"
```

---

## Task 5: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-4.

- [ ] **Step 1: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 (Windows) y arranca uno limpio con `pnpm dev`
en segundo plano si hace falta.

- [ ] **Step 2: Verificar la ruta `/favoritos` sin sesión**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/favoritos
```

Expected: `200` (a diferencia de `/carrito` para invitados, `/favoritos`
no debe redirigir — es una página pública que muestra el estado vacío o
el contenido de `localStorage`).

```bash
curl -s http://localhost:3000/favoritos | grep -o "Aún no tienes productos favoritos" | head -1
```

Expected: imprime el texto — confirma que el estado vacío de invitado
renderiza en el servidor sin errores.

- [ ] **Step 3: Verificar que el link del header aparece**

```bash
curl -s http://localhost:3000/ | grep -o "Favoritos" | head -1
```

Expected: imprime `Favoritos`.

- [ ] **Step 4: Confirmar en el código que `/admin`, `/pos` y `/superadmin` no importan nada de favoritos**

Búsqueda de texto (`favorite|Favorite|favoritos`) dentro de
`src/app/admin`, `src/app/pos` y `src/app/superadmin` — no debe haber
ningún resultado, confirmando que la función quedó contenida a la
tienda pública, igual que el carrito.

- [ ] **Step 5: Detener el servidor**

Detener el servidor de desarrollo si se levantó en el Step 1.

- [ ] **Step 6: Nota para el reporte final**

Deja anotado en tu reporte que la verificación visual completa (marcar
un favorito como invitado, cerrar el navegador y confirmar que persiste,
iniciar sesión y confirmar que se fusiona a la cuenta, marcar/desmarcar
desde la tarjeta sin navegar accidentalmente al detalle del producto) no
se hizo de forma interactiva en navegador — recomienda al usuario ese
recorrido manual, igual que en fases anteriores de este proyecto.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 5, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta fase (creada al iniciar la ejecución de este plan,
con base en `master`) para fusionar, verificar y subir.
