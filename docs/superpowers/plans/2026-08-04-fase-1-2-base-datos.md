# MeryLay Boutique — Fase 1 (Base) y Fase 2 (Datos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold la tienda MeryLay Boutique (Next.js + Tailwind + shadcn/ui con
identidad de marca, clientes Supabase, middleware de auth) y crear todo el
esquema de datos (tablas, RLS, buckets, tipos TypeScript) vía Supabase MCP.

**Architecture:** App Next.js (App Router, `src/`) con Server Components por
defecto, Supabase como backend (Postgres + Auth + Storage, RLS en todas las
tablas), estilos con Tailwind + shadcn/ui sobre tokens de marca, middleware de
Next.js protegiendo rutas por rol consultando `profiles.role`.

**Tech Stack:** Next.js (App Router) + TypeScript estricto, Tailwind CSS,
shadcn/ui, lucide-react, `@supabase/ssr` + `@supabase/supabase-js`, Vitest +
Testing Library, pnpm.

## Global Constraints

- Idioma: todo el producto (UI, mensajes, metadata) en español.
- Paleta exacta: rosa fuerte `#E96A9E`, dorado `#D9A441`, rosa `#F29DB8`, rosa
  medio `#F5B7C8`, rosa claro `#F8D4DD`, crema `#FFF8F4`, ciruela `#6E2A44`.
- Tipografía: Great Vibes (acento/logo), Playfair Display (títulos), Montserrat
  (cuerpo/UI) — Google Fonts vía `next/font/google`.
- Gestor de paquetes: `pnpm`.
- TypeScript estricto; Server Components por defecto, Client Components solo
  cuando se necesite interacción.
- RLS activo en todas las tablas; nunca `service_role` en el cliente.
- Precios en `numeric`, nunca floats.
- Commits atómicos en español al cerrar cada tarea funcional.
- Nunca subir secretos al repo; todo lo sensible va en `.env.local`
  (gitignored).
- Estructura de carpetas con `src/` (`src/app`, `src/components`, `src/lib`),
  `/public` y `/supabase/migrations` fuera de `src/` (decisión del spec).

## Referencia del spec

Este plan implementa `docs/superpowers/specs/2026-08-04-fase-1-2-base-datos-design.md`.
Consulta ese documento para el contexto completo de las decisiones de arranque.

---

## Mapa de archivos

