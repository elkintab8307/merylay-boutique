# Registro de Clientes y "Mi cuenta" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar el registro de clientes (nombre, dirección, WhatsApp,
email opcional) y agregar una página "Mi cuenta" donde el cliente ve cuánto
ha pagado en la tienda, enlaza a sus pedidos, y crea/edita su propia reseña
de la empresa (sujeta a aprobación del admin).

**Architecture:** Se agregan `address`/`whatsapp` a `profiles` y `user_id`
(con restricción única parcial) a `reviews`. El registro sin email usa
`createAdminClient()` + `auth.admin.createUser({ email_confirm: true })`
para crear la cuenta con un email interno sintético derivado del WhatsApp, y
luego `signInWithPassword` en el cliente normal para dejar sesión iniciada.
El login no cambia: `resolveEmail()` ya resuelve por `username`
independientemente de si ese username vino de un email o de un WhatsApp. La
página `/cuenta` reutiliza el patrón de Server Component + Server Actions ya
usado en `superadmin/ajustes`.

**Tech Stack:** Next.js App Router, Supabase (Postgres/Auth/RLS), zod,
react-hook-form, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-registro-clientes-design.md`

## Global Constraints

- Todo el producto (UI, mensajes) en español (CLAUDE.md sección 0).
- RLS activo en todo; nunca usar `service_role` en el cliente — solo desde
  Server Actions/Route Handlers vía `createAdminClient()` (CLAUDE.md sección
  13, patrón ya usado en `resolve-email.ts`, `superadmin/usuarios/actions.ts`).
- Precios en `numeric`, nunca floats para dinero (ya así en `orders.total`).
- El "total pagado" suma pedidos en estado `pagado`, `enviado` o
  `entregado` (spec, decisión confirmada).
- La reseña de un cliente se guarda siempre con `is_active = false` al
  crear o editar (spec, decisión confirmada) — la aprueba un admin desde
  `/admin/resenas`, sin cambios en esa página.
- Cualquier cliente registrado puede reseñar, sin exigir compra previa
  (spec, decisión confirmada).
- El checkout precarga nombre/teléfono/dirección desde el perfil si existen,
  pero siguen siendo editables por pedido sin tocar lo guardado en el perfil
  (spec, decisión confirmada). La ciudad no se precarga (no vive en el perfil).

---

### Task 1: Migración de base de datos y regeneración de tipos

**Ejecución:** Este task lo ejecuta el propio controlador de la sesión con
las herramientas MCP de Supabase (`mcp__supabase__apply_migration`,
`mcp__supabase__generate_typescript_types`), **no se despacha a un
subagente implementador** — un subagente fresco no tiene acceso a esas
herramientas MCP. El resto de tasks sí se despachan normalmente.

**Files:**
- Create: `supabase/migrations/031_registro_clientes.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado completo, no a mano)

**Interfaces:**
- Produces: columnas `profiles.address` (text, nullable), `profiles.whatsapp`
  (text, nullable), `reviews.user_id` (uuid, nullable, FK a
  `profiles.id` on delete cascade), restricción única normal
  `reviews_user_id_unique` sobre `reviews(user_id)` (los NULL no cuentan
  como duplicados entre sí en Postgres, así que las reseñas del admin sin
  dueño siguen sin límite),
  políticas RLS `reviews_insert_own`/`reviews_update_own`/`reviews_select_own`,
  trigger `handle_new_user()` reemplazado (username derivado de
  `raw_user_meta_data->>'whatsapp'` cuando existe, si no del email como
  antes) y ahora también inserta `full_name`/`address`/`whatsapp` en el
  mismo `insert`.

- [ ] **Step 1: Aplicar la migración vía MCP**

Contenido exacto de `supabase/migrations/031_registro_clientes.sql`:

```sql
-- profiles: nuevos campos de contacto/envio para clientes
alter table public.profiles
  add column address text,
  add column whatsapp text;

-- reviews: vinculo opcional a un cliente + una resena por cliente
alter table public.reviews
  add column user_id uuid references public.profiles(id) on delete cascade;

-- Restriccion unica NORMAL (no un indice parcial): en Postgres los NULL
-- nunca se consideran duplicados entre si bajo una unique constraint, asi
-- que esto ya permite multiples resenas del admin con user_id = null,
-- mientras limita a una fila por cliente real. Se usa una constraint (no
-- un indice parcial) porque supabase-js hace
-- upsert(..., { onConflict: "user_id" }) mas adelante (Task 7), y un
-- indice parcial exigiria que la clausula ON CONFLICT repita el mismo
-- predicado WHERE, algo que la libreria no permite especificar.
alter table public.reviews
  add constraint reviews_user_id_unique unique (user_id);

-- RLS: el cliente puede insertar/editar/leer SU PROPIA resena (ademas de
-- los permisos de admin ya existentes en reviews_insert_admin,
-- reviews_update_admin, reviews_select_active_or_admin, que no se tocan).
-- Mismo patron que favorites (migracion 022): auth.uid() envuelto en
-- (select ...), politicas limitadas a "authenticated".
create policy "reviews_insert_own"
  on public.reviews for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "reviews_update_own"
  on public.reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reviews_select_own"
  on public.reviews for select
  to authenticated
  using (user_id = (select auth.uid()));

-- handle_new_user: ahora puebla full_name/address/whatsapp en el mismo
-- insert (antes solo username/role), y el username se deriva del
-- whatsapp cuando esta presente en los metadatos (registro sin email),
-- o del email como antes.
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
  base_source text;
begin
  base_source := coalesce(
    nullif(new.raw_user_meta_data->>'whatsapp', ''),
    split_part(new.email, '@', 1)
  );
  base_username := lower(regexp_replace(base_source, '[^a-z0-9]', '', 'g'));
  if base_username = '' then
    base_username := 'usuario';
  end if;

  candidate_username := base_username;

  while exists (select 1 from public.profiles where username = candidate_username) loop
    suffix := suffix + 1;
    candidate_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, full_name, address, whatsapp, role)
  values (
    new.id,
    candidate_username,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'whatsapp',
    'customer'
  );

  return new;
end;
$$;
```

