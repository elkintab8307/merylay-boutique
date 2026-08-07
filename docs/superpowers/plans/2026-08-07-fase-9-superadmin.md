# Fase 9 — SuperAdmin: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el panel `/superadmin` para que el rol `superadmin` gestione
usuarios/roles (incluyendo bloqueo real de acceso) y los ajustes generales de
la tienda, completando el roadmap de `CLAUDE.md` §12 punto 9.

**Architecture:** Server Components para lectura (RLS ya permite a superadmin
leer todo en `profiles`; `store_settings` es de lectura pública), Server
Actions `"use server"` para mutaciones (patrón `{ error?: string }` ya
establecido en Fases 5/7/8), y el cliente de service role (`createAdminClient`,
ya existente desde la Fase 3) solo para las dos operaciones que no tienen
equivalente en RLS: leer `banned_until` de `auth.users` y bloquear/reactivar
usuarios vía `auth.admin.updateUserById`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions),
Supabase (`@supabase/supabase-js` admin client, PostgREST), zod,
react-hook-form + `@hookform/resolvers/zod`, Tailwind, Vitest.

## Global Constraints

- Toda la UI, textos y mensajes de error en español (CLAUDE.md §0).
- `RLS` siempre activo; el `service_role` (vía `createAdminClient`) solo se
  usa en Server Actions/Server Components, nunca se expone al cliente.
- Sin `any` sin justificar; TypeScript estricto.
- No se crean migraciones nuevas — el esquema de `profiles` y
  `store_settings` ya cubre todo lo necesario (ver spec).
- El selector de rol en la UI nunca ofrece `superadmin` como opción asignable
  — solo `customer | staff | admin`.
- Un superadmin no puede cambiarse el rol a sí mismo ni bloquearse a sí mismo
  desde el panel.
- Commits atómicos en español después de cada tarea funcional.
- Spec de referencia: `docs/superpowers/specs/2026-08-07-fase-9-superadmin-design.md`.

---

## Mapa de archivos

```
src/lib/admin/user-guards.ts                  # nuevo — reglas puras de auto-modificación
src/lib/admin/__tests__/user-guards.test.ts   # nuevo
src/lib/admin/require-superadmin.ts           # nuevo — guard de autorización
src/lib/validation/store-settings.ts          # nuevo — schema zod + mapa de claves
src/lib/validation/__tests__/store-settings.test.ts  # nuevo

src/app/superadmin/layout.tsx                 # nuevo
src/app/superadmin/superadmin-nav.tsx         # nuevo
src/app/superadmin/usuarios/actions.ts        # nuevo
src/app/superadmin/usuarios/page.tsx          # nuevo
src/app/superadmin/usuarios/user-row-actions.tsx  # nuevo
src/app/superadmin/ajustes/actions.ts         # nuevo
src/app/superadmin/ajustes/page.tsx           # nuevo
src/app/superadmin/ajustes/ajustes-form.tsx   # nuevo
```

---

### Task 1: Reglas puras de auto-modificación (`user-guards.ts`)

**Files:**
- Create: `src/lib/admin/user-guards.ts`
- Test: `src/lib/admin/__tests__/user-guards.test.ts`

**Interfaces:**
- Produces: `puedeCambiarRol(actorId: string, targetId: string): boolean`,
  `puedeBloquear(actorId: string, targetId: string): boolean` — usados por
  Task 5 (`usuarios/actions.ts`).

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { puedeBloquear, puedeCambiarRol } from "../user-guards";

describe("puedeCambiarRol", () => {
  it("permite cambiar el rol de otro usuario", () => {
    expect(puedeCambiarRol("actor-1", "usuario-2")).toBe(true);
  });

  it("no permite que un usuario se cambie su propio rol", () => {
    expect(puedeCambiarRol("actor-1", "actor-1")).toBe(false);
  });
});

