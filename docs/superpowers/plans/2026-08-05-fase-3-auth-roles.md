# MeryLay Boutique — Fase 3 (Auth y roles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro, login (por email o username), logout y helpers de rol
server-side para MeryLay Boutique, con el header reflejando la sesión actual.

**Architecture:** Server Actions (`'use server'`) para registro/login/logout,
un cliente Supabase adicional con la service role key (server-only) para
resolver username→email antes de autenticar, formularios cliente con
react-hook-form + zod, Server Components por defecto (el header pasa a ser
async).

**Tech Stack:** Next.js 16 (App Router, `src/`), TypeScript estricto,
`@supabase/ssr` + `@supabase/supabase-js`, `react-hook-form`, `zod`,
`@hookform/resolvers`, Vitest.

## Global Constraints

- Idioma: todo el producto (UI, mensajes de error) en español.
- TypeScript estricto; Server Components por defecto, Client Components solo
  cuando se necesite interacción (formularios).
- RLS siempre activo; el `service_role` solo se usa en `src/lib/supabase/admin.ts`,
  importado exclusivamente desde Server Actions — nunca en código que llegue al
  cliente.
- Valida toda entrada con zod (servidor y cliente).
- Mensajes de error claros y en español; no revelar si un usuario/email existe
  (mensajes de login genéricos: "Usuario o contraseña incorrectos").
- Commits atómicos en español al cerrar cada tarea funcional.
- Paleta de marca ya definida en `globals.css` (`brand.*`); componentes shadcn
  ya temados (`Button`, `Input`).

## Referencia del spec

Este plan implementa `docs/superpowers/specs/2026-08-05-fase-3-auth-roles-design.md`.

## Prerrequisito

`SUPABASE_SERVICE_ROLE_KEY` en `.env.local` sigue con el placeholder de la
Fase 1. Antes de la verificación manual (Task 12), el dueño del proyecto debe
pegar la clave real desde el dashboard de Supabase (Project Settings → API);
sin eso, `resolveEmail()` y el registro fallarán en runtime aunque el código
compile y los tests unitarios pasen.

---

## Mapa de archivos

- `supabase/migrations/008_full_name_registro.sql` — el trigger `handle_new_user`
  también guarda `full_name` desde los metadatos del registro.
- `src/lib/auth/identifier.ts` — `isEmail()`.
- `src/lib/validation/auth.ts` — `loginSchema`, `registroSchema`.
- `src/lib/supabase/admin.ts` — cliente con service role key.
- `src/lib/auth/resolve-email.ts` — Server Action `resolveEmail()`.
- `src/lib/auth/get-current-user.ts` — `getCurrentProfile()`.
- `src/lib/auth/logout-action.ts` — Server Action `logout()`.
- `src/app/(auth)/login/actions.ts`, `page.tsx`, `login-form.tsx`.
- `src/app/(auth)/registro/actions.ts`, `page.tsx`, `registro-form.tsx`.
- Modifica `src/components/layout/site-header.tsx`.

---

## Task 1: Instalar dependencias de formularios

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nada.
- Produces: `react-hook-form`, `zod`, `@hookform/resolvers` disponibles para
  todas las tareas siguientes.

- [ ] **Step 1: Instalar**

```bash
pnpm add react-hook-form zod @hookform/resolvers
```

- [ ] **Step 2: Verificar**

```bash
pnpm build
```

Expected: PASS (sin cambios de código todavía, solo confirma que la instalación
no rompe nada).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: agrega react-hook-form, zod y @hookform/resolvers"
```

---

## Task 2: Migración 008 — full_name desde metadata de registro

**Files:**
- Create: `supabase/migrations/008_full_name_registro.sql`

**Interfaces:**
- Consumes: `public.handle_new_user()` (Fase 2, migración 001).
- Produces: `profiles.full_name` poblado automáticamente si `signUp()` envía
  `options.data.full_name` — usado por Task 10 (registro).

- [ ] **Step 1: Escribir la migración**

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate_username text;
  suffix int := 1;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));
  if base_username = '' then
    base_username := 'usuario';
  end if;

  candidate_username := base_username;

  while exists (select 1 from public.profiles where username = candidate_username) loop
    suffix := suffix + 1;
    candidate_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, role, full_name)
  values (new.id, candidate_username, 'customer', new.raw_user_meta_data->>'full_name');

  return new;
end;
$$;
```

