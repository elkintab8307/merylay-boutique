# MeryLay Boutique — Fase 4 (Seed superadmin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script idempotente `scripts/seed-superadmin.ts` que crea (o asegura)
el usuario superadmin `adminsu` a partir de las variables de entorno.

**Architecture:** Script standalone ejecutado con `tsx`, reutiliza
`createAdminClient()` (Fase 3) para hablar con Supabase Auth y `profiles` con
la service role key.

**Tech Stack:** TypeScript, `tsx`, `dotenv`, `@supabase/supabase-js` (ya
instalado).

## Global Constraints

- Idioma: mensajes de consola en español.
- La contraseña nunca se escribe en código ni se imprime; solo se lee de
  `SUPERADMIN_PASSWORD`.
- El script debe ser idempotente: correrlo dos veces no debe fallar ni
  duplicar nada.
- `service_role` solo se usa server-side (ya es la convención de
  `src/lib/supabase/admin.ts`, Fase 3).

## Referencia del spec

Este plan implementa `docs/superpowers/specs/2026-08-06-fase-4-seed-superadmin-design.md`.

---

## Mapa de archivos

- `scripts/seed-superadmin.ts` — script principal.
- `package.json` — dependencias `tsx`, `dotenv` (dev) y script `seed:superadmin`.

---

## Task 1: Instalar `tsx` y `dotenv`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nada.
- Produces: `tsx` disponible para ejecutar TypeScript standalone; `dotenv`
  disponible para cargar `.env.local` fuera del runtime de Next.js — usados
  por Task 2.

- [ ] **Step 1: Instalar**

```bash
pnpm add -D tsx dotenv
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: agrega tsx y dotenv para scripts standalone"
```

---

## Task 2: Script `seed-superadmin.ts`

**Files:**
- Create: `scripts/seed-superadmin.ts`
- Modify: `package.json` (script `seed:superadmin`)

**Interfaces:**
- Consumes: `createAdminClient()` de `src/lib/supabase/admin.ts` (Fase 3);
  `SUPERADMIN_EMAIL`, `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD` (env).
- Produces: comando `pnpm seed:superadmin`.

- [ ] **Step 1: Implementar el script**

`scripts/seed-superadmin.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";

const REQUIRED_ENV_VARS = [
  "SUPERADMIN_EMAIL",
  "SUPERADMIN_USERNAME",
  "SUPERADMIN_PASSWORD",
] as const;

function readRequiredEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Faltan variables de entorno en .env.local: ${missing.join(", ")}`,
    );
    process.exit(1);
  }

  return {
    email: process.env.SUPERADMIN_EMAIL!,
    username: process.env.SUPERADMIN_USERNAME!,
    password: process.env.SUPERADMIN_PASSWORD!,
  };
}

async function getOrCreateAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  password: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) {
    return { user: data.user, created: true as const };
  }

  if (!error.message.toLowerCase().includes("already")) {
    throw error;
  }

  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    throw listError;
  }

  const existing = list.users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(
      `No se pudo crear ni encontrar el usuario ${email}: ${error.message}`,
    );
  }

  return { user: existing, created: false as const };
}

async function main() {
  const { email, username, password } = readRequiredEnv();
  const admin = createAdminClient();

  const { user, created } = await getOrCreateAuthUser(admin, email, password);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role: "superadmin", username })
    .eq("id", user.id);

  if (updateError) {
    throw updateError;
  }

  console.log(
    created
      ? `Usuario superadmin creado: ${email} (username: ${username}).`
      : `Usuario superadmin ya existia: ${email} (username: ${username}). Rol confirmado.`,
  );
  console.log(
    "IMPORTANTE: cambia la contraseña del superadmin despues del primer inicio de sesion.",
  );
}

main().catch((error) => {
  console.error("Error al sembrar el superadmin:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Agregar el script a `package.json`**

```json
{
  "scripts": {
    "seed:superadmin": "tsx scripts/seed-superadmin.ts"
  }
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-superadmin.ts package.json
git commit -m "feat: agrega script idempotente de seed del superadmin"
```

---

## Task 3: Verificación y cierre de Fase 4

**Files:** ninguno nuevo — solo verificación contra el proyecto Supabase real.

**Interfaces:**
- Consumes: Task 2, `.env.local` (ya tiene `SUPERADMIN_PASSWORD` real).

- [ ] **Step 1: Primera corrida (crea el usuario)**

```bash
pnpm seed:superadmin
```

Expected: imprime "Usuario superadmin creado: adminsu@merylayboutique.com
(username: adminsu)." y el aviso de cambiar la contraseña.

- [ ] **Step 2: Segunda corrida (idempotencia)**

```bash
pnpm seed:superadmin
```

Expected: imprime "Usuario superadmin ya existia..." — NO falla ni duplica.

- [ ] **Step 3: Verificar en la base de datos**

Vía `mcp__supabase__execute_sql`:

```sql
select username, role from public.profiles
where username = 'adminsu';
```

Expected: una sola fila, `role = 'superadmin'`.

- [ ] **Step 4: Build y lint del proyecto completo**

```bash
pnpm build
pnpm lint
```

Expected: ambos exitosos (el script vive fuera del build de Next.js, pero
debe compilar limpio con `tsc`).

- [ ] **Step 5: Commit de cierre de fase**

```bash
git add -A
git commit -m "chore: cierra Fase 4 (seed superadmin) - verificado idempotente" --allow-empty
```
