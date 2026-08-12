# Rediseño — Fase B2: Reseñas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un módulo de reseñas de clientas, con CRUD en el
panel admin (mismo nivel de permiso que Categorías/Productos) y una
sección en la home pública que se oculta sola si no hay reseñas
activas.

**Architecture:** Réplica exacta del patrón ya usado para Categorías:
tabla propia con RLS (lectura pública solo si `is_active`, escritura
solo admin), bucket de Storage dedicado, CRUD de 2 páginas + formulario
+ acciones + botón de activar/desactivar. La home consume las reseñas
activas ya resueltas y las pasa a un componente presentacional
(`ReviewsSection`) que no renderiza nada si la lista está vacía — mismo
criterio de "poco contenido" ya aplicado en la Fase B1 a
`CollectionBanners`.

**Tech Stack:** Next.js App Router (Server + Client Components),
Supabase (Postgres + Storage + RLS, vía MCP), react-hook-form + zod,
`lucide-react`.

## Global Constraints

- Todo el producto en español (UI, mensajes).
- Las rutas del admin evitan tildes/eñes aunque la UI sí las muestre
  (`/admin/resenas`, no `/admin/reseñas`) — mismo criterio que
  `categorias`/`productos`/`gastos`/`compras`/`informes`.
- El bucket `review-images` usa `is_admin()` en sus políticas de
  escritura (no `is_superadmin()`) — las reseñas son contenido de
  catálogo gestionado por admin, igual que `category-images`, a
  diferencia de `banner-images` de la Fase B1 que es exclusivo de
  superadmin porque vive en `store_settings`.
- Toda migración de Supabase se crea y aplica con el MCP de Supabase.
- Las imágenes se suben a Storage primero (obteniendo su URL pública)
  y luego se guarda esa URL como texto — mismo patrón ya usado por
  `uploadProductImages`/`subirImagenCategoria`.
- Los formularios que suben archivos envuelven su `onSubmit` en
  `try/catch`, mostrando un mensaje de error en español si algo falla
  (incluyendo el límite de tamaño de Server Actions) — lección de la
  revisión final de la Fase B1, aplicada aquí desde el inicio.
- No se rediseña ninguna otra página en este plan — solo se agrega la
  sección de reseñas a la home ya existente.

---

## Task 1: Tabla de reseñas, bucket y validación

**Files:**
- Create: `supabase/migrations/024_resenas.sql`
- Create: `src/lib/validation/resena.ts`

**Interfaces:**
- Produces: tabla `reviews(id, customer_name, body, rating, image_url,
  sort_order, is_active, created_at)` con RLS — consumida por las
  Tasks 2 y 3. Bucket `review-images` — consumido por la Task 2.
  `resenaSchema`, `ResenaInput` — consumidos por la Task 2.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/024_resenas.sql`:

```sql
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  body text not null,
  rating int not null check (rating between 1 and 5),
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index reviews_sort_order_idx on public.reviews(sort_order);

alter table public.reviews enable row level security;

create policy "reviews_select_active_or_admin"
  on public.reviews for select
  using (is_active or public.is_admin());
create policy "reviews_write_admin"
  on public.reviews for all
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('review-images', 'review-images', true)
on conflict (id) do nothing;

create policy "review_images_public_read"
  on storage.objects for select
  using (bucket_id = 'review-images');
