# Rediseño POS — Layout y navegación (sub-proyecto 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al POS (`/pos/**`) el layout persistente del mockup — sidebar con íconos, barra superior con acciones reales, barra de estado inferior — cerrando además la inconsistencia de que la terminal (`/pos`) es hoy la única página del módulo sin el sidebar compartido.

**Architecture:** Se extiende el componente `BackendSidebar` ya compartido con `/admin` para aceptar un ícono opcional por ítem. La terminal (`page.tsx` + `pos-terminal.tsx`) se mueve al route group `(admin)` para heredar `PosAdminLayout` (la URL sigue siendo `/pos`, los route groups no la afectan). `PosAdminLayout` pasa a ser `async`, trae vendedor actual y alertas de stock bajo, y monta dos piezas nuevas — `PosTopBar` y `PosStatusBar` — alrededor de `{children}`, por lo que aparecen en TODAS las páginas del POS (terminal, ventas, créditos, recibo), no solo en la terminal.

**Tech Stack:** Next.js App Router (Server + Client Components), TypeScript, Supabase (`@/lib/supabase/server`), Tailwind CSS, lucide-react, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-pos-layout-navegacion-design.md`

## Global Constraints

- Paleta y tipografía: reusar exclusivamente los tokens ya definidos en `globals.css` (`brand-rosa`, `brand-oro`, `brand-ciruela`, `brand-crema`, `brand-rosa-claro`). No crear tokens nuevos.
- Íconos: solo `lucide-react`. Antes de usar un ícono nuevo, verificar que existe en la versión instalada (ya verificado para este plan: `Store`, `Receipt`, `CreditCard`, `Bell`, `Printer`, `Wifi`, `WifiOff` — los cuatro existen en `lucide-react@1.28.0`).
- Sin botón "Cliente" en la barra superior — diferido al sub-proyecto 2 (selector real de clientes).
- Sin "Scanner" — pertenece al sub-proyecto 3.
- "Caja actual" es siempre el texto fijo `"Caja Principal"` — no existe (ni se planea aquí) un sistema real de múltiples cajas.
- Todo el texto de la UI en español, mensajes de error claros.
- `BackendSidebar` debe seguir funcionando sin cambios para `admin-nav.tsx`, que no pasa íconos — cualquier cambio a su tipo debe ser retrocompatible (ícono opcional).
- Toda barra/elemento de navegación nuevo debe llevar `print:hidden` para no aparecer en el recibo impreso (mismo criterio que ya usa `BackendSidebar` y `PrintButton`).
- **[Ruling post-Task 4]** `SidebarSection.items[].icon` es `React.ReactNode` (un elemento ya renderizado, p. ej. `<Store className="h-4 w-4 shrink-0" />`), **nunca** el tipo `LucideIcon`/una referencia a componente sin invocar. Un Server Component (como `PosAdminLayout`) no puede pasarle una función/referencia a componente como prop a un Client Component (`BackendSidebar` lleva `"use client"`) — Next.js lo rechaza en build con "Functions cannot be passed directly to Client Components". Descubierto durante la verificación de build de la Task 4; corregido en `backend-sidebar.tsx` y en el bloque de la Task 7 más abajo.

---

### Task 1: Ícono opcional por ítem en `BackendSidebar`

**Files:**
- Modify: `src/components/admin/backend-sidebar.tsx`
- Test: `src/components/admin/__tests__/backend-sidebar.test.tsx`

**Interfaces:**
- Produces: `SidebarSection.items[].icon?: LucideIcon` — usado por la Task 2 (`src/app/pos/(admin)/layout.tsx`) para pasar `Store`, `Receipt`, `CreditCard`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/admin/__tests__/backend-sidebar.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Store } from "lucide-react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pos",
}));

import { BackendSidebar } from "../backend-sidebar";

describe("BackendSidebar", () => {
  it("renderiza un icono cuando el item lo trae", () => {
    render(
      <BackendSidebar
        sections={[
          { label: "POS", items: [{ href: "/pos", label: "Terminal", icon: Store }] },
        ]}
        homeHref="/pos"
      />,
    );
    const enlaces = screen.getAllByText("Terminal");
    expect(enlaces.length).toBeGreaterThan(0);
    const link = enlaces[0].closest("a");
    expect(link?.querySelector("svg")).toBeInTheDocument();
  });

  it("no rompe cuando el item no trae icono (compatibilidad con admin-nav)", () => {
    render(
      <BackendSidebar
        sections={[{ label: "Panel", items: [{ href: "/admin", label: "Inicio" }] }]}
        homeHref="/admin"
      />,
    );
    expect(screen.getAllByText("Inicio").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run src/components/admin/__tests__/backend-sidebar.test.tsx`