**Fase 1:**
- `tailwind.config.ts`, `src/app/globals.css` — tokens de marca.
- `src/lib/fonts.ts` — fuentes de marca.
- `components.json`, `src/components/ui/{button,card,separator,input}.tsx` — shadcn/ui.
- `src/app/icon.svg`, `public/brand/isotipo-placeholder.svg` — assets placeholder.
- `src/app/layout.tsx`, `src/components/layout/site-header.tsx` — layout raíz.
- `src/app/(store)/page.tsx` — home placeholder.
- `vitest.config.ts`, `vitest.setup.ts` — testing.
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` — clientes Supabase.
- `.env.local`, `.env.local.example` — variables de entorno.

**Fase 2:**
- `supabase/migrations/001_roles_y_profiles.sql`
- `supabase/migrations/002_catalogo.sql`
- `supabase/migrations/003_carrito_y_pedidos.sql`
- `supabase/migrations/004_pos.sql`
- `supabase/migrations/005_store_settings.sql`
- `supabase/migrations/006_storage_buckets.sql`
- `src/lib/supabase/database.types.ts` — tipos generados.
- `src/lib/auth/route-protection.ts` — lógica pura de protección por rol.
- `middleware.ts` — middleware de sesión + protección por rol.

---

## Task 1: Scaffold del proyecto Next.js

**Files:**
- Create: proyecto completo generado por `create-next-app` en la raíz del repo
  (`package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`,
  `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`,
  `eslint.config.mjs`).

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: proyecto Next.js funcional con `pnpm dev`/`pnpm build`; convención
  `src/app` para todas las tareas siguientes.

- [ ] **Step 1: Generar el proyecto en una carpeta temporal**

El directorio raíz ya tiene `.git`, `CLAUDE.md`, `docs/`, `.claude/` — para
evitar cualquier ambigüedad con la detección de "carpeta no vacía" de
`create-next-app`, se genera en una carpeta temporal hermana y se mueve.

```bash
cd "C:/PROYECTOS"
pnpm create next-app@latest MERYLAY_tmp \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --no-turbopack
```

- [ ] **Step 2: Mover el contenido generado a la raíz del proyecto**

```bash
cd "C:/PROYECTOS"
shopt -s dotglob
for f in MERYLAY_tmp/*; do
  base=$(basename "$f")
  if [ "$base" != ".git" ]; then
    mv "$f" "MERYLAY/$base"
  fi
done
rm -rf MERYLAY_tmp
```

- [ ] **Step 3: Verificar que el proyecto compila**

```bash
cd "C:/PROYECTOS/MERYLAY"
pnpm install
pnpm build
```

Expected: build exitoso (página default de Next.js).

- [ ] **Step 4: Commit**

```bash
cd "C:/PROYECTOS/MERYLAY"
git add -A
git commit -m "chore: scaffold inicial de Next.js (TypeScript, Tailwind, App Router, src/)"
```

---

## Task 2: Tokens de marca (colores)

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `tailwind.config.ts` y `globals.css` generados en Task 1.
- Produces: clases Tailwind `brand.rosa`, `brand.oro`, `brand.rosaSecundario`,
  `brand.rosaMedio`, `brand.rosaClaro`, `brand.crema`, `brand.ciruela`; variables
  CSS `--color-brand-*` disponibles para el resto de tareas.

- [ ] **Step 1: Añadir variables CSS de marca en `globals.css`**

Agregar dentro del bloque `:root` (o crearlo si el scaffold usa `@theme inline`
de Tailwind v4 — ajustar a la sintaxis que haya generado Task 1):

```css
:root {
  --color-brand-rosa: #e96a9e;
  --color-brand-oro: #d9a441;
  --color-brand-rosa-secundario: #f29db8;
  --color-brand-rosa-medio: #f5b7c8;
  --color-brand-rosa-claro: #f8d4dd;
  --color-brand-crema: #fff8f4;
  --color-brand-ciruela: #6e2a44;
}
```

- [ ] **Step 2: Extender `tailwind.config.ts` con los tokens de marca**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          rosa: "var(--color-brand-rosa)",
          oro: "var(--color-brand-oro)",
          rosaSecundario: "var(--color-brand-rosa-secundario)",
          rosaMedio: "var(--color-brand-rosa-medio)",
          rosaClaro: "var(--color-brand-rosa-claro)",
          crema: "var(--color-brand-crema)",
          ciruela: "var(--color-brand-ciruela)",
        },
      },
    },
  },
};

export default config;
```

- [ ] **Step 3: Verificar con el build**

```bash
pnpm build
```

Expected: build exitoso, sin errores de Tailwind.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts src/app/globals.css
git commit -m "feat: agrega tokens de color de la marca MeryLay Boutique"
```

---

## Task 3: Tipografías de marca

**Files:**
- Create: `src/lib/fonts.ts`
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`

**Interfaces:**
- Consumes: `tailwind.config.ts` de Task 2.
- Produces: `greatVibes`, `playfairDisplay`, `montserrat` exportados desde
  `src/lib/fonts.ts` (objetos `NextFont` con `.variable`); clases Tailwind
  `font-script`, `font-heading`, `font-body`. Task 6 (layout) importa estos
  objetos.

- [ ] **Step 1: Crear `src/lib/fonts.ts`**

```ts
import { Great_Vibes, Playfair_Display, Montserrat } from "next/font/google";

export const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-heading",
  display: "swap",
});

export const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
```

- [ ] **Step 2: Registrar las clases en `tailwind.config.ts`**

Agregar dentro de `theme.extend`:

```ts
      fontFamily: {
        script: ["var(--font-script)"],
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
      },
```

- [ ] **Step 3: Definir `font-body` como fuente base en `globals.css`**

```css
body {
  font-family: var(--font-body);
}
```

- [ ] **Step 4: Verificar con el build**

```bash
pnpm build
```

Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fonts.ts src/app/globals.css tailwind.config.ts
git commit -m "feat: agrega tipografias de marca (Great Vibes, Playfair Display, Montserrat)"
```

---

## Task 4: shadcn/ui inicializado sobre la marca

**Files:**
- Create: `components.json`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/separator.tsx`
- Create: `src/components/ui/input.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: tokens de marca de Task 2.
- Produces: componentes `Button`, `Card`, `Separator`, `Input` importables desde
  `@/components/ui/*`, usados por Task 6 y Task 7.

- [ ] **Step 1: Inicializar shadcn/ui con defaults**

```bash
pnpm dlx shadcn@latest init -d
```

- [ ] **Step 2: Instalar los componentes base**

```bash
pnpm dlx shadcn@latest add button card separator input
```

- [ ] **Step 3: Remapear las variables semánticas de shadcn a la marca**

En `src/app/globals.css`, dentro del bloque de variables de tema que generó
shadcn (`:root` / `.dark` o el bloque `@theme` según la versión), sobrescribir:

```css
:root {
  --background: var(--color-brand-crema);
  --foreground: var(--color-brand-ciruela);
  --primary: var(--color-brand-rosa);
  --primary-foreground: var(--color-brand-crema);
  --secondary: var(--color-brand-rosa-medio);
  --secondary-foreground: var(--color-brand-ciruela);
  --accent: var(--color-brand-oro);
  --accent-foreground: var(--color-brand-ciruela);
  --card: var(--color-brand-crema);
  --card-foreground: var(--color-brand-ciruela);
  --ring: var(--color-brand-oro);
}
```

- [ ] **Step 4: Verificar visualmente**

```bash
pnpm dev
```

Abrir `http://localhost:3000` y confirmar que el botón/página default ya no se
ve gris genérico shadcn sino con los colores de marca. Detener el servidor.

- [ ] **Step 5: Commit**

```bash
git add components.json src/components/ui src/app/globals.css package.json pnpm-lock.yaml
git commit -m "feat: inicializa shadcn/ui temado con la identidad de marca"
```

---

## Task 5: Assets de marca placeholder

**Files:**
- Create: `src/app/icon.svg`
- Create: `public/brand/isotipo-placeholder.svg`

**Interfaces:**
- Consumes: tokens de marca (colores hex directos, no depende de Tailwind en
  SVG estático).
- Produces: favicon servido automáticamente por Next.js desde
  `src/app/icon.svg`; `public/brand/isotipo-placeholder.svg` usado por Task 6.

- [ ] **Step 1: Crear el favicon placeholder (monograma "ML")**

`src/app/icon.svg`:

```svg
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="31" fill="#FFF8F4" stroke="#D9A441" stroke-width="2"/>
  <text x="32" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#E96A9E">ML</text>
</svg>
```

- [ ] **Step 2: Crear el isotipo placeholder para el header**

`public/brand/isotipo-placeholder.svg` (mismo diseño, tamaño mayor para uso en
header/logo):

```svg
<svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="58" fill="#FFF8F4" stroke="#D9A441" stroke-width="3"/>
  <text x="60" y="74" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#E96A9E">ML</text>
</svg>
```

- [ ] **Step 3: Verificar que Next.js sirve el favicon**

```bash
pnpm dev
```

Abrir `http://localhost:3000` y confirmar el ícono en la pestaña del navegador.
Detener el servidor.

- [ ] **Step 4: Commit**

```bash
git add src/app/icon.svg public/brand/isotipo-placeholder.svg
git commit -m "feat: agrega assets de marca placeholder (favicon e isotipo)"
```

---

## Task 6: Layout raíz

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/layout/site-header.tsx`

**Interfaces:**
- Consumes: `greatVibes`, `playfairDisplay`, `montserrat` de
  `src/lib/fonts.ts` (Task 3); `Button` de `@/components/ui/button` (Task 4);
  `public/brand/isotipo-placeholder.svg` (Task 5).
- Produces: `<SiteHeader />` reutilizado por Task 7 y por todas las páginas
  futuras de `(store)`.

- [ ] **Step 1: Crear `src/components/layout/site-header.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-brand-rosaClaro bg-brand-crema/80 backdrop-blur">
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
        <nav className="font-body text-sm text-brand-ciruela">
          <span>Inspiración Femenina</span>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Actualizar `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { greatVibes, playfairDisplay, montserrat } from "@/lib/fonts";
import { SiteHeader } from "@/components/layout/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeryLay Boutique — Inspiración Femenina",
  description:
    "Pijamas y ropa femenina con estilo elegante y romántico. MeryLay Boutique: Inspiración Femenina.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${greatVibes.variable} ${playfairDisplay.variable} ${montserrat.variable} bg-brand-crema font-body text-brand-ciruela antialiased`}
      >
        <SiteHeader />
        {children}
      </body>
    </html>
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
git add src/app/layout.tsx src/components/layout/site-header.tsx
git commit -m "feat: layout raiz con header, fuentes y metadata en espanol"
```

---

## Task 7: Home placeholder

**Files:**
- Modify: `src/app/page.tsx` → mover a `src/app/(store)/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Card` de `@/components/ui/*` (Task 4); tokens de marca
  (Task 2/3); `<SiteHeader />` ya montado globalmente en `layout.tsx` (Task 6).
- Produces: página home en `src/app/(store)/page.tsx`, usada por Task 8 para el
  smoke test.

- [ ] **Step 1: Eliminar la home default y crear el grupo `(store)`**

```bash
rm src/app/page.tsx
mkdir -p "src/app/(store)"
```

- [ ] **Step 2: Crear `src/app/(store)/page.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-20 text-center">
      <p className="font-script text-2xl text-brand-oro">
        Bienvenida a
      </p>
      <h1 className="font-heading text-5xl font-semibold text-brand-ciruela">
        MeryLay Boutique
      </h1>
      <p className="max-w-xl font-body text-lg text-brand-ciruela/80">
        Pijamas y ropa femenina pensadas para ti. Elegancia, comodidad y un
        toque romántico en cada prenda.
      </p>
      <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
        Explorar catálogo
      </Button>

      <div className="mt-16 grid w-full gap-6 sm:grid-cols-3">
        <Card className="border-brand-rosaClaro bg-white/60">
          <CardHeader>
            <CardTitle className="font-heading text-brand-ciruela">
              Diseño elegante
            </CardTitle>
          </CardHeader>
          <CardContent className="text-brand-ciruela/70">
            Prendas pensadas con detalles dorados y siluetas femeninas.
          </CardContent>
        </Card>
        <Card className="border-brand-rosaClaro bg-white/60">
          <CardHeader>
            <CardTitle className="font-heading text-brand-ciruela">
              Comodidad real
            </CardTitle>
          </CardHeader>
          <CardContent className="text-brand-ciruela/70">
            Telas suaves seleccionadas para el día a día.
          </CardContent>
        </Card>
        <Card className="border-brand-rosaClaro bg-white/60">
          <CardHeader>
            <CardTitle className="font-heading text-brand-ciruela">
              Inspiración femenina
            </CardTitle>
          </CardHeader>
          <CardContent className="text-brand-ciruela/70">
            Cada colección refleja delicadeza y autenticidad.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verificar build**

```bash
pnpm build
```

Expected: build exitoso, ruta `/` sirviendo `(store)/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: home placeholder con identidad visual de la marca"
```

---

## Task 8: Vitest + Testing Library

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (script `test`)
- Create: `src/app/(store)/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `HomePage` de `src/app/(store)/page.tsx` (Task 7).
- Produces: comando `pnpm test`, usado por Task 19 y por toda la lógica de
  negocio de fases futuras (carrito, stock, POS).

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Crear `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Agregar script `test` en `package.json`**

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 5: Escribir el smoke test (falla primero)**

`src/app/(store)/__tests__/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "../page";

describe("HomePage", () => {
  it("muestra el nombre de la marca", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "MeryLay Boutique" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Ejecutar y confirmar que pasa (ya existe la implementación de Task 7)**

```bash
pnpm test
```

Expected: PASS — 1 test. (Nota: aquí el ciclo TDD es inverso al habitual porque
`HomePage` ya se implementó en Task 7; este test queda como regresión guard
para las fases siguientes que van a modificar esa página.)

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json "src/app/(store)/__tests__/page.test.tsx" pnpm-lock.yaml
git commit -m "test: configura Vitest y Testing Library con smoke test de la home"
```

---

## Task 9: Clientes Supabase (browser/server)

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`

**Interfaces:**
- Consumes: variables de entorno `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (definidas en Task 10).
- Produces: `createClient()` (browser) y `createClient()` (server, async) —
  usados por Task 19 (middleware) y por toda la app en fases futuras. Nota: no
  usan tipos genéricos `Database` todavía; Task 18 los añade una vez existan.

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Crear `src/lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Crear `src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // se llama desde un Server Component sin permiso de escritura;
            // el middleware ya refresca la sesión en ese caso.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores (las env vars con `!` son responsabilidad de Task 10).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase package.json pnpm-lock.yaml
git commit -m "feat: agrega clientes Supabase browser y server con @supabase/ssr"
```

---

## Task 10: Variables de entorno

**Files:**
- Create: `.env.local` (NO se commitea — ya ignorado por el `.gitignore` de
  Next.js, que incluye `.env*.local`)
- Create: `.env.local.example`

**Interfaces:**
- Consumes: `mcp__supabase__get_project_url`, `mcp__supabase__get_publishable_keys`.
- Produces: `.env.local` con valores reales de proyecto/anon key para que
  `pnpm dev` funcione localmente.

- [ ] **Step 1: Obtener URL y anon key del proyecto Supabase**

Usar las tools MCP `mcp__supabase__get_project_url` y
`mcp__supabase__get_publishable_keys` (ya conectado al proyecto
`umnyolwszwvavwcxzyfy`).

- [ ] **Step 2: Confirmar que `.env.local` está en `.gitignore`**

```bash
grep -n "env" .gitignore
```

Expected: incluye `.env*.local` (línea generada por `create-next-app`).

- [ ] **Step 3: Crear `.env.local`**

```env
NEXT_PUBLIC_SUPABASE_URL=<url del Step 1>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del Step 1>
SUPABASE_SERVICE_ROLE_KEY=<pegar manualmente desde el dashboard de Supabase; NUNCA por MCP ni en el repo>
SUPERADMIN_EMAIL=adminsu@merylayboutique.com
SUPERADMIN_USERNAME=adminsu
SUPERADMIN_PASSWORD=<definir manualmente antes de la Fase 4 — cambiar tras el primer login>
```

- [ ] **Step 4: Crear `.env.local.example` (sin valores reales, sí se commitea)**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPERADMIN_EMAIL=adminsu@merylayboutique.com
SUPERADMIN_USERNAME=adminsu
SUPERADMIN_PASSWORD=
```

- [ ] **Step 5: Verificar que `.env.local` no aparece en `git status`**

```bash
git status
```

Expected: `.env.local` no listado; `.env.local.example` sí como untracked.

- [ ] **Step 6: Commit**

```bash
git add .env.local.example
git commit -m "chore: agrega plantilla de variables de entorno (.env.local.example)"
```

---

## Task 11: Verificación final y cierre de Fase 1

**Files:** ninguno nuevo — solo verificación.

**Interfaces:**
- Consumes: todo lo producido en Tasks 1–10.
- Produces: confirmación de que la Fase 1 está completa y estable.

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

Expected: PASS.

- [ ] **Step 4: Commit de cierre de fase**

```bash
git add -A
git commit -m "chore: cierra Fase 1 (base del proyecto) — build, lint y tests en verde" --allow-empty
```

---

## Task 12: Migración 001 — roles y profiles

**Files:**
- Create: `supabase/migrations/001_roles_y_profiles.sql`

**Interfaces:**
- Consumes: proyecto Supabase `umnyolwszwvavwcxzyfy` (vacío).
- Produces: enum `public.user_role`; tabla `public.profiles`; funciones
  `public.is_admin()`, `public.is_superadmin()`, `public.is_staff_or_above()`
  (security definer, usadas por todas las migraciones siguientes); trigger
  `on_auth_user_created`.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/001_roles_y_profiles.sql`:

```sql
-- Enum de roles
create type public.user_role as enum ('superadmin', 'admin', 'staff', 'customer');

-- Tabla profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  role public.user_role not null default 'customer',
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Funciones de rol (security definer para evitar recursion en RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function public.is_staff_or_above()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin', 'superadmin')
  );
$$;

-- Politicas RLS de profiles
create policy "profiles_select_own_or_superadmin"
  on public.profiles for select
  using (id = auth.uid() or public.is_superadmin());

create policy "profiles_update_own_or_superadmin"
  on public.profiles for update
  using (id = auth.uid() or public.is_superadmin());

-- Trigger: crea el profile al registrarse un usuario, con username
-- autogenerado desde el email y reintento numerico ante colision.
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

  insert into public.profiles (id, username, role)
  values (new.id, candidate_username, 'customer');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Aplicar la migración vía MCP**

Usar `mcp__supabase__apply_migration` con `name: "roles_y_profiles"` y el SQL
del Step 1.

- [ ] **Step 3: Verificar la tabla y las políticas**

Usar `mcp__supabase__execute_sql`:

```sql
select rowsecurity from pg_tables where tablename = 'profiles';
select policyname from pg_policies where tablename = 'profiles';
```

Expected: `rowsecurity = true`; 2 políticas
(`profiles_select_own_or_superadmin`, `profiles_update_own_or_superadmin`).

- [ ] **Step 4: Verificar el trigger con un insert de prueba en `auth.users`**

```sql
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values (gen_random_uuid(), 'prueba.trigger@example.com', 'x', now());

select username, role from public.profiles where username like 'prueba.trigger%';
```

Expected: una fila con `username = 'pruebatrigger'` (o similar, sin puntos) y
`role = 'customer'`. Repetir el insert con el mismo email localpart (otro uuid,
otro email) para confirmar el sufijo numérico ante colisión, luego limpiar:

```sql
delete from auth.users where email like 'prueba.trigger%';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/001_roles_y_profiles.sql
git commit -m "feat(db): migracion 001 - roles, profiles y trigger de registro"
```

---

## Task 13: Migración 002 — catálogo

**Files:**
- Create: `supabase/migrations/002_catalogo.sql`

**Interfaces:**
- Consumes: `public.is_admin()` de Task 12.
- Produces: tablas `categories`, `products`, `product_variants`,
  `product_images` con RLS — usadas por Task 14 (FK a `products` /
  `product_variants`) y por el admin/tienda pública en fases futuras.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/002_catalogo.sql`:

```sql
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  sku text unique not null,
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text unique not null,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  stock int not null default 0 check (stock >= 0)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order int not null default 0,
  is_primary boolean not null default false
);

create index products_category_id_idx on public.products(category_id);
create index product_variants_product_id_idx on public.product_variants(product_id);
create index product_images_product_id_idx on public.product_images(product_id);

-- updated_at automatico en products
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;

create policy "categories_select_active_or_admin"
  on public.categories for select
  using (is_active or public.is_admin());
create policy "categories_write_admin"
  on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy "products_select_active_or_admin"
  on public.products for select
  using (is_active or public.is_admin());
create policy "products_write_admin"
  on public.products for all
  using (public.is_admin()) with check (public.is_admin());

create policy "product_variants_select_active_or_admin"
  on public.product_variants for select
  using (
    exists (select 1 from public.products p where p.id = product_id and (p.is_active or public.is_admin()))
  );
create policy "product_variants_write_admin"
  on public.product_variants for all
  using (public.is_admin()) with check (public.is_admin());

create policy "product_images_select_active_or_admin"
  on public.product_images for select
  using (
    exists (select 1 from public.products p where p.id = product_id and (p.is_active or public.is_admin()))
  );
create policy "product_images_write_admin"
  on public.product_images for all
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Aplicar la migración vía MCP**

`mcp__supabase__apply_migration` con `name: "catalogo"`.

- [ ] **Step 3: Verificar tablas, índices y políticas**

```sql
select tablename, rowsecurity from pg_tables
where tablename in ('categories', 'products', 'product_variants', 'product_images');

select tablename, policyname from pg_policies
where tablename in ('categories', 'products', 'product_variants', 'product_images')
order by tablename;
```

Expected: `rowsecurity = true` en las 4 tablas; 2 políticas por tabla (8 en
total).

- [ ] **Step 4: Verificar el trigger `updated_at` con una prueba funcional**

```sql
insert into public.categories (name, slug) values ('Pijamas', 'pijamas');
insert into public.products (name, slug, category_id, price, sku)
select 'Pijama Rosa', 'pijama-rosa', id, 89900, 'PJ-ROSA-001'
from public.categories where slug = 'pijamas';

select updated_at from public.products where slug = 'pijama-rosa';
update public.products set stock = 10 where slug = 'pijama-rosa';
select updated_at from public.products where slug = 'pijama-rosa';
```

Expected: el segundo `updated_at` es mayor al primero. Limpiar:

```sql
delete from public.products where slug = 'pijama-rosa';
delete from public.categories where slug = 'pijamas';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/002_catalogo.sql
git commit -m "feat(db): migracion 002 - catalogo (categorias, productos, variantes, imagenes)"
```

---

## Task 14: Migración 003 — carrito y pedidos

**Files:**
- Create: `supabase/migrations/003_carrito_y_pedidos.sql`

**Interfaces:**
- Consumes: `public.profiles` (Task 12), `public.products` /
  `public.product_variants` (Task 13), `public.is_admin()` (Task 12).
- Produces: tablas `carts`, `cart_items`, `orders`, `order_items` con RLS.

**Nota de diseño**: el acceso de carritos de invitados (`session_id`, sin
`user_id`) se implementa server-side en la Fase 7 (a través de un Route
Handler con el cliente Supabase de servidor), no con una política RLS abierta
por `session_id` — exponer esa columna directamente vía RLS permitiría a
cualquier `anon` listar carritos de otros invitados. Por eso en esta fase
`carts`/`cart_items` solo dan acceso directo a clientes autenticados dueños de
su carrito y a `admin`/`superadmin`.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/003_carrito_y_pedidos.sql`:

```sql
create type public.order_status as enum ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado');

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  session_id text,
  created_at timestamptz not null default now(),
  constraint carts_owner_check check (user_id is not null or session_id is not null)
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  user_id uuid not null references public.profiles(id),
  status public.order_status not null default 'pendiente',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  shipping numeric(12,2) not null default 0 check (shipping >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method text,
  shipping_address jsonb,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  name_snapshot text not null,
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index cart_items_cart_id_idx on public.cart_items(cart_id);
create index orders_user_id_idx on public.orders(user_id);
create index order_items_order_id_idx on public.order_items(order_id);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "carts_owner_or_admin"
  on public.carts for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "cart_items_owner_or_admin"
  on public.cart_items for all
  using (
    exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = auth.uid() or public.is_admin()))
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = auth.uid() or public.is_admin()))
  );

create policy "orders_select_owner_or_admin"
  on public.orders for select
  using (user_id = auth.uid() or public.is_admin());
create policy "orders_insert_owner"
  on public.orders for insert
  with check (user_id = auth.uid() or public.is_admin());
create policy "orders_update_admin"
  on public.orders for update
  using (public.is_admin());

create policy "order_items_select_owner_or_admin"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
  );
create policy "order_items_insert_owner"
  on public.order_items for insert
  with check (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
  );
```

- [ ] **Step 2: Aplicar la migración vía MCP**

`mcp__supabase__apply_migration` con `name: "carrito_y_pedidos"`.

- [ ] **Step 3: Verificar tablas y políticas**

```sql
select tablename, rowsecurity from pg_tables
where tablename in ('carts', 'cart_items', 'orders', 'order_items');

select tablename, policyname from pg_policies
where tablename in ('carts', 'cart_items', 'orders', 'order_items')
order by tablename;
```

Expected: `rowsecurity = true` en las 4 tablas; políticas presentes según lo
definido en el Step 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_carrito_y_pedidos.sql
git commit -m "feat(db): migracion 003 - carrito y pedidos"
```

---

## Task 15: Migración 004 — POS

**Files:**
- Create: `supabase/migrations/004_pos.sql`

**Interfaces:**
- Consumes: `public.profiles`, `public.is_staff_or_above()` (Task 12);
  `public.products` / `public.product_variants` (Task 13).
- Produces: tablas `pos_sales`, `pos_sale_items` con RLS.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/004_pos.sql`:

```sql
create type public.payment_method as enum ('efectivo', 'tarjeta', 'transferencia', 'nequi', 'daviplata');

create table public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text unique not null,
  staff_id uuid not null references public.profiles(id),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method public.payment_method not null,
  created_at timestamptz not null default now()
);

create table public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index pos_sales_staff_id_idx on public.pos_sales(staff_id);
create index pos_sale_items_sale_id_idx on public.pos_sale_items(sale_id);

alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;

create policy "pos_sales_staff_access"
  on public.pos_sales for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());

create policy "pos_sale_items_staff_access"
  on public.pos_sale_items for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());
```

- [ ] **Step 2: Aplicar la migración vía MCP**

`mcp__supabase__apply_migration` con `name: "pos"`.

- [ ] **Step 3: Verificar tablas y políticas**

```sql
select tablename, rowsecurity from pg_tables
where tablename in ('pos_sales', 'pos_sale_items');

select tablename, policyname from pg_policies
where tablename in ('pos_sales', 'pos_sale_items');
```

Expected: `rowsecurity = true` en ambas; 1 política por tabla.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/004_pos.sql
git commit -m "feat(db): migracion 004 - punto de venta (POS)"
```

---

## Task 16: Migración 005 — store_settings

**Files:**
- Create: `supabase/migrations/005_store_settings.sql`

**Interfaces:**
- Consumes: `public.is_superadmin()` (Task 12).
- Produces: tabla `store_settings` con RLS.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/005_store_settings.sql`:

```sql
create table public.store_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null
);

alter table public.store_settings enable row level security;

create policy "store_settings_select_public"
  on public.store_settings for select
  using (true);

create policy "store_settings_insert_superadmin"
  on public.store_settings for insert
  with check (public.is_superadmin());

create policy "store_settings_update_superadmin"
  on public.store_settings for update
  using (public.is_superadmin());

create policy "store_settings_delete_superadmin"
  on public.store_settings for delete
  using (public.is_superadmin());
```

- [ ] **Step 2: Aplicar la migración vía MCP**

`mcp__supabase__apply_migration` con `name: "store_settings"`.

- [ ] **Step 3: Verificar tabla y políticas**

```sql
select rowsecurity from pg_tables where tablename = 'store_settings';
select policyname, cmd from pg_policies where tablename = 'store_settings';
```

Expected: `rowsecurity = true`; 4 políticas (select/insert/update/delete).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_store_settings.sql
git commit -m "feat(db): migracion 005 - ajustes de tienda (store_settings)"
```

---

## Task 17: Migración 006 — storage buckets

**Files:**
- Create: `supabase/migrations/006_storage_buckets.sql`

**Interfaces:**
- Consumes: `public.is_admin()` (Task 12).
- Produces: buckets `product-images`, `category-images`, `brand` (públicos,
  lectura abierta, escritura solo admin/superadmin) — usados por el módulo de
  admin en fases futuras y por `public/brand` una vez el dueño suba los
  archivos reales.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/006_storage_buckets.sql`:

```sql
insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('category-images', 'category-images', true),
  ('brand', 'brand', true)
on conflict (id) do nothing;

create policy "product_images_public_read"
  on storage.objects for select
  using (bucket_id = 'product-images');
create policy "product_images_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());

create policy "category_images_public_read"
  on storage.objects for select
  using (bucket_id = 'category-images');
create policy "category_images_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'category-images' and public.is_admin());
create policy "category_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'category-images' and public.is_admin());
create policy "category_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'category-images' and public.is_admin());

create policy "brand_public_read"
  on storage.objects for select
  using (bucket_id = 'brand');
create policy "brand_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'brand' and public.is_admin());
create policy "brand_admin_update"
  on storage.objects for update
  using (bucket_id = 'brand' and public.is_admin());
create policy "brand_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'brand' and public.is_admin());
```

- [ ] **Step 2: Aplicar la migración vía MCP**

`mcp__supabase__apply_migration` con `name: "storage_buckets"`.

- [ ] **Step 3: Verificar buckets y políticas**

```sql
select id, public from storage.buckets
where id in ('product-images', 'category-images', 'brand');

select policyname from pg_policies where tablename = 'objects' and schemaname = 'storage';
```

Expected: 3 buckets con `public = true`; 12 políticas de storage (4 por
bucket).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_storage_buckets.sql
git commit -m "feat(db): migracion 006 - buckets de storage (product-images, category-images, brand)"
```

---

## Task 18: Generación de tipos TypeScript

**Files:**
- Create: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/supabase/server.ts`

**Interfaces:**
- Consumes: esquema completo de Tasks 12–17.
- Produces: tipo `Database` importado por `createClient()` en ambos
  clientes — usado por Task 19 y por todo el código futuro que consulte
  Supabase con autocompletado y chequeo de tipos.

- [ ] **Step 1: Generar los tipos vía MCP**

Usar `mcp__supabase__generate_typescript_types` y guardar el resultado en
`src/lib/supabase/database.types.ts`.

- [ ] **Step 2: Tipar el cliente browser**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Tipar el cliente server**

En `src/lib/supabase/server.ts`, agregar `import type { Database } from
"./database.types";` y cambiar `createServerClient(` por
`createServerClient<Database>(`.

- [ ] **Step 4: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase
git commit -m "feat(db): genera tipos TypeScript del esquema de Supabase"
```

---

## Task 19: Middleware de auth con protección por rol

> **Nota de ejecución:** el scaffold real usó Next.js 16, que renombró
> `middleware.ts`/`middleware()` a `proxy.ts`/`proxy()`, y el archivo debe
> vivir al mismo nivel que `app/` (dentro de `src/`, no en la raíz). El código
> implementado usa `src/proxy.ts` exportando `proxy()` en vez de
> `middleware.ts`/`middleware()`. La lógica y el comportamiento son
> equivalentes a lo descrito abajo.

**Files:**
- Create: `src/lib/auth/route-protection.ts`
- Create: `src/lib/auth/__tests__/route-protection.test.ts`
- Create: `src/proxy.ts` (Next.js 16: reemplaza a `middleware.ts`)

**Interfaces:**
- Consumes: tipo `Database["public"]["Enums"]["user_role"]` (Task 18);
  `createClient()` de `src/lib/supabase/server.ts` (Task 9/18, vía
  `createServerClient` con manejo de `NextRequest`/`NextResponse` — este
  archivo usa su propia instancia inline, no reutiliza `server.ts` porque el
  middleware necesita mutar la respuesta directamente).
- Produces: `getRequiredRoles(pathname)` y `isRoleAllowed(role, required)`
  puros y testeados; `middleware.ts` que los usa en producción.

- [ ] **Step 1: Escribir el test de la lógica pura (falla primero)**

`src/lib/auth/__tests__/route-protection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRequiredRoles, isRoleAllowed } from "../route-protection";

describe("getRequiredRoles", () => {
  it("exige admin o superadmin para /admin", () => {
    expect(getRequiredRoles("/admin/productos")).toEqual([
      "admin",
      "superadmin",
    ]);
  });

  it("exige staff, admin o superadmin para /pos", () => {
    expect(getRequiredRoles("/pos")).toEqual(["staff", "admin", "superadmin"]);
  });

  it("exige solo superadmin para /superadmin", () => {
    expect(getRequiredRoles("/superadmin/usuarios")).toEqual(["superadmin"]);
  });

  it("no exige rol para rutas publicas", () => {
    expect(getRequiredRoles("/producto/pijama-rosa")).toBeNull();
  });
});

describe("isRoleAllowed", () => {
  it("permite cuando no hay rol requerido", () => {
    expect(isRoleAllowed(null, null)).toBe(true);
  });

  it("rechaza sin sesion cuando se requiere rol", () => {
    expect(isRoleAllowed(null, ["admin", "superadmin"])).toBe(false);
  });

  it("permite cuando el rol del usuario esta en los requeridos", () => {
    expect(isRoleAllowed("staff", ["staff", "admin", "superadmin"])).toBe(
      true,
    );
  });

  it("rechaza cuando el rol del usuario no esta en los requeridos", () => {
    expect(isRoleAllowed("customer", ["admin", "superadmin"])).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
pnpm test route-protection
```

Expected: FAIL — `route-protection` no existe todavía.

- [ ] **Step 3: Implementar `src/lib/auth/route-protection.ts`**

```ts
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

const PROTECTED_ROUTES: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/superadmin", roles: ["superadmin"] },
  { prefix: "/admin", roles: ["admin", "superadmin"] },
  { prefix: "/pos", roles: ["staff", "admin", "superadmin"] },
];

export function getRequiredRoles(pathname: string): UserRole[] | null {
  const match = PROTECTED_ROUTES.find((route) =>
    pathname.startsWith(route.prefix),
  );
  return match ? match.roles : null;
}

export function isRoleAllowed(
  userRole: UserRole | null,
  requiredRoles: UserRole[] | null,
): boolean {
  if (!requiredRoles) return true;
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

```bash
pnpm test route-protection
```

Expected: PASS — 8 tests.

- [ ] **Step 5: Implementar `middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequiredRoles, isRoleAllowed } from "@/lib/auth/route-protection";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requiredRoles = getRequiredRoles(request.nextUrl.pathname);

  if (requiredRoles) {
    let role = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      role = profile?.role ?? null;
    }

    if (!isRoleAllowed(role, requiredRoles)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirectTo", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 6: Verificar build, lint y tests completos**

```bash
pnpm build
pnpm lint
pnpm test
```

Expected: los tres en verde. (La redirección a `/login` es un placeholder de
ruta — la página real de login se construye en la Fase 3; hasta entonces
redirige a una ruta que aún no existe, lo cual es aceptable para este alcance
porque no hay UI de admin/pos/superadmin todavía que dependa de ella.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth middleware.ts
git commit -m "feat: middleware de sesion Supabase con proteccion de rutas por rol"
```

---

## Task 20: Verificación final y cierre de Fase 2

**Files:** ninguno nuevo — solo verificación.

**Interfaces:**
- Consumes: todo lo producido en Tasks 12–19.
- Produces: confirmación de que la Fase 2 está completa y segura a nivel de
  RLS/advisors.

- [ ] **Step 1: Revisar advisors de seguridad y rendimiento**

Usar `mcp__supabase__get_advisors` con `type: "security"` y luego
`type: "performance"`.

Expected: sin alertas de tablas con RLS deshabilitado ni de políticas
ausentes. Si aparece alguna alerta legítima (p. ej. índice faltante en una FK
sin índice), documentarla y decidir con el usuario si se corrige en esta fase
o se difiere.

- [ ] **Step 2: Listar todas las migraciones aplicadas**

Usar `mcp__supabase__list_migrations` y confirmar las 6 migraciones
(`roles_y_profiles`, `catalogo`, `carrito_y_pedidos`, `pos`, `store_settings`,
`storage_buckets`) en orden.

- [ ] **Step 3: Build, lint y tests completos del proyecto**

```bash
pnpm build
pnpm lint
pnpm test
```

Expected: los tres en verde.

- [ ] **Step 4: Commit de cierre de fase**

```bash
git add -A
git commit -m "chore: cierra Fase 2 (datos) - migraciones, RLS, storage y tipos verificados" --allow-empty
```

---

## Nota de cierre

Al terminar Task 20, DETENTE y presenta al usuario un resumen del esquema
creado (tablas, RLS, buckets, tipos) para su revisión, tal como pidió antes de
avanzar a la Fase 3.