create policy "review_images_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'review-images' and public.is_admin());
create policy "review_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'review-images' and public.is_admin());
create policy "review_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'review-images' and public.is_admin());
```

- [ ] **Step 2: Aplicar la migración con el MCP de Supabase**

Usa `ToolSearch` con `"select:mcp__supabase__apply_migration,mcp__supabase__list_tables,mcp__supabase__get_advisors,mcp__supabase__generate_typescript_types"`
si las herramientas no están cargadas. Aplica con
`mcp__supabase__apply_migration` (nombre `024_resenas`, contenido
exactamente el SQL del Step 1). Verifica con `mcp__supabase__list_tables`
que `reviews` existe con RLS habilitada, y con
`mcp__supabase__get_advisors` (tipo `security` y luego `performance`)
que no aparece ninguna advertencia nueva relacionada con `reviews` o
`review-images` (presta atención especial a que la política de
`reviews` use `public.is_admin()` sin envolver `auth.uid()`
directamente — revisa si el resto de políticas nuevas del proyecto
recientemente empezaron a envolver `auth.uid()` en `(select auth.uid())`
dentro de las funciones `is_admin()`/`is_superadmin()` mismas, no en
cada política individual, así que esto ya debería estar bien; si el
advisor de `performance` reporta `auth_rls_initplan` para `reviews`,
es una señal de que hace falta una migración de ajuste como la
`022_favoritos_hardening.sql` — en ese caso, resuélvelo antes de
continuar, no lo dejes pasar).

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Corre `mcp__supabase__generate_typescript_types` y sobrescribe
`src/lib/supabase/database.types.ts` con el resultado completo, para
que incluya la tabla `reviews`.

- [ ] **Step 4: Crear la validación**

Crea `src/lib/validation/resena.ts`:

```ts
import { z } from "zod";

export const resenaSchema = z.object({
  customerName: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  body: z.string().trim().min(10, "Ingresa un texto de al menos 10 caracteres"),
  rating: z
    .number()
    .int()
    .min(1, "La calificación debe ser entre 1 y 5")
    .max(5, "La calificación debe ser entre 1 y 5"),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});

export type ResenaInput = z.infer<typeof resenaSchema>;
```

- [ ] **Step 5: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/024_resenas.sql src/lib/validation/resena.ts src/lib/supabase/database.types.ts
git commit -m "feat: tabla de resenas con RLS, bucket de imagenes y validacion"
```

---

## Task 2: CRUD de reseñas en el admin

**Files:**
- Create: `src/lib/admin/upload-review-image.ts`
- Create: `src/app/admin/resenas/page.tsx`
- Create: `src/app/admin/resenas/resena-form.tsx`
- Create: `src/app/admin/resenas/actions.ts`
- Create: `src/app/admin/resenas/toggle-resena-button.tsx`
- Create: `src/app/admin/resenas/nueva/page.tsx`
- Create: `src/app/admin/resenas/[id]/editar/page.tsx`
- Modify: `src/app/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `resenaSchema`, `ResenaInput` (Task 1); tabla `reviews`,
  bucket `review-images` (Task 1); `requireAdmin`
  (`@/lib/admin/require-admin`, ya existente).
- Produces: nada consumido por otra task de este plan.

- [ ] **Step 1: Crear el helper de subida de imagen**

Crea `src/lib/admin/upload-review-image.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

export async function subirImagenResena(
  file: File,
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("review-images")
    .upload(path, file);

  if (uploadError) {
    return { error: "No se pudo subir la imagen." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("review-images").getPublicUrl(path);

  return { url: publicUrl };
}
```

- [ ] **Step 2: Crear las server actions**

Crea `src/app/admin/resenas/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { resenaSchema, type ResenaInput } from "@/lib/validation/resena";
import { subirImagenResena } from "@/lib/admin/upload-review-image";

export async function createResena(
  input: ResenaInput,
  imageFile: File | null,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = resenaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  let imageUrl: string | null = null;
  if (imageFile) {
    const uploadResult = await subirImagenResena(imageFile);
    if (uploadResult.error) return { error: uploadResult.error };
    imageUrl = uploadResult.url ?? null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reviews").insert({
    customer_name: parsed.data.customerName,
    body: parsed.data.body,
    rating: parsed.data.rating,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
    image_url: imageUrl,
  });

  if (error) {
    return { error: "No se pudo crear la reseña." };
  }

  revalidatePath("/admin/resenas");
  revalidatePath("/");
  return {};
}

export async function updateResena(
  id: string,
  input: ResenaInput,
  imageFile: File | null,
  imagenActual: string | null,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = resenaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  let imageUrl = imagenActual;
  if (imageFile) {
    const uploadResult = await subirImagenResena(imageFile);
    if (uploadResult.error) return { error: uploadResult.error };
    imageUrl = uploadResult.url ?? imagenActual;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      customer_name: parsed.data.customerName,
      body: parsed.data.body,
      rating: parsed.data.rating,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
      image_url: imageUrl,
    })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar la reseña." };
  }

  revalidatePath("/admin/resenas");
  revalidatePath("/");
  return {};
}