Expected: FAIL — `icon` no existe en el tipo `SidebarSection.items` (error de TypeScript) o el ícono simplemente no se encuentra en el DOM.

- [ ] **Step 3: Implementar el cambio mínimo**

En `src/components/admin/backend-sidebar.tsx`, reemplazar el bloque completo del archivo por:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type SidebarSection = {
  label: string;
  items: { href: string; label: string; icon?: LucideIcon }[];
};

function NavLinks({
  sections,
  currentPath,
  onNavigate,
}: {
  sections: SidebarSection[];
  currentPath: string;
  onNavigate?: (
    item: { href: string; label: string; icon?: LucideIcon },
    className: string,
    content: React.ReactNode,
  ) => React.ReactNode;
}) {
  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium tracking-wide text-brand-ciruela/50 uppercase">
            {section.label}
          </p>
          {section.items.map((item) => {
            const active = currentPath === item.href;
            const Icon = item.icon;
            const linkClassName = cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-brand-rosa/10 font-medium text-brand-rosa"
                : "text-brand-ciruela hover:bg-brand-rosa-claro/20",
            );
            const content = (
              <>
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {item.label}
              </>
            );
            if (onNavigate) {
              return <div key={item.href}>{onNavigate(item, linkClassName, content)}</div>;
            }
            return (
              <Link key={item.href} href={item.href} className={linkClassName}>
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function BackendSidebar({
  sections,
  homeHref,
}: {
  sections: SidebarSection[];
  homeHref: string;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-brand-rosa-claro bg-white px-4 py-6 md:flex print:hidden">
        <Link href={homeHref} className="px-3 font-script text-2xl text-brand-rosa">
          MeryLay
        </Link>
        <NavLinks sections={sections} currentPath={pathname} />
      </aside>
      <div className="border-b border-brand-rosa-claro bg-white px-4 py-3 md:hidden print:hidden">
        <Sheet>
          <SheetTrigger
            aria-label="Menú"
            className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <Menu className="h-6 w-6" />
          </SheetTrigger>
          <SheetContent side="left" className="bg-brand-crema">
            <SheetHeader>
              <SheetTitle className="font-script text-2xl text-brand-rosa">
                MeryLay
              </SheetTitle>
            </SheetHeader>
            <div className="px-2 pb-4">
              <NavLinks
                sections={sections}
                currentPath={pathname}
                onNavigate={(item, className, content) => (
                  <SheetClose render={<Link href={item.href} />} className={className}>
                    {content}
                  </SheetClose>
                )}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run src/components/admin/__tests__/backend-sidebar.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Verificar que `admin-nav.tsx` sigue compilando sin cambios**

Run: `pnpm tsc --noEmit`
Expected: sin errores — `src/app/admin/admin-nav.tsx` no pasa `icon` en ningún item y sigue siendo válido porque el campo es opcional.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/backend-sidebar.tsx src/components/admin/__tests__/backend-sidebar.test.tsx
git commit -m "feat: BackendSidebar acepta icono opcional por item"
```

---

### Task 2: Íconos en el sidebar del POS y terminal dentro del route group `(admin)`

**Files:**
- Modify: `src/app/pos/(admin)/layout.tsx`
- Move: `src/app/pos/page.tsx` → `src/app/pos/(admin)/page.tsx`
- Move: `src/app/pos/pos-terminal.tsx` → `src/app/pos/(admin)/pos-terminal.tsx`

**Interfaces:**
- Consumes: `SidebarSection.items[].icon?: LucideIcon` (Task 1).
- Produces: la terminal (`/pos`) ahora vive dentro de `src/app/pos/(admin)/`, junto a `venta/[id]`, `ventas` y `creditos` — la Task 7 la usará para wirear el top bar/status bar sin tocar rutas.

- [ ] **Step 1: Mover los dos archivos preservando el historial de git**

```bash
git mv "src/app/pos/page.tsx" "src/app/pos/(admin)/page.tsx"
git mv "src/app/pos/pos-terminal.tsx" "src/app/pos/(admin)/pos-terminal.tsx"
```

- [ ] **Step 2: Corregir los imports internos de `pos-terminal.tsx`**

`pos-terminal.tsx` importaba `./venta-items-editor` y `./sale-action`, que ahora quedan un nivel más arriba (siguen en `src/app/pos/`). En `src/app/pos/(admin)/pos-terminal.tsx`, reemplazar:

```tsx
import { VentaItemsEditor } from "./venta-items-editor";
import { registrarVenta } from "./sale-action";
```

por (mismo alias absoluto que ya usa `editar-venta-form.tsx` para importar `venta-items-editor.tsx`):

```tsx
import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import { registrarVenta } from "@/app/pos/sale-action";
```

El resto del archivo (`PosTerminal`) no cambia.

- [ ] **Step 3: Agregar íconos a las secciones del sidebar del POS**

En `src/app/pos/(admin)/layout.tsx`, reemplazar el archivo completo por:

```tsx
import { Store, Receipt, CreditCard } from "lucide-react";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

const SECTIONS: SidebarSection[] = [
  {
    label: "POS",
    items: [
      { href: "/pos", label: "Terminal", icon: Store },
      { href: "/pos/ventas", label: "Ventas POS", icon: Receipt },
      { href: "/pos/creditos", label: "Créditos", icon: CreditCard },
    ],
  },
];

export default function PosAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-brand-crema">
      <BackendSidebar sections={SECTIONS} homeHref="/pos" />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
```

(Este layout se vuelve a modificar en la Task 7 para montar el top bar y el status bar — aquí solo se agregan los íconos, sin tocar la estructura todavía.)

- [ ] **Step 4: Verificar que compila y que la ruta `/pos` sigue existiendo**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

Run: `pnpm vitest run`
Expected: todos los tests existentes siguen en verde (en particular `src/app/pos/__tests__/sale-action.test.ts`, que no depende de la ubicación de `pos-terminal.tsx`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/pos/(admin)/page.tsx" "src/app/pos/(admin)/pos-terminal.tsx" "src/app/pos/(admin)/layout.tsx"
git commit -m "feat: mover terminal POS al grupo (admin) y agregar iconos al sidebar"
```

---

### Task 3: Server action para reimprimir el último recibo

**Files:**
- Create: `src/components/pos/reimprimir-action.ts`
- Test: `src/components/pos/__tests__/reimprimir-action.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile()` (`@/lib/auth/get-current-user`, ya existente, retorna `CurrentUser | null` con `id: string`); `pos_sales` tabla (`staff_id`, `id`, `created_at`).
- Produces: `reimprimirUltimoRecibo(): Promise<{ error?: string }>` — usado por la Task 5 (`ImprimirUltimoReciboButton`). En caso de éxito hace `redirect()` (lanza, no retorna).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/pos/__tests__/reimprimir-action.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

function crearSupabaseMock(venta: { id: string } | null) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: venta, error: null }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, _spies: { select, eq, order, limit, maybeSingle } };
}

describe("reimprimirUltimoRecibo", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(getCurrentProfile).mockReset();
    vi.mocked(redirect).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesion activa: retorna error sin consultar la base de datos", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const supabase = crearSupabaseMock(null);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reimprimirUltimoRecibo } = await import("../reimprimir-action");
    const resultado = await reimprimirUltimoRecibo();

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("vendedor sin ventas registradas: retorna error", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: "staff-1",
      email: "a@b.com",
      profile: { id: "staff-1", role: "staff" } as never,
    });
    const supabase = crearSupabaseMock(null);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reimprimirUltimoRecibo } = await import("../reimprimir-action");
    const resultado = await reimprimirUltimoRecibo();

    expect(resultado).toEqual({ error: expect.any(String) });
  });

  it("vendedor con ventas: filtra por su staff_id y redirige al recibo con ?print=1", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: "staff-1",
      email: "a@b.com",
      profile: { id: "staff-1", role: "staff" } as never,
    });
    const supabase = crearSupabaseMock({ id: "sale-uuid-9" });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reimprimirUltimoRecibo } = await import("../reimprimir-action");
    await expect(reimprimirUltimoRecibo()).rejects.toThrow("NEXT_REDIRECT");

    expect(supabase.from).toHaveBeenCalledWith("pos_sales");
    expect(supabase._spies.eq).toHaveBeenCalledWith("staff_id", "staff-1");
    expect(redirect).toHaveBeenCalledWith("/pos/venta/sale-uuid-9?print=1");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run src/components/pos/__tests__/reimprimir-action.test.ts`
Expected: FAIL — el módulo `../reimprimir-action` no existe todavía.

- [ ] **Step 3: Implementar el mínimo necesario**

Crear `src/components/pos/reimprimir-action.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";

