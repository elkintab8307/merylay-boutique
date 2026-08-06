# MeryLay Boutique — Fase 5 (Admin: categorías y productos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD completo de categorías y productos (con variantes talla/color e
imágenes en Storage) para el panel `/admin`, protegido por rol.

**Architecture:** Server Components para listar/cargar datos, Client
Components solo para los formularios interactivos, Server Actions para
mutaciones (todas con `requireAdmin()` como defensa adicional al proxy).
Subida de imágenes vía la sesión del propio admin (no service role).

**Tech Stack:** Next.js 16 (App Router, `src/`), TypeScript estricto,
`@supabase/ssr`, `react-hook-form` (+ `useFieldArray`), `zod`, shadcn/ui,
Vitest.

## Global Constraints

- Idioma: todo en español (UI, mensajes de error).
- TypeScript estricto; Server Components por defecto.
- RLS siempre activo; nunca `service_role` en subida de imágenes (usa la
  sesión del admin autenticado, ya cubierta por las policies de Storage de la
  Fase 2).
- Precios en `numeric`, nunca floats en el esquema (ya así desde la Fase 2).
- Borrado = soft-delete (`is_active = false`), nunca `DELETE` de categorías o
  productos.
- Cada Server Action de este módulo llama `requireAdmin()` al inicio.
- Commits atómicos en español al cerrar cada tarea funcional.

## Referencia del spec

Este plan implementa `docs/superpowers/specs/2026-08-06-fase-5-admin-catalogo-design.md`.

---

## Mapa de archivos

- `supabase/migrations/009_variantes_talla_color.sql`
- `src/lib/slug.ts`
- `src/lib/admin/require-admin.ts`
- `src/lib/admin/upload-product-images.ts`
- `src/lib/validation/categoria.ts`
- `src/lib/validation/producto.ts`
- `src/app/admin/layout.tsx`, `src/app/admin/admin-nav.tsx`
- `src/app/admin/categorias/{page.tsx, actions.ts, categoria-form.tsx,
  toggle-categoria-button.tsx, nueva/page.tsx, [id]/editar/page.tsx}`
- `src/app/admin/productos/{page.tsx, actions.ts, producto-form.tsx,
  toggle-producto-button.tsx, nuevo/page.tsx, [id]/editar/page.tsx}`
- `next.config.ts` (remotePatterns para imágenes de Storage)

---

## Task 1: Migración 009 — talla y color en variantes

**Files:**
- Create: `supabase/migrations/009_variantes_talla_color.sql`

**Interfaces:**
- Consumes: `public.product_variants` (Fase 2).
- Produces: columnas `talla`, `color` (nullable) — usadas por Task 11
  (schema zod) y Task 13 (Server Actions de productos).

- [ ] **Step 1: Escribir la migración**

```sql
alter table public.product_variants
  add column talla text,
  add column color text;
```

- [ ] **Step 2: Aplicar vía MCP**

Usar `mcp__supabase__apply_migration` con `name: "variantes_talla_color"`.

- [ ] **Step 3: Verificar**

```sql
select column_name, is_nullable from information_schema.columns
where table_name = 'product_variants' and column_name in ('talla', 'color');
```

Expected: 2 filas, ambas `is_nullable = 'YES'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/009_variantes_talla_color.sql
git commit -m "feat(db): migracion 009 - talla y color en product_variants"
```

---

## Task 2: `slugify()` — lógica pura (TDD)

**Files:**
- Create: `src/lib/__tests__/slug.test.ts`
- Create: `src/lib/slug.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `slugify(value: string): string` — usado por Task 7
  (`categoria-form.tsx`), Task 6/13 (Server Actions, generación de slug
  único).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "../slug";

describe("slugify", () => {
  it("convierte a minusculas y reemplaza espacios por guiones", () => {
    expect(slugify("Pijama Rosa Elegante")).toBe("pijama-rosa-elegante");
  });

  it("elimina acentos y caracteres especiales", () => {
    expect(slugify("Piñata & Más!!")).toBe("pinata-mas");
  });

  it("recorta guiones al inicio y al final", () => {
    expect(slugify("  Espacios  ")).toBe("espacios");
  });

  it("devuelve cadena vacia para entrada vacia", () => {
    expect(slugify("")).toBe("");
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test slug
```

Expected: FAIL — `slug` no existe todavía.

- [ ] **Step 3: Implementar**

```ts
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test slug
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/__tests__/slug.test.ts
git commit -m "feat: agrega slugify para generar slugs de categorias y productos"
```

---

## Task 3: `requireAdmin()` — defensa en capas

**Files:**
- Create: `src/lib/admin/require-admin.ts`

**Interfaces:**
- Consumes: `getCurrentProfile()` (Fase 3), `UserRole` de
  `src/lib/auth/route-protection.ts` (Fase 1).
- Produces: `requireAdmin(): Promise<CurrentUser>` — usado por todas las
  Server Actions de Tasks 6 y 13.

- [ ] **Step 1: Implementar**

