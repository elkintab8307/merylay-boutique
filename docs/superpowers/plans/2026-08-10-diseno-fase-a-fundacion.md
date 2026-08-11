# Rediseño — Fase A: Fundación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sentar la base visual y técnica del rediseño (assets de marca
reales, tipografía, sombras, componentes base, navegación móvil,
pixeles de seguimiento) antes de tocar contenido de páginas específicas
en fases posteriores.

**Architecture:** El header de la tienda pública se saca del layout raíz
(hoy se filtra a admin/POS/superadmin) hacia un componente compartido
que usan los dos grupos de rutas públicos (`(store)` y `(auth)`). Se
agregan tokens de Tailwind (fuente Cinzel, sombras con tinte de marca) y
se mejoran los dos componentes base más usados (`Button`, `Input`) para
que el beneficio llegue a todo el sitio sin tocar cada página. Un
componente de menú móvil compartido (sobre `Sheet` de shadcn) resuelve
la navegación que hoy se desborda en pantallas angostas, tanto en la
tienda como en admin/superadmin.

**Tech Stack:** Next.js App Router (Server + Client Components),
Tailwind v4, shadcn/ui, `next/font/google`, `next/script`, `lucide-react`.

## Global Constraints

- Todo el producto en español (UI).
- No se toca contenido de página específico en esta fase (home, listado
  de productos, formularios de admin) — eso es Fase B/C.
- Los pixeles de seguimiento son opcionales por variable de entorno y
  *fail-open*: si la variable falta, el componente no renderiza nada, sin
  romper build ni runtime — mismo criterio que `RESEND_API_KEY` ya
  documentado en `CLAUDE.md`.
- Los pixeles y el header de tienda solo viven en los grupos de rutas
  públicos (`(store)`, `(auth)`) — nunca en `/admin`, `/pos` ni
  `/superadmin`.
- El variant `default` de `Button` ya hereda `bg-primary` = `brand-rosa`
  vía los tokens de shadcn ya configurados — no se crea un variant
  "brand" nuevo, se mejora `default`/`secondary` directamente para que
  el beneficio llegue a los ~15+ archivos que hoy sobreescriben el color
  inline, sin tocar esos archivos.
- El componente `Card` de shadcn existe pero no se usa en ningún lado —
  queda intacto en esta fase.
- Ya están instalados y verificados en esta rama: `sharp` (dependencia),
  `src/components/ui/sheet.tsx` (shadcn), y los assets reales de marca
  (`public/brand/logo-principal.png`, `src/app/icon.png`,
  `public/brand/apple-touch-icon.png`, reemplazando el placeholder
  anterior) — ninguna tarea de este plan necesita reinstalar ni
  regenerar nada de eso.

---

## Task 1: Layout público, tipografía, tokens de sombra y pixeles de seguimiento

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/fonts.ts`
- Modify: `src/app/globals.css`
- Modify: `.env.local.example`
- Modify: `CLAUDE.md`
- Create: `src/components/analytics/tracking-pixels.tsx`
- Create: `src/components/layout/public-layout-shell.tsx`
- Create: `src/app/(store)/layout.tsx`
- Create: `src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: `SiteHeader` (`@/components/layout/site-header`, ya existe,
  sin cambios en esta tarea).
- Produces: utilidad Tailwind `font-display` (Cinzel), utilidades
  `shadow-brand-sm`/`shadow-brand-md`/`shadow-brand-lg` — consumidas por
  la Task 2. `PublicLayoutShell` — no lo consume ninguna tarea futura de
  este plan, pero es la pieza que usará la Fase B si necesita agregar
  algo común a ambos grupos de rutas públicos.

- [ ] **Step 1: Agregar Cinzel a `fonts.ts`**

```ts
import { Great_Vibes, Playfair_Display, Montserrat, Cinzel } from "next/font/google";

export const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-great-vibes",
  display: "swap",
});

export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

export const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});
```

- [ ] **Step 2: Agregar tokens a `globals.css`**

Dentro del bloque `@theme inline`, agrega esta línea inmediatamente
después de `--font-sans: var(--font-montserrat);`:

```css
  --font-display: var(--font-cinzel);
```