export async function toggleResenaActiva(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado de la reseña." };
  }

  revalidatePath("/admin/resenas");
  revalidatePath("/");
  return {};
}
```

- [ ] **Step 3: Crear `ResenaForm`**

Crea `src/app/admin/resenas/resena-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { resenaSchema, type ResenaInput } from "@/lib/validation/resena";
import { createResena, updateResena } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResenaForm({
  resenaId,
  defaultValues,
  imagenActual = null,
}: {
  resenaId?: string;
  defaultValues: ResenaInput;
  imagenActual?: string | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResenaInput>({
    resolver: zodResolver(resenaSchema),
    defaultValues,
  });

  const onSubmit = async (data: ResenaInput) => {
    setServerError(null);
    try {
      const result = resenaId
        ? await updateResena(resenaId, data, imageFile, imagenActual)
        : await createResena(data, imageFile);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      router.push("/admin/resenas");
      router.refresh();
    } catch {
      setServerError(
        "No se pudo guardar la reseña. Verifica que la imagen no supere los 8MB.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="customerName" className="text-sm text-brand-ciruela">
          Nombre de la clienta
        </label>
        <Input id="customerName" {...register("customerName")} />
        {errors.customerName && (
          <p className="text-sm text-red-600">{errors.customerName.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="body" className="text-sm text-brand-ciruela">
          Texto de la reseña
        </label>
        <textarea
          id="body"
          rows={4}
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("body")}
        />
        {errors.body && <p className="text-sm text-red-600">{errors.body.message}</p>}
      </div>
      <div>
        <label htmlFor="rating" className="text-sm text-brand-ciruela">
          Calificación
        </label>
        <select
          id="rating"
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("rating", { valueAsNumber: true })}
        >
          {[5, 4, 3, 2, 1].map((valor) => (
            <option key={valor} value={valor}>
              {valor} {valor === 1 ? "estrella" : "estrellas"}
            </option>
          ))}
        </select>
        {errors.rating && <p className="text-sm text-red-600">{errors.rating.message}</p>}
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
      <div className="flex flex-col gap-2">
        <label className="text-sm text-brand-ciruela">Foto (opcional)</label>
        {imagenActual && (
          <Image
            src={imagenActual}
            alt=""
            width={200}
            height={112}
            className="h-28 w-full max-w-xs rounded-md object-cover"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
        />
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

- [ ] **Step 4: Crear `ToggleResenaButton`**

Crea `src/app/admin/resenas/toggle-resena-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleResenaActiva } from "./actions";

export function ToggleResenaButton({
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
      await toggleResenaActiva(id, !isActive);
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

- [ ] **Step 5: Crear la página de listado**

Crea `src/app/admin/resenas/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleResenaButton } from "./toggle-resena-button";

export default async function ResenasPage() {
  const supabase = await createClient();
  const { data: resenas } = await supabase
    .from("reviews")
    .select("id, customer_name, rating, sort_order, is_active")
    .order("sort_order", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Reseñas</h1>
        <Link href="/admin/resenas/nueva">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nueva reseña
          </Button>
        </Link>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
            <th className="py-2">Clienta</th>
            <th className="py-2">Calificación</th>
            <th className="py-2">Orden</th>
            <th className="py-2">Activa</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {resenas?.map((resena) => (
            <tr key={resena.id} className="border-b border-brand-rosa-claro/50">
              <td className="py-2">{resena.customer_name}</td>
              <td className="py-2">{resena.rating} / 5</td>
              <td className="py-2">{resena.sort_order}</td>
              <td className="py-2">{resena.is_active ? "Sí" : "No"}</td>
              <td className="flex gap-3 py-2">
                <Link
                  href={`/admin/resenas/${resena.id}/editar`}
                  className="text-brand-rosa hover:underline"
                >
                  Editar
                </Link>
                <ToggleResenaButton id={resena.id} isActive={resena.is_active} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Crear la página "Nueva reseña"**

Crea `src/app/admin/resenas/nueva/page.tsx`:

```tsx
import { ResenaForm } from "../resena-form";

export default function NuevaResenaPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nueva reseña</h1>
      <ResenaForm
        defaultValues={{
          customerName: "",
          body: "",
          rating: 5,
          sortOrder: 0,
          isActive: true,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Crear la página "Editar reseña"**

Crea `src/app/admin/resenas/[id]/editar/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResenaForm } from "../../resena-form";

export default async function EditarResenaPage({
  params,
}: PageProps<"/admin/resenas/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: resena } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", id)
    .single();

  if (!resena) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar reseña</h1>
      <ResenaForm
        resenaId={resena.id}
        defaultValues={{
          customerName: resena.customer_name,
          body: resena.body,
          rating: resena.rating,
          sortOrder: resena.sort_order,
          isActive: resena.is_active,
        }}
        imagenActual={resena.image_url}
      />
    </div>
  );
}
```

- [ ] **Step 8: Agregar el link "Reseñas" a la navegación del admin**

En `src/app/admin/admin-nav.tsx`, agrega una línea a `ENLACES_BASE`
entre "Productos" y "Gastos":

```tsx
const ENLACES_BASE = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/resenas", label: "Reseñas" },
  { href: "/admin/gastos", label: "Gastos" },
  { href: "/admin/compras", label: "Compras" },
  { href: "/admin/informes", label: "Informes" },
];
```

- [ ] **Step 9: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos, y `/admin/resenas` aparece en la lista de
rutas del build.

- [ ] **Step 10: Commit**

```bash
git add src/lib/admin/upload-review-image.ts src/app/admin/resenas src/app/admin/admin-nav.tsx
git commit -m "feat: CRUD de resenas en el panel admin"
```

---

## Task 3: Sección de reseñas en la home pública

**Files:**
- Create: `src/components/store/reviews-section.tsx`
- Modify: `src/app/(store)/page.tsx`

**Interfaces:**
- Consumes: tabla `reviews` (Task 1).
- Produces: `ReviewsSection({ resenas })`, `ReviewItem` — no lo
  consume ninguna otra task de este plan.

- [ ] **Step 1: Crear `ReviewsSection`**

Crea `src/components/store/reviews-section.tsx`:

```tsx
import Image from "next/image";
import { Star } from "lucide-react";

export type ReviewItem = {
  id: string;
  customerName: string;
  body: string;
  rating: number;
  imageUrl: string | null;
};

export function ReviewsSection({ resenas }: { resenas: ReviewItem[] }) {
  if (resenas.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl text-brand-ciruela">
        Lo que dicen nuestras clientas
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {resenas.map((resena) => (
          <div
            key={resena.id}
            className="flex flex-col gap-3 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm"
          >
            <div className="flex items-center gap-3">
              {resena.imageUrl ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-brand-rosa-claro">
                  <Image src={resena.imageUrl} alt="" fill className="object-cover" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-rosa-claro font-heading text-brand-ciruela">
                  {resena.customerName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-body text-sm text-brand-ciruela">
                  {resena.customerName}
                </span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className="h-3.5 w-3.5 text-brand-oro"
                      fill={index < resena.rating ? "currentColor" : "none"}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-sm text-brand-ciruela/80">{resena.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Conectar la sección en la home**

En `src/app/(store)/page.tsx`, agrega el import al inicio del archivo,
junto a los demás imports de componentes de `@/components/store`:

```ts
import { ReviewsSection, type ReviewItem } from "@/components/store/reviews-section";
```

Cambia el primer `Promise.all` para agregar una quinta consulta.
Reemplaza:

```ts
  const [{ data: destacados }, { data: { user } }, { data: categorias }, { data: settingsRows }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, slug, price, compare_at_price")
        .eq("is_active", true)
        .eq("is_featured", true)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.auth.getUser(),
      supabase
        .from("categories")
        .select("id, name, slug, image_url")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("store_settings")
        .select("key, value")
        .in("key", ["home_hero", "home_banners"]),
    ]);
```

por:

```ts
  const [
    { data: destacados },
    { data: { user } },
    { data: categorias },
    { data: settingsRows },
    { data: resenasData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, price, compare_at_price")
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.auth.getUser(),
    supabase
      .from("categories")
      .select("id, name, slug, image_url")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("store_settings")
      .select("key, value")
      .in("key", ["home_hero", "home_banners"]),
    supabase
      .from("reviews")
      .select("id, customer_name, body, rating, image_url")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(6),
  ]);
```

Agrega la construcción de `resenas` justo después del bloque que
calcula `banners` (después de la línea
`const banners = bannersParsed.success ? bannersParsed.data : [];`):

```ts
  const resenas: ReviewItem[] = (resenasData ?? []).map((r) => ({
    id: r.id,
    customerName: r.customer_name,
    body: r.body,
    rating: r.rating,
    imageUrl: r.image_url,
  }));
```

Y agrega `<ReviewsSection resenas={resenas} />` dentro del `<main>`,
justo después del bloque de "Destacados" (después del `)}` que cierra
`{productos.length > 0 && (...)}`, antes del `</main>` de cierre):

```tsx
      {productos.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl text-brand-ciruela">Destacados</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {productos.map((producto) => (
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

      <ReviewsSection resenas={resenas} />
    </main>
```

No cambies nada más de este archivo (hero, beneficios, categorías,
banners quedan iguales — son alcance de la Fase B1, ya implementada).

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/components/store/reviews-section.tsx "src/app/(store)/page.tsx"
git commit -m "feat: seccion de resenas en la home publica"
```

---

## Task 4: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-3.

- [ ] **Step 1: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 (Windows) y arranca uno limpio con `pnpm dev`
en segundo plano si hace falta.

- [ ] **Step 2: Verificar que la home carga sin errores sin reseñas**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Expected: `200` — confirma que la home no se rompe sin ninguna reseña
activa todavía (la tabla `reviews` está vacía en este punto).

```bash
curl -s http://localhost:3000/ | grep -o "Lo que dicen nuestras clientas" | head -1
```

Expected: no imprime nada (la sección no se renderiza sin reseñas) —
si imprime el texto, hay un bug: la sección debería ocultarse.

- [ ] **Step 3: Verificar que `/admin/resenas` está protegido**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/resenas
```

Expected: `307` o `302` (redirige a login sin sesión).

- [ ] **Step 4: Confirmar en código que `/pos` y `/superadmin` no importan nada de reseñas**

Búsqueda de texto (`ReviewsSection|resena|Resena`) dentro de
`src/app/pos` y `src/app/superadmin` — no debe haber ningún resultado.
`src/app/admin` SÍ debe tener resultados (`src/app/admin/resenas/**` y
el link en `admin-nav.tsx`) — confirma que es exactamente ahí donde
aparecen, no en otro lado inesperado.

- [ ] **Step 5: Detener el servidor**

Detener el servidor de desarrollo si se levantó en el Step 1.

- [ ] **Step 6: Nota para el reporte final**

Deja anotado en tu reporte que la verificación visual completa (crear
una reseña con foto desde el panel, confirmar que aparece en la home
con sus estrellas correctas, desactivarla y confirmar que desaparece)
no se hizo de forma interactiva en navegador — recomienda al usuario
ese recorrido manual, igual que en fases anteriores de este proyecto.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 4, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