```ts
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import type { UserRole } from "@/lib/auth/route-protection";

const ADMIN_ROLES: UserRole[] = ["admin", "superadmin"];

export async function requireAdmin() {
  const currentUser = await getCurrentProfile();
  if (!currentUser || !ADMIN_ROLES.includes(currentUser.profile.role)) {
    throw new Error("No autorizado.");
  }
  return currentUser;
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/require-admin.ts
git commit -m "feat(admin): agrega requireAdmin como defensa adicional en Server Actions"
```

---

## Task 4: Layout de admin con navegación

**Files:**
- Create: `src/app/admin/admin-nav.tsx`
- Create: `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: nada nuevo (el proxy de la Fase 1 ya protege `/admin/**`).
- Produces: shell de `/admin/**`, usado por todas las páginas de Tasks 8–17.

- [ ] **Step 1: Crear la navegación**

`src/app/admin/admin-nav.tsx`:

```tsx
import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="flex gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <Link href="/admin/categorias" className="hover:text-brand-rosa">
        Categorías
      </Link>
      <Link href="/admin/productos" className="hover:text-brand-rosa">
        Productos
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Crear el layout**

`src/app/admin/layout.tsx`:

```tsx
import { AdminNav } from "./admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-crema">
      <AdminNav />
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar build**

```bash
pnpm build
```

Expected: PASS (todavía no hay `page.tsx` bajo `/admin`, es normal que esa
ruta exacta no exista aún — las subrutas se agregan en tasks siguientes).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/admin-nav.tsx src/app/admin/layout.tsx
git commit -m "feat: agrega layout de admin con navegacion"
```

---

## Task 5: Schema zod de categorías (TDD)

**Files:**
- Create: `src/lib/validation/__tests__/categoria.test.ts`
- Create: `src/lib/validation/categoria.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `categoriaSchema`, `CategoriaInput` — usados por Task 6 (Server
  Actions) y Task 7 (`CategoriaForm`).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { categoriaSchema } from "../categoria";

describe("categoriaSchema", () => {
  const base = {
    name: "Pijamas",
    slug: "pijamas",
    description: "",
    parentId: null,
    sortOrder: 0,
    isActive: true,
  };

  it("acepta datos validos", () => {
    expect(categoriaSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza nombre muy corto", () => {
    expect(categoriaSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("rechaza slug muy corto", () => {
    expect(categoriaSchema.safeParse({ ...base, slug: "a" }).success).toBe(false);
  });

  it("rechaza sortOrder negativo", () => {
    expect(categoriaSchema.safeParse({ ...base, sortOrder: -1 }).success).toBe(false);
  });

  it("acepta parentId nulo", () => {
    expect(categoriaSchema.safeParse({ ...base, parentId: null }).success).toBe(true);
  });

  it("rechaza parentId invalido", () => {
    expect(
      categoriaSchema.safeParse({ ...base, parentId: "no-es-uuid" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test src/lib/validation/__tests__/categoria
```

Expected: FAIL — `categoria` no existe todavía.

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";

export const categoriaSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  slug: z.string().trim().min(2, "El slug debe tener al menos 2 caracteres"),
  description: z.string().trim().optional(),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});

export type CategoriaInput = z.infer<typeof categoriaSchema>;
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test src/lib/validation/__tests__/categoria
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/categoria.ts src/lib/validation/__tests__/categoria.test.ts
git commit -m "feat(admin): agrega schema zod de categorias"
```

---

## Task 6: Server Actions de categorías

**Files:**
- Create: `src/app/admin/categorias/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()` (Task 3), `categoriaSchema` (Task 5),
  `slugify()` (Task 2), `createClient()` de `src/lib/supabase/server.ts`.
- Produces: `createCategoria()`, `updateCategoria()`,
  `toggleCategoriaActiva()` — usados por Task 7 y Task 8.

- [ ] **Step 1: Implementar**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { categoriaSchema, type CategoriaInput } from "@/lib/validation/categoria";
import { slugify } from "@/lib/slug";

async function uniqueSlug(baseSlug: string, ignoreId?: string) {
  const supabase = await createClient();
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    let query = supabase.from("categories").select("id").eq("slug", candidate);
    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

export async function createCategoria(
  input: CategoriaInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name));

  const { error } = await supabase.from("categories").insert({
    name: parsed.data.name,
    slug,
    description: parsed.data.description || null,
    parent_id: parsed.data.parentId,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return { error: "No se pudo crear la categoría." };
  }

  revalidatePath("/admin/categorias");
  return {};
}

export async function updateCategoria(
  id: string,
  input: CategoriaInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), id);

  const { error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      parent_id: parsed.data.parentId,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar la categoría." };
  }

  revalidatePath("/admin/categorias");
  return {};
}

export async function toggleCategoriaActiva(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado de la categoría." };
  }

  revalidatePath("/admin/categorias");
  return {};
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/categorias/actions.ts
git commit -m "feat(admin): agrega Server Actions de categorias"
```

---

## Task 7: Formulario de categoría

**Files:**
- Create: `src/app/admin/categorias/categoria-form.tsx`

**Interfaces:**
- Consumes: `categoriaSchema`, `CategoriaInput` (Task 5), `slugify()`
  (Task 2), `createCategoria`/`updateCategoria` (Task 6), `Button`/`Input`
  de `@/components/ui/*`.
- Produces: `<CategoriaForm />` — usado por Task 9 y Task 10.

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { categoriaSchema, type CategoriaInput } from "@/lib/validation/categoria";
import { slugify } from "@/lib/slug";
import { createCategoria, updateCategoria } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CategoriaOption = { id: string; name: string };

export function CategoriaForm({
  categoriaId,
  defaultValues,
  categoriasDisponibles,
}: {
  categoriaId?: string;
  defaultValues: CategoriaInput;
  categoriasDisponibles: CategoriaOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues,
  });

  const onSubmit = async (data: CategoriaInput) => {
    setServerError(null);
    const result = categoriaId
      ? await updateCategoria(categoriaId, data)
      : await createCategoria(data);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/categorias");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-sm text-brand-ciruela">
          Nombre
        </label>
        <Input
          id="name"
          {...register("name", {
            onChange: (e) => {
              if (!categoriaId) {
                setValue("slug", slugify(e.target.value));
              }
            },
          })}
        />
        {errors.name && (
          <p className="text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="slug" className="text-sm text-brand-ciruela">
          Slug
        </label>
        <Input id="slug" {...register("slug")} />
        {errors.slug && (
          <p className="text-sm text-red-600">{errors.slug.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="description" className="text-sm text-brand-ciruela">
          Descripción
        </label>
        <Input id="description" {...register("description")} />
      </div>
      <div>
        <label htmlFor="parentId" className="text-sm text-brand-ciruela">
          Categoría padre
        </label>
        <select
          id="parentId"
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("parentId", { setValueAs: (v) => (v === "" ? null : v) })}
        >
          <option value="">Sin categoría padre</option>
          {categoriasDisponibles
            .filter((c) => c.id !== categoriaId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label htmlFor="sortOrder" className="text-sm text-brand-ciruela">
          Orden
        </label>
        <Input
          id="sortOrder"
          type="number"
          {...register("sortOrder", { valueAsNumber: true })}
        />
        {errors.sortOrder && (
          <p className="text-sm text-red-600">{errors.sortOrder.message}</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-ciruela">
        <input type="checkbox" {...register("isActive")} />
        Activa
      </label>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores (todavía no compila la página que lo usa; eso es Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/categorias/categoria-form.tsx
git commit -m "feat(admin): agrega formulario de categoria"
```

---

## Task 8: Listado de categorías

**Files:**
- Create: `src/app/admin/categorias/toggle-categoria-button.tsx`
- Create: `src/app/admin/categorias/page.tsx`

**Interfaces:**
- Consumes: `toggleCategoriaActiva()` (Task 6), `createClient()` de
  `src/lib/supabase/server.ts`, `Button` de `@/components/ui/button`.
- Produces: ruta `/admin/categorias`.

- [ ] **Step 1: Botón de activar/desactivar**

`src/app/admin/categorias/toggle-categoria-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleCategoriaActiva } from "./actions";

export function ToggleCategoriaButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await toggleCategoriaActiva(id, !isActive);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline"
    >
      {isActive ? "Desactivar" : "Activar"}
    </button>
  );
}
```

- [ ] **Step 2: Página de listado**

`src/app/admin/categorias/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleCategoriaButton } from "./toggle-categoria-button";

export default async function CategoriasPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, is_active, parent_id")
    .order("sort_order", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Categorías
        </h1>
        <Link href="/admin/categorias/nueva">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nueva categoría
          </Button>
        </Link>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
            <th className="py-2">Nombre</th>
            <th className="py-2">Slug</th>
            <th className="py-2">Orden</th>
            <th className="py-2">Activa</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {categorias?.map((categoria) => (
            <tr key={categoria.id} className="border-b border-brand-rosa-claro/50">
              <td className="py-2">{categoria.name}</td>
              <td className="py-2 text-brand-ciruela/70">{categoria.slug}</td>
              <td className="py-2">{categoria.sort_order}</td>
              <td className="py-2">{categoria.is_active ? "Sí" : "No"}</td>
              <td className="flex gap-3 py-2">
                <Link
                  href={`/admin/categorias/${categoria.id}/editar`}
                  className="text-brand-rosa hover:underline"
                >
                  Editar
                </Link>
                <ToggleCategoriaButton
                  id={categoria.id}
                  isActive={categoria.is_active}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
git add src/app/admin/categorias/toggle-categoria-button.tsx src/app/admin/categorias/page.tsx
git commit -m "feat(admin): pagina de listado de categorias"
```

---

## Task 9: Crear categoría

**Files:**
- Create: `src/app/admin/categorias/nueva/page.tsx`

**Interfaces:**
- Consumes: `<CategoriaForm />` (Task 7).
- Produces: ruta `/admin/categorias/nueva`.

- [ ] **Step 1: Implementar**

```tsx
import { createClient } from "@/lib/supabase/server";
import { CategoriaForm } from "../categoria-form";

export default async function NuevaCategoriaPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Nueva categoría
      </h1>
      <CategoriaForm
        defaultValues={{
          name: "",
          slug: "",
          description: "",
          parentId: null,
          sortOrder: 0,
          isActive: true,
        }}
        categoriasDisponibles={categorias ?? []}
      />
    </div>
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
git add "src/app/admin/categorias/nueva"
git commit -m "feat(admin): pagina de crear categoria"
```

---

## Task 10: Editar categoría

**Files:**
- Create: `src/app/admin/categorias/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `<CategoriaForm />` (Task 7).
- Produces: ruta `/admin/categorias/[id]/editar`.

- [ ] **Step 1: Implementar**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CategoriaForm } from "../../categoria-form";

export default async function EditarCategoriaPage({
  params,
}: PageProps<"/admin/categorias/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: categoria } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (!categoria) {
    notFound();
  }

  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Editar categoría
      </h1>
      <CategoriaForm
        categoriaId={categoria.id}
        defaultValues={{
          name: categoria.name,
          slug: categoria.slug,
          description: categoria.description ?? "",
          parentId: categoria.parent_id,
          sortOrder: categoria.sort_order,
          isActive: categoria.is_active,
        }}
        categoriasDisponibles={categorias ?? []}
      />
    </div>
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
git add "src/app/admin/categorias/[id]"
git commit -m "feat(admin): pagina de editar categoria"
```

---

## Task 11: Schemas zod de productos y variantes (TDD)

**Files:**
- Create: `src/lib/validation/__tests__/producto.test.ts`
- Create: `src/lib/validation/producto.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `varianteSchema`, `productoSchema`, `VarianteInput`,
  `ProductoInput` — usados por Task 13 (Server Actions) y Task 14
  (`ProductoForm`).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { productoSchema, varianteSchema } from "../producto";

describe("varianteSchema", () => {
  it("acepta variante con solo talla", () => {
    expect(
      varianteSchema.safeParse({
        talla: "M",
        color: "",
        sku: "SKU-1",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(true);
  });

  it("acepta variante con solo color", () => {
    expect(
      varianteSchema.safeParse({
        talla: "",
        color: "Rosa",
        sku: "SKU-1",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(true);
  });

  it("rechaza variante sin talla ni color", () => {
    expect(
      varianteSchema.safeParse({
        talla: "",
        color: "",
        sku: "SKU-1",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(false);
  });

  it("rechaza variante sin sku", () => {
    expect(
      varianteSchema.safeParse({
        talla: "M",
        color: "Rosa",
        sku: "",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(false);
  });
});

describe("productoSchema", () => {
  const base = {
    name: "Pijama Rosa",
    slug: "pijama-rosa",
    description: "",
    categoryId: null,
    price: 89900,
    compareAtPrice: null,
    sku: "PJ-001",
    stock: 10,
    isActive: true,
    isFeatured: false,
    variantes: [] as const,
  };

  it("acepta un producto sin variantes", () => {
    expect(productoSchema.safeParse(base).success).toBe(true);
  });

  it("acepta un producto con variantes validas", () => {
    expect(
      productoSchema.safeParse({
        ...base,
        variantes: [
          { talla: "M", color: "Rosa", sku: "PJ-001-M-ROSA", priceOverride: null, stock: 3 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rechaza precio negativo", () => {
    expect(productoSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
  });

  it("rechaza sku vacio", () => {
    expect(productoSchema.safeParse({ ...base, sku: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test src/lib/validation/__tests__/producto
```

Expected: FAIL — `producto` no existe todavía en `src/lib/validation`.

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";

export const varianteSchema = z
  .object({
    talla: z.string().trim().optional(),
    color: z.string().trim().optional(),
    sku: z.string().trim().min(1, "El SKU de la variante es obligatorio"),
    priceOverride: z.number().min(0).nullable(),
    stock: z.number().int().min(0),
  })
  .refine((data) => Boolean(data.talla) || Boolean(data.color), {
    message: "Ingresa talla, color, o ambos",
    path: ["talla"],
  });

export type VarianteInput = z.infer<typeof varianteSchema>;

export const productoSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  slug: z.string().trim().min(2, "El slug debe tener al menos 2 caracteres"),
  description: z.string().trim().optional(),
  categoryId: z.string().uuid().nullable(),
  price: z.number().min(0, "El precio no puede ser negativo"),
  compareAtPrice: z.number().min(0).nullable(),
  sku: z.string().trim().min(1, "El SKU es obligatorio"),
  stock: z.number().int().min(0),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  variantes: z.array(varianteSchema),
});

export type ProductoInput = z.infer<typeof productoSchema>;
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test src/lib/validation/__tests__/producto
```

Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/producto.ts src/lib/validation/__tests__/producto.test.ts
git commit -m "feat(admin): agrega schemas zod de productos y variantes"
```

---

## Task 12: Subida de imágenes a Storage

**Files:**
- Create: `src/lib/admin/upload-product-images.ts`

**Interfaces:**
- Consumes: `createClient()` de `src/lib/supabase/server.ts` (sesión del
  admin autenticado, respeta las policies de Storage de la Fase 2).
- Produces: `uploadProductImages(productId, files): Promise<{ error?: string }>`
  — usado por Task 13 (`createProducto`, `updateProducto`).

- [ ] **Step 1: Implementar**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

export async function uploadProductImages(
  productId: string,
  files: File[],
): Promise<{ error?: string }> {
  if (files.length === 0) {
    return {};
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", productId);

  let sortOrder = existing?.length ?? 0;
  const hasPrimaryAlready = sortOrder > 0;

  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop() ?? "jpg";
    const path = `${productId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file);

    if (uploadError) {
      return { error: "No se pudo subir una de las imágenes." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(path);

    const { error: insertError } = await supabase.from("product_images").insert({
      product_id: productId,
      url: publicUrl,
      sort_order: sortOrder,
      is_primary: !hasPrimaryAlready && index === 0,
    });

    if (insertError) {
      return { error: "No se pudo registrar una de las imágenes." };
    }

    sortOrder += 1;
  }

  return {};
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/upload-product-images.ts
git commit -m "feat(admin): sube imagenes de producto a Storage con la sesion del admin"
```

---

## Task 13: Server Actions de productos

**Files:**
- Create: `src/app/admin/productos/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()` (Task 3), `productoSchema`/`ProductoInput`
  (Task 11), `slugify()` (Task 2), `uploadProductImages()` (Task 12),
  `createClient()` de `src/lib/supabase/server.ts`.
- Produces: `createProducto()`, `updateProducto()`, `toggleProductoActivo()`,
  `deleteProductImage()`, `setPrimaryProductImage()` — usados por Task 14,
  Task 15.

- [ ] **Step 1: Implementar**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { productoSchema, type ProductoInput } from "@/lib/validation/producto";
import { slugify } from "@/lib/slug";
import { uploadProductImages } from "@/lib/admin/upload-product-images";

async function uniqueSlug(baseSlug: string, ignoreId?: string) {
  const supabase = await createClient();
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    let query = supabase.from("products").select("id").eq("slug", candidate);
    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

function nombreVariante(talla?: string, color?: string) {
  return [talla, color].filter(Boolean).join(" / ") || "Variante";
}

export async function createProducto(
  input: ProductoInput,
  imageFiles: File[],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name));

  const { data: producto, error } = await supabase
    .from("products")
    .insert({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      compare_at_price: parsed.data.compareAtPrice,
      sku: parsed.data.sku,
      stock: parsed.data.stock,
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .select("id")
    .single();

  if (error || !producto) {
    return {
      error: "No se pudo crear el producto. Verifica que el SKU no este repetido.",
    };
  }

  if (parsed.data.variantes.length > 0) {
    const { error: variantesError } = await supabase.from("product_variants").insert(
      parsed.data.variantes.map((variante) => ({
        product_id: producto.id,
        name: nombreVariante(variante.talla, variante.color),
        talla: variante.talla || null,
        color: variante.color || null,
        sku: variante.sku,
        price_override: variante.priceOverride,
        stock: variante.stock,
      })),
    );

    if (variantesError) {
      return {
        error: "El producto se creo, pero hubo un error con las variantes. Revisa los SKU.",
      };
    }
  }

  if (imageFiles.length > 0) {
    const uploadResult = await uploadProductImages(producto.id, imageFiles);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  revalidatePath("/admin/productos");
  return {};
}

export async function updateProducto(
  id: string,
  input: ProductoInput,
  newImageFiles: File[],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), id);

  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      compare_at_price: parsed.data.compareAtPrice,
      sku: parsed.data.sku,
      stock: parsed.data.stock,
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .eq("id", id);

  if (error) {
    return {
      error: "No se pudo actualizar el producto. Verifica que el SKU no este repetido.",
    };
  }

  // Nota: estrategia simple de "borrar y reinsertar" variantes. Es segura
  // mientras no existan cart_items/order_items referenciando variant_id
  // (eso ocurre a partir de la Fase 7); si en el futuro una variante ya
  // vendida se elimina aqui, el DELETE fallara por la FK sin ON DELETE
  // CASCADE en esas tablas — revisar entonces una estrategia de diff en vez
  // de reemplazo total.
  await supabase.from("product_variants").delete().eq("product_id", id);

  if (parsed.data.variantes.length > 0) {
    const { error: variantesError } = await supabase.from("product_variants").insert(
      parsed.data.variantes.map((variante) => ({
        product_id: id,
        name: nombreVariante(variante.talla, variante.color),
        talla: variante.talla || null,
        color: variante.color || null,
        sku: variante.sku,
        price_override: variante.priceOverride,
        stock: variante.stock,
      })),
    );

    if (variantesError) {
      return { error: "El producto se actualizo, pero hubo un error con las variantes." };
    }
  }

  if (newImageFiles.length > 0) {
    const uploadResult = await uploadProductImages(id, newImageFiles);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${id}/editar`);
  return {};
}

export async function toggleProductoActivo(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado del producto." };
  }

  revalidatePath("/admin/productos");
  return {};
}

export async function deleteProductImage(
  imageId: string,
  productId: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  // Nota: borra la fila de product_images pero no el archivo en Storage
  // (solo guardamos la URL publica, no la ruta cruda). El archivo huerfano
  // no afecta la funcionalidad; limpiarlo queda como mejora futura si el
  // volumen de Storage lo amerita.
  const supabase = await createClient();
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);

  if (error) {
    return { error: "No se pudo eliminar la imagen." };
  }

  revalidatePath(`/admin/productos/${productId}/editar`);
  return {};
}

export async function setPrimaryProductImage(
  imageId: string,
  productId: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId);

  const { error } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId);

  if (error) {
    return { error: "No se pudo marcar la imagen como principal." };
  }

  revalidatePath(`/admin/productos/${productId}/editar`);
  return {};
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/productos/actions.ts
git commit -m "feat(admin): agrega Server Actions de productos, variantes e imagenes"
```

---

## Task 14: Formulario de producto (variantes + imágenes)

**Files:**
- Modify: `next.config.ts`
- Create: `src/app/admin/productos/producto-form.tsx`

**Interfaces:**
- Consumes: `productoSchema`/`ProductoInput` (Task 11), `slugify()`
  (Task 2), Server Actions de Task 13, `Button`/`Input` de
  `@/components/ui/*`.
- Produces: `<ProductoForm />` — usado por Task 16 y Task 17.

- [ ] **Step 1: Configurar `next/image` para el dominio de Storage**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Implementar el formulario**

`src/app/admin/productos/producto-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { productoSchema, type ProductoInput } from "@/lib/validation/producto";
import { slugify } from "@/lib/slug";
import {
  createProducto,
  updateProducto,
  deleteProductImage,
  setPrimaryProductImage,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CategoriaOption = { id: string; name: string };
type ProductImage = { id: string; url: string; is_primary: boolean };

export function ProductoForm({
  productoId,
  defaultValues,
  categoriasDisponibles,
  imagenesExistentes = [],
}: {
  productoId?: string;
  defaultValues: ProductoInput;
  categoriasDisponibles: CategoriaOption[];
  imagenesExistentes?: ProductImage[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState(imagenesExistentes);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductoInput>({
    resolver: zodResolver(productoSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variantes",
  });

  const onSubmit = async (data: ProductoInput) => {
    setServerError(null);
    const result = productoId
      ? await updateProducto(productoId, data, imageFiles)
      : await createProducto(data, imageFiles);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/productos");
    router.refresh();
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!productoId) return;
    const result = await deleteProductImage(imageId, productoId);
    if (!result.error) {
      setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    if (!productoId) return;
    const result = await setPrimaryProductImage(imageId, productoId);
    if (!result.error) {
      setExistingImages((prev) =>
        prev.map((img) => ({ ...img, is_primary: img.id === imageId })),
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="text-sm text-brand-ciruela">
            Nombre
          </label>
          <Input
            id="name"
            {...register("name", {
              onChange: (e) => {
                if (!productoId) {
                  setValue("slug", slugify(e.target.value));
                }
              },
            })}
          />
          {errors.name && (
            <p className="text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="slug" className="text-sm text-brand-ciruela">
            Slug
          </label>
          <Input id="slug" {...register("slug")} />
          {errors.slug && (
            <p className="text-sm text-red-600">{errors.slug.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="description" className="text-sm text-brand-ciruela">
            Descripción
          </label>
          <Input id="description" {...register("description")} />
        </div>
        <div>
          <label htmlFor="categoryId" className="text-sm text-brand-ciruela">
            Categoría
          </label>
          <select
            id="categoryId"
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
            {...register("categoryId", { setValueAs: (v) => (v === "" ? null : v) })}
          >
            <option value="">Sin categoría</option>
            {categoriasDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="price" className="text-sm text-brand-ciruela">
              Precio
            </label>
            <Input
              id="price"
              type="number"
              step="0.01"
              {...register("price", { valueAsNumber: true })}
            />
            {errors.price && (
              <p className="text-sm text-red-600">{errors.price.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="compareAtPrice" className="text-sm text-brand-ciruela">
              Precio de comparación
            </label>
            <Input
              id="compareAtPrice"
              type="number"
              step="0.01"
              {...register("compareAtPrice", {
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="sku" className="text-sm text-brand-ciruela">
              SKU
            </label>
            <Input id="sku" {...register("sku")} />
            {errors.sku && (
              <p className="text-sm text-red-600">{errors.sku.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="stock" className="text-sm text-brand-ciruela">
              Stock
            </label>
            <Input
              id="stock"
              type="number"
              {...register("stock", { valueAsNumber: true })}
            />
            {errors.stock && (
              <p className="text-sm text-red-600">{errors.stock.message}</p>
            )}
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-brand-ciruela">
            <input type="checkbox" {...register("isActive")} />
            Activo
          </label>
          <label className="flex items-center gap-2 text-sm text-brand-ciruela">
            <input type="checkbox" {...register("isFeatured")} />
            Destacado
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg text-brand-ciruela">Variantes</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              append({ talla: "", color: "", sku: "", priceOverride: null, stock: 0 })
            }
            className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
          >
            Agregar variante
          </Button>
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-5 items-end gap-2 rounded-md border border-brand-rosa-claro p-3"
          >
            <div>
              <label className="text-xs text-brand-ciruela">Talla</label>
              <Input {...register(`variantes.${index}.talla` as const)} />
            </div>
            <div>
              <label className="text-xs text-brand-ciruela">Color</label>
              <Input {...register(`variantes.${index}.color` as const)} />
            </div>
            <div>
              <label className="text-xs text-brand-ciruela">SKU</label>
              <Input {...register(`variantes.${index}.sku` as const)} />
            </div>
            <div>
              <label className="text-xs text-brand-ciruela">Stock</label>
              <Input
                type="number"
                {...register(`variantes.${index}.stock` as const, {
                  valueAsNumber: true,
                })}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => remove(index)}
              className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
            >
              Quitar
            </Button>
            {errors.variantes?.[index]?.talla && (
              <p className="col-span-5 text-sm text-red-600">
                {errors.variantes[index]?.talla?.message}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-brand-ciruela">Imágenes</h2>
        {existingImages.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {existingImages.map((image) => (
              <div key={image.id} className="flex flex-col items-center gap-1">
                <Image
                  src={image.url}
                  alt=""
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-md border border-brand-rosa-claro object-cover"
                />
                <span className="text-xs text-brand-ciruela">
                  {image.is_primary ? "Principal" : ""}
                </span>
                <div className="flex gap-2 text-xs">
                  {!image.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(image.id)}
                      className="text-brand-rosa hover:underline"
                    >
                      Marcar principal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(image.id)}
                    className="text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts src/app/admin/productos/producto-form.tsx
git commit -m "feat(admin): agrega formulario de producto con variantes talla/color e imagenes"
```

---

## Task 15: Listado de productos

**Files:**
- Create: `src/app/admin/productos/toggle-producto-button.tsx`
- Create: `src/app/admin/productos/page.tsx`

**Interfaces:**
- Consumes: `toggleProductoActivo()` (Task 13), `createClient()` de
  `src/lib/supabase/server.ts`.
- Produces: ruta `/admin/productos`.

- [ ] **Step 1: Botón de activar/desactivar**

`src/app/admin/productos/toggle-producto-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleProductoActivo } from "./actions";

export function ToggleProductoButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await toggleProductoActivo(id, !isActive);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline"
    >
      {isActive ? "Desactivar" : "Activar"}
    </button>
  );
}
```

- [ ] **Step 2: Página de listado**

`src/app/admin/productos/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleProductoButton } from "./toggle-producto-button";

export default async function ProductosPage() {
  const supabase = await createClient();
  const [{ data: productos }, { data: categorias }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, stock, is_active, category_id")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name"),
  ]);

  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Productos</h1>
        <Link href="/admin/productos/nuevo">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nuevo producto
          </Button>
        </Link>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
            <th className="py-2">Nombre</th>
            <th className="py-2">SKU</th>
            <th className="py-2">Categoría</th>
            <th className="py-2">Precio</th>
            <th className="py-2">Stock</th>
            <th className="py-2">Activo</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {productos?.map((producto) => (
            <tr key={producto.id} className="border-b border-brand-rosa-claro/50">
              <td className="py-2">{producto.name}</td>
              <td className="py-2 text-brand-ciruela/70">{producto.sku}</td>
              <td className="py-2">
                {producto.category_id
                  ? (categoriaPorId.get(producto.category_id) ?? "—")
                  : "—"}
              </td>
              <td className="py-2">${producto.price}</td>
              <td className="py-2">{producto.stock}</td>
              <td className="py-2">{producto.is_active ? "Sí" : "No"}</td>
              <td className="flex gap-3 py-2">
                <Link
                  href={`/admin/productos/${producto.id}/editar`}
                  className="text-brand-rosa hover:underline"
                >
                  Editar
                </Link>
                <ToggleProductoButton id={producto.id} isActive={producto.is_active} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
git add src/app/admin/productos/toggle-producto-button.tsx src/app/admin/productos/page.tsx
git commit -m "feat(admin): pagina de listado de productos"
```

---

## Task 16: Crear producto

**Files:**
- Create: `src/app/admin/productos/nuevo/page.tsx`

**Interfaces:**
- Consumes: `<ProductoForm />` (Task 14).
- Produces: ruta `/admin/productos/nuevo`.

- [ ] **Step 1: Implementar**

```tsx
import { createClient } from "@/lib/supabase/server";
import { ProductoForm } from "../producto-form";

export default async function NuevoProductoPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nuevo producto</h1>
      <ProductoForm
        defaultValues={{
          name: "",
          slug: "",
          description: "",
          categoryId: null,
          price: 0,
          compareAtPrice: null,
          sku: "",
          stock: 0,
          isActive: true,
          isFeatured: false,
          variantes: [
            { talla: "", color: "", sku: "", priceOverride: null, stock: 0 },
          ],
        }}
        categoriasDisponibles={categorias ?? []}
      />
    </div>
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
git add "src/app/admin/productos/nuevo"
git commit -m "feat(admin): pagina de crear producto"
```

---

## Task 17: Editar producto

**Files:**
- Create: `src/app/admin/productos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `<ProductoForm />` (Task 14).
- Produces: ruta `/admin/productos/[id]/editar`.

- [ ] **Step 1: Implementar**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductoForm } from "../../producto-form";

export default async function EditarProductoPage({
  params,
}: PageProps<"/admin/productos/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (!producto) {
    notFound();
  }

  const [{ data: categorias }, { data: variantes }, { data: imagenes }] =
    await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      supabase
        .from("product_variants")
        .select("talla, color, sku, price_override, stock")
        .eq("product_id", id),
      supabase
        .from("product_images")
        .select("id, url, is_primary")
        .eq("product_id", id)
        .order("sort_order"),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar producto</h1>
      <ProductoForm
        productoId={producto.id}
        defaultValues={{
          name: producto.name,
          slug: producto.slug,
          description: producto.description ?? "",
          categoryId: producto.category_id,
          price: producto.price,
          compareAtPrice: producto.compare_at_price,
          sku: producto.sku,
          stock: producto.stock,
          isActive: producto.is_active,
          isFeatured: producto.is_featured,
          variantes: (variantes ?? []).map((v) => ({
            talla: v.talla ?? "",
            color: v.color ?? "",
            sku: v.sku,
            priceOverride: v.price_override,
            stock: v.stock,
          })),
        }}
        categoriasDisponibles={categorias ?? []}
        imagenesExistentes={imagenes ?? []}
      />
    </div>
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
git add "src/app/admin/productos/[id]"
git commit -m "feat(admin): pagina de editar producto"
```

---

## Task 18: Verificación manual end-to-end

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: Tasks 1–17, sesión real de `adminsu` (Fase 4).

- [ ] **Step 1: Levantar el servidor**

```bash
pnpm dev
```

- [ ] **Step 2: Login como superadmin**

Ir a `/login`, entrar con `adminsu` (o el email) y la contraseña de
`.env.local`.

- [ ] **Step 3: Crear categoría**

Ir a `/admin/categorias/nueva`, crear "Pijamas". Confirmar que aparece en el
listado con slug autogenerado.

- [ ] **Step 4: Crear producto con variantes e imágenes**

Ir a `/admin/productos/nuevo`. Llenar nombre, SKU, precio, categoría
"Pijamas". Agregar 2 variantes (ej. Talla M / Color Rosa, Talla L / Color
Azul) con SKUs distintos. Subir 2 imágenes. Guardar.

- [ ] **Step 5: Confirmar en la base de datos**

Vía `mcp__supabase__execute_sql`:

```sql
select p.name, p.sku, count(distinct pv.id) as variantes, count(distinct pi.id) as imagenes
from public.products p
left join public.product_variants pv on pv.product_id = p.id
left join public.product_images pi on pi.product_id = p.id
where p.slug = '<slug-del-producto-creado>'
group by p.name, p.sku;

select is_primary, sort_order from public.product_images pi
join public.products p on p.id = pi.product_id
where p.slug = '<slug-del-producto-creado>'
order by sort_order;
```

Expected: 2 variantes, 2 imágenes, la primera imagen (`sort_order = 0`) con
`is_primary = true`.

- [ ] **Step 6: Editar el producto**

Cambiar el precio, eliminar una imagen, marcar la restante como principal
(si no lo era). Guardar y confirmar los cambios reflejados en el listado.

- [ ] **Step 7: Desactivar categoría y producto**

Desde los listados, click en "Desactivar" para la categoría y el producto
creados. Confirmar que la columna "Activa"/"Activo" cambia a "No".

- [ ] **Step 8: Confirmar que un customer no accede a `/admin`**

Cerrar sesión, registrar o usar un usuario `customer` existente, iniciar
sesión, visitar `/admin/productos`. Confirmar redirección a `/login`.

- [ ] **Step 9: Detener el servidor**

```bash
# Ctrl+C o kill del proceso de pnpm dev
```

No requiere commit (verificación manual).

---

## Task 19: Verificación final y cierre de Fase 5

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: Tasks 1–18.

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

Expected: PASS (incluye los 18 tests nuevos de esta fase: 4 de `slugify`, 6
de `categoriaSchema`, 8 de `varianteSchema`/`productoSchema`, más los 20
existentes de fases anteriores).

- [ ] **Step 4: Commit de cierre de fase**

```bash
git add -A
git commit -m "chore: cierra Fase 5 (admin: categorias y productos) - build, lint y tests en verde" --allow-empty
```