Y agrega estas tres líneas al final del mismo bloque `@theme inline`
(justo antes del `}` que lo cierra, después de `--radius-4xl: calc(var(--radius) * 2.6);`):

```css
  --shadow-brand-sm: 0 1px 3px rgb(110 42 68 / 0.10), 0 1px 2px rgb(110 42 68 / 0.06);
  --shadow-brand-md: 0 6px 16px rgb(110 42 68 / 0.12), 0 2px 6px rgb(110 42 68 / 0.08);
  --shadow-brand-lg: 0 16px 32px rgb(110 42 68 / 0.14), 0 6px 12px rgb(110 42 68 / 0.10);
```

- [ ] **Step 3: Crear `tracking-pixels.tsx`**

```tsx
"use client";

import Script from "next/script";

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

export function TrackingPixels() {
  return (
    <>
      {META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
      {TIKTOK_PIXEL_ID && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<e.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var a=document.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};
              ttq.load('${TIKTOK_PIXEL_ID}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}
    </>
  );
}
```

- [ ] **Step 4: Crear `public-layout-shell.tsx`**

```tsx
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { TrackingPixels } from "@/components/analytics/tracking-pixels";

export function PublicLayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TrackingPixels />
      <SiteHeader />
      {children}
    </>
  );
}
```

- [ ] **Step 5: Crear `(store)/layout.tsx` y `(auth)/layout.tsx`**

Ambos archivos son idénticos salvo el nombre de la función:

`src/app/(store)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { PublicLayoutShell } from "@/components/layout/public-layout-shell";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
```

`src/app/(auth)/layout.tsx` (archivo nuevo, no existía ninguno para este
grupo de rutas):

```tsx
import type { ReactNode } from "react";
import { PublicLayoutShell } from "@/components/layout/public-layout-shell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
```

- [ ] **Step 6: Editar `src/app/layout.tsx` (raíz)**

Quita el import y el uso de `SiteHeader`, agrega la variable de Cinzel:

```tsx
import type { Metadata } from "next";
import { greatVibes, playfairDisplay, montserrat, cinzel } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeryLay Boutique — Inspiración Femenina",
  description:
    "Pijamas y ropa femenina con estilo elegante y romántico. MeryLay Boutique: Inspiración Femenina.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${greatVibes.variable} ${playfairDisplay.variable} ${montserrat.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-crema font-body text-brand-ciruela">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Documentar las variables nuevas**

En `.env.local.example`, agrega al final:

```env
NEXT_PUBLIC_META_PIXEL_ID=
NEXT_PUBLIC_TIKTOK_PIXEL_ID=
```

En `CLAUDE.md`, dentro del bloque de código de la sección 8 ("Variables
de entorno"), agrega después de la línea de `RESEND_API_KEY=...` (antes
del ```` ``` ```` que cierra el bloque):

```
# Pixeles de seguimiento (Fase A del rediseno) — opcionales, solo tienda publica
NEXT_PUBLIC_META_PIXEL_ID=...         # ID del Pixel de Meta/Facebook Ads
NEXT_PUBLIC_TIKTOK_PIXEL_ID=...       # ID del Pixel de TikTok Ads
```

Y después del párrafo que empieza con `` `RESEND_API_KEY` es **solo de
servidor**... `` (antes de la línea `En Vercel, carga estas mismas
variables...`), agrega un párrafo nuevo:

```
Los pixeles de seguimiento siguen el mismo criterio *fail-open* que
`RESEND_API_KEY`: si `NEXT_PUBLIC_META_PIXEL_ID` o
`NEXT_PUBLIC_TIKTOK_PIXEL_ID` faltan, ese pixel específico simplemente no
se carga — sin error, sin romper el sitio. Solo se cargan en la tienda
pública (grupos de rutas `(store)` y `(auth)`), nunca en `/admin`, `/pos`
ni `/superadmin`.
```

- [ ] **Step 8: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos. Confirma en el output de `pnpm build` que
`/admin`, `/pos` y `/superadmin` siguen listados (sin errores), y que no
aparece ningún error de tipos relacionado con los layouts nuevos.

- [ ] **Step 9: Commit**