Aplica esta migración con `mcp__supabase__apply_migration` (nombre:
`registro_clientes`, con el SQL de arriba como `query`).

- [ ] **Step 2: Verificar la migración**

Ejecuta con `mcp__supabase__execute_sql`:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name in ('address','whatsapp');
```

Expected: 2 filas (`address`, `whatsapp`).

```sql
select conname from pg_constraint where conrelid = 'public.reviews'::regclass and conname='reviews_user_id_unique';
```

Expected: 1 fila.

```sql
select policyname from pg_policies where tablename='reviews' and policyname like 'reviews_%_own';
```

Expected: 3 filas (`reviews_insert_own`, `reviews_update_own`, `reviews_select_own`).

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Usa `mcp__supabase__generate_typescript_types` y escribe el resultado
completo (reemplazando el archivo entero) en
`src/lib/supabase/database.types.ts`.

- [ ] **Step 4: Verificar que el proyecto sigue compilando**

Run: `pnpm exec tsc --noEmit`
Expected: sin salida (sin errores). Los tasks siguientes ya pueden asumir
que `Tables<"profiles">` incluye `address`/`whatsapp` y `Tables<"reviews">`
incluye `user_id`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/031_registro_clientes.sql src/lib/supabase/database.types.ts
git commit -m "feat: agrega direccion/whatsapp a profiles y resena por cliente a reviews"
```

---

### Task 2: Esquema de registro (`registroSchema`)

