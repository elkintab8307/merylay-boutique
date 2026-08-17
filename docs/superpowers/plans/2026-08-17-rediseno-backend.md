# Rediseño visual del backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la barra superior + tablas de texto plano + inputs de archivo crudos del backend (admin, POS administrativo, superadmin) por un panel lateral agrupado, tablas/tarjetas con jerarquía visual, badges de estado, un botón de subida de imágenes con marca propia, y un panel de inicio con métricas y gráfico reales.

**Architecture:** Componentes de presentación compartidos (`Table`, `Badge`, `BackendSidebar`, `ImageUploadButton`) reemplazan el marcado crudo existente, página por página, sin tocar ninguna query, RPC, Server Action ni validación. `/pos` (terminal de cobro) queda fuera del cambio — pantalla completa, sin sidebar.

**Tech Stack:** Next.js App Router, Tailwind CSS, shadcn/ui (`Button`, `Sheet`, ya existentes), `recharts` (vía `src/components/ui/chart.tsx`, ya existente), Supabase.

**Spec:** `docs/superpowers/specs/2026-08-17-rediseno-backend-design.md`

## Global Constraints

- Ninguna query, RPC, Server Action, validación zod ni regla de negocio cambia de comportamiento — es exclusivamente una capa de presentación.
- Paleta de marca fija: `brand.rosa` `#E96A9E`, `brand.oro` `#D9A441`, `brand.crema` `#FFF8F4`, `brand.ciruela` `#6E2A44`. Los colores de `<Badge>` (verde/ámbar/rojo) son la única paleta nueva, reservada solo para indicadores de estado.
- Todo el texto de UI en español.
- `/pos` (la terminal de cobro, `src/app/pos/page.tsx`) se queda pantalla completa, sin `BackendSidebar` — no perder ancho en el flujo de cobro.
- `/pos/venta/[id]` es un recibo imprimible (`PrintButton`) — el sidebar que lo envuelva debe llevar `print:hidden` para no aparecer al imprimir.
- `pnpm build && pnpm lint && pnpm test` en verde antes de cerrar cada tarea.

---

### Task 1: Componentes `<Table>` y `<Badge>`

**Files:**
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/badge.tsx`
- Test: `src/components/ui/__tests__/badge.test.tsx`

**Interfaces:**
- Produces: `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableHeaderCell` (todos `{ children: React.ReactNode; className?: string }`, `className` opcional solo en `TableCell`); `Badge({ variant: "success" | "warning" | "danger" | "neutral"; children: React.ReactNode })`. Las Tasks 8-14 importan estos componentes.

- [ ] **Step 1: Escribir el test de `Badge`**

Crea `src/components/ui/__tests__/badge.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../badge";