describe("puedeBloquear", () => {
  it("permite bloquear a otro usuario", () => {
    expect(puedeBloquear("actor-1", "usuario-2")).toBe(true);
  });

  it("no permite que un usuario se bloquee a si mismo", () => {
    expect(puedeBloquear("actor-1", "actor-1")).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/admin/__tests__/user-guards.test.ts`
Expected: FAIL (módulo `../user-guards` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
export function puedeCambiarRol(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}

export function puedeBloquear(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/admin/__tests__/user-guards.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/user-guards.ts src/lib/admin/__tests__/user-guards.test.ts
git commit -m "feat: reglas de auto-modificacion para gestion de usuarios (Fase 9)"
```

---

### Task 2: Schema de ajustes de la tienda (`store-settings.ts`)

**Files:**
- Create: `src/lib/validation/store-settings.ts`
- Test: `src/lib/validation/__tests__/store-settings.test.ts`

**Interfaces:**
- Produces: `storeSettingsSchema` (zod), `type StoreSettingsInput`,
  `STORE_SETTINGS_KEYS` (mapa `campo -> key de store_settings`) — usados por
  Task 7 (`ajustes/actions.ts`) y Task 8 (`ajustes/page.tsx`,
  `ajustes-form.tsx`).

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { storeSettingsSchema } from "../store-settings";

const base = {
  nombreTienda: "MeryLay Boutique",
  contactoEmail: "contacto@merylayboutique.com",
  contactoTelefono: "3001234567",
  envioCostoDefecto: 15000,
  redesInstagram: "",
  redesFacebook: "",
  redesTiktok: "",
  redesWhatsapp: "",
};

describe("storeSettingsSchema", () => {
  it("acepta datos validos con redes vacias", () => {
    expect(storeSettingsSchema.safeParse(base).success).toBe(true);
  });

  it("acepta URLs de redes cuando se completan", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      redesInstagram: "https://instagram.com/merylay",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un correo de contacto invalido", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      contactoEmail: "no-es-un-correo",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un costo de envio negativo", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      envioCostoDefecto: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una URL de red social mal formada", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      redesInstagram: "no-es-una-url",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un nombre de tienda demasiado corto", () => {
    const result = storeSettingsSchema.safeParse({ ...base, nombreTienda: "M" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/lib/validation/__tests__/store-settings.test.ts`
Expected: FAIL (módulo `../store-settings` no existe)

- [ ] **Step 3: Implementación mínima**

```ts
import { z } from "zod";

const optionalUrl = z.union([
  z.literal(""),
  z.string().trim().url("Ingresa una URL válida"),
]);

export const storeSettingsSchema = z.object({
  nombreTienda: z.string().trim().min(2, "Ingresa el nombre de la tienda"),
  contactoEmail: z.string().trim().email("Ingresa un correo válido"),
  contactoTelefono: z.string().trim().min(7, "Ingresa un teléfono válido"),
  envioCostoDefecto: z
    .number()
    .int()
    .min(0, "El costo de envío no puede ser negativo"),
  redesInstagram: optionalUrl,
  redesFacebook: optionalUrl,
  redesTiktok: optionalUrl,
  redesWhatsapp: optionalUrl,
});

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

export const STORE_SETTINGS_KEYS: Record<keyof StoreSettingsInput, string> = {
  nombreTienda: "nombre_tienda",
  contactoEmail: "contacto_email",
  contactoTelefono: "contacto_telefono",
  envioCostoDefecto: "envio_costo_defecto",
  redesInstagram: "redes_instagram",
  redesFacebook: "redes_facebook",
  redesTiktok: "redes_tiktok",
  redesWhatsapp: "redes_whatsapp",
};
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/lib/validation/__tests__/store-settings.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/store-settings.ts src/lib/validation/__tests__/store-settings.test.ts
git commit -m "feat: schema de ajustes de la tienda (Fase 9)"
```

---

### Task 3: Guard de autorización (`require-superadmin.ts`)

**Files:**
- Create: `src/lib/admin/require-superadmin.ts`

**Interfaces:**
- Consumes: `getCurrentProfile()` de `src/lib/auth/get-current-user.ts`
  (retorna `CurrentUser | null` con `profile.role`).
- Produces: `requireSuperadmin(): Promise<CurrentUser>` — usado por Task 5
  (`usuarios/actions.ts`) y Task 7 (`ajustes/actions.ts`).

- [ ] **Step 1: Implementación**

```ts
import { getCurrentProfile } from "@/lib/auth/get-current-user";

export async function requireSuperadmin() {
  const currentUser = await getCurrentProfile();
  if (!currentUser || currentUser.profile.role !== "superadmin") {
    throw new Error("No autorizado.");
  }
  return currentUser;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/require-superadmin.ts
git commit -m "feat: guard requireSuperadmin para acciones del panel SuperAdmin (Fase 9)"
```

---

### Task 4: Layout y navegación de `/superadmin`

**Files:**
- Create: `src/app/superadmin/superadmin-nav.tsx`
- Create: `src/app/superadmin/layout.tsx`

**Interfaces:**
- Consumes: ninguna (rutas ya protegidas por `proxy.ts` de la Fase 1/3, que
  exige `role = 'superadmin'` para `/superadmin/**`).
- Produces: layout compartido para Tasks 6 y 8.

- [ ] **Step 1: Crear `superadmin-nav.tsx`**

```tsx
import Link from "next/link";

export function SuperadminNav() {
  return (
    <nav className="flex gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <Link href="/superadmin/usuarios" className="hover:text-brand-rosa">
        Usuarios
      </Link>
      <Link href="/superadmin/ajustes" className="hover:text-brand-rosa">
        Ajustes
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Crear `layout.tsx`**

```tsx
import { SuperadminNav } from "./superadmin-nav";

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-crema">
      <SuperadminNav />
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: build exitoso. Un `layout.tsx` sin páginas hijas no genera una ruta
por sí mismo, así que el build no falla por ausencia de `page.tsx` — las
páginas de `usuarios/` y `ajustes/` se añaden en Tasks 6 y 8.

- [ ] **Step 4: Commit**

```bash
git add src/app/superadmin/superadmin-nav.tsx src/app/superadmin/layout.tsx
git commit -m "feat: layout y navegacion del panel SuperAdmin (Fase 9)"
```

---

### Task 5: Server Actions de gestión de usuarios

**Files:**
- Create: `src/app/superadmin/usuarios/actions.ts`

**Interfaces:**
- Consumes: `requireSuperadmin()` (Task 3), `puedeCambiarRol`/`puedeBloquear`
  (Task 1), `createClient()` de `@/lib/supabase/server`, `createAdminClient()`
  de `@/lib/supabase/admin` (ya existente).
- Produces: `cambiarRol(userId: string, nuevoRol: string): Promise<{ error?: string }>`,
  `bloquearUsuario(userId: string): Promise<{ error?: string }>`,
  `reactivarUsuario(userId: string): Promise<{ error?: string }>` — usados por
  Task 6 (`user-row-actions.tsx`).

- [ ] **Step 1: Implementación**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { puedeBloquear, puedeCambiarRol } from "@/lib/admin/user-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const rolAsignableSchema = z.enum(["customer", "staff", "admin"]);

export async function cambiarRol(
  userId: string,
  nuevoRol: string,
): Promise<{ error?: string }> {
  const actor = await requireSuperadmin();

  const parsed = rolAsignableSchema.safeParse(nuevoRol);
  if (!parsed.success) {
    return { error: "Rol inválido." };
  }

  if (!puedeCambiarRol(actor.id, userId)) {
    return { error: "No puedes cambiar tu propio rol." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data })
    .eq("id", userId);

  if (error) {
    return { error: "No se pudo cambiar el rol." };
  }

  revalidatePath("/superadmin/usuarios");
  return {};
}

export async function bloquearUsuario(
  userId: string,
): Promise<{ error?: string }> {
  const actor = await requireSuperadmin();

  if (!puedeBloquear(actor.id, userId)) {
    return { error: "No puedes bloquearte a ti mismo." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });

  if (error) {
    return { error: "No se pudo bloquear al usuario." };
  }

  revalidatePath("/superadmin/usuarios");
  return {};
}

export async function reactivarUsuario(
  userId: string,
): Promise<{ error?: string }> {
  await requireSuperadmin();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (error) {
    return { error: "No se pudo reactivar al usuario." };
  }

  revalidatePath("/superadmin/usuarios");
  return {};
}
```

Nota: `ban_duration: "876000h"` (100 años) es el valor que documenta Supabase
para un bloqueo efectivamente permanente; `"none"` limpia el bloqueo. Ambos
confirmados en el tipo `AdminUserAttributes` de `@supabase/auth-js`.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/usuarios/actions.ts
git commit -m "feat: server actions para cambiar rol y bloquear/reactivar usuarios (Fase 9)"
```

---

### Task 6: Página y componente de fila de `/superadmin/usuarios`

**Files:**
- Create: `src/app/superadmin/usuarios/user-row-actions.tsx`
- Create: `src/app/superadmin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `cambiarRol`, `bloquearUsuario`, `reactivarUsuario` (Task 5);
  `getCurrentProfile()`; `createClient()`; `createAdminClient()`.
- Produces: página completa, sin consumidores posteriores en este plan.

- [ ] **Step 1: Crear `user-row-actions.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bloquearUsuario, cambiarRol, reactivarUsuario } from "./actions";

const ROLES_ASIGNABLES = [
  { value: "customer", label: "Cliente" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Admin" },
] as const;

export function UserRowActions({
  userId,
  role,
  isBlocked,
  isSelf,
}: {
  userId: string;
  role: string;
  isBlocked: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (role === "superadmin") {
    return <span className="text-brand-ciruela/50">—</span>;
  }

  const handleRoleChange = (nuevoRol: string) => {
    setError(null);
    startTransition(async () => {
      const result = await cambiarRol(userId, nuevoRol);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleToggleBloqueo = () => {
    setError(null);
    startTransition(async () => {
      const result = isBlocked
        ? await reactivarUsuario(userId)
        : await bloquearUsuario(userId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          value={role}
          disabled={isPending || isSelf}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="rounded border border-brand-rosa-claro bg-white px-2 py-1 text-sm text-brand-ciruela disabled:opacity-50"
        >
          {ROLES_ASIGNABLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleToggleBloqueo}
          disabled={isPending || isSelf}
          className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline disabled:opacity-50 disabled:hover:no-underline"
        >
          {isBlocked ? "Reactivar" : "Bloquear"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

```tsx
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UserRowActions } from "./user-row-actions";

const ROL_LABELS: Record<string, string> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  staff: "Staff",
  customer: "Cliente",
};

export default async function UsuariosPage() {
  const currentUser = await getCurrentProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    admin.auth.admin.listUsers(),
  ]);

  const bannedById = new Map(
    (authData?.users ?? []).map((u) => [
      u.id,
      Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
    ]),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Usuarios</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
            <th className="py-2">Usuario</th>
            <th className="py-2">Nombre</th>
            <th className="py-2">Rol</th>
            <th className="py-2">Estado</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {(profiles ?? []).map((profile) => (
            <tr
              key={profile.id}
              className="border-b border-brand-rosa-claro/50"
            >
              <td className="py-2">{profile.username}</td>
              <td className="py-2 text-brand-ciruela/70">
                {profile.full_name ?? "-"}
              </td>
              <td className="py-2">
                {ROL_LABELS[profile.role] ?? profile.role}
              </td>
              <td className="py-2">
                {bannedById.get(profile.id) ? (
                  <span className="text-red-600">Bloqueado</span>
                ) : (
                  <span className="text-green-700">Activo</span>
                )}
              </td>
              <td className="py-2">
                <UserRowActions
                  userId={profile.id}
                  role={profile.role}
                  isBlocked={bannedById.get(profile.id) ?? false}
                  isSelf={profile.id === currentUser?.id}
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

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos, sin errores de tipos ni de lint

- [ ] **Step 4: Commit**

```bash
git add src/app/superadmin/usuarios/user-row-actions.tsx src/app/superadmin/usuarios/page.tsx
git commit -m "feat: pagina de gestion de usuarios en SuperAdmin (Fase 9)"
```

---

### Task 7: Server Action de ajustes de la tienda

**Files:**
- Create: `src/app/superadmin/ajustes/actions.ts`

**Interfaces:**
- Consumes: `requireSuperadmin()` (Task 3), `storeSettingsSchema`,
  `STORE_SETTINGS_KEYS`, `type StoreSettingsInput` (Task 2), `createClient()`.
- Produces: `guardarAjustes(input: StoreSettingsInput): Promise<{ error?: string }>`
  — usado por Task 8 (`ajustes-form.tsx`).

- [ ] **Step 1: Implementación**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { createClient } from "@/lib/supabase/server";
import {
  STORE_SETTINGS_KEYS,
  storeSettingsSchema,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";

export async function guardarAjustes(
  input: StoreSettingsInput,
): Promise<{ error?: string }> {
  await requireSuperadmin();

  const parsed = storeSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const campos = Object.keys(STORE_SETTINGS_KEYS) as (keyof StoreSettingsInput)[];
  const rows = campos.map((campo) => ({
    key: STORE_SETTINGS_KEYS[campo],
    value: parsed.data[campo],
  }));

  const { error } = await supabase
    .from("store_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return { error: "No se pudieron guardar los ajustes." };
  }

  revalidatePath("/superadmin/ajustes");
  return {};
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/ajustes/actions.ts
git commit -m "feat: server action para guardar ajustes de la tienda (Fase 9)"
```

---

### Task 8: Página y formulario de `/superadmin/ajustes`

**Files:**
- Create: `src/app/superadmin/ajustes/ajustes-form.tsx`
- Create: `src/app/superadmin/ajustes/page.tsx`

**Interfaces:**
- Consumes: `guardarAjustes` (Task 7), `storeSettingsSchema`,
  `STORE_SETTINGS_KEYS`, `type StoreSettingsInput` (Task 2), `createClient()`.
- Produces: página completa, sin consumidores posteriores en este plan.

- [ ] **Step 1: Crear `ajustes-form.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  storeSettingsSchema,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";
import { guardarAjustes } from "./actions";

export function AjustesForm({
  defaultValues,
}: {
  defaultValues: StoreSettingsInput;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StoreSettingsInput>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues,
  });

  const onSubmit = async (data: StoreSettingsInput) => {
    setServerError(null);
    setSuccess(false);
    const result = await guardarAjustes(data);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-xl flex-col gap-6"
    >
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg text-brand-ciruela">
          Datos generales
        </h2>
        <div>
          <label htmlFor="nombreTienda" className="text-sm text-brand-ciruela">
            Nombre de la tienda
          </label>
          <Input id="nombreTienda" {...register("nombreTienda")} />
          {errors.nombreTienda && (
            <p className="text-sm text-red-600">
              {errors.nombreTienda.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="contactoEmail" className="text-sm text-brand-ciruela">
            Correo de contacto
          </label>
          <Input id="contactoEmail" {...register("contactoEmail")} />
          {errors.contactoEmail && (
            <p className="text-sm text-red-600">
              {errors.contactoEmail.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="contactoTelefono"
            className="text-sm text-brand-ciruela"
          >
            Teléfono de contacto
          </label>
          <Input id="contactoTelefono" {...register("contactoTelefono")} />
          {errors.contactoTelefono && (
            <p className="text-sm text-red-600">
              {errors.contactoTelefono.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg text-brand-ciruela">Envío</h2>
        <div>
          <label
            htmlFor="envioCostoDefecto"
            className="text-sm text-brand-ciruela"
          >
            Costo de envío por defecto (COP)
          </label>
          <Input
            id="envioCostoDefecto"
            type="number"
            {...register("envioCostoDefecto", { valueAsNumber: true })}
          />
          {errors.envioCostoDefecto && (
            <p className="text-sm text-red-600">
              {errors.envioCostoDefecto.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg text-brand-ciruela">
          Redes sociales
        </h2>
        <div>
          <label
            htmlFor="redesInstagram"
            className="text-sm text-brand-ciruela"
          >
            Instagram
          </label>
          <Input id="redesInstagram" {...register("redesInstagram")} />
          {errors.redesInstagram && (
            <p className="text-sm text-red-600">
              {errors.redesInstagram.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="redesFacebook" className="text-sm text-brand-ciruela">
            Facebook
          </label>
          <Input id="redesFacebook" {...register("redesFacebook")} />
          {errors.redesFacebook && (
            <p className="text-sm text-red-600">
              {errors.redesFacebook.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="redesTiktok" className="text-sm text-brand-ciruela">
            TikTok
          </label>
          <Input id="redesTiktok" {...register("redesTiktok")} />
          {errors.redesTiktok && (
            <p className="text-sm text-red-600">{errors.redesTiktok.message}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="redesWhatsapp"
            className="text-sm text-brand-ciruela"
          >
            WhatsApp
          </label>
          <Input id="redesWhatsapp" {...register("redesWhatsapp")} />
          {errors.redesWhatsapp && (
            <p className="text-sm text-red-600">
              {errors.redesWhatsapp.message}
            </p>
          )}
        </div>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && (
        <p className="text-sm text-green-700">
          Ajustes guardados correctamente.
        </p>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        Guardar cambios
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import {
  STORE_SETTINGS_KEYS,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";
import { AjustesForm } from "./ajustes-form";

export default async function AjustesPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("store_settings")
    .select("key, value");

  const valueByKey = new Map((rows ?? []).map((r) => [r.key, r.value]));

  const defaultValues: StoreSettingsInput = {
    nombreTienda: String(valueByKey.get(STORE_SETTINGS_KEYS.nombreTienda) ?? ""),
    contactoEmail: String(
      valueByKey.get(STORE_SETTINGS_KEYS.contactoEmail) ?? "",
    ),
    contactoTelefono: String(
      valueByKey.get(STORE_SETTINGS_KEYS.contactoTelefono) ?? "",
    ),
    envioCostoDefecto: Number(
      valueByKey.get(STORE_SETTINGS_KEYS.envioCostoDefecto) ?? 0,
    ),
    redesInstagram: String(
      valueByKey.get(STORE_SETTINGS_KEYS.redesInstagram) ?? "",
    ),
    redesFacebook: String(
      valueByKey.get(STORE_SETTINGS_KEYS.redesFacebook) ?? "",
    ),
    redesTiktok: String(valueByKey.get(STORE_SETTINGS_KEYS.redesTiktok) ?? ""),
    redesWhatsapp: String(
      valueByKey.get(STORE_SETTINGS_KEYS.redesWhatsapp) ?? "",
    ),
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Ajustes de la tienda
      </h1>
      <AjustesForm defaultValues={defaultValues} />
    </div>
  );
}
```

- [ ] **Step 3: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos; suite de tests con todos los casos previos más
los añadidos en Tasks 1 y 2 en verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/superadmin/ajustes/ajustes-form.tsx src/app/superadmin/ajustes/page.tsx
git commit -m "feat: pagina de ajustes de la tienda en SuperAdmin (Fase 9)"
```

---

### Task 9: Verificación de integración end-to-end

**Files:** ninguno nuevo (script desechable, no se commitea).

**Interfaces:**
- Consumes: todo lo construido en Tasks 1–8, más `createAdminClient()` y
  `@supabase/supabase-js` directamente para simular un usuario autenticado.

- [ ] **Step 1: Confirmar que el servidor de desarrollo está limpio**

Verificar que no hay un proceso `next dev` obsoleto de una sesión anterior
sirviendo con un `next.config.ts` desactualizado (problema recurrente en
fases previas). Si existe, terminarlo y arrancar uno limpio:

Run: `pnpm dev` (en segundo plano) y esperar a que quede listo en
`http://localhost:3000`.

- [ ] **Step 2: Verificar protección de ruta con `curl`**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/superadmin/usuarios
```

Expected: redirect (307/302) hacia `/login` para una petición sin sesión.

- [ ] **Step 3: Script de verificación de negocio (`.mjs` desechable)**

Crear un archivo temporal (por ejemplo
`scripts/tmp-verify-fase9.mjs`, fuera de `src/`, para borrar al final) que:

1. Cargue `.env.local` con `dotenv` y cree un cliente admin
   (`createClient` de `@supabase/supabase-js` con `SUPABASE_SERVICE_ROLE_KEY`,
   igual que `src/lib/supabase/admin.ts`).
2. Cree un usuario de prueba (`admin.auth.admin.createUser`, email
   confirmado, contraseña temporal) y su fila en `profiles` con
   `role = 'customer'`.
3. Como el service role (equivalente a superadmin para esta prueba, ya que
   `cambiarRol`/`bloquearUsuario` en la app usan RLS + service role
   respectivamente): actualizar `profiles.role = 'staff'` para el usuario de
   prueba directamente vía SQL, y verificar con un cliente anon +
   `signInWithPassword` que puede iniciar sesión.
4. Llamar `admin.auth.admin.updateUserById(testUserId, { ban_duration: '876000h' })`
   y verificar que `signInWithPassword` con las mismas credenciales ahora
   falla.
5. Llamar `admin.auth.admin.updateUserById(testUserId, { ban_duration: 'none' })`
   y verificar que `signInWithPassword` vuelve a funcionar.
6. Omitir la verificación de auto-modificación en este script: `puedeCambiarRol`
   y `puedeBloquear` son funciones puras ya cubiertas por los tests unitarios
   de Task 1, y las Server Actions las invocan directamente antes de tocar la
   base de datos — no hay comportamiento adicional de integración que probar
   aquí.
7. Insertar/actualizar una fila de `store_settings` (p. ej. `key =
   'nombre_tienda'`) vía el cliente admin y releerla para confirmar
   persistencia.
8. Limpiar: eliminar el usuario de prueba (`admin.auth.admin.deleteUser`,
   lo que también elimina su `profile` por `on delete cascade`) y la fila de
   `store_settings` de prueba si no se quiere dejar un valor de prueba en
   producción (o dejar `nombre_tienda = 'MeryLay Boutique'` como valor real
   final, ya que es el valor legítimo de la tienda).

Run: `node scripts/tmp-verify-fase9.mjs`
Expected: todos los pasos imprimen `OK`; ningún paso lanza excepción.

- [ ] **Step 4: Borrar el script desechable**

```bash
rm scripts/tmp-verify-fase9.mjs
```

- [ ] **Step 5: Detener el servidor de desarrollo**

Terminar el proceso `pnpm dev` iniciado en el Step 1.

No hay commit en esta tarea — es puramente de verificación.

---

## Cierre de fase

Al completar la Task 9, invocar `superpowers:finishing-a-development-branch`
sobre la rama `fase-9-superadmin` (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir, siguiendo el
mismo flujo usado en las Fases 5–8.