- [ ] **Step 2: Aplicar vía MCP**

Usar `mcp__supabase__apply_migration` con `name: "full_name_registro"`.

- [ ] **Step 3: Verificar con un insert de prueba**

```sql
insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, aud, role, raw_user_meta_data)
values (gen_random_uuid(), 'prueba.fullname@example.com', 'x', now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"full_name": "Prueba Nombre"}');

select username, full_name from public.profiles where username like 'pruebafullname%';

delete from auth.users where email = 'prueba.fullname@example.com';
```

Expected: `full_name = 'Prueba Nombre'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_full_name_registro.sql
git commit -m "feat(db): migracion 008 - full_name desde metadata de registro"
```

---

## Task 3: `isEmail()` — lógica pura (TDD)

**Files:**
- Create: `src/lib/auth/__tests__/identifier.test.ts`
- Create: `src/lib/auth/identifier.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `isEmail(value: string): boolean`, usado por Task 6 (`resolveEmail`).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { isEmail } from "../identifier";

describe("isEmail", () => {
  it("reconoce un email valido", () => {
    expect(isEmail("cliente@example.com")).toBe(true);
  });

  it("reconoce un username como no-email", () => {
    expect(isEmail("adminsu")).toBe(false);
  });

  it("ignora espacios alrededor", () => {
    expect(isEmail("  cliente@example.com  ")).toBe(true);
  });

  it("rechaza un email sin dominio", () => {
    expect(isEmail("cliente@")).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test identifier
```

Expected: FAIL — `identifier` no existe todavía.

- [ ] **Step 3: Implementar**

```ts
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test identifier
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/identifier.ts src/lib/auth/__tests__/identifier.test.ts
git commit -m "feat(auth): agrega isEmail para distinguir email de username"
```

---

## Task 4: Schemas zod de login y registro (TDD)

**Files:**
- Create: `src/lib/validation/__tests__/auth.test.ts`
- Create: `src/lib/validation/auth.ts`

**Interfaces:**
- Consumes: `zod` (Task 1).
- Produces: `loginSchema`, `registroSchema`, tipos `LoginInput`, `RegistroInput`
  — usados por Task 9 (login) y Task 10 (registro), cliente y servidor.

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, expect, it } from "vitest";
import { loginSchema, registroSchema } from "../auth";