```bash
git add src/app/layout.tsx src/lib/fonts.ts src/app/globals.css .env.local.example CLAUDE.md src/components/analytics/tracking-pixels.tsx src/components/layout/public-layout-shell.tsx "src/app/(store)/layout.tsx" "src/app/(auth)/layout.tsx"
git commit -m "feat: layout publico separado, tipografia Cinzel, sombras de marca y pixeles de seguimiento (rediseno Fase A)"
```

---

## Task 2: `Button` e `Input` con objetivo táctil y sombra de marca

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`

**Interfaces:**
- Consumes: `shadow-brand-sm`/`shadow-brand-md` (Task 1).
- Produces: nada consumido por otras tasks de este plan (el beneficio
  visual llega automáticamente a todo el sitio, sin que otras tasks
  necesiten importar nada nuevo).

- [ ] **Step 1: Reescribir `button.tsx`**

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-brand-sm hover:bg-primary/80 hover:shadow-brand-md",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-brand-sm hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] hover:shadow-brand-md aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-10",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 2: Reescribir `input.tsx`**

```tsx
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos — presta atención especial a
`src/app/admin/productos/__tests__/producto-form.test.tsx` (el único
test de renderizado de componente del proyecto), que no debería verse
afectado porque no depende de clases exactas de altura/sombra, solo de
roles y texto.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/input.tsx
git commit -m "feat: Button e Input con objetivo tactil real y sombra de marca (rediseno Fase A)"
```

---

## Task 3: Navegación móvil compartida

**Files:**
- Create: `src/components/layout/mobile-nav-sheet.tsx`
- Modify: `src/components/layout/site-header.tsx`
- Modify: `src/app/admin/admin-nav.tsx`
- Modify: `src/app/superadmin/superadmin-nav.tsx`

**Interfaces:**
- Consumes: `Sheet`/`SheetTrigger`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetClose`
  (`@/components/ui/sheet`, ya instalado), `Button`/`Input` mejorados
  (Task 2, aunque esta task no los usa directamente).
- Produces: `MobileNavSheet({ links, triggerLabel? })` — usado por los 3
  archivos modificados de esta misma tarea.

- [ ] **Step 1: Crear `mobile-nav-sheet.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavLink = { href: string; label: string };

export function MobileNavSheet({
  links,
  triggerLabel = "Menú",
}: {
  links: NavLink[];
  triggerLabel?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger
        aria-label={triggerLabel}
        className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30 md:hidden"
      >
        <Menu className="h-6 w-6" />
      </SheetTrigger>
      <SheetContent side="left" className="bg-brand-crema">
        <SheetHeader>
          <SheetTitle className="font-heading text-brand-ciruela">
            {triggerLabel}
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4 pb-4">
          {links.map((link) => (
            <SheetClose asChild key={link.href}>
              <Link
                href={link.href}
                className="rounded-md px-3 py-3 text-brand-ciruela hover:bg-brand-rosa-claro/30"
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Editar `site-header.tsx`**

Cambia el `src` de la imagen del logo de `/brand/isotipo-placeholder.svg`
(placeholder, ya no existe ese archivo) a `/brand/logo-principal.png`
(el logo real ya generado), y divide la fila de categorías en versión de
escritorio + menú móvil:

```tsx
import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { logout } from "@/lib/auth/logout-action";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MobileNavSheet } from "./mobile-nav-sheet";

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
              src="/brand/logo-principal.png"
              alt="MeryLay Boutique"
              width={40}
              height={40}
              className="rounded-full"
            />
            <span className="font-script text-3xl text-brand-rosa">
              MeryLay Boutique
            </span>
          </Link>
          <div className="flex items-center gap-4 font-body text-sm text-brand-ciruela">
            <span className="hidden sm:inline">Inspiración Femenina</span>
            <Link href="/carrito" className="hover:text-brand-rosa">
              Carrito
            </Link>
            {currentUser && (
              <Link href="/cuenta/pedidos" className="hover:text-brand-rosa">
                Mis pedidos
              </Link>
            )}
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
          <>
            <nav className="hidden gap-4 text-sm text-brand-ciruela md:flex">
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
            <div className="md:hidden">
              <MobileNavSheet
                triggerLabel="Categorías"
                links={categorias.map((categoria) => ({
                  href: `/categoria/${categoria.slug}`,
                  label: categoria.name,
                }))}
              />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Editar `admin-nav.tsx`**