export async function reimprimirUltimoRecibo(): Promise<{ error?: string }> {
  const currentUser = await getCurrentProfile();
  if (!currentUser) {
    return { error: "No hay sesión activa." };
  }

  const supabase = await createClient();
  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id")
    .eq("staff_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!venta) {
    return { error: "Todavía no tienes ventas registradas." };
  }

  redirect(`/pos/venta/${venta.id}?print=1`);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run src/components/pos/__tests__/reimprimir-action.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/pos/reimprimir-action.ts src/components/pos/__tests__/reimprimir-action.test.ts
git commit -m "feat: server action para reimprimir el ultimo recibo del vendedor"
```

---

### Task 4: Auto-impresión del recibo vía `?print=1`

**Files:**
- Modify: `src/app/pos/(admin)/venta/[id]/print-button.tsx`
- Modify: `src/app/pos/(admin)/venta/[id]/page.tsx`

**Interfaces:**
- Consumes: nada nuevo (solo el `searchParams` que Next.js ya provee a toda página vía `PageProps<Route>`, patrón ya usado en `src/app/admin/informes/ventas/page.tsx`).
- Produces: `<PrintButton autoImprimir?: boolean />` — cuando `reimprimirUltimoRecibo()` (Task 3) redirige a `/pos/venta/[id]?print=1`, esta página dispara `window.print()` automáticamente al cargar.

- [ ] **Step 1: Modificar `print-button.tsx` para soportar auto-impresión**

Reemplazar `src/app/pos/(admin)/venta/[id]/print-button.tsx` completo por:

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton({ autoImprimir = false }: { autoImprimir?: boolean }) {
  useEffect(() => {
    if (autoImprimir) {
      window.print();
    }
  }, [autoImprimir]);

  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 print:hidden"
    >
      Imprimir
    </Button>
  );
}
```

- [ ] **Step 2: Leer `searchParams` en `page.tsx` y pasar el prop**

En `src/app/pos/(admin)/venta/[id]/page.tsx`, cambiar la firma de la función de:

```tsx
export default async function ReciboVentaPage({
  params,
}: PageProps<"/pos/venta/[id]">) {
  const { id } = await params;
```

a:

```tsx
export default async function ReciboVentaPage({
  params,
  searchParams,
}: PageProps<"/pos/venta/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const autoImprimir = query.print === "1";
```

Y cambiar el uso de `<PrintButton />` (dentro del `<div className="mt-6 flex justify-center gap-3">`) a:

```tsx
<PrintButton autoImprimir={autoImprimir} />
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/pos/(admin)/venta/[id]/print-button.tsx" "src/app/pos/(admin)/venta/[id]/page.tsx"
git commit -m "feat: recibo POS soporta auto-impresion via query param print=1"
```

---

### Task 5: Barra superior del POS (título, imprimir, notificaciones, usuario)

**Files:**
- Create: `src/components/pos/imprimir-ultimo-recibo-button.tsx`
- Create: `src/components/pos/notificaciones-stock-bajo.tsx`
- Create: `src/components/pos/pos-top-bar.tsx`

**Interfaces:**
- Consumes: `reimprimirUltimoRecibo()` (Task 3); `LowStockItem` (`@/lib/admin/low-stock`, ya existente: `{ productId: string; productName: string; variantLabel: string | null; stock: number }`).
- Produces: `<PosTopBar nombreVendedor={string} rolVendedor={string} stockBajo={LowStockItem[]} />` — usado por la Task 7 en `src/app/pos/(admin)/layout.tsx`.

Este componente y sus piezas son UI de interacción (botón + dropdown), sin lógica de negocio propia más allá de lo ya cubierto por el test de la Task 3 y por el test existente de `buildLowStockItems` (`src/lib/admin/__tests__/low-stock.test.ts`) — no llevan test dedicado, siguiendo el mismo criterio que ya usa el componente equivalente `ShareButton` (`src/components/store/share-button.tsx`, sin test propio, mismo patrón de dropdown con click-fuera).

- [ ] **Step 1: Botón "Imprimir" (reimprime el último recibo)**

Crear `src/components/pos/imprimir-ultimo-recibo-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { reimprimirUltimoRecibo } from "./reimprimir-action";

export function ImprimirUltimoReciboButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await reimprimirUltimoRecibo();
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-brand-rosa-claro px-3 py-1.5 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30 disabled:opacity-50"
      >
        <Printer className="h-4 w-4" />
        {isPending ? "Abriendo..." : "Imprimir"}
      </button>
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md bg-white p-2 text-xs text-red-600 shadow-brand-sm">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Campana de notificaciones de stock bajo**

Crear `src/components/pos/notificaciones-stock-bajo.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { LowStockItem } from "@/lib/admin/low-stock";

export function NotificacionesStockBajo({ items }: { items: LowStockItem[] }) {
  const [open, setOpen] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, [open]);

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones de stock bajo"
        className="relative rounded-full p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
      >
        <Bell className="h-5 w-5" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-rosa px-1 text-[10px] font-medium text-white">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-brand-rosa-claro bg-white p-2 text-sm shadow-brand-md">
          <p className="px-2 py-1 font-heading text-brand-ciruela">Stock bajo</p>
          {items.length === 0 ? (
            <p className="px-2 py-1 text-brand-ciruela/60">Sin alertas de stock.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={`${item.productId}-${item.variantLabel ?? "base"}`}
                  className="flex justify-between gap-2 rounded px-2 py-1.5 hover:bg-brand-rosa-claro/20"
                >
                  <span className="text-brand-ciruela">
                    {item.productName}
                    {item.variantLabel ? ` (${item.variantLabel})` : ""}
                  </span>
                  <span className="shrink-0 font-medium text-brand-rosa">{item.stock}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Ensamblar la barra superior**

Crear `src/components/pos/pos-top-bar.tsx`:

```tsx
import type { LowStockItem } from "@/lib/admin/low-stock";
import { ImprimirUltimoReciboButton } from "./imprimir-ultimo-recibo-button";
import { NotificacionesStockBajo } from "./notificaciones-stock-bajo";

const ETIQUETA_ROL: Record<string, string> = {
  staff: "Vendedor/a",
  admin: "Administrador/a",
  superadmin: "Superadmin",
};

export function PosTopBar({
  nombreVendedor,
  rolVendedor,
  stockBajo,
}: {
  nombreVendedor: string;
  rolVendedor: string;
  stockBajo: LowStockItem[];
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-rosa-claro bg-white px-6 py-4 print:hidden">
      <div>
        <h1 className="font-heading text-xl text-brand-ciruela">Punto de Venta</h1>
        <p className="text-sm text-brand-ciruela/70">¡Bienvenida/o, {nombreVendedor}!</p>
      </div>
      <div className="flex items-center gap-3">
        <ImprimirUltimoReciboButton />
        <NotificacionesStockBajo items={stockBajo} />
        <div className="flex items-center gap-2 border-l border-brand-rosa-claro pl-3">
          <span className="text-sm font-medium text-brand-ciruela">{nombreVendedor}</span>
          <span className="text-xs text-brand-ciruela/60">
            {ETIQUETA_ROL[rolVendedor] ?? rolVendedor}
          </span>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/pos/imprimir-ultimo-recibo-button.tsx src/components/pos/notificaciones-stock-bajo.tsx src/components/pos/pos-top-bar.tsx
git commit -m "feat: barra superior del POS con imprimir, notificaciones de stock y usuario"
```

---

### Task 6: Barra de estado inferior del POS

**Files:**
- Create: `src/components/pos/pos-status-bar.tsx`

**Interfaces:**
- Produces: `<PosStatusBar nombreVendedor={string} />` — usado por la Task 7.

- [ ] **Step 1: Crear el componente**

Crear `src/components/pos/pos-status-bar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function PosStatusBar({ nombreVendedor }: { nombreVendedor: string }) {
  const [ahora, setAhora] = useState<Date | null>(null);
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    setAhora(new Date());
    const interval = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    const handleOnline = () => setEnLinea(true);
    const handleOffline = () => setEnLinea(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-brand-rosa-claro bg-white px-6 py-2 text-xs text-brand-ciruela/80 print:hidden">
      <span>
        Caja actual: <strong className="text-brand-ciruela">Caja Principal</strong>
      </span>
      <span>
        Vendedor: <strong className="text-brand-ciruela">{nombreVendedor}</strong>
      </span>
      <span>
        {ahora ? ahora.toLocaleDateString("es-CO") : "--"}{" "}
        {ahora ? ahora.toLocaleTimeString("es-CO") : "--"}
      </span>
      <span className="inline-flex items-center gap-1">
        {enLinea ? (
          <Wifi className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-red-600" />
        )}
        {enLinea ? "En línea" : "Sin conexión"}
      </span>
    </footer>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/pos-status-bar.tsx
git commit -m "feat: barra de estado inferior del POS (vendedor, hora, conexion)"
```

---

### Task 7: Integrar top bar y status bar en el layout del POS, limpiar la terminal

**Files:**
- Modify: `src/app/pos/(admin)/layout.tsx`
- Modify: `src/app/pos/(admin)/page.tsx`

**Interfaces:**
- Consumes: `PosTopBar` (Task 5), `PosStatusBar` (Task 6), `getCurrentProfile()`, `buildLowStockItems`/`obtenerUmbralStockBajo` (`@/lib/admin/low-stock`, mismo patrón exacto de consulta ya usado en `src/app/admin/page.tsx`).

- [ ] **Step 1: Convertir el layout en `async` y montar las dos barras**

Reemplazar `src/app/pos/(admin)/layout.tsx` completo por:

```tsx
import { Store, Receipt, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { buildLowStockItems, obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";
import { PosTopBar } from "@/components/pos/pos-top-bar";
import { PosStatusBar } from "@/components/pos/pos-status-bar";

const SECTIONS: SidebarSection[] = [
  {
    label: "POS",
    items: [
      { href: "/pos", label: "Terminal", icon: <Store className="h-4 w-4 shrink-0" /> },
      { href: "/pos/ventas", label: "Ventas POS", icon: <Receipt className="h-4 w-4 shrink-0" /> },
      { href: "/pos/creditos", label: "Créditos", icon: <CreditCard className="h-4 w-4 shrink-0" /> },
    ],
  },
];

export default async function PosAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [currentUser, umbralStockBajo, { data: productos }, { data: variantes }] =
    await Promise.all([
      getCurrentProfile(),
      obtenerUmbralStockBajo(),
      supabase.from("products").select("id, name, stock").eq("is_active", true),
      supabase.from("product_variants").select("id, product_id, talla, color, stock"),
    ]);

  const idsActivos = new Set((productos ?? []).map((p) => p.id));
  const variantesActivas = (variantes ?? []).filter((v) => idsActivos.has(v.product_id));
  const stockBajo = buildLowStockItems(productos ?? [], variantesActivas, umbralStockBajo);

  const nombreVendedor =
    currentUser?.profile.full_name || currentUser?.profile.username || "Vendedor";
  const rolVendedor = currentUser?.profile.role ?? "staff";

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-brand-crema">
      <BackendSidebar sections={SECTIONS} homeHref="/pos" />
      <div className="flex flex-1 flex-col">
        <PosTopBar
          nombreVendedor={nombreVendedor}
          rolVendedor={rolVendedor}
          stockBajo={stockBajo}
        />
        <main className="flex-1 px-6 py-8">{children}</main>
        <PosStatusBar nombreVendedor={nombreVendedor} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Simplificar la página de la terminal (el título y la navegación ya los da el top bar + sidebar)**

Reemplazar `src/app/pos/(admin)/page.tsx` completo por:

```tsx
import { PosTerminal } from "./pos-terminal";

export default function PosPage() {
  return <PosTerminal />;
}
```

- [ ] **Step 3: Verificar que compila y que la suite completa sigue en verde**

Run: `pnpm tsc --noEmit`
Expected: sin errores.

Run: `pnpm vitest run`
Expected: todos los tests pasan, incluidos los de las Tasks 1 y 3.

- [ ] **Step 4: Verificar el build de producción**

Antes de correr `pnpm build`, detener cualquier `pnpm dev` que esté corriendo en este worktree (un build concurrente con el dev server corrompe `.next`, patrón ya visto antes en esta sesión):

```bash
tasklist /FI "IMAGENAME eq node.exe"
```

Si hay procesos `node.exe` corriendo `pnpm dev` en este worktree, deténlos, luego:

Run: `pnpm build`
Expected: build exitoso, sin errores de tipos ni de rutas (confirma que el route group `(admin)` sigue resolviendo `/pos`, `/pos/ventas`, `/pos/creditos`, `/pos/venta/[id]` correctamente).

- [ ] **Step 5: Commit**

```bash
git add "src/app/pos/(admin)/layout.tsx" "src/app/pos/(admin)/page.tsx"
git commit -m "feat: integrar barra superior e inferior en el layout del POS"
```

---

## Nota de verificación manual (no automatizable en esta sesión)

`/pos/**` requiere sesión autenticada de `staff`/`admin`/`superadmin`, y el manejo en texto plano de la contraseña del superadmin está prohibido en esta sesión (restricción vigente desde antes en esta conversación). La verificación visual final — que el sidebar, la barra superior y la barra inferior se vean y funcionen como el mockup en un navegador real — la hace el usuario en el preview desplegado, igual que se hizo con el historial de ventas POS (PR #24). Se deja explícito en la descripción del PR.