**Files:**
- Modify: `src/lib/validation/auth.ts`
- Modify: `src/lib/validation/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: nada (task independiente de la migración; solo valida forma de
  datos, no toca la base).
- Produces: `registroSchema` con forma
  `{ fullName: string; whatsapp: string; address: string; email?: string; password: string; confirmPassword: string }`,
  exportado como antes vía `RegistroInput = z.infer<typeof registroSchema>`.
  Los tasks 3 y 4 consumen este tipo y estos nombres de campo exactos.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplaza el bloque `describe("registroSchema", ...)` completo en
`src/lib/validation/__tests__/auth.test.ts` (el bloque `describe("loginSchema", ...)` no cambia) por:

```ts
describe("registroSchema", () => {
  const base = {
    fullName: "Maria Perez",
    whatsapp: "3001234567",
    address: "Calle 10 # 20-30",
    email: "maria@example.com",
    password: "secreta1",
    confirmPassword: "secreta1",
  };

  it("acepta datos validos con email", () => {
    expect(registroSchema.safeParse(base).success).toBe(true);
  });

  it("acepta datos validos sin email (email opcional)", () => {
    const { email: _email, ...sinEmail } = base;
    expect(registroSchema.safeParse(sinEmail).success).toBe(true);
  });

  it("acepta email vacio como equivalente a no dar email", () => {
    expect(registroSchema.safeParse({ ...base, email: "" }).success).toBe(true);
  });

  it("rechaza email invalido cuando se proporciona", () => {
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

  it("rechaza whatsapp muy corto", () => {
    expect(registroSchema.safeParse({ ...base, whatsapp: "123" }).success).toBe(
      false,
    );
  });

  it("rechaza direccion muy corta", () => {
    expect(registroSchema.safeParse({ ...base, address: "Av" }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm exec vitest run src/lib/validation/__tests__/auth.test.ts`
Expected: FAIL — los tests nuevos fallan porque `registroSchema` todavía
exige `email` y no exige `whatsapp`/`address`.

- [ ] **Step 3: Implementar el schema**

En `src/lib/validation/auth.ts`, reemplaza el bloque `registroSchema`
completo por:

```ts
export const registroSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
    whatsapp: z.string().trim().min(7, "Ingresa un número de WhatsApp válido"),
    address: z.string().trim().min(5, "Ingresa una dirección válida"),
    email: z
      .email("Ingresa un correo electrónico válido")
      .trim()
      .optional()
      .or(z.literal("")),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `pnpm exec vitest run src/lib/validation/__tests__/auth.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/auth.ts src/lib/validation/__tests__/auth.test.ts
git commit -m "feat: registroSchema pide whatsapp y direccion, email pasa a opcional"
```

---

### Task 3: Server Action de registro (email opcional / identidad por WhatsApp)

**Files:**
- Modify: `src/app/(auth)/registro/actions.ts`
- Create: `src/app/(auth)/registro/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `registroSchema`/`RegistroInput` de Task 2 (campos `fullName`,
  `whatsapp`, `address`, `email?`, `password`); `createAdminClient()` de
  `@/lib/supabase/admin` (ya existente, sin cambios de firma); `createClient()`
  de `@/lib/supabase/server` (ya existente).
- Produces: `registro(input: RegistroInput)` mantiene exactamente la misma
  firma de retorno que hoy:
  `Promise<{ error?: string; message?: string; success?: boolean }>`. Task 4
  (el formulario) no necesita cambios en cómo llama ni maneja el resultado
  de esta función.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/app/(auth)/registro/__tests__/actions.test.ts`:

```ts
// @vitest-environment node
//
// Server Action real (usa cookies() de next/headers via createClient()),
// igual patron que admin/pedidos/__tests__/actions.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/email/resend";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  enviarCorreo: vi.fn(),
}));

const datosBase = {
  fullName: "Maria Perez",
  whatsapp: "3001234567",
  address: "Calle 10 # 20-30",
  password: "secreta1",
  confirmPassword: "secreta1",
};

describe("registro", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(enviarCorreo).mockReset();
    vi.mocked(enviarCorreo).mockResolvedValue({ id: "email-test-id" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con email real: usa auth.signUp y envia el correo de bienvenida", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "t" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado).toEqual({ success: true });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "maria@example.com",
        password: "secreta1",
        options: {
          data: {
            full_name: "Maria Perez",
            address: "Calle 10 # 20-30",
            whatsapp: "3001234567",
          },
        },
      }),
    );
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({ to: "maria@example.com" }),
    );
  });

  it("sin email: crea el usuario con el admin client y lo deja con sesion iniciada, sin enviar correo", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { createUser } },
    } as never);

    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: "user-2" }, session: { access_token: "t" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithPassword },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro(datosBase);

    expect(resultado).toEqual({ success: true });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "3001234567@merylay.local",
        password: "secreta1",
        email_confirm: true,
        user_metadata: {
          full_name: "Maria Perez",
          address: "Calle 10 # 20-30",
          whatsapp: "3001234567",
        },
      }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "3001234567@merylay.local",
      password: "secreta1",
    });
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("sin email, whatsapp ya registrado: retorna error legible", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { createUser } },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro(datosBase);

    expect(resultado.error).toBe("Ya existe una cuenta con ese WhatsApp.");
  });

  it("con email ya registrado: retorna error legible", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado.error).toBe("Ya existe una cuenta con ese correo electrónico.");
  });

  it("un fallo al preparar el correo de bienvenida no rompe el registro", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "t" } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as never);
    vi.mocked(enviarCorreo).mockRejectedValue(new Error("fallo de red"));

    const { registro } = await import("../actions");
    const resultado = await registro({ ...datosBase, email: "maria@example.com" });

    expect(resultado).toEqual({ success: true });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[email]"),
      expect.any(Error),
    );
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm exec vitest run src/app/\(auth\)/registro/__tests__/actions.test.ts`
Expected: FAIL — `actions.ts` todavía no tiene la rama sin email ni el
mensaje de error de WhatsApp duplicado.

- [ ] **Step 3: Implementar la Server Action**

Reemplaza el contenido completo de `src/app/(auth)/registro/actions.ts` por:

```ts
"use server";

import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";
import { enviarCorreo } from "@/lib/email/resend";
import { BienvenidaEmail } from "@/lib/email/templates/bienvenida-email";

export async function registro(
  input: RegistroInput,
): Promise<{ error?: string; message?: string; success?: boolean }> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const metadata = {
    full_name: parsed.data.fullName,
    address: parsed.data.address,
    whatsapp: parsed.data.whatsapp,
  };

  let hasSession: boolean;

  if (parsed.data.email) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: metadata },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        return { error: "Ya existe una cuenta con ese correo electrónico." };
      }
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }

    hasSession = Boolean(data.session);
  } else {
    // Sin email real: Supabase intentaria mandar un correo de confirmacion
    // a una direccion inventada y la cuenta quedaria atrapada "sin
    // confirmar" sin forma de completarla. Se crea ya confirmada con el
    // service role (mismo mecanismo que scripts/seed-superadmin.ts) y
    // luego se inicia sesion normalmente.
    const emailSintetico = `${parsed.data.whatsapp.replace(/\D/g, "")}@merylay.local`;
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: emailSintetico,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        return { error: "Ya existe una cuenta con ese WhatsApp." };
      }
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }

    const supabase = await createClient();
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: emailSintetico,
        password: parsed.data.password,
      });

    if (signInError) {
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }

    hasSession = Boolean(signInData.session);
  }

  // Mismo criterio que en checkout/webhook/admin: la cuenta YA quedo
  // creada, asi que ningun fallo del correo de bienvenida puede
  // convertirse en un "no pudimos crear tu cuenta" para quien si se
  // registro. Nunca se envia a la direccion @merylay.local sintetica.
  if (parsed.data.email) {
    try {
      await enviarCorreo({
        to: parsed.data.email,
        subject: "Bienvenida a MeryLay Boutique",
        react: createElement(BienvenidaEmail, { nombre: parsed.data.fullName }),
      });
    } catch (emailError) {
      console.error(
        "[email] Error preparando o enviando el correo de bienvenida:",
        emailError,
      );
    }
  }

  if (hasSession) {
    return { success: true };
  }

  return {
    message:
      "Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.",
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `pnpm exec vitest run src/app/\(auth\)/registro/__tests__/actions.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/registro/actions.ts "src/app/(auth)/registro/__tests__/actions.test.ts"
git commit -m "feat: registro sin email crea la cuenta via admin client con whatsapp como identidad"
```

---

### Task 4: Formularios de registro y copy de login

**Files:**
- Modify: `src/app/(auth)/registro/registro-form.tsx`
- Modify: `src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `RegistroInput`/`registroSchema` de Task 2 (campos `fullName`,
  `whatsapp`, `address`, `email`, `password`, `confirmPassword`); `registro()`
  de Task 3 (misma firma, sin cambios de llamada).
- Produces: nada que otros tasks consuman (hoja del árbol de UI).

- [ ] **Step 1: Actualizar `registro-form.tsx`**

Reemplaza el bloque de campos del formulario (entre `<form ...>` y el
bloque `{serverError && ...}`) por lo siguiente — el resto del archivo
(imports, estado, `onSubmit`) no cambia:

```tsx
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
  <label htmlFor="whatsapp" className="text-sm text-brand-ciruela">
    WhatsApp
  </label>
  <Input id="whatsapp" type="tel" {...register("whatsapp")} />
  {errors.whatsapp && (
    <p className="text-sm text-red-600">{errors.whatsapp.message}</p>
  )}
</div>
<div>
  <label htmlFor="address" className="text-sm text-brand-ciruela">
    Dirección
  </label>
  <Input id="address" {...register("address")} />
  {errors.address && (
    <p className="text-sm text-red-600">{errors.address.message}</p>
  )}
</div>
<div>
  <label htmlFor="email" className="text-sm text-brand-ciruela">
    Correo electrónico (opcional)
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
```

- [ ] **Step 2: Actualizar la etiqueta del login**

En `src/app/(auth)/login/login-form.tsx`, cambia únicamente el texto del
`<label htmlFor="identifier">`:

```tsx
<label htmlFor="identifier" className="text-sm text-brand-ciruela">
  Usuario, correo electrónico o WhatsApp
</label>
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores nuevos (los 3 warnings preexistentes de
`react-hooks/incompatible-library` en otros archivos son normales, no
relacionados con este cambio).

- [ ] **Step 4: Verificación en el navegador**

Con `pnpm dev`: entra a `/registro`, confirma que se ven los 4 campos
(Nombre, WhatsApp, Dirección, Email opcional) más contraseña/confirmar.
Registra un usuario de prueba **sin** llenar el email y confirma que
termina con sesión iniciada (redirige a `/`). Cierra sesión y vuelve a
entrar en `/login` usando el WhatsApp como identificador.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/registro/registro-form.tsx" "src/app/(auth)/login/login-form.tsx"
git commit -m "feat: formulario de registro pide whatsapp/direccion y email opcional"
```

---

### Task 5: Helper de total pagado

**Files:**
- Create: `src/lib/store/total-pagado.ts`
- Create: `src/lib/store/__tests__/total-pagado.test.ts`

**Interfaces:**
- Consumes: nada (función pura).
- Produces: `calcularTotalPagado(pedidos: { status: string; total: number }[]): number`.
  Task 8 (página `/cuenta`) importa y llama esta función con las filas de
  `orders` ya traídas de Supabase.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/store/__tests__/total-pagado.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularTotalPagado } from "../total-pagado";

describe("calcularTotalPagado", () => {
  it("suma solo pedidos pagado, enviado y entregado", () => {
    const pedidos = [
      { status: "pendiente", total: 100000 },
      { status: "pagado", total: 50000 },
      { status: "enviado", total: 30000 },
      { status: "entregado", total: 20000 },
      { status: "cancelado", total: 999999 },
    ];
    expect(calcularTotalPagado(pedidos)).toBe(100000);
  });

  it("retorna 0 si no hay pedidos", () => {
    expect(calcularTotalPagado([])).toBe(0);
  });

  it("retorna 0 si ningun pedido cuenta como pagado", () => {
    expect(
      calcularTotalPagado([{ status: "pendiente", total: 1000 }]),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm exec vitest run src/lib/store/__tests__/total-pagado.test.ts`
Expected: FAIL con "Cannot find module '../total-pagado'".

- [ ] **Step 3: Implementar**

Crea `src/lib/store/total-pagado.ts`:

```ts
const ESTADOS_PAGADOS = new Set(["pagado", "enviado", "entregado"]);

export function calcularTotalPagado(
  pedidos: { status: string; total: number }[],
): number {
  return pedidos
    .filter((pedido) => ESTADOS_PAGADOS.has(pedido.status))
    .reduce((suma, pedido) => suma + pedido.total, 0);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm exec vitest run src/lib/store/__tests__/total-pagado.test.ts`
Expected: PASS (los 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/total-pagado.ts src/lib/store/__tests__/total-pagado.test.ts
git commit -m "feat: agrega calcularTotalPagado para el resumen de Mi cuenta"
```

---

### Task 6: Componente de calificación con estrellas

**Files:**
- Create: `src/components/store/estrellas-input.tsx`
- Create: `src/components/store/__tests__/estrellas-input.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `EstrellasInput({ value, onChange, disabled? }: { value: number; onChange: (n: number) => void; disabled?: boolean })`,
  componente cliente. Task 9 (formulario de reseña) lo usa dentro de un
  `Controller` de react-hook-form.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/components/store/__tests__/estrellas-input.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EstrellasInput } from "../estrellas-input";

describe("EstrellasInput", () => {
  it("marca como llenas las estrellas hasta el valor actual", () => {
    render(<EstrellasInput value={3} onChange={() => {}} />);
    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(5);
    expect(botones[0]).toHaveAttribute("aria-pressed", "true");
    expect(botones[2]).toHaveAttribute("aria-pressed", "true");
    expect(botones[3]).toHaveAttribute("aria-pressed", "false");
  });

  it("llama a onChange con el numero de estrella clickeada", () => {
    const onChange = vi.fn();
    render(<EstrellasInput value={2} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("4 estrellas"));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("no llama a onChange cuando disabled", () => {
    const onChange = vi.fn();
    render(<EstrellasInput value={2} onChange={onChange} disabled />);

    fireEvent.click(screen.getByLabelText("4 estrellas"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm exec vitest run src/components/store/__tests__/estrellas-input.test.tsx`
Expected: FAIL con "Cannot find module '../estrellas-input'".

- [ ] **Step 3: Implementar**

Crea `src/components/store/estrellas-input.tsx`:

```tsx
"use client";

import { Star } from "lucide-react";

export function EstrellasInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((estrella) => (
        <button
          key={estrella}
          type="button"
          disabled={disabled}
          aria-label={`${estrella} estrella${estrella > 1 ? "s" : ""}`}
          aria-pressed={estrella <= value}
          onClick={() => onChange(estrella)}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Star
            className="h-6 w-6 text-brand-oro"
            fill={estrella <= value ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm exec vitest run src/components/store/__tests__/estrellas-input.test.tsx`
Expected: PASS (los 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/store/estrellas-input.tsx src/components/store/__tests__/estrellas-input.test.tsx
git commit -m "feat: agrega EstrellasInput para calificar con estrellas"
```

---

### Task 7: Validación y Server Actions de "Mi cuenta"

**Files:**
- Modify: `src/lib/validation/resena.ts`
- Create: `src/lib/validation/cuenta.ts`
- Create: `src/app/(store)/cuenta/actions.ts`
- Create: `src/app/(store)/cuenta/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `Tables<"profiles">`/`Tables<"reviews">` de
  `@/lib/supabase/database.types` (Task 1, ya con `address`/`whatsapp`/
  `user_id`); `createClient()` de `@/lib/supabase/server`.
- Produces:
  - `perfilSchema` / `PerfilInput` en `cuenta.ts`:
    `{ fullName: string; whatsapp: string; address: string }`.
  - `resenaClienteSchema` / `ResenaClienteInput` agregado a `resena.ts`:
    `{ rating: number; body: string }`.
  - `actualizarPerfil(input: PerfilInput): Promise<{ error?: string }>`.
  - `guardarResena(input: ResenaClienteInput): Promise<{ error?: string }>`.

  Task 9 (la página) consume estos 4 nombres/firmas exactos.

- [ ] **Step 1: Agregar `resenaClienteSchema`**

Al final de `src/lib/validation/resena.ts`, agrega (sin tocar
`resenaSchema` existente):

```ts
export const resenaClienteSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, "La calificación debe ser entre 1 y 5")
    .max(5, "La calificación debe ser entre 1 y 5"),
  body: z.string().trim().min(10, "Ingresa un texto de al menos 10 caracteres"),
});

export type ResenaClienteInput = z.infer<typeof resenaClienteSchema>;
```

- [ ] **Step 2: Crear `perfilSchema`**

Crea `src/lib/validation/cuenta.ts`:

```ts
import { z } from "zod";

export const perfilSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
  whatsapp: z.string().trim().min(7, "Ingresa un número de WhatsApp válido"),
  address: z.string().trim().min(5, "Ingresa una dirección válida"),
});

export type PerfilInput = z.infer<typeof perfilSchema>;
```

- [ ] **Step 3: Escribir los tests que fallan para las Server Actions**

Crea `src/app/(store)/cuenta/__tests__/actions.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function crearSupabaseMock(opts: {
  usuario?: { id: string } | null;
  perfilResultado?: { data: unknown; error?: unknown };
  updateResultado?: { error: unknown };
  upsertResultado?: { error: unknown };
}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: opts.usuario ?? { id: "user-1" } },
  });

  // profiles: actualizarPerfil usa .update().eq(); guardarResena usa
  // .select().eq().single() para leer el full_name antes del upsert.
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(opts.updateResultado ?? { error: null }),
  });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        opts.perfilResultado ?? { data: { full_name: "Maria Perez" }, error: null },
      ),
    }),
  });
  const upsert = vi.fn().mockResolvedValue(opts.upsertResultado ?? { error: null });

  const from = vi.fn((tabla: string) => {
    if (tabla === "profiles") return { update, select };
    if (tabla === "reviews") return { upsert };
    throw new Error(`Tabla no mockeada: ${tabla}`);
  });

  return { auth: { getUser }, from, update, select, upsert };
}

describe("actualizarPerfil", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(revalidatePath).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  const datos = {
    fullName: "Maria Perez",
    whatsapp: "3001234567",
    address: "Calle 10 # 20-30",
  };

  it("sin sesion: retorna error y no toca la base", async () => {
    const supabase = crearSupabaseMock({ usuario: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { actualizarPerfil } = await import("../actions");
    const resultado = await actualizarPerfil(datos);

    expect(resultado.error).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("con sesion: actualiza el perfil del usuario actual", async () => {
    const supabase = crearSupabaseMock({});
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { actualizarPerfil } = await import("../actions");
    const resultado = await actualizarPerfil(datos);

    expect(resultado.error).toBeUndefined();
    expect(supabase.update).toHaveBeenCalledWith({
      full_name: "Maria Perez",
      whatsapp: "3001234567",
      address: "Calle 10 # 20-30",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/cuenta");
  });

  it("datos invalidos: retorna error sin tocar la base", async () => {
    const supabase = crearSupabaseMock({});
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { actualizarPerfil } = await import("../actions");
    const resultado = await actualizarPerfil({ ...datos, fullName: "A" });

    expect(resultado.error).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("guardarResena", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(revalidatePath).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  const datos = { rating: 5, body: "Excelente atencion y productos." };

  it("sin sesion: retorna error y no toca la base", async () => {
    const supabase = crearSupabaseMock({ usuario: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { guardarResena } = await import("../actions");
    const resultado = await guardarResena(datos);

    expect(resultado.error).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("con sesion: hace upsert con is_active en false, sin importar si es nueva o edicion", async () => {
    const supabase = crearSupabaseMock({});
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { guardarResena } = await import("../actions");
    const resultado = await guardarResena(datos);

    expect(resultado.error).toBeUndefined();
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        rating: 5,
        body: "Excelente atencion y productos.",
        is_active: false,
      }),
      { onConflict: "user_id" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/cuenta");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("error de la base: retorna error legible", async () => {
    const supabase = crearSupabaseMock({
      upsertResultado: { error: { message: "constraint violation" } },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { guardarResena } = await import("../actions");
    const resultado = await guardarResena(datos);

    expect(resultado.error).toBe("No se pudo guardar tu reseña.");
  });
});
```

- [ ] **Step 4: Correr los tests para verificar que fallan**

Run: `pnpm exec vitest run src/app/\(store\)/cuenta/__tests__/actions.test.ts`
Expected: FAIL con "Cannot find module '../actions'".

- [ ] **Step 5: Implementar las Server Actions**

Crea `src/app/(store)/cuenta/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { perfilSchema, type PerfilInput } from "@/lib/validation/cuenta";
import {
  resenaClienteSchema,
  type ResenaClienteInput,
} from "@/lib/validation/resena";

export async function actualizarPerfil(
  input: PerfilInput,
): Promise<{ error?: string }> {
  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      whatsapp: parsed.data.whatsapp,
      address: parsed.data.address,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "No se pudo actualizar tu perfil." };
  }

  revalidatePath("/cuenta");
  return {};
}

export async function guardarResena(
  input: ResenaClienteInput,
): Promise<{ error?: string }> {
  const parsed = resenaClienteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("reviews").upsert(
    {
      user_id: user.id,
      customer_name: profile?.full_name ?? "Clienta MeryLay",
      rating: parsed.data.rating,
      body: parsed.data.body,
      is_active: false,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: "No se pudo guardar tu reseña." };
  }

  revalidatePath("/cuenta");
  revalidatePath("/");
  return {};
}
```

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `pnpm exec vitest run src/app/\(store\)/cuenta/__tests__/actions.test.ts`
Expected: PASS (los 6 tests).

- [ ] **Step 7: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores (confirma que `profiles.whatsapp`/`address` y
`reviews.user_id` del tipo regenerado en Task 1 encajan aquí).

- [ ] **Step 8: Commit**

```bash
git add src/lib/validation/resena.ts src/lib/validation/cuenta.ts "src/app/(store)/cuenta/actions.ts" "src/app/(store)/cuenta/__tests__/actions.test.ts"
git commit -m "feat: server actions para editar perfil y guardar la resena del cliente"
```

---

### Task 8: Página "Mi cuenta"

**Files:**
- Create: `src/app/(store)/cuenta/page.tsx`
- Create: `src/app/(store)/cuenta/perfil-form.tsx`
- Create: `src/app/(store)/cuenta/resena-form.tsx`

**Interfaces:**
- Consumes: `calcularTotalPagado` (Task 5); `EstrellasInput` (Task 6);
  `perfilSchema`/`PerfilInput`, `actualizarPerfil` (Task 7);
  `resenaClienteSchema`/`ResenaClienteInput`, `guardarResena` (Task 7);
  `formatPrice` de `@/lib/format` (ya existente).
- Produces: ruta `/cuenta` navegable. Task 10 (enlace del menú) apunta acá.

- [ ] **Step 1: Crear el formulario de perfil**

Crea `src/app/(store)/cuenta/perfil-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { perfilSchema, type PerfilInput } from "@/lib/validation/cuenta";
import { actualizarPerfil } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PerfilForm({ defaultValues }: { defaultValues: PerfilInput }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PerfilInput>({
    resolver: zodResolver(perfilSchema),
    defaultValues,
  });

  const onSubmit = async (data: PerfilInput) => {
    setServerError(null);
    setSuccess(false);
    const result = await actualizarPerfil(data);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
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
        <label htmlFor="whatsapp" className="text-sm text-brand-ciruela">
          WhatsApp
        </label>
        <Input id="whatsapp" type="tel" {...register("whatsapp")} />
        {errors.whatsapp && (
          <p className="text-sm text-red-600">{errors.whatsapp.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="address" className="text-sm text-brand-ciruela">
          Dirección
        </label>
        <Input id="address" {...register("address")} />
        {errors.address && (
          <p className="text-sm text-red-600">{errors.address.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && (
        <p className="text-sm text-green-700">Datos actualizados.</p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar datos"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Crear el formulario de reseña**

Crea `src/app/(store)/cuenta/resena-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resenaClienteSchema,
  type ResenaClienteInput,
} from "@/lib/validation/resena";
import { guardarResena } from "./actions";
import { EstrellasInput } from "@/components/store/estrellas-input";
import { Button } from "@/components/ui/button";

export function ResenaClienteForm({
  defaultValues,
  yaTieneResena,
}: {
  defaultValues: ResenaClienteInput;
  yaTieneResena: boolean;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResenaClienteInput>({
    resolver: zodResolver(resenaClienteSchema),
    defaultValues,
  });

  const onSubmit = async (data: ResenaClienteInput) => {
    setServerError(null);
    setSuccess(false);
    const result = await guardarResena(data);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <span className="text-sm text-brand-ciruela">Calificación</span>
        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <EstrellasInput value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.rating && (
          <p className="text-sm text-red-600">{errors.rating.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="body" className="text-sm text-brand-ciruela">
          Tu reseña
        </label>
        <textarea
          id="body"
          rows={4}
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("body")}
        />
        {errors.body && (
          <p className="text-sm text-red-600">{errors.body.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && (
        <p className="text-sm text-green-700">
          Reseña guardada. Se publicará cuando el equipo la revise.
        </p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting
          ? "Guardando..."
          : yaTieneResena
            ? "Actualizar reseña"
            : "Publicar reseña"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear la página**

Crea `src/app/(store)/cuenta/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { calcularTotalPagado } from "@/lib/store/total-pagado";
import { PerfilForm } from "./perfil-form";
import { ResenaClienteForm } from "./resena-form";

export default async function CuentaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/cuenta");
  }

  const [{ data: profile }, { data: pedidos }, { data: resena }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, whatsapp, address")
        .eq("id", user.id)
        .single(),
      supabase.from("orders").select("status, total").eq("user_id", user.id),
      supabase
        .from("reviews")
        .select("rating, body")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const totalPagado = calcularTotalPagado(pedidos ?? []);
  const cantidadPedidos = pedidos?.length ?? 0;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Mi cuenta</h1>

      <section className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-6 shadow-brand-sm">
        <div className="flex justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-brand-ciruela/60">
              Pedidos realizados
            </p>
            <p className="font-heading text-2xl text-brand-ciruela">
              {cantidadPedidos}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-brand-ciruela/60">
              Total pagado
            </p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(totalPagado)}
            </p>
          </div>
        </div>
        <Link href="/cuenta/pedidos" className="text-sm text-brand-rosa hover:underline">
          Ver mis pedidos →
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl text-brand-ciruela">Mis datos</h2>
        <PerfilForm
          defaultValues={{
            fullName: profile?.full_name ?? "",
            whatsapp: profile?.whatsapp ?? "",
            address: profile?.address ?? "",
          }}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl text-brand-ciruela">
          {resena ? "Mi reseña" : "Deja tu reseña"}
        </h2>
        <ResenaClienteForm
          defaultValues={{
            rating: resena?.rating ?? 5,
            body: resena?.body ?? "",
          }}
          yaTieneResena={Boolean(resena)}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Verificación en el navegador**

Con `pnpm dev`, inicia sesión con el usuario de prueba creado en Task 4 y
entra a `/cuenta`. Confirma: se ven pedidos=0 y total pagado=$0 (sin
pedidos aún); el formulario de datos trae precargado nombre/whatsapp/
dirección; guardar cambios funciona; el formulario de reseña permite
elegir estrellas y escribir texto, y tras guardar muestra el mensaje de
"se publicará cuando el equipo la revise". Entra a `/admin/resenas` como
`adminsu` y confirma que la reseña aparece ahí, inactiva.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(store)/cuenta/page.tsx" "src/app/(store)/cuenta/perfil-form.tsx" "src/app/(store)/cuenta/resena-form.tsx"
git commit -m "feat: pagina Mi cuenta con resumen de pedidos y resena del cliente"
```

---

### Task 9: Precarga del checkout desde el perfil

**Files:**
- Modify: `src/app/(store)/checkout/page.tsx`
- Modify: `src/app/(store)/checkout/checkout-form.tsx`

**Interfaces:**
- Consumes: `profiles.full_name`/`whatsapp`/`address` (Task 1);
  `CheckoutInput` (ya existente, sin cambios de forma).
- Produces: `CheckoutForm` acepta una nueva prop opcional
  `defaultValues?: Partial<Pick<CheckoutInput, "fullName" | "phone" | "address">>`.

- [ ] **Step 1: Pasar los valores del perfil desde la página**

En `src/app/(store)/checkout/page.tsx`, agrega la consulta del perfil junto
a las demás (después de obtener `user`, antes de construir `items`):

```ts
const { data: profile } = await supabase
  .from("profiles")
  .select("full_name, whatsapp, address")
  .eq("id", user.id)
  .single();
```

Y cambia la línea final `<CheckoutForm />` por:

```tsx
<CheckoutForm
  defaultValues={{
    fullName: profile?.full_name ?? undefined,
    phone: profile?.whatsapp ?? undefined,
    address: profile?.address ?? undefined,
  }}
/>
```

- [ ] **Step 2: Aceptar `defaultValues` en el formulario**

En `src/app/(store)/checkout/checkout-form.tsx`, cambia la firma del
componente y el `useForm`:

```tsx
export function CheckoutForm({
  defaultValues,
}: {
  defaultValues?: Partial<Pick<CheckoutInput, "fullName" | "phone" | "address">>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [datosWompi, setDatosWompi] = useState<DatosWompi | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "transferencia", ...defaultValues },
  });
```

El resto del componente (JSX de los campos, `onSubmit`) no cambia.

- [ ] **Step 3: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificación en el navegador**

Con el usuario de prueba de Task 4/8 (que ya tiene nombre/whatsapp/
dirección guardados), agrega un producto al carrito y entra a `/checkout`.
Confirma que Nombre completo, Teléfono y Dirección llegan precargados con
los datos del perfil (Ciudad y Notas quedan vacíos, como antes). Cambia el
teléfono solo para este pedido, confirma el pedido, y entra de nuevo a
`/checkout` con otro producto para confirmar que el cambio puntual no
sobrescribió lo guardado en `/cuenta`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(store)/checkout/page.tsx" "src/app/(store)/checkout/checkout-form.tsx"
git commit -m "feat: precarga el checkout con nombre/telefono/direccion del perfil"
```

---

### Task 10: Enlace "Mi cuenta" en el menú

**Files:**
- Modify: `src/components/layout/site-menu-sheet.tsx`

**Interfaces:**
- Consumes: ruta `/cuenta` de Task 8.
- Produces: nada que otros tasks consuman (hoja del árbol de UI).

- [ ] **Step 1: Agregar el enlace**

En `src/components/layout/site-menu-sheet.tsx`, dentro del bloque
`{currentUser ? ( <> ... </> ) : ( ... )}` de la sección "Mi cuenta", agrega
un primer `SheetClose` apuntando a `/cuenta`, antes de "Mis pedidos":

```tsx
{currentUser ? (
  <>
    {destino && destino !== "/" && (
      <SheetClose
        render={
          <Link
            href={destino}
            className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
          />
        }
      >
        Panel ({currentUser.profile.username})
      </SheetClose>
    )}
    <SheetClose
      render={
        <Link
          href="/cuenta"
          className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
        />
      }
    >
      Mi cuenta
    </SheetClose>
    <SheetClose
      render={
        <Link
          href="/cuenta/pedidos"
          className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
        />
      }
    >
      Mis pedidos
    </SheetClose>
    ...
```

(El resto del bloque — "Favoritos", "Cerrar sesión", y la rama `else` para
usuarios sin sesión — no cambia.)

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 3: Verificación en el navegador**

Con el usuario de prueba con sesión iniciada, abre el menú (ícono de
hamburguesa) y confirma que aparece "Mi cuenta" antes de "Mis pedidos", y
que lleva a `/cuenta`.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/site-menu-sheet.tsx
git commit -m "feat: agrega enlace Mi cuenta al menu del cliente"
```

---

## Verificación final (antes de finishing-a-development-branch)

- [ ] `pnpm exec tsc --noEmit` sin errores.
- [ ] `pnpm lint` sin errores nuevos (solo los 3 warnings preexistentes de
  `react-hooks/incompatible-library`).
- [ ] `pnpm test` — todos los tests pasan, incluyendo los nuevos de Tasks
  2, 3, 5, 6 y 7.
- [ ] `pnpm build` completa sin errores.
- [ ] Recorrido manual completo en el navegador: registro sin email →
  sesión iniciada → `/cuenta` con datos precargados → editar perfil →
  dejar reseña → checkout con nombre/teléfono/dirección precargados →
  confirmar pedido → `/cuenta` ahora muestra 1 pedido y, tras marcarlo
  `pagado` desde `/admin/pedidos`, el total pagado se actualiza →
  `/admin/resenas` muestra la reseña del cliente inactiva → al activarla,
  aparece en la sección de reseñas de la home pública.