```tsx
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

const ENLACES_BASE = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/gastos", label: "Gastos" },
  { href: "/admin/compras", label: "Compras" },
  { href: "/admin/informes", label: "Informes" },
];

export async function AdminNav() {
  const currentUser = await getCurrentProfile();
  const esSuperadmin = currentUser?.profile.role === "superadmin";
  const enlaces = esSuperadmin
    ? [...ENLACES_BASE, { href: "/superadmin/usuarios", label: "Superadmin" }]
    : ENLACES_BASE;

  return (
    <nav className="flex items-center gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <div className="md:hidden">
        <MobileNavSheet links={enlaces} />
      </div>
      <div className="hidden gap-4 md:flex">
        {enlaces.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="hover:text-brand-rosa"
          >
            {enlace.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Editar `superadmin-nav.tsx`**

```tsx
import Link from "next/link";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

const ENLACES = [
  { href: "/admin", label: "Panel" },
  { href: "/superadmin/usuarios", label: "Usuarios" },
  { href: "/superadmin/ajustes", label: "Ajustes" },
];

export function SuperadminNav() {
  return (
    <nav className="flex items-center gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <div className="md:hidden">
        <MobileNavSheet links={ENLACES} />
      </div>
      <div className="hidden gap-4 md:flex">
        {ENLACES.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="hover:text-brand-rosa"
          >
            {enlace.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/mobile-nav-sheet.tsx src/components/layout/site-header.tsx src/app/admin/admin-nav.tsx src/app/superadmin/superadmin-nav.tsx
git commit -m "feat: menu movil compartido para tienda, admin y superadmin (rediseno Fase A)"
```

---

## Task 4: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-3.

- [ ] **Step 1: Confirmar que el servidor de desarrollo está limpio**

Verificar que no hay un proceso `next dev` obsoleto (revisa el puerto
3000 en Windows con `Stop-Process` si hace falta). Si no hay ninguno,
arrancar uno limpio con `pnpm dev` en segundo plano.

- [ ] **Step 2: Verificar rutas con `curl`**

```bash
curl -s http://localhost:3000/ | grep -o 'logo-principal.png' | head -1
curl -s http://localhost:3000/login | grep -o 'logo-principal.png' | head -1
```

Expected: ambas imprimen `logo-principal.png` — confirma que el logo
real (no el placeholder) aparece tanto en la tienda (`/`) como en el
grupo `(auth)` (`/login`), sin necesitar sesión ni navegador.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin
```

Expected: redirige (307/302) hacia `/login` sin sesión (comportamiento
ya existente, confirma que la ruta sigue protegida tras los cambios de
layout).

- [ ] **Step 3: Confirmar en el HTML que admin/POS no cargan el header de tienda**

No es posible autenticarse desde `curl` fácilmente en este proyecto
(login usa Server Actions), así que esta verificación queda como
inspección de código, no de runtime: relee
`src/app/admin/layout.tsx`, `src/app/pos` (confirma que no existe
`src/app/pos/layout.tsx` propio, por lo que hereda directo del layout
raíz) y `src/app/superadmin/layout.tsx`, y confirma que ninguno importa
`SiteHeader` ni `PublicLayoutShell` — solo el layout raíz (que ya no los
importa, según la Task 1) y los layouts de `(store)`/`(auth)`.

- [ ] **Step 4: Detener el servidor**

Detener el servidor de desarrollo si se levantó en el Step 1.

- [ ] **Step 5: Nota para el reporte final**

Deja anotado en tu reporte que la verificación visual del menú
hamburguesa (que se vea, que abra, que cierre al tocar un enlace) y del
resto de los cambios de esta fase no se probó de forma interactiva en
navegador (sin herramienta de Chrome disponible) — recomienda al usuario
abrir el sitio en un móvil o achicar la ventana del navegador por debajo
de 768px para confirmar visualmente: (a) el logo real aparece en el
header, (b) el menú de categorías colapsa a un botón de hamburguesa que
abre un panel lateral, (c) lo mismo en `/admin` y `/superadmin` con sus
propios enlaces, y (d) que `/admin`, `/pos` y `/superadmin` ya NO
muestran el header de "Carrito"/"Iniciar sesión" de la tienda.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 4, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