describe("Badge", () => {
  it("renderiza el texto y aplica la clase del variant", () => {
    render(<Badge variant="success">Activo</Badge>);
    const badge = screen.getByText("Activo");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("emerald");
  });

  it("aplica clases distintas para cada variant", () => {
    const { rerender } = render(<Badge variant="danger">Agotado</Badge>);
    expect(screen.getByText("Agotado").className).toContain("red");
    rerender(<Badge variant="warning">Stock bajo</Badge>);
    expect(screen.getByText("Stock bajo").className).toContain("amber");
    rerender(<Badge variant="neutral">Inactivo</Badge>);
    expect(screen.getByText("Inactivo").className).toContain("brand-rosa-claro");
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pnpm exec vitest run src/components/ui/__tests__/badge.test.tsx`
Expected: FAIL — `Cannot find module '../badge'`.

- [ ] **Step 3: Implementar `Badge`**

Crea `src/components/ui/badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

const badgeVariants = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-brand-rosa-claro/40 text-brand-ciruela",
} as const;

export function Badge({
  variant,
  children,
}: {
  variant: keyof typeof badgeVariants;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeVariants[variant],
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pnpm exec vitest run src/components/ui/__tests__/badge.test.tsx`
Expected: 2 tests, PASS.

- [ ] **Step 5: Implementar `Table` (sin test dedicado — wrapper de marcado puro, se verifica visualmente en cada página que lo use)**

Crea `src/components/ui/table.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-brand-rosa-claro bg-white">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-brand-rosa-claro bg-brand-crema/60 text-left text-xs tracking-wide text-brand-ciruela/70 uppercase">
      {children}
    </thead>
  );
}

export function TableRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-brand-rosa-claro/40 last:border-0 hover:bg-brand-rosa-claro/10">
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}

export function TableHeaderCell({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
```

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/table.tsx src/components/ui/badge.tsx src/components/ui/__tests__/badge.test.tsx
git commit -m "feat: agrega componentes Table y Badge para los listados del backend"
```

---

### Task 2: Helper `inicioDelMesBogota`

**Files:**
- Create: `src/lib/date/inicio-del-mes.ts`
- Test: `src/lib/date/__tests__/inicio-del-mes.test.ts`

**Interfaces:**
- Produces: `inicioDelMesBogota(ahora?: Date): string` (mismo formato de retorno que `inicioDelDiaBogota`: `"YYYY-MM-01T00:00:00-05:00"`). Task 9 (dashboard) lo consume.

- [ ] **Step 1: Escribir el test**

Crea `src/lib/date/__tests__/inicio-del-mes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inicioDelMesBogota } from "../inicio-del-mes";

describe("inicioDelMesBogota", () => {
  it("devuelve el dia 1 del mes en curso, medianoche hora de Bogota", () => {
    const fecha = new Date("2026-08-17T15:30:00Z");
    expect(inicioDelMesBogota(fecha)).toBe("2026-08-01T00:00:00-05:00");
  });

  it("funciona en el primer dia del mes", () => {
    const fecha = new Date("2026-03-01T02:00:00Z");
    expect(inicioDelMesBogota(fecha)).toBe("2026-03-01T00:00:00-05:00");
  });

  it("funciona en el ultimo dia del mes", () => {
    const fecha = new Date("2026-02-28T23:59:00Z");
    expect(inicioDelMesBogota(fecha)).toBe("2026-02-01T00:00:00-05:00");
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pnpm exec vitest run src/lib/date/__tests__/inicio-del-mes.test.ts`
Expected: FAIL — `Cannot find module '../inicio-del-mes'`.

- [ ] **Step 3: Implementar**

Crea `src/lib/date/inicio-del-mes.ts`:

```ts
export function inicioDelMesBogota(ahora: Date = new Date()): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).format(ahora);

  return `${fecha}-01T00:00:00-05:00`;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pnpm exec vitest run src/lib/date/__tests__/inicio-del-mes.test.ts`
Expected: 3 tests, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date/inicio-del-mes.ts src/lib/date/__tests__/inicio-del-mes.test.ts
git commit -m "feat: agrega inicioDelMesBogota para el panel de inicio"
```

---

### Task 3: `BackendSidebar` (componente compartido)

**Files:**
- Create: `src/components/admin/backend-sidebar.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetClose` de `@/components/ui/sheet` (mismo patrón que `MobileNavSheet`).
- Produces: `BackendSidebar({ sections: SidebarSection[]; homeHref: string })` donde
  `type SidebarSection = { label: string; items: { href: string; label: string }[] }`.
  Tasks 4, 5 y 6 lo consumen.

- [ ] **Step 1: Implementar el componente**

Crea `src/components/admin/backend-sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
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
  items: { href: string; label: string }[];
};

function NavLinks({
  sections,
  currentPath,
  onNavigate,
}: {
  sections: SidebarSection[];
  currentPath: string;
  onNavigate?: (href: string) => React.ReactNode;
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
            const linkClassName = cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-brand-rosa/10 font-medium text-brand-rosa"
                : "text-brand-ciruela hover:bg-brand-rosa-claro/20",
            );
            if (onNavigate) {
              return (
                <div key={item.href}>
                  {onNavigate(item.href) ?? (
                    <Link href={item.href} className={linkClassName}>
                      {item.label}
                    </Link>
                  )}
                </div>
              );
            }
            return (
              <Link key={item.href} href={item.href} className={linkClassName}>
                {item.label}
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
                onNavigate={(href) => (
                  <SheetClose
                    render={<Link href={href} />}
                    className="block rounded-md px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/20"
                  >
                    {sections.flatMap((s) => s.items).find((i) => i.href === href)?.label}
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

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/backend-sidebar.tsx
git commit -m "feat: agrega BackendSidebar (panel lateral con drawer movil)"
```

---

### Task 4: Layout de `/admin` con panel lateral agrupado

**Files:**
- Modify: `src/app/admin/admin-nav.tsx` (reescritura completa)
- Modify: `src/app/admin/layout.tsx`
- Delete: ninguno (el archivo se mantiene, cambia de contenido)

**Interfaces:**
- Consumes: `BackendSidebar`, `SidebarSection` de Task 3.
- Produces: ningún otro archivo depende de estos dos.

- [ ] **Step 1: Reescribir `admin-nav.tsx` con secciones agrupadas**

Reemplaza el contenido completo de `src/app/admin/admin-nav.tsx`:

```tsx
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

export async function AdminNav() {
  const currentUser = await getCurrentProfile();
  const esSuperadmin = currentUser?.profile.role === "superadmin";

  const sections: SidebarSection[] = [
    { label: "Inicio", items: [{ href: "/admin", label: "Panel" }] },
    {
      label: "Catálogo",
      items: [
        { href: "/admin/productos", label: "Productos" },
        { href: "/admin/categorias", label: "Categorías" },
      ],
    },
    {
      label: "Ventas",
      items: [
        { href: "/admin/pedidos", label: "Pedidos" },
        { href: "/pos", label: "POS" },
        { href: "/pos/ventas", label: "Ventas POS" },
      ],
    },
    {
      label: "Negocio",
      items: [
        { href: "/admin/resenas", label: "Reseñas" },
        { href: "/admin/gastos", label: "Gastos" },
        { href: "/admin/compras", label: "Compras" },
        { href: "/admin/informes", label: "Informes" },
      ],
    },
  ];

  if (esSuperadmin) {
    sections.push({
      label: "Superadmin",
      items: [{ href: "/superadmin/usuarios", label: "Superadmin" }],
    });
  }

  return <BackendSidebar sections={sections} homeHref="/admin" />;
}
```

- [ ] **Step 2: Reescribir `layout.tsx` para usar el sidebar en vez de la barra superior**

Reemplaza el contenido completo de `src/app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AdminNav } from "./admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-brand-crema">
      <AdminNav />
      <div className="flex flex-1 flex-col">
        <div className="flex justify-end border-b border-brand-rosa-claro bg-white px-6 py-3 print:hidden">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-rosa-claro px-3 py-1.5 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <ExternalLink className="h-4 w-4" />
            Ver tienda
          </Link>
        </div>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
```

(El botón "Ver tienda" se conserva, solo se mueve de la barra superior a una franja delgada sobre el contenido — ya no compite por espacio con los enlaces de navegación, que ahora viven en el sidebar.)

- [ ] **Step 3: Verificar tipos y build**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/admin-nav.tsx src/app/admin/layout.tsx
git commit -m "feat: panel lateral agrupado por secciones en /admin"
```

- [ ] **Step 5: Verificación manual en navegador**

Con el servidor corriendo, entra a `/admin` como `adminsu`/`Admin@123`: confirma que el sidebar aparece con las 5 secciones (Inicio, Catálogo, Ventas, Negocio, Superadmin), que el enlace activo se resalta, que "Ver tienda" sigue funcionando, y que en una ventana angosta (móvil) el sidebar se reemplaza por el botón de menú con el mismo contenido en un drawer.

---

### Task 5: Layout de `/superadmin` con el mismo sidebar

**Files:**
- Modify: `src/app/superadmin/superadmin-nav.tsx` (reescritura completa)
- Modify: `src/app/superadmin/layout.tsx`

**Interfaces:**
- Consumes: `BackendSidebar`, `SidebarSection` de Task 3 (idéntico patrón a Task 4).

- [ ] **Step 1: Reescribir `superadmin-nav.tsx`**

Reemplaza el contenido completo de `src/app/superadmin/superadmin-nav.tsx`:

```tsx
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

export function SuperadminNav() {
  const sections: SidebarSection[] = [
    {
      label: "Superadmin",
      items: [
        { href: "/admin", label: "Panel" },
        { href: "/superadmin/usuarios", label: "Usuarios" },
        { href: "/superadmin/ajustes", label: "Ajustes" },
      ],
    },
  ];

  return <BackendSidebar sections={sections} homeHref="/admin" />;
}
```

- [ ] **Step 2: Reescribir `layout.tsx`**

Reemplaza el contenido completo de `src/app/superadmin/layout.tsx`:

```tsx
import { SuperadminNav } from "./superadmin-nav";

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-brand-crema">
      <SuperadminNav />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/superadmin/superadmin-nav.tsx src/app/superadmin/layout.tsx
git commit -m "feat: panel lateral en /superadmin"
```

- [ ] **Step 5: Verificación manual en navegador**

Entra a `/superadmin/usuarios` como `adminsu` — confirma el sidebar con Panel/Usuarios/Ajustes.

---

### Task 6: Route group `/pos/(admin)` con sidebar (terminal de cobro sin tocar)

**Files:**
- Move: `src/app/pos/ventas/page.tsx` → `src/app/pos/(admin)/ventas/page.tsx`
- Move: `src/app/pos/venta/[id]/page.tsx` → `src/app/pos/(admin)/venta/[id]/page.tsx`
- Move: `src/app/pos/venta/[id]/print-button.tsx` → `src/app/pos/(admin)/venta/[id]/print-button.tsx`
- Move: `src/app/pos/venta/[id]/editar/*` (todo el contenido de esa carpeta) → `src/app/pos/(admin)/venta/[id]/editar/*`
- Create: `src/app/pos/(admin)/layout.tsx`
- No modifica: `src/app/pos/page.tsx`, `src/app/pos/pos-terminal.tsx`, `src/app/pos/product-search-result.tsx`, `src/app/pos/venta-items-editor.tsx` (quedan fuera del route group)

**Interfaces:**
- Consumes: `BackendSidebar`, `SidebarSection` de Task 3.
- Produces: ningún otro archivo depende de este layout. Las URLs no cambian — `(admin)` es un route group de Next.js, invisible en la URL: `/pos/(admin)/ventas` se sigue sirviendo en `/pos/ventas`.

- [ ] **Step 1: Mover los archivos al route group**

```bash
mkdir -p "src/app/pos/(admin)/ventas" "src/app/pos/(admin)/venta/[id]/editar"
git mv src/app/pos/ventas/page.tsx "src/app/pos/(admin)/ventas/page.tsx"
git mv src/app/pos/venta/[id]/page.tsx "src/app/pos/(admin)/venta/[id]/page.tsx"
git mv src/app/pos/venta/[id]/print-button.tsx "src/app/pos/(admin)/venta/[id]/print-button.tsx"
git mv src/app/pos/venta/[id]/editar/page.tsx "src/app/pos/(admin)/venta/[id]/editar/page.tsx"
```

(Si `venta/[id]/editar/` tiene más de un archivo — revisa con `ls src/app/pos/venta/\[id\]/editar/` antes de mover — mueve cada uno al mismo destino relativo.)

- [ ] **Step 2: Borrar las carpetas viejas ya vacías**

```bash
rmdir "src/app/pos/ventas" "src/app/pos/venta/[id]/editar" "src/app/pos/venta/[id]" "src/app/pos/venta" 2>/dev/null || true
```

- [ ] **Step 3: Crear el layout del route group**

Crea `src/app/pos/(admin)/layout.tsx`:

```tsx
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";

const SECTIONS: SidebarSection[] = [
  {
    label: "POS",
    items: [
      { href: "/pos", label: "Terminal" },
      { href: "/pos/ventas", label: "Ventas POS" },
    ],
  },
];

export default function PosAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-brand-crema">
      <BackendSidebar sections={SECTIONS} homeHref="/admin" />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Evitar el `<main>` anidado en las 3 páginas movidas**

`PosAdminLayout` (Step 3) ya envuelve `children` en su propio `<main>`.
Las 3 páginas movidas también empiezan con `<main className="...">` en
su elemento raíz — hoy son las únicas de esa ruta, así que era correcto,
pero anidar `<main>` dentro de `<main>` es inválido semánticamente. En
cada uno de los 3 archivos movidos, cambia únicamente la etiqueta raíz
de `<main ...>`/`</main>` a `<div ...>`/`</div>`, sin tocar el
`className` ni nada del contenido interior:

- `src/app/pos/(admin)/ventas/page.tsx`: `<main className="mx-auto max-w-4xl px-6 py-12">` → `<div className="mx-auto max-w-4xl px-6 py-12">` (y su cierre `</main>` → `</div>`).
- `src/app/pos/(admin)/venta/[id]/page.tsx`: `<main className="mx-auto max-w-md px-6 py-12">` → `<div className="mx-auto max-w-md px-6 py-12">` (y cierre correspondiente).
- `src/app/pos/(admin)/venta/[id]/editar/page.tsx`: `<main className="mx-auto max-w-5xl px-6 py-12">` → `<div className="mx-auto max-w-5xl px-6 py-12">` (y cierre correspondiente).

- [ ] **Step 5: Verificar que las rutas internas (imports relativos, enlaces) siguen resolviendo**

Los `import` dentro de los archivos movidos usan alias `@/...` (no relativos), así que no deberían romperse. Verifica igual:

Run: `pnpm exec tsc --noEmit`
Expected: sin errores. Si aparece un import roto, es porque algún archivo del grupo usaba un import relativo (`./algo`) apuntando fuera de su carpeta — ajústalo a `@/...` o a la nueva ruta relativa correcta.

- [ ] **Step 6: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. El build confirma que Next.js resuelve las rutas movidas correctamente (`/pos/ventas`, `/pos/venta/[id]`, `/pos/venta/[id]/editar` deben seguir apareciendo en la salida del build).

- [ ] **Step 7: Commit**

```bash
git add -A src/app/pos
git commit -m "feat: agrupa las paginas administrativas del POS bajo un panel lateral"
```

- [ ] **Step 8: Verificación manual en navegador**

Entra a `/pos` — debe seguir pantalla completa, sin sidebar. Entra a `/pos/ventas` — debe tener el sidebar nuevo. Abre un recibo en `/pos/venta/[id]` y usa el botón de imprimir (o la vista previa de impresión del navegador, Ctrl+P) — el sidebar no debe aparecer en la vista de impresión.

---

### Task 7: `ImageUploadButton` — botón de subir imágenes con vista previa

**Files:**
- Create: `src/components/admin/image-upload-button.tsx`
- Modify: `src/app/admin/productos/producto-form.tsx`

**Interfaces:**
- Produces: `ImageUploadButton({ id: string; files: File[]; onChange: (files: File[]) => void; label?: string })`.
- Consumes en `producto-form.tsx`: reemplaza los dos `<input type="file">` existentes (el general en la sección "Imágenes generales", y el de cada variante en el `.map` de `fields`) sin cambiar `handleImageChange`/`handleVariantImageChange` — esos handlers ya reciben `File[]`, que es justo lo que `ImageUploadButton.onChange` entrega.

- [ ] **Step 1: Implementar `ImageUploadButton`**

Crea `src/components/admin/image-upload-button.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImageUploadButton({
  id,
  files,
  onChange,
  label = "Agregar imágenes",
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<Map<File, string>>(new Map());

  useEffect(() => {
    const vigentes = new Set(files);
    for (const [file, url] of objectUrls.current) {
      if (!vigentes.has(file)) {
        URL.revokeObjectURL(url);
        objectUrls.current.delete(file);
      }
    }
  }, [files]);

  useEffect(() => {
    return () => {
      for (const url of objectUrls.current.values()) {
        URL.revokeObjectURL(url);
      }
      objectUrls.current.clear();
    };
  }, []);

  const previewUrl = (file: File) => {
    let url = objectUrls.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      objectUrls.current.set(file, url);
    }
    return url;
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          onChange(Array.from(e.target.files ?? []));
          // Limpia el valor nativo del input despues de leerlo: si no se
          // hace, volver a elegir exactamente los mismos archivos (p. ej.
          // tras un rechazo por tamaño) no dispara onChange la segunda vez
          // en algunos navegadores.
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="w-fit border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
      >
        <ImagePlus className="h-4 w-4" />
        {label}
      </Button>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative h-16 w-16">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de un File local, no una URL remota optimizable */}
              <img
                src={previewUrl(file)}
                alt=""
                className="h-full w-full rounded-md border border-brand-rosa-claro object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white"
                aria-label={`Quitar ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Cambiar `handleImageChange` para recibir `File[]` directamente**

`validarTamanoTotal` ya calcula el peso total y ya llama a
`setImageSizeError` con el mensaje completo cuando se excede — no hace
falta que `handleImageChange` arme su propio mensaje. En
`src/app/admin/productos/producto-form.tsx`, reemplaza `handleImageChange`
(la función completa, que hoy recibe un `React.ChangeEvent<HTMLInputElement>`)
por una versión que recibe `File[]` directamente:

```tsx
  const handleImageChange = (files: File[]) => {
    if (!validarTamanoTotal(files, variantImageFiles)) {
      setImageFiles([]);
      return;
    }
    setImageSizeError(null);
    setImageFiles(files);
  };
```

- [ ] **Step 3: Reemplazar el input general por `<ImageUploadButton>`**

Agrega el import:

```tsx
import { ImageUploadButton } from "@/components/admin/image-upload-button";
```

Reemplaza la línea del input general (`<input type="file" accept="image/*" multiple onChange={handleImageChange} />`, dentro de la sección "Imágenes generales") por:

```tsx
        <ImageUploadButton
          id="general-images"
          files={imageFiles}
          onChange={handleImageChange}
        />
```

- [ ] **Step 4: Reemplazar el input por variante, con el mismo ajuste de firma**

Reemplaza `handleVariantImageChange` (la función completa) por:

```tsx
  const handleVariantImageChange = (index: number, files: File[]) => {
    const siguiente = variantImageFiles.map((f, i) => (i === index ? files : f));
    if (!validarTamanoTotal(imageFiles, siguiente)) {
      setVariantImageFiles(variantImageFiles.map((f, i) => (i === index ? [] : f)));
      return;
    }
    setVariantImageFiles(siguiente);
  };
```

Reemplaza el input de archivo dentro del `.map` de `fields` (el que tiene `id={\`variant-images-${index}\`}`) por:

```tsx
                <ImageUploadButton
                  id={`variant-images-${index}`}
                  files={variantImageFiles[index] ?? []}
                  onChange={(files) => handleVariantImageChange(index, files)}
                />
```

- [ ] **Step 5: Actualizar el test existente que mockea el `onChange` del input crudo**

`src/app/admin/productos/__tests__/producto-form.test.tsx` tiene un test que hace
`fireEvent.change(inputsDeVariante[1], { target: { files: [archivoVarianteL] } })`
sobre un `<input type="file">` real. Con `ImageUploadButton`, el input sigue existiendo
en el DOM (está oculto con `sr-only`, no `display: none` — `sr-only` no lo saca del
árbol de accesibilidad ni de las consultas de Testing Library), así que
`screen.getAllByLabelText(/imágenes de esta variante/i)` **ya no encuentra el input**
porque `ImageUploadButton` no asocia un `<label>` con `htmlFor` al input — usa un
`<Button>` visible con el texto "Agregar imágenes" en vez de eso. Actualiza el test:
reemplaza `screen.getAllByLabelText(/imágenes de esta variante/i)` por
`document.querySelectorAll('input[type="file"]')` (NodeList de los inputs reales,
que siguen en el DOM aunque estén ocultos visualmente) y usa `fireEvent.change` sobre
el elemento del índice correspondiente, igual que antes.

- [ ] **Step 6: Correr los tests, tsc y lint**

Run: `pnpm exec vitest run src/app/admin/productos/__tests__/producto-form.test.tsx`
Expected: 2/2 PASS (con el ajuste del Step 5).

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/image-upload-button.tsx src/app/admin/productos/producto-form.tsx src/app/admin/productos/__tests__/producto-form.test.tsx
git commit -m "feat: reemplaza el input de archivo crudo por un boton de subida con vista previa"
```

- [ ] **Step 8: Verificación manual en navegador**

Crea o edita un producto, agrega una variante, sube imágenes generales y de la variante — confirma que el botón "Agregar imágenes" se ve con estilo de marca, que aparecen las miniaturas con "×" para quitar, y que al guardar las imágenes llegan correctamente (mismo flujo ya probado en la fase anterior).

---

### Task 8: Productos — de tabla a cuadrícula de tarjetas

**Files:**
- Modify: `src/app/admin/productos/page.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `Badge` de Task 1, `obtenerUmbralStockBajo` de `@/lib/admin/low-stock` (ya existente).

- [ ] **Step 1: Reescribir la página**

Reemplaza el contenido completo de `src/app/admin/productos/page.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleProductoButton } from "./toggle-producto-button";

export default async function ProductosPage() {
  const supabase = await createClient();
  const [{ data: productos }, { data: categorias }, umbralStockBajo] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, stock, is_active, category_id")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name"),
    obtenerUmbralStockBajo(),
  ]);

  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c.name]));

  const idsProductos = (productos ?? []).map((p) => p.id);
  const { data: imagenesPrincipales } =
    idsProductos.length > 0
      ? await supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", idsProductos)
          .eq("is_primary", true)
      : { data: [] as { product_id: string; url: string }[] };
  const imagenPorProducto = new Map(
    (imagenesPrincipales ?? []).map((img) => [img.product_id, img.url]),
  );

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(productos ?? []).map((producto) => {
          const imagenUrl = imagenPorProducto.get(producto.id) ?? null;
          const stockBadge =
            producto.stock === 0
              ? { variant: "danger" as const, label: "Agotado" }
              : producto.stock <= umbralStockBajo
                ? { variant: "warning" as const, label: `${producto.stock} unidades` }
                : { variant: "neutral" as const, label: `${producto.stock} unidades` };

          return (
            <div
              key={producto.id}
              className="flex flex-col overflow-hidden rounded-lg border border-brand-rosa-claro bg-white shadow-brand-sm"
            >
              <div className="relative aspect-square w-full bg-brand-rosa-claro">
                {imagenUrl ? (
                  <Image src={imagenUrl} alt={producto.name} fill className="object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-brand-ciruela/50">
                    Sin imagen
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="font-heading text-brand-ciruela">{producto.name}</p>
                <p className="text-xs text-brand-ciruela/60">
                  {producto.sku}
                  {producto.category_id
                    ? ` · ${categoriaPorId.get(producto.category_id) ?? "—"}`
                    : ""}
                </p>
                <p className="font-heading text-lg text-brand-rosa">
                  {formatPrice(producto.price)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>
                  <Badge variant={producto.is_active ? "success" : "neutral"}>
                    {producto.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <div className="mt-auto flex items-center gap-3 pt-2 text-sm">
                  <Link
                    href={`/admin/productos/${producto.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleProductoButton id={producto.id} isActive={producto.is_active} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/productos/page.tsx
git commit -m "feat: el listado de productos pasa a cuadricula de tarjetas"
```

- [ ] **Step 4: Verificación manual en navegador**

Entra a `/admin/productos` — confirma que se ven tarjetas con imagen, precio, badges de stock/estado, y que "Editar"/activar-desactivar siguen funcionando igual que antes.

---

### Task 9: Panel de inicio avanzado

**Files:**
- Modify: `src/app/admin/page.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `inicioDelMesBogota` de Task 2; `GraficaVentas` (ya existe en `src/app/admin/informes/ventas/grafica-ventas.tsx`); `Table`/`TableHeader`/`TableRow`/`TableCell`/`TableHeaderCell` de Task 1; RPCs `informe_ventas_serie` e `informe_productos_vendidos` (ya existen).

- [ ] **Step 1: Reescribir la página**

Reemplaza el contenido completo de `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { inicioDelDiaBogota } from "@/lib/date/inicio-del-dia";
import { inicioDelMesBogota } from "@/lib/date/inicio-del-mes";
import { buildLowStockItems, obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { GraficaVentas } from "./informes/ventas/grafica-ventas";

function formatearVariacion(hoy: number, ayer: number): string | null {
  if (ayer === 0) return null;
  const variacion = ((hoy - ayer) / ayer) * 100;
  const signo = variacion >= 0 ? "+" : "";
  return `${signo}${variacion.toFixed(0)}% vs ayer`;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const inicioHoy = inicioDelDiaBogota();
  const inicioAyer = inicioDelDiaBogota(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const inicioMes = inicioDelMesBogota();
  const hace6Dias = inicioDelDiaBogota(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

  const [
    { data: ordenesHoy, error: ordenesError },
    { data: ventasPosHoy, error: posError },
    { data: ordenesAyer, error: ordenesAyerError },
    { data: ventasPosAyer, error: posAyerError },
    { data: ordenesMes, error: ordenesMesError },
    { data: ventasPosMes, error: posMesError },
    { count: pedidosPendientes, error: pendientesError },
    { data: productos, error: productosError },
    { data: variantes, error: variantesError },
    umbralStockBajo,
    { data: serieVentas, error: serieError },
    { data: productosVendidos, error: productosVendidosError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioHoy)
      .neq("status", "cancelado"),
    supabase.from("pos_sales").select("total").gte("created_at", inicioHoy),
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioAyer)
      .lt("created_at", inicioHoy)
      .neq("status", "cancelado"),
    supabase
      .from("pos_sales")
      .select("total")
      .gte("created_at", inicioAyer)
      .lt("created_at", inicioHoy),
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioMes)
      .neq("status", "cancelado"),
    supabase.from("pos_sales").select("total").gte("created_at", inicioMes),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendiente"),
    supabase.from("products").select("id, name, stock").eq("is_active", true),
    supabase
      .from("product_variants")
      .select("id, product_id, talla, color, stock"),
    obtenerUmbralStockBajo(),
    supabase.rpc("informe_ventas_serie", { p_desde: hace6Dias, p_hasta: inicioHoy }),
    supabase.rpc("informe_productos_vendidos", {
      p_desde: hace6Dias,
      p_hasta: inicioHoy,
      p_limit: 5,
    }),
  ]);

  const huboError =
    ordenesError ||
    posError ||
    ordenesAyerError ||
    posAyerError ||
    ordenesMesError ||
    posMesError ||
    pendientesError ||
    productosError ||
    variantesError ||
    serieError ||
    productosVendidosError;

  if (huboError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>
        <p className="text-sm text-red-600">No se pudieron cargar las métricas.</p>
      </div>
    );
  }

  const sumar = (filas: { total: number }[] | null) =>
    (filas ?? []).reduce((sum, f) => sum + f.total, 0);

  const ventasTienda = sumar(ordenesHoy);
  const ventasPos = sumar(ventasPosHoy);
  const ventasTotal = ventasTienda + ventasPos;
  const ventasAyerTotal = sumar(ordenesAyer) + sumar(ventasPosAyer);
  const ventasMesTotal = sumar(ordenesMes) + sumar(ventasPosMes);
  const variacionTexto = formatearVariacion(ventasTotal, ventasAyerTotal);

  const productosActivos = productos ?? [];
  const idsActivos = new Set(productosActivos.map((p) => p.id));
  const variantesActivas = (variantes ?? []).filter((v) => idsActivos.has(v.product_id));

  const stockBajoCompleto = buildLowStockItems(productosActivos, variantesActivas, umbralStockBajo);
  const stockBajo = stockBajoCompleto.slice(0, 10);

  const porFecha = new Map<string, { fecha: string; tienda: number; pos: number }>();
  for (const fila of serieVentas ?? []) {
    const entry = porFecha.get(fila.fecha) ?? { fecha: fila.fecha, tienda: 0, pos: 0 };
    if (fila.canal === "tienda") entry.tienda = fila.monto;
    if (fila.canal === "pos") entry.pos = fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datosGrafica = Array.from(porFecha.values());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Ventas de hoy</p>
          <p className="font-heading text-2xl text-brand-rosa">{formatPrice(ventasTotal)}</p>
          {variacionTexto && (
            <p className="mt-1 text-xs text-brand-ciruela/60">{variacionTexto}</p>
          )}
        </div>

        <Link
          href="/admin/pedidos?status=pendiente"
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm transition hover:border-brand-rosa hover:shadow-brand-md"
        >
          <p className="text-sm text-brand-ciruela/70">Pedidos pendientes</p>
          <p className="font-heading text-2xl text-brand-rosa">{pedidosPendientes ?? 0}</p>
        </Link>

        <Link
          href="/admin/informes/stock-bajo"
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm transition hover:border-brand-rosa hover:shadow-brand-md"
        >
          <p className="text-sm text-brand-ciruela/70">Stock bajo</p>
          <p className="font-heading text-2xl text-brand-rosa">{stockBajoCompleto.length}</p>
        </Link>

        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Ventas del mes</p>
          <p className="font-heading text-2xl text-brand-rosa">{formatPrice(ventasMesTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {datosGrafica.length > 0 && (
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <h2 className="mb-3 font-heading text-lg text-brand-ciruela">
              Ventas — últimos 7 días
            </h2>
            <GraficaVentas datos={datosGrafica} />
          </div>
        )}

        {(productosVendidos ?? []).length > 0 && (
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <h2 className="mb-3 font-heading text-lg text-brand-ciruela">
              Productos más vendidos (7 días)
            </h2>
            <ul className="flex flex-col divide-y divide-brand-rosa-claro/50 text-sm text-brand-ciruela">
              {(productosVendidos ?? []).map((p) => (
                <li key={p.product_id} className="flex justify-between py-2">
                  <span>{p.nombre}</span>
                  <span>{Number(p.qty)} unidades</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {stockBajo.length > 0 && (
        <div>
          <h2 className="mb-3 font-heading text-lg text-brand-ciruela">Stock bajo</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Stock</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {stockBajo.map((item) => (
                <TableRow key={`${item.productId}-${item.variantLabel ?? ""}`}>
                  <TableCell>
                    <Link
                      href={`/admin/productos/${item.productId}/editar`}
                      className="hover:text-brand-rosa"
                    >
                      {item.productName}
                      {item.variantLabel ? ` (${item.variantLabel})` : ""}
                    </Link>
                  </TableCell>
                  <TableCell>{item.stock} unidades</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

(`inicioDelDiaBogota` acepta un parámetro `ahora?: Date` desde antes — se reutiliza aquí
pasándole "hace 24h"/"hace 6 días" en vez de `new Date()` por defecto, sin tocar su
implementación.)

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores. Si `informe_ventas_serie`/`informe_productos_vendidos` no
type-checkan con los nombres de columna usados (`fila.canal`, `fila.monto`,
`p.product_id`, `p.nombre`, `p.qty`), compáralos contra
`src/app/admin/informes/ventas/page.tsx` y `src/app/admin/informes/productos/page.tsx`
(ya usan esos mismos RPCs) — deben coincidir exactamente.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: panel de inicio con variacion de ventas, grafico de 7 dias y top productos"
```

- [ ] **Step 4: Verificación manual en navegador**

Entra a `/admin` — confirma las 4 tarjetas, el gráfico de 7 días (puede estar vacío si no
hay ventas recientes en el ambiente de prueba — en ese caso confirma solo que no rompe
la página), la lista de productos más vendidos, y la tabla de stock bajo con el nuevo
estilo.

---

### Task 10: Migrar `/admin/pedidos` a `Table`/`Badge`

**Files:**
- Modify: `src/app/admin/pedidos/page.tsx`

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableHeaderCell`, `Badge` de Task 1.

- [ ] **Step 1: Reescribir el bloque de tabla**

En `src/app/admin/pedidos/page.tsx`, agrega los imports:

```tsx
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
```

Reemplaza el bloque completo desde `<div className="overflow-x-auto">` hasta su
`</div>` de cierre por:

```tsx
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Pedido</TableHeaderCell>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
              <TableHeaderCell>Fecha</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(pedidos ?? []).map((pedido) => {
              const direccion = pedido.shipping_address as ShippingAddress | null;
              const estadoVariant =
                pedido.status === "entregado" || pedido.status === "pagado"
                  ? ("success" as const)
                  : pedido.status === "cancelado"
                    ? ("danger" as const)
                    : ("warning" as const);
              return (
                <TableRow key={pedido.id}>
                  <TableCell>
                    <Link
                      href={`/admin/pedidos/${pedido.id}`}
                      className="text-brand-rosa hover:underline"
                    >
                      {pedido.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-brand-ciruela/70">
                    {direccion?.fullName ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estadoVariant}>
                      {ESTADO_PEDIDO_LABELS[pedido.status] ?? pedido.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatPrice(pedido.total)}</TableCell>
                  <TableCell className="text-brand-ciruela/70">
                    {new Date(pedido.created_at).toLocaleDateString("es-CO")}
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/pedidos/page.tsx
git commit -m "feat: tabla refinada con badges de estado en /admin/pedidos"
```

- [ ] **Step 4: Verificación manual en navegador**

Entra a `/admin/pedidos` — confirma la tabla nueva y que el color del badge coincide
con el estado de cada pedido (pendiente=ámbar, pagado/entregado=verde,
cancelado=rojo).

---

### Task 11: Migrar Categorías, Categorías de gasto, Proveedores y Reseñas (mismo patrón: tabla con toggle activo/inactivo)

**Files:**
- Modify: `src/app/admin/categorias/page.tsx`
- Modify: `src/app/admin/gastos/categorias/page.tsx`
- Modify: `src/app/admin/compras/proveedores/page.tsx`
- Modify: `src/app/admin/resenas/page.tsx`

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableHeaderCell`, `Badge` de Task 1.

Las 4 páginas comparten el mismo patrón exacto (tabla con columna
"Activa"/"Activo" en texto plano + enlace "Editar" + botón de toggle) —
se migran juntas en una sola tarea porque el cambio es idéntico en
forma, cambia solo el nombre de columnas y el componente de toggle.

- [ ] **Step 1: `src/app/admin/categorias/page.tsx`**

Agrega los imports:

```tsx
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
```

Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Slug</TableHeaderCell>
            <TableHeaderCell>Orden</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {categorias?.map((categoria) => (
            <TableRow key={categoria.id}>
              <TableCell>{categoria.name}</TableCell>
              <TableCell className="text-brand-ciruela/70">{categoria.slug}</TableCell>
              <TableCell>{categoria.sort_order}</TableCell>
              <TableCell>
                <Badge variant={categoria.is_active ? "success" : "neutral"}>
                  {categoria.is_active ? "Activa" : "Inactiva"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/categorias/${categoria.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleCategoriaButton id={categoria.id} isActive={categoria.is_active} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
```

- [ ] **Step 2: `src/app/admin/gastos/categorias/page.tsx`**

Agrega los mismos dos imports. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {(categorias ?? []).map((categoria) => (
            <TableRow key={categoria.id}>
              <TableCell>{categoria.name}</TableCell>
              <TableCell>
                <Badge variant={categoria.is_active ? "success" : "neutral"}>
                  {categoria.is_active ? "Activa" : "Inactiva"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/gastos/categorias/${categoria.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleCategoriaGastoButton id={categoria.id} isActive={categoria.is_active} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
```

- [ ] **Step 3: `src/app/admin/compras/proveedores/page.tsx`**

Agrega los mismos dos imports. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Nombre</TableHeaderCell>
              <TableHeaderCell>Teléfono</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Acciones</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(proveedores ?? []).map((proveedor) => (
              <TableRow key={proveedor.id}>
                <TableCell>{proveedor.name}</TableCell>
                <TableCell>{proveedor.phone ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={proveedor.is_active ? "success" : "neutral"}>
                    {proveedor.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/compras/proveedores/${proveedor.id}/editar`}
                      className="text-brand-rosa hover:underline"
                    >
                      Editar
                    </Link>
                    <ToggleProveedorButton id={proveedor.id} isActive={proveedor.is_active} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
```

(esta página conserva su envoltura condicional `{error ? ... : (...)}` —
el bloque de arriba reemplaza solo lo que hoy está dentro del `<div
className="overflow-x-auto">`.)

- [ ] **Step 4: `src/app/admin/resenas/page.tsx`**

Agrega los mismos dos imports. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Clienta</TableHeaderCell>
            <TableHeaderCell>Calificación</TableHeaderCell>
            <TableHeaderCell>Orden</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {resenas?.map((resena) => (
            <TableRow key={resena.id}>
              <TableCell>{resena.customer_name}</TableCell>
              <TableCell>{resena.rating} / 5</TableCell>
              <TableCell>{resena.sort_order}</TableCell>
              <TableCell>
                <Badge variant={resena.is_active ? "success" : "neutral"}>
                  {resena.is_active ? "Activa" : "Inactiva"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/resenas/${resena.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleResenaButton id={resena.id} isActive={resena.is_active} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
```

- [ ] **Step 5: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores en las 4 páginas.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/categorias/page.tsx src/app/admin/gastos/categorias/page.tsx src/app/admin/compras/proveedores/page.tsx src/app/admin/resenas/page.tsx
git commit -m "feat: tabla refinada con badges en categorias, categorias de gasto, proveedores y resenas"
```

- [ ] **Step 7: Verificación manual en navegador**

Entra a cada una de las 4 páginas — confirma la tabla nueva y que
activar/desactivar sigue funcionando.

---

### Task 12: Migrar Gastos y Compras (listados con filtro/total, sin toggle)

**Files:**
- Modify: `src/app/admin/gastos/page.tsx`
- Modify: `src/app/admin/compras/page.tsx`

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableHeaderCell` de Task 1 (sin `Badge` — no hay un estado que mostrar en estas dos).

- [ ] **Step 1: `src/app/admin/gastos/page.tsx`**

Agrega el import:

```tsx
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
```

Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Categoría</TableHeaderCell>
                <TableHeaderCell>Descripción</TableHeaderCell>
                <TableHeaderCell>Monto</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {(gastos ?? []).map((gasto) => (
                <TableRow key={gasto.id}>
                  <TableCell>{gasto.expense_date}</TableCell>
                  <TableCell>{categoriaNombreById.get(gasto.category_id) ?? "-"}</TableCell>
                  <TableCell>{gasto.description}</TableCell>
                  <TableCell>{formatPrice(gasto.amount)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/gastos/${gasto.id}/editar`}
                        className="text-brand-rosa hover:underline"
                      >
                        Editar
                      </Link>
                      <EliminarGastoButton id={gasto.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
```

- [ ] **Step 2: `src/app/admin/compras/page.tsx`**

Agrega el mismo import. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Proveedor</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(compras ?? []).map((compra) => (
              <TableRow key={compra.id}>
                <TableCell>{compra.purchase_date}</TableCell>
                <TableCell>{proveedorNombreById.get(compra.supplier_id) ?? "-"}</TableCell>
                <TableCell>{formatPrice(totalPorCompra.get(compra.id) ?? 0)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/gastos/page.tsx src/app/admin/compras/page.tsx
git commit -m "feat: tabla refinada en gastos y compras"
```

- [ ] **Step 5: Verificación manual en navegador**

Entra a `/admin/gastos` y `/admin/compras` — confirma la tabla nueva, que
el filtro por fecha/categoría de Gastos sigue funcionando, y que "Editar"/eliminar
sigue funcionando en Gastos.

---

### Task 13: Migrar las 7 subpáginas de `/admin/informes`

**Files:**
- Modify: `src/app/admin/informes/ventas/page.tsx`
- Modify: `src/app/admin/informes/productos/page.tsx`
- Modify: `src/app/admin/informes/ganancia/page.tsx`
- Modify: `src/app/admin/informes/gastos/page.tsx`
- Modify: `src/app/admin/informes/metodos-pago/page.tsx`
- Modify: `src/app/admin/informes/stock-bajo/page.tsx`
- Modify: `src/app/admin/informes/compras/page.tsx`

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableHeaderCell` de Task 1 (sin `Badge` — son tablas numéricas, no de estado). Ninguna gráfica (`Grafica*.tsx`) se toca.

Las 7 páginas son puramente numéricas (fecha/categoría/monto) — se
migran juntas, cada una solo cambia su `<table>...</table>` por los
componentes de Task 1, sin tocar el resto de cada página (filtro de
rango, tarjetas de totales, gráficas).

- [ ] **Step 1: `ventas/page.tsx`**

Agrega el import `{ Table, TableHeader, TableRow, TableCell, TableHeaderCell }` desde
`@/components/ui/table`. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Tienda</TableHeaderCell>
                <TableHeaderCell>POS</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {datos.map((fila) => (
                <TableRow key={fila.fecha}>
                  <TableCell>{fila.fecha}</TableCell>
                  <TableCell>{formatPrice(fila.tienda)}</TableCell>
                  <TableCell>{formatPrice(fila.pos)}</TableCell>
                  <TableCell>{formatPrice(fila.tienda + fila.pos)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
```

- [ ] **Step 2: `productos/page.tsx`**

Mismo import. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Unidades</TableHeaderCell>
                <TableHeaderCell>Ingreso</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {datos.map((fila) => (
                <TableRow key={fila.productId}>
                  <TableCell>{fila.nombre}</TableCell>
                  <TableCell>{fila.qty}</TableCell>
                  <TableCell>{formatPrice(fila.ingreso)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
```

- [ ] **Step 3: `ganancia/page.tsx`**

Mismo import. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Ventas</TableHeaderCell>
                <TableHeaderCell>Costo de productos</TableHeaderCell>
                <TableHeaderCell>Gastos</TableHeaderCell>
                <TableHeaderCell>Ganancia</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {datos.map((fila) => (
                <TableRow key={fila.fecha}>
                  <TableCell>{fila.fecha}</TableCell>
                  <TableCell>{formatPrice(fila.ventas)}</TableCell>
                  <TableCell>{formatPrice(fila.costo_productos)}</TableCell>
                  <TableCell>{formatPrice(fila.gastos)}</TableCell>
                  <TableCell>{formatPrice(fila.ganancia)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
```

- [ ] **Step 4: `gastos/page.tsx`**

Mismo import. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Categoría</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {Array.from(totalPorCategoria.entries()).map(([categoria, monto]) => (
                <TableRow key={categoria}>
                  <TableCell>{categoria}</TableCell>
                  <TableCell>{formatPrice(monto)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
```

- [ ] **Step 5: `metodos-pago/page.tsx`**

Mismo import. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Método</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {datos.map((fila) => (
                <TableRow key={fila.metodo}>
                  <TableCell className="capitalize">{fila.metodo}</TableCell>
                  <TableCell>{formatPrice(fila.total)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
```

- [ ] **Step 6: `stock-bajo/page.tsx`**

Mismo import. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Producto</TableHeaderCell>
              <TableHeaderCell>SKU</TableHeaderCell>
              <TableHeaderCell>Stock</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {productosSinVariante.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.sku}</TableCell>
                <TableCell>{p.stock}</TableCell>
              </TableRow>
            ))}
            {(variantes ?? []).map((v) => (
              <TableRow key={v.id}>
                <TableCell>{nombrePorProductoId.get(v.product_id) ?? "-"} — {v.name}</TableCell>
                <TableCell>{v.sku}</TableCell>
                <TableCell>{v.stock}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
```

- [ ] **Step 7: `compras/page.tsx`**

Mismo import. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Proveedor</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {Array.from(totalPorProveedor.entries()).map(([proveedor, monto]) => (
                <TableRow key={proveedor}>
                  <TableCell>{proveedor}</TableCell>
                  <TableCell>{formatPrice(monto)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
```

- [ ] **Step 8: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores en las 7 páginas.

- [ ] **Step 9: Commit**

```bash
git add src/app/admin/informes
git commit -m "feat: tabla refinada en las 7 subpaginas de informes"
```

- [ ] **Step 10: Verificación manual en navegador**

Entra a cada una de las 7 subpáginas de `/admin/informes` — confirma que las tablas se
ven con el nuevo estilo y que el filtro de rango de fechas y las gráficas existentes
siguen funcionando sin cambios.

---

### Task 14: Migrar Ventas POS (historial) y Usuarios (superadmin)

**Files:**
- Modify: `src/app/pos/(admin)/ventas/page.tsx` (ruta ya movida en Task 6)
- Modify: `src/app/superadmin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableHeaderCell` de Task 1; `Badge` de Task 1 (solo en Usuarios, para el estado bloqueado/activo y el rol).

- [ ] **Step 1: `src/app/pos/(admin)/ventas/page.tsx`**

Agrega el import `{ Table, TableHeader, TableRow, TableCell, TableHeaderCell }` desde
`@/components/ui/table`. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Número</TableHeaderCell>
              <TableHeaderCell>Método de pago</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {ventas.map((venta) => (
              <TableRow key={venta.id}>
                <TableCell>{new Date(venta.created_at).toLocaleString("es-CO")}</TableCell>
                <TableCell>
                  <Link href={`/pos/venta/${venta.id}`} className="text-brand-rosa hover:underline">
                    {venta.sale_number}
                  </Link>
                </TableCell>
                <TableCell>{venta.payment_method}</TableCell>
                <TableCell>{formatPrice(venta.total)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
```

(Esta página también tiene un `<Link href="/pos" ...>` "Volver al POS" y un
`<h1>` fuera del `<div className="overflow-x-auto">` — no se tocan, siguen
igual. El elemento raíz ya se cambió de `<main>` a `<div>` en la Task 6
Step 4 — aquí solo se toca la tabla.)

- [ ] **Step 2: `src/app/superadmin/usuarios/page.tsx`**

Agrega los imports `{ Table, TableHeader, TableRow, TableCell, TableHeaderCell }` y
`{ Badge }`. Reemplaza el bloque `<div className="overflow-x-auto">...</div>` por:

```tsx
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Usuario</TableHeaderCell>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Rol</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {(profiles ?? []).map((profile) => (
            <TableRow key={profile.id}>
              <TableCell>{profile.username}</TableCell>
              <TableCell className="text-brand-ciruela/70">{profile.full_name ?? "-"}</TableCell>
              <TableCell>{ROL_LABELS[profile.role] ?? profile.role}</TableCell>
              <TableCell>
                <Badge variant={bannedById.get(profile.id) ? "danger" : "success"}>
                  {bannedById.get(profile.id) ? "Bloqueado" : "Activo"}
                </Badge>
              </TableCell>
              <TableCell>
                <UserRowActions
                  userId={profile.id}
                  role={profile.role}
                  isBlocked={bannedById.get(profile.id) ?? false}
                  isSelf={profile.id === currentUser.id}
                />
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/pos/(admin)/ventas/page.tsx" src/app/superadmin/usuarios/page.tsx
git commit -m "feat: tabla refinada en ventas POS y usuarios de superadmin"
```

- [ ] **Step 5: Verificación manual en navegador**

Entra a `/pos/ventas` y `/superadmin/usuarios` — confirma la tabla nueva y los
badges de rol/estado en Usuarios.

---

## Self-Review

**Cobertura del spec:** las 7 secciones de "Arquitectura" del spec
tienen tarea propia — sidebar (Tasks 3-6), `Table`/`Badge` (Task 1,
aplicado en Tasks 8-14), tarjetas de producto (Task 8), botón de
imágenes (Task 7), panel de inicio (Task 9), migración del resto de
listados (Tasks 10-14, cubre el inventario completo listado en la
sección 7 del spec).

**Placeholders:** ninguno — cada step trae el código completo.

**Consistencia de tipos:** `SidebarSection`/`BackendSidebar` (Task 3)
se usa con la misma forma en Tasks 4, 5 y 6.
`ImageUploadButton({ id, files, onChange, label? })` (Task 7) coincide
en `producto-form.tsx` con lo que ya devuelven `handleImageChange`/
`handleVariantImageChange` tras el ajuste de firma del propio Task 7.
`Table`/`TableHeader`/`TableRow`/`TableCell`/`TableHeaderCell` (Task 1)
se usan con la misma forma en todas las Tasks 8-14.