describe("loginSchema", () => {
  it("acepta un identificador y password validos", () => {
    const result = loginSchema.safeParse({
      identifier: "adminsu",
      password: "secreta1",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza identificador vacio", () => {
    const result = loginSchema.safeParse({ identifier: "", password: "secreta1" });
    expect(result.success).toBe(false);
  });

  it("rechaza password corta", () => {
    const result = loginSchema.safeParse({ identifier: "adminsu", password: "123" });
    expect(result.success).toBe(false);
  });
});

describe("registroSchema", () => {
  const base = {
    fullName: "Maria Perez",
    email: "maria@example.com",
    password: "secreta1",
    confirmPassword: "secreta1",
  };

  it("acepta datos validos", () => {
    expect(registroSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza email invalido", () => {
    expect(
      registroSchema.safeParse({ ...base, email: "no-es-email" }).success,
    ).toBe(false);
  });

  it("rechaza si las contrasenas no coinciden", () => {
    expect(
      registroSchema.safeParse({ ...base, confirmPassword: "otra12345" })
        .success,
    ).toBe(false);
  });

  it("rechaza nombre muy corto", () => {
    expect(registroSchema.safeParse({ ...base, fullName: "A" }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test src/lib/validation
```

Expected: FAIL — `auth` no existe todavía en `src/lib/validation`.

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Ingresa tu usuario o correo electrónico"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registroSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
    email: z.string().trim().email("Ingresa un correo electrónico válido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type RegistroInput = z.infer<typeof registroSchema>;
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test src/lib/validation
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation
git commit -m "feat(auth): agrega schemas zod de login y registro"
```

---

## Task 5: Cliente Supabase admin (service role)

**Files:**
- Create: `src/lib/supabase/admin.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY` (env, Fase 1), `Database` (Fase 2).
- Produces: `createAdminClient()` — usado únicamente por Task 6
  (`resolveEmail`). Server-only: nunca importar desde un Client Component.

- [ ] **Step 1: Implementar**

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Server-only: usa la service role key, nunca debe importarse desde
// codigo que se envie al cliente (Client Components, hooks, etc.).
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
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
git add src/lib/supabase/admin.ts
git commit -m "feat(auth): agrega cliente Supabase admin server-only (service role)"
```

---

## Task 6: `resolveEmail()` — Server Action

**Files:**
- Create: `src/lib/auth/resolve-email.ts`

**Interfaces:**
- Consumes: `isEmail()` (Task 3), `createAdminClient()` (Task 5).
- Produces: `resolveEmail(identifier: string): Promise<string | null>` — usado
  por Task 9 (`login`).

- [ ] **Step 1: Implementar**

```ts
"use server";

import { isEmail } from "./identifier";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (isEmail(trimmed)) {
    return trimmed;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", trimmed.toLowerCase())
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const { data: userData, error } = await admin.auth.admin.getUserById(
    profile.id,
  );

  if (error || !userData.user?.email) {
    return null;
  }

  return userData.user.email;
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/resolve-email.ts
git commit -m "feat(auth): resuelve username a email via Server Action con service role"
```

---

## Task 7: `getCurrentProfile()` — helper de rol

**Files:**
- Create: `src/lib/auth/get-current-user.ts`

**Interfaces:**
- Consumes: `createClient()` de `src/lib/supabase/server.ts` (Fase 1),
  `Tables<"profiles">` (Fase 2).
- Produces: `getCurrentProfile(): Promise<CurrentUser | null>` — usado por
  Task 11 (`SiteHeader`) y por código futuro que necesite el rol actual.

- [ ] **Step 1: Implementar**

```ts
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: Tables<"profiles">;
};

export async function getCurrentProfile(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  return { id: user.id, email: user.email ?? null, profile };
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/get-current-user.ts
git commit -m "feat(auth): agrega getCurrentProfile para obtener sesion y rol actual"
```

---

## Task 8: `logout()` — Server Action

**Files:**
- Create: `src/lib/auth/logout-action.ts`

**Interfaces:**
- Consumes: `createClient()` de `src/lib/supabase/server.ts`.
- Produces: `logout()` — usado por Task 11 (`SiteHeader`).

- [ ] **Step 1: Implementar**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/logout-action.ts
git commit -m "feat(auth): agrega Server Action de logout"
```

---

## Task 9: Login — página, formulario y Server Action

**Files:**
- Create: `src/app/(auth)/login/actions.ts`
- Create: `src/app/(auth)/login/login-form.tsx`
- Create: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `loginSchema`, `LoginInput` (Task 4), `resolveEmail()` (Task 6),
  `createClient()` de `src/lib/supabase/server.ts`, `Button`/`Input` de
  `@/components/ui/*`.
- Produces: ruta `/login`, usada por `proxy.ts` (Fase 1) como destino de
  redirección para rutas protegidas.

- [ ] **Step 1: Server Action `login()`**

`src/app/(auth)/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveEmail } from "@/lib/auth/resolve-email";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export async function login(
  input: LoginInput,
  redirectTo: string,
): Promise<{ error: string } | undefined> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const email = await resolveEmail(parsed.data.identifier);
  if (!email) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  redirect(redirectTo || "/");
}
```

- [ ] **Step 2: Formulario cliente**

`src/app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    const result = await login(data, redirectTo);
    if (result?.error) {
      setServerError(result.error);
    }
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

- [ ] **Step 3: Página**

`src/app/(auth)/login/page.tsx`:

```tsx
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <h1 className="font-heading text-3xl text-brand-ciruela">
        Iniciar sesión
      </h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 4: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/login"
git commit -m "feat: pagina de login con soporte de usuario o email"
```

---

## Task 10: Registro — página, formulario y Server Action

**Files:**
- Create: `src/app/(auth)/registro/actions.ts`
- Create: `src/app/(auth)/registro/registro-form.tsx`
- Create: `src/app/(auth)/registro/page.tsx`

**Interfaces:**
- Consumes: `registroSchema`, `RegistroInput` (Task 4), `createClient()` de
  `src/lib/supabase/server.ts`, `Button`/`Input` de `@/components/ui/*`.
- Produces: ruta `/registro`.

- [ ] **Step 1: Server Action `registro()`**

`src/app/(auth)/registro/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";

export async function registro(
  input: RegistroInput,
): Promise<{ error?: string; message?: string }> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "Ya existe una cuenta con ese correo electrónico." };
    }
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  if (data.session) {
    redirect("/");
  }

  return {
    message:
      "Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.",
  };
}
```

- [ ] **Step 2: Formulario cliente**

`src/app/(auth)/registro/registro-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";
import { registro } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegistroForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroInput>({ resolver: zodResolver(registroSchema) });

  const onSubmit = async (data: RegistroInput) => {
    setServerError(null);
    setSuccessMessage(null);
    const result = await registro(data);
    if (result?.error) {
      setServerError(result.error);
    } else if (result?.message) {
      setSuccessMessage(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="fullName" className="text-sm text-brand-ciruela">
          Nombre completo
        </label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && (
          <p className="text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="email" className="text-sm text-brand-ciruela">
          Correo electrónico
        </label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
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
      <div>
        <label htmlFor="confirmPassword" className="text-sm text-brand-ciruela">
          Confirmar contraseña
        </label>
        <Input
          id="confirmPassword"
          type="password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {successMessage && (
        <p className="text-sm text-brand-oro">{successMessage}</p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Página**

`src/app/(auth)/registro/page.tsx`:

```tsx
import { RegistroForm } from "./registro-form";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <h1 className="font-heading text-3xl text-brand-ciruela">
        Crea tu cuenta
      </h1>
      <RegistroForm />
    </main>
  );
}
```

- [ ] **Step 4: Verificar build y lint**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/registro"
git commit -m "feat: pagina de registro de clientes"
```

---

## Task 11: `SiteHeader` con sesión

**Files:**
- Modify: `src/components/layout/site-header.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile()` (Task 7), `logout()` (Task 8), `Button` de
  `@/components/ui/button`.
- Produces: header actualizado, usado globalmente por `src/app/layout.tsx`
  (Fase 1, sin cambios necesarios ahí).

- [ ] **Step 1: Actualizar el componente**

```tsx
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { logout } from "@/lib/auth/logout-action";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const currentUser = await getCurrentProfile();

  return (
    <header className="border-b border-brand-rosa-claro bg-brand-crema/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
        <nav className="flex items-center gap-4 font-body text-sm text-brand-ciruela">
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
        </nav>
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

Expected: ambos exitosos. (`SiteHeader` ya era usado como `<SiteHeader />` en
`layout.tsx`; al ser ahora `async`, Next.js lo soporta igual dentro de un
Server Component sin cambios adicionales en `layout.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/site-header.tsx
git commit -m "feat: header muestra sesion actual (login o username + logout)"
```

---

## Task 12: Verificación manual end-to-end

**Files:** ninguno nuevo — solo verificación manual contra el proyecto
Supabase real.

**Interfaces:**
- Consumes: todo lo producido en Tasks 1–11, más `SUPABASE_SERVICE_ROLE_KEY`
  real en `.env.local` (ver Prerrequisito al inicio del plan).

- [ ] **Step 1: Levantar el servidor**

```bash
pnpm dev
```

- [ ] **Step 2: Registro**

Ir a `/registro`, crear una cuenta de prueba. Confirmar en Supabase
(`execute_sql: select username, role, full_name from public.profiles order by created_at desc limit 1;`)
que se creó el `profile` con `role='customer'`, `username` autogenerado y
`full_name` correcto.

- [ ] **Step 3: Login con email**

Ir a `/login`, iniciar sesión con el email de la cuenta creada. Confirmar
redirección a `/` y que el header muestra el username + "Cerrar sesión".

- [ ] **Step 4: Logout y login con username**

Cerrar sesión desde el header. Volver a `/login` e iniciar sesión usando el
`username` autogenerado (no el email). Confirmar que funciona igual.

- [ ] **Step 5: Confirmar que la protección de rutas sigue activa**

Sin sesión (tras logout), visitar `/admin`. Confirmar redirección a
`/login?redirectTo=%2Fadmin` (comportamiento de `proxy.ts`, Fase 1).

- [ ] **Step 6: Detener el servidor**

```bash
# Ctrl+C o kill del proceso de pnpm dev
```

No requiere commit (verificación manual, sin cambios de código).

---

## Task 13: Verificación final y cierre de Fase 3

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo producido en Tasks 1–12.

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

Expected: PASS (incluye los 4 tests de `isEmail` y 7 de los schemas zod, más
los 9 existentes de fases anteriores).

- [ ] **Step 4: Commit de cierre de fase**

```bash
git add -A
git commit -m "chore: cierra Fase 3 (auth y roles) - build, lint y tests en verde" --allow-empty
```
