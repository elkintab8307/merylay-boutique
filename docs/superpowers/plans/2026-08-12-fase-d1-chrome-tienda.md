# Rediseño — Fase D1: Header, menú lateral y pie de página — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el header de texto actual por uno minimalista de
solo íconos (buscar/carrito/menú), mover categorías y cuenta a un menú
lateral nuevo, agregar un pie de página con redes sociales/ubicación/
horario, y crear una página mínima `/productos` para que el header y
el menú tengan a dónde enlazar.

**Architecture:** `store_settings` (tabla jsonb ya existente) gana dos
keys nuevas (`direccion`, `horario`) sin necesidad de migración de
esquema. El conteo de productos por categoría y el conteo del carrito
se resuelven con consultas simples agrupadas en memoria (mismo patrón
ya usado para tallas/imágenes por producto), sin RPC. El carrito usa
el mismo patrón de hidratación en dos pasos que `FavoriteButton`
(servidor resuelve el conteo real para usuarios con sesión, cliente lo
corrige para invitados leyendo `localStorage`). El horario se edita
con un formulario separado (`HorarioForm` + `guardarHorario`), mismo
patrón arquitectónico que el hero/banners de la Fase B1 (formulario y
acción propios en vez de forzar la forma compleja dentro del
`AjustesForm` plano existente).

**Tech Stack:** Next.js App Router (Server + Client Components),
Supabase (Postgres), react-hook-form + zod, `lucide-react`.

## Global Constraints

- Todo el producto en español (UI, mensajes).
- El logo NO es editable desde el panel — sigue siendo el archivo
  estático `/public/brand/logo-principal.png`.
- `lucide-react` (versión instalada, `^1.28.0`) **no incluye** íconos
  de marca (`Instagram`/`Facebook`/`Twitter`/`Youtube` no existen en
  este paquete) — verificado en vivo antes de escribir este plan. Las
  redes sociales usan íconos genéricos: WhatsApp → `MessageCircle`,
  Instagram → `Camera`, TikTok → `Music2`, Facebook → `ThumbsUp`. No
  se instala ninguna librería de íconos de marca nueva.
- Cada red social solo se renderiza (en el menú y en el footer) si su
  URL está configurada en Ajustes — mismo criterio "oculto si no está
  configurado" ya usado en toda la Fase B.
- `MobileNavSheet` (Fase A) NO se modifica ni se elimina — sigue
  siendo usado tal cual por `admin-nav.tsx`/`superadmin-nav.tsx`. El
  menú lateral de la tienda usa un componente nuevo (`SiteMenuSheet`)
  sobre el mismo `Sheet` base.
- El ícono de buscar de esta fase enlaza a `/productos` (no hay
  buscador funcional todavía — lo agrega una fase posterior).
- Los formularios que suben archivos ya establecieron el patrón
  `try/catch` en su `onSubmit` (lección de la Fase B1) — el
  `HorarioForm` nuevo, aunque no sube archivos, sigue el mismo patrón
  de manejo de errores por consistencia.

---

## Task 1: Validación de horario/dirección y contador del carrito

**Files:**
- Create: `src/lib/validation/horario.ts`
- Modify: `src/lib/validation/store-settings.ts`
- Create: `src/components/store/cart-badge.tsx`

**Interfaces:**
- Produces: `DIAS_SEMANA`, `DIA_LABEL`, `horarioSchema`, `HorarioDia`,
  `Horario`, `horarioPorDefecto()` (`@/lib/validation/horario`) —
  consumidos por las Tasks 3 y 4. `direccion` agregado a
  `storeSettingsSchema`/`StoreSettingsInput`/`STORE_SETTINGS_KEYS` —
  consumido por la Task 4. `CartBadge({ initialCount, currentUserId })`
  — consumido por la Task 2.

- [ ] **Step 1: Crear la validación de horario**

Crea `src/lib/validation/horario.ts`:

```ts
import { z } from "zod";

export const DIAS_SEMANA = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const DIA_LABEL: Record<DiaSemana, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};

const horarioDiaSchema = z.object({
  dia: z.enum(DIAS_SEMANA),
  abierto: z.boolean(),
  desde: z.string(),
  hasta: z.string(),
});

export const horarioSchema = z.array(horarioDiaSchema).length(7);

export type HorarioDia = z.infer<typeof horarioDiaSchema>;
export type Horario = z.infer<typeof horarioSchema>;

export function horarioPorDefecto(): Horario {
  return DIAS_SEMANA.map((dia) => ({
    dia,
    abierto: false,
    desde: "09:00",
    hasta: "18:00",
  }));
}
```

- [ ] **Step 2: Agregar `direccion` a la validación de ajustes**

En `src/lib/validation/store-settings.ts`, agrega el campo `direccion`
al objeto `storeSettingsSchema` (después de `envioCostoDefecto`, antes
de `redesInstagram`):

```ts
  direccion: z.string().trim(),
```

Y agrega la key correspondiente a `STORE_SETTINGS_KEYS` (después de
`envioCostoDefecto: "envio_costo_defecto",`):

```ts
  direccion: "direccion",
```

No cambies nada más de ese archivo.

- [ ] **Step 3: Crear `CartBadge`**

Crea `src/components/store/cart-badge.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getLocalCart } from "@/lib/cart/local-cart";

export function CartBadge({
  initialCount,
  currentUserId,
}: {
  initialCount: number;
  currentUserId: string | null;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (currentUserId) return;
    // Un invitado no tiene carrito en el servidor; el conteo real
    // vive en localStorage y solo se conoce tras montar en el navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(getLocalCart().reduce((sum, item) => sum + item.qty, 0));
  }, [currentUserId]);

  if (count <= 0) return null;

  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-rosa px-1 text-[10px] font-semibold text-brand-crema">
      {count > 99 ? "99+" : count}
    </span>
  );
}
```

- [ ] **Step 4: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/horario.ts src/lib/validation/store-settings.ts src/components/store/cart-badge.tsx
git commit -m "feat: validacion de horario/direccion y contador de carrito"
```

---

## Task 2: Header minimalista y menú lateral

**Files:**
- Create: `src/components/layout/site-menu-sheet.tsx`
- Modify: `src/components/layout/site-header.tsx` (reemplazo completo)

**Interfaces:**
- Consumes: `CartBadge` (Task 1); `Sheet`/`SheetTrigger`/`SheetContent`/
  `SheetHeader`/`SheetTitle`/`SheetClose` (`@/components/ui/sheet`, ya
  existente); `CurrentUser` (`@/lib/auth/get-current-user`, ya
  existente); `destinoPorRol` (`@/lib/auth/destino-por-rol`, ya
  existente); `logout` (`@/lib/auth/logout-action`, ya existente).
- Produces: `SiteMenuSheet(...)` — no lo consume ninguna otra task de
  este plan.

- [ ] **Step 1: Crear `SiteMenuSheet`**

Crea `src/components/layout/site-menu-sheet.tsx`:

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, MessageCircle, Camera, Music2, ThumbsUp } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logout } from "@/lib/auth/logout-action";
import { destinoPorRol } from "@/lib/auth/destino-por-rol";
import type { CurrentUser } from "@/lib/auth/get-current-user";

type CategoriaConConteo = { id: string; name: string; slug: string; count: number };
type Redes = {
  whatsapp: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
};

export function SiteMenuSheet({
  nombreTienda,
  currentUser,
  categorias,
  totalProductos,
  redes,
}: {
  nombreTienda: string;
  currentUser: CurrentUser | null;
  categorias: CategoriaConConteo[];
  totalProductos: number;
  redes: Redes;
}) {
  const hayRedes = redes.whatsapp || redes.instagram || redes.tiktok || redes.facebook;
  const destino = currentUser ? destinoPorRol(currentUser.profile.role) : null;

  return (
    <Sheet>
      <SheetTrigger
        aria-label="Menú"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-6 overflow-y-auto bg-brand-crema">
        <SheetHeader className="items-center text-center">
          <Image
            src="/brand/logo-principal.png"
            alt={nombreTienda}
            width={64}
            height={64}
            className="rounded-full"
          />
          <SheetTitle className="font-heading text-xl text-brand-ciruela">
            {nombreTienda}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-1 px-4">
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase text-brand-rosa">
            Categorías
          </h3>
          <SheetClose
            render={
              <Link
                href="/productos"
                className="flex items-center justify-between rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
              />
            }
          >
            <span>Todos los productos</span>
            <span className="text-brand-ciruela/50">{totalProductos}</span>
          </SheetClose>
          {categorias.map((categoria) => (
            <SheetClose
              key={categoria.id}
              render={
                <Link
                  href={`/categoria/${categoria.slug}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                />
              }
            >
              <span>{categoria.name}</span>
              <span className="text-brand-ciruela/50">{categoria.count}</span>
            </SheetClose>
          ))}
        </div>

        <div className="flex flex-col gap-1 px-4">
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase text-brand-rosa">
            Mi cuenta
          </h3>
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
                    href="/cuenta/pedidos"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Mis pedidos
              </SheetClose>
              <SheetClose
                render={
                  <Link
                    href="/favoritos"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Favoritos
              </SheetClose>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full rounded-md px-3 py-2 text-left text-brand-ciruela hover:bg-brand-rosa-claro/30"
                >
                  Cerrar sesión
                </button>
              </form>
            </>
          ) : (
            <>
              <SheetClose
                render={
                  <Link
                    href="/login"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Iniciar sesión
              </SheetClose>
              <SheetClose
                render={
                  <Link
                    href="/favoritos"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Favoritos
              </SheetClose>
            </>
          )}
        </div>

        {hayRedes && (
          <div className="flex flex-col gap-2 px-4">
            <h3 className="mb-1 px-3 text-xs font-semibold uppercase text-brand-rosa">
              Síguenos
            </h3>
            <div className="flex flex-wrap gap-3 px-3">
              {redes.whatsapp && (
                <a
                  href={redes.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              )}
              {redes.instagram && (
                <a
                  href={redes.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-rosa text-brand-crema"
                >
                  <Camera className="h-5 w-5" />
                </a>
              )}
              {redes.tiktok && (
                <a
                  href={redes.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-ciruela text-brand-crema"
                >
                  <Music2 className="h-5 w-5" />
                </a>
              )}
              {redes.facebook && (
                <a
                  href={redes.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-oro text-brand-crema"
                >
                  <ThumbsUp className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Reescribir `site-header.tsx`**

Reemplaza el contenido completo de
`src/components/layout/site-header.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { CartBadge } from "@/components/store/cart-badge";
import { SiteMenuSheet } from "./site-menu-sheet";

export async function SiteHeader() {
  const supabase = await createClient();
  const [currentUser, { data: categorias }, { data: productosActivos }, { data: settingsRows }] =
    await Promise.all([
      getCurrentProfile(),
      supabase
        .from("categories")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("products").select("category_id").eq("is_active", true),
      supabase
        .from("store_settings")
        .select("key, value")
        .in("key", [
          "nombre_tienda",
          "redes_instagram",
          "redes_facebook",
          "redes_tiktok",
          "redes_whatsapp",
        ]),
    ]);

  const conteoPorCategoria = new Map<string, number>();
  for (const producto of productosActivos ?? []) {
    if (!producto.category_id) continue;
    conteoPorCategoria.set(
      producto.category_id,
      (conteoPorCategoria.get(producto.category_id) ?? 0) + 1,
    );
  }
  const totalProductos = (productosActivos ?? []).length;

  let cartInitialCount = 0;
  if (currentUser) {
    const { data: cart } = await supabase
      .from("carts")
      .select("id")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (cart) {
      const { data: items } = await supabase
        .from("cart_items")
        .select("qty")
        .eq("cart_id", cart.id);
      cartInitialCount = (items ?? []).reduce((sum, i) => sum + i.qty, 0);
    }
  }

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const nombreTienda = String(settingsByKey.get("nombre_tienda") ?? "MeryLay Boutique");
  const redesWhatsapp = settingsByKey.get("redes_whatsapp");
  const redesInstagram = settingsByKey.get("redes_instagram");
  const redesTiktok = settingsByKey.get("redes_tiktok");
  const redesFacebook = settingsByKey.get("redes_facebook");

  return (
    <header className="sticky top-0 z-40 border-b border-brand-rosa-claro bg-brand-crema/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/logo-principal.png"
            alt={nombreTienda}
            width={36}
            height={36}
            className="rounded-full"
          />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/productos"
            aria-label="Buscar productos"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="/carrito"
            aria-label="Ver carrito"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <ShoppingBag className="h-5 w-5" />
            <CartBadge initialCount={cartInitialCount} currentUserId={currentUser?.id ?? null} />
          </Link>
          <SiteMenuSheet
            nombreTienda={nombreTienda}
            currentUser={currentUser}
            categorias={(categorias ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              count: conteoPorCategoria.get(c.id) ?? 0,
            }))}
            totalProductos={totalProductos}
            redes={{
              whatsapp: redesWhatsapp ? String(redesWhatsapp) : null,
              instagram: redesInstagram ? String(redesInstagram) : null,
              tiktok: redesTiktok ? String(redesTiktok) : null,
              facebook: redesFacebook ? String(redesFacebook) : null,
            }}
          />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/site-menu-sheet.tsx src/components/layout/site-header.tsx
git commit -m "feat: header minimalista de iconos y menu lateral de la tienda"
```

---

## Task 3: Pie de página

**Files:**
- Create: `src/components/layout/site-footer.tsx`
- Modify: `src/components/layout/public-layout-shell.tsx`

**Interfaces:**
- Consumes: `DIAS_SEMANA`, `DIA_LABEL`, `Horario` (Task 1).
- Produces: `SiteFooter()` — no lo consume ninguna otra task de este
  plan.

- [ ] **Step 1: Crear `SiteFooter`**

Crea `src/components/layout/site-footer.tsx`:

```tsx
import { MessageCircle, Camera, Music2, ThumbsUp, MapPin, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DIA_LABEL, DIAS_SEMANA, type Horario } from "@/lib/validation/horario";

export async function SiteFooter() {
  const supabase = await createClient();
  const { data: settingsRows } = await supabase
    .from("store_settings")
    .select("key, value")
    .in("key", [
      "nombre_tienda",
      "direccion",
      "horario",
      "redes_instagram",
      "redes_facebook",
      "redes_tiktok",
      "redes_whatsapp",
    ]);

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const nombreTienda = String(settingsByKey.get("nombre_tienda") ?? "MeryLay Boutique");
  const direccion = settingsByKey.get("direccion");
  const horario = settingsByKey.get("horario") as Horario | undefined;
  const redesWhatsapp = settingsByKey.get("redes_whatsapp");
  const redesInstagram = settingsByKey.get("redes_instagram");
  const redesTiktok = settingsByKey.get("redes_tiktok");
  const redesFacebook = settingsByKey.get("redes_facebook");

  const hayRedes = redesWhatsapp || redesInstagram || redesTiktok || redesFacebook;
  const horarioOrdenado = horario
    ? DIAS_SEMANA.map((dia) => horario.find((h) => h.dia === dia)).filter(
        (h): h is Horario[number] => Boolean(h),
      )
    : [];

  return (
    <footer className="mt-16 bg-brand-ciruela px-6 py-12 text-brand-crema">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
        <h2 className="font-heading text-2xl">{nombreTienda}</h2>

        {hayRedes && (
          <div className="flex gap-3">
            {redesWhatsapp && (
              <a
                href={String(redesWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
            )}
            {redesInstagram && (
              <a
                href={String(redesInstagram)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-rosa text-brand-crema"
              >
                <Camera className="h-5 w-5" />
              </a>
            )}
            {redesTiktok && (
              <a
                href={String(redesTiktok)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-crema/20 text-brand-crema"
              >
                <Music2 className="h-5 w-5" />
              </a>
            )}
            {redesFacebook && (
              <a
                href={String(redesFacebook)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-oro text-brand-crema"
              >
                <ThumbsUp className="h-5 w-5" />
              </a>
            )}
          </div>
        )}

        {direccion && (
          <div className="flex flex-col items-center gap-1">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-brand-oro">
              <MapPin className="h-4 w-4" />
              Ubicación
            </p>
            <p className="text-sm">{String(direccion)}</p>
          </div>
        )}

        {horarioOrdenado.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-brand-oro">
              <Clock className="h-4 w-4" />
              Horario
            </p>
            <div className="flex flex-col gap-1 text-sm">
              {horarioOrdenado.map((dia) => (
                <div key={dia.dia} className="flex justify-between gap-6">
                  <span>{DIA_LABEL[dia.dia]}</span>
                  <span>{dia.abierto ? `${dia.desde} – ${dia.hasta}` : "Cerrado"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-brand-crema/60">
          © {new Date().getFullYear()} {nombreTienda} · Inspiración Femenina
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Agregar el footer a `PublicLayoutShell`**

Reemplaza el contenido completo de
`src/components/layout/public-layout-shell.tsx`:

```tsx
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TrackingPixels } from "@/components/analytics/tracking-pixels";

export function PublicLayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TrackingPixels />
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/site-footer.tsx src/components/layout/public-layout-shell.tsx
git commit -m "feat: pie de pagina con redes sociales, ubicacion y horario"
```

---

## Task 4: Dirección y horario en el panel de Ajustes

**Files:**
- Modify: `src/app/superadmin/ajustes/ajustes-form.tsx`
- Create: `src/app/superadmin/ajustes/horario-form.tsx`
- Modify: `src/app/superadmin/ajustes/actions.ts`
- Modify: `src/app/superadmin/ajustes/page.tsx`

**Interfaces:**
- Consumes: `direccion` en `storeSettingsSchema`/`StoreSettingsInput`/
  `STORE_SETTINGS_KEYS`, `horarioSchema`, `Horario`, `DIA_LABEL`,
  `horarioPorDefecto` (Task 1).
- Produces: `guardarHorario(horario)` — no lo consume ninguna otra
  task de este plan.

- [ ] **Step 1: Agregar el campo "Dirección" a `AjustesForm`**

En `src/app/superadmin/ajustes/ajustes-form.tsx`, dentro de la sección
"Datos generales" (el primer `<div className="flex flex-col gap-4">`),
agrega este bloque justo después del campo `contactoTelefono` (después
de su `</div>` de cierre, antes del `</div>` que cierra la sección
"Datos generales"):

```tsx
        <div>
          <label htmlFor="direccion" className="text-sm text-brand-ciruela">
            Dirección
          </label>
          <Input id="direccion" {...register("direccion")} />
          {errors.direccion && (
            <p className="text-sm text-red-600">{errors.direccion.message}</p>
          )}
        </div>
```

No cambies nada más de ese archivo — el resto de las secciones (Envío,
Inventario, Redes sociales) y el botón de guardar quedan iguales.

- [ ] **Step 2: Crear `HorarioForm`**

Crea `src/app/superadmin/ajustes/horario-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { horarioSchema, DIA_LABEL, type Horario } from "@/lib/validation/horario";
import { guardarHorario } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formSchema = z.object({ dias: horarioSchema });
type FormValues = z.infer<typeof formSchema>;

export function HorarioForm({ defaultValues }: { defaultValues: Horario }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { dias: defaultValues },
  });

  const { fields } = useFieldArray({ control, name: "dias" });
  const diasActuales = watch("dias");

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    setSuccess(false);
    try {
      const result = await guardarHorario(data.dias);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      setSuccess(true);
    } catch {
      setServerError("No se pudo guardar el horario.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-3">
      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-wrap items-center gap-3">
          <span className="w-24 text-sm text-brand-ciruela">{DIA_LABEL[field.dia]}</span>
          <label className="flex items-center gap-1 text-xs text-brand-ciruela">
            <input type="checkbox" {...register(`dias.${index}.abierto` as const)} />
            Abierto
          </label>
          <Input
            type="time"
            disabled={!diasActuales[index]?.abierto}
            className="w-28"
            {...register(`dias.${index}.desde` as const)}
          />
          <Input
            type="time"
            disabled={!diasActuales[index]?.abierto}
            className="w-28"
            {...register(`dias.${index}.hasta` as const)}
          />
        </div>
      ))}
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && <p className="text-sm text-green-700">Horario guardado correctamente.</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar horario"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Agregar `guardarHorario` a `actions.ts`**

En `src/app/superadmin/ajustes/actions.ts`, agrega este import al
inicio del archivo (junto a los ya existentes):

```ts
import { horarioSchema, type Horario } from "@/lib/validation/horario";
```

Y agrega esta función al final del archivo:

```ts
export async function guardarHorario(horario: Horario): Promise<{ error?: string }> {
  await requireSuperadmin();

  const parsed = horarioSchema.safeParse(horario);
  if (!parsed.success) {
    return { error: "Revisa los datos del horario." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_settings")
    .upsert({ key: "horario", value: parsed.data }, { onConflict: "key" });

  if (error) {
    return { error: "No se pudo guardar el horario." };
  }

  revalidatePath("/superadmin/ajustes");
  revalidatePath("/");
  return {};
}
```

- [ ] **Step 4: Cargar horario y `direccion` en `page.tsx`**

En `src/app/superadmin/ajustes/page.tsx`, agrega estos imports al
inicio del archivo (junto a los ya existentes):

```ts
import { horarioPorDefecto, type Horario } from "@/lib/validation/horario";
import { HorarioForm } from "./horario-form";
```

En la construcción de `defaultValues: StoreSettingsInput`, agrega el
campo `direccion` (después de la línea de `envioCostoDefecto`):

```tsx
    direccion: String(valueByKey.get(STORE_SETTINGS_KEYS.direccion) ?? ""),
```

Después del bloque que calcula `homeDefaultValues` (antes del
`return`), agrega:

```tsx
  const horarioStored = valueByKey.get("horario") as Horario | undefined;
  const horarioDefaultValues = horarioStored ?? horarioPorDefecto();
```

Y dentro del `return`, agrega una sección nueva para `HorarioForm`
justo después de la sección "Contenido del inicio" (después de su
`</div>` de cierre, antes del `</div>` que cierra todo el componente):

```tsx
      <div className="flex flex-col gap-6">
        <h2 className="font-heading text-xl text-brand-ciruela">Horario de atención</h2>
        <HorarioForm defaultValues={horarioDefaultValues} />
      </div>
```

- [ ] **Step 5: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 6: Commit**

```bash
git add src/app/superadmin/ajustes/ajustes-form.tsx src/app/superadmin/ajustes/horario-form.tsx src/app/superadmin/ajustes/actions.ts src/app/superadmin/ajustes/page.tsx
git commit -m "feat: direccion y horario editables desde Ajustes"
```

---

## Task 5: Página mínima `/productos`

**Files:**
- Create: `src/app/(store)/productos/page.tsx`

**Interfaces:**
- Consumes: `ProductCard`, `ProductCardData` (`@/components/store/product-card`,
  ya existente).
- Produces: nada consumido por otra task de este plan.

- [ ] **Step 1: Crear la página**

Crea `src/app/(store)/productos/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";

export default async function ProductosPage() {
  const supabase = await createClient();
  const [{ data: productosBase }, { data: { user } }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, price, compare_at_price")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const productIds = (productosBase ?? []).map((p) => p.id);

  const [{ data: imagenes }, { data: favoritos }, { data: variantes }] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", productIds)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
    user && productIds.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user.id)
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
    productIds.length > 0
      ? supabase
          .from("product_variants")
          .select("product_id, talla")
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as { product_id: string; talla: string | null }[] }),
  ]);

  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));
  const tallasPorProducto = new Map<string, string[]>();
  for (const variante of variantes ?? []) {
    if (!variante.talla) continue;
    const actuales = tallasPorProducto.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorProducto.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallas] of tallasPorProducto) {
    tallasPorProducto.set(productId, [...tallas].sort());
  }

  const productos: ProductCardData[] = (productosBase ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
    tallas: tallasPorProducto.get(p.id) ?? [],
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Todos los productos</h1>
      {productos.length > 0 ? (
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
      ) : (
        <p className="text-brand-ciruela/70">Todavía no hay productos disponibles.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos, y `/productos` aparece en la lista de
rutas del build.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(store)/productos/page.tsx"
git commit -m "feat: pagina minima de catalogo completo en /productos"
```

---

## Task 6: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-5.

- [ ] **Step 1: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 (Windows) y arranca uno limpio con `pnpm dev`
en segundo plano si hace falta.

- [ ] **Step 2: Verificar que la home y `/productos` cargan**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/productos
```

Expected: `200` en ambos.

```bash
curl -s http://localhost:3000/ | grep -o "Todos los productos" | head -1
```

Expected: no imprime nada directamente visible en el HTML del servidor
(el texto vive dentro del `Sheet`, que Base UI monta pero mantiene
oculto hasta abrirse) — en su lugar, verifica que el ícono de menú
está presente buscando su `aria-label`:

```bash
curl -s http://localhost:3000/ | grep -o 'aria-label="Menú"' | head -1
```

Expected: imprime la coincidencia.

- [ ] **Step 3: Verificar que el pie de página aparece**

```bash
curl -s http://localhost:3000/ | grep -o "Inspiración Femenina" | head -1
```

Expected: imprime la coincidencia (viene del footer).

- [ ] **Step 4: Confirmar en código que `/admin`, `/pos` y `/superadmin` no importan nada del nuevo chrome público**

Búsqueda de texto (`SiteMenuSheet|SiteFooter|CartBadge`) dentro de
`src/app/admin`, `src/app/pos` y `src/app/superadmin` — no debe haber
ningún resultado.

- [ ] **Step 5: Detener el servidor**

Detener el servidor de desarrollo si se levantó en el Step 1.

- [ ] **Step 6: Nota para el reporte final**

Deja anotado en tu reporte que la verificación visual completa (abrir
el menú lateral y confirmar categorías/conteos/redes sociales, agregar
algo al carrito como invitado y como usuario con sesión y confirmar
que el contador del header cambia, revisar el pie de página con y sin
horario/dirección configurados, guardar un horario desde Ajustes y
confirmar que aparece en el footer) no se hizo de forma interactiva en
navegador — recomienda al usuario ese recorrido manual.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 6, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
