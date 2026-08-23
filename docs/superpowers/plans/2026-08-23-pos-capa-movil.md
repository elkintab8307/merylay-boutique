# Rediseño POS — Capa móvil (sub-proyecto 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al módulo POS una capa móvil completa: barra de navegación inferior con pestañas, header condensado, patrón de dos pantallas (productos ↔ carrito) en la terminal POS, categorías con imagen en móvil, grilla de pago responsiva, arreglo de presión de ancho en el carrito, y una pasada de accesibilidad sobre los 6 grupos de botones-toggle del módulo — todo por debajo del sub-proyecto 5 de 5 (último) del rediseño POS.

**Architecture:** Todo el trabajo es aditivo y gateado por el breakpoint `md` (768px) o por props opcionales con default `false`/comportamiento actual — en escritorio (`md:` y superior) nada cambia visualmente respecto a los sub-proyectos 1-4 ya en producción. Dos componentes nuevos (`PosBottomNav`, `PosMobileShell`) orquestan la navegación móvil; `BackendSidebar` se promueve a componente controlable (sin romper sus otros 2 consumidores fuera del POS); `VentaItemsEditor` gana un prop opcional `mobileVistaDoble` que activa el patrón de dos pantallas solo en la terminal POS.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, lucide-react para íconos, `@testing-library/react` + Vitest para los tests existentes de `BackendSidebar`.

**Spec:** `docs/superpowers/specs/2026-08-23-pos-capa-movil-design.md`

## Global Constraints

- Breakpoint `md` (768px) en todo — mismo criterio ya usado en `BackendSidebar` y en el grid de `VentaItemsEditor`. No se introduce un breakpoint nuevo.
- En escritorio (`md:` y superior) el resultado visual debe ser byte-idéntico a lo que ya está en producción (sub-proyectos 1-4) — todo cambio nuevo va gateado por clases `md:`/`hidden` o por props opcionales con default que preserva el comportamiento actual.
- Sin favoritos — no se agrega funcionalidad de favoritos al POS (decisión ya tomada en el sub-proyecto 3, se reafirma aquí).
- La pestaña "Inventario" de la barra inferior apunta a `/admin/productos` y es visible SOLO para `admin`/`superadmin` — `staff` no tiene acceso a `/admin/**` (`src/lib/auth/route-protection.ts`), así que su barra tiene 4 pestañas, no 5.
- "Más" en la barra inferior abre el mismo `Sheet` que ya usa `BackendSidebar` — no se duplica el menú lateral.
- El patrón de dos pantallas del carrito (`mobileVistaDoble`) solo lo activa `pos-terminal.tsx` — los otros 2 consumidores de `VentaItemsEditor` (`editar-venta-form.tsx`, `pedido-editar-form.tsx`) no lo activan y siguen apilándose verticalmente en móvil sin cambios de comportamiento.
- Sin test unitario dedicado para los componentes de layout/navegación nuevos (`PosBottomNav`, `PosMobileShell`) — mismo criterio ya usado para `PosTopBar`/`PosStatusBar`/`NotificacionesStockBajo` en sub-proyectos anteriores (componentes de layout sin lógica de negocio propia). Excepción: `BackendSidebar` ya tiene un archivo de test existente (`src/components/admin/__tests__/backend-sidebar.test.tsx`) — al modificarlo se sigue SU PROPIO precedente y se le agregan casos nuevos, no se elimina la práctica de testearlo.
- `listarCategoriasPos` ya tiene tests existentes (sub-proyecto 3) — se extiende el test existente para cubrir el nuevo campo `imageUrl`, no se crea un archivo nuevo.
- Íconos lucide-react verificados en la versión instalada antes de escribir este plan: `Package`, `ArrowLeft`, `ShoppingCart`, `Menu`, `LayoutGrid` (además de `Store`, `Receipt`, `Users`, `Banknote`, `CreditCard`, `Landmark`, `Smartphone`, `Wallet` ya usados en sub-proyectos anteriores).
- Disciplina ícono-como-ReactNode (de sub-proyecto 1): cualquier ícono que cruce de un Server Component a un Client Component como dato debe ir ya renderizado (`<Icon className="..." />`), nunca como referencia de componente sin renderizar.

---

### Task 1: `listarCategoriasPos` gana `imageUrl`

**Files:**
- Modify: `src/app/pos/product-browser-action.ts`
- Modify: `src/app/pos/__tests__/product-browser-action.test.ts`

**Interfaces:**
- Produces: `PosCategoriaResult` gana el campo `imageUrl: string | null` — consumido por la Task 3 (`ProductBrowser`).

- [ ] **Step 1: Actualizar el test existente antes del código**

En `src/app/pos/__tests__/product-browser-action.test.ts`, reemplazar:

```ts
  it("filtra activas, sin parent_id, ordenadas por sort_order", async () => {
    const supabase = crearSupabaseMock({
      categories: [{ id: "cat-1", name: "Pijamas" }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { listarCategoriasPos } = await import("../product-browser-action");
    const resultado = await listarCategoriasPos();

    expect(supabase.builders.categories.eq).toHaveBeenCalledWith("is_active", true);
    expect(supabase.builders.categories.is).toHaveBeenCalledWith("parent_id", null);
    expect(supabase.builders.categories.order).toHaveBeenCalledWith("sort_order");
    expect(resultado).toEqual([{ id: "cat-1", name: "Pijamas" }]);
  });
```

por:

```ts
  it("filtra activas, sin parent_id, ordenadas por sort_order", async () => {
    const supabase = crearSupabaseMock({
      categories: [{ id: "cat-1", name: "Pijamas", image_url: "https://cdn.example.com/cat.jpg" }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { listarCategoriasPos } = await import("../product-browser-action");
    const resultado = await listarCategoriasPos();

    expect(supabase.builders.categories.eq).toHaveBeenCalledWith("is_active", true);
    expect(supabase.builders.categories.is).toHaveBeenCalledWith("parent_id", null);
    expect(supabase.builders.categories.order).toHaveBeenCalledWith("sort_order");
    expect(resultado).toEqual([
      { id: "cat-1", name: "Pijamas", imageUrl: "https://cdn.example.com/cat.jpg" },
    ]);
  });

  it("mapea image_url null a imageUrl: null", async () => {
    const supabase = crearSupabaseMock({
      categories: [{ id: "cat-2", name: "Vestidos", image_url: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { listarCategoriasPos } = await import("../product-browser-action");
    const resultado = await listarCategoriasPos();

    expect(resultado).toEqual([{ id: "cat-2", name: "Vestidos", imageUrl: null }]);
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm vitest run src/app/pos/__tests__/product-browser-action.test.ts`
Expected: FAIL — `resultado` no incluye `imageUrl` todavía.

- [ ] **Step 3: Actualizar `listarCategoriasPos`**

En `src/app/pos/product-browser-action.ts`, reemplazar:

```ts
export type PosCategoriaResult = {
  id: string;
  name: string;
};

export async function listarCategoriasPos(): Promise<PosCategoriaResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .is("parent_id", null)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}
```

por:

```ts
export type PosCategoriaResult = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export async function listarCategoriasPos(): Promise<PosCategoriaResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, image_url")
    .eq("is_active", true)
    .is("parent_id", null)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, imageUrl: c.image_url }));
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm vitest run src/app/pos/__tests__/product-browser-action.test.ts`
Expected: PASS (11 tests — 9 existentes + 2 nuevos)

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/product-browser-action.ts src/app/pos/__tests__/product-browser-action.test.ts
git commit -m "feat: listarCategoriasPos incluye imageUrl de la categoria"
```

---

### Task 2: `PaymentMethodPicker` — grilla responsiva + accesibilidad + arreglo de ancho del carrito

**Files:**
- Modify: `src/app/pos/payment-method-picker.tsx`
- Modify: `src/app/pos/venta-items-editor.tsx`

**Interfaces:**
- Produces: `PaymentMethodPicker` gana un prop nuevo REQUERIDO `groupLabel: string` (rompe la firma actual — ambos usos en `venta-items-editor.tsx` se actualizan en este mismo task) y grilla `grid-cols-2 md:grid-cols-3` (antes fija en 3).

- [ ] **Step 1: Reemplazar `payment-method-picker.tsx` completo**

```tsx
"use client";

import type { LucideIcon } from "lucide-react";

export type PaymentMethodOption<T extends string> = {
  value: T;
  label: string;
  Icon: LucideIcon;
};

export function PaymentMethodPicker<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  groupLabel,
}: {
  options: PaymentMethodOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  compact?: boolean;
  groupLabel: string;
}) {
  return (
    <div role="group" aria-label={groupLabel} className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {options.map(({ value: optionValue, label, Icon }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            aria-pressed={active}
            className={`flex flex-col items-center justify-center gap-1 rounded-md border ${
              compact ? "px-2 py-1.5" : "px-3 py-2.5"
            } ${
              active
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
            <span className={compact ? "text-[11px]" : "text-xs"}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Agregar `groupLabel` a los dos usos en `venta-items-editor.tsx`**

Reemplazar:

```tsx
        {mostrarMetodoPago && (
          <div>
            <label className="text-sm text-brand-ciruela">Método de pago</label>
            <PaymentMethodPicker
              options={metodosPagoPrincipal}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
          </div>
        )}
```

por:

```tsx
        {mostrarMetodoPago && (
          <div>
            <label className="text-sm text-brand-ciruela">Método de pago</label>
            <PaymentMethodPicker
              options={metodosPagoPrincipal}
              value={paymentMethod}
              onChange={setPaymentMethod}
              groupLabel="Método de pago"
            />
          </div>
        )}
```

Y reemplazar:

```tsx
            {abonoInicial > 0 && (
              <div>
                <label className="text-sm text-brand-ciruela">
                  Método de pago del abono inicial
                </label>
                <PaymentMethodPicker
                  options={METODOS_ABONO_OPTIONS}
                  value={abonoInicialMetodo}
                  onChange={setAbonoInicialMetodo}
                  compact
                />
              </div>
            )}
```

por:

```tsx
            {abonoInicial > 0 && (
              <div>
                <label className="text-sm text-brand-ciruela">
                  Método de pago del abono inicial
                </label>
                <PaymentMethodPicker
                  options={METODOS_ABONO_OPTIONS}
                  value={abonoInicialMetodo}
                  onChange={setAbonoInicialMetodo}
                  compact
                  groupLabel="Método de pago del abono inicial"
                />
              </div>
            )}
```

- [ ] **Step 3: Arreglar la presión de ancho en la línea del carrito**

En el mismo archivo `venta-items-editor.tsx`, reemplazar:

```tsx
            {items.map((item) => (
              <div
                key={`${item.productId}-${item.variantId ?? "base"}`}
                className="flex items-center gap-2 py-2"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
                  {item.imageUrl && (
                    <Image src={item.imageUrl} alt={item.name} fill className="object-contain" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-brand-ciruela">{item.name}</p>
                  <p className="text-xs text-brand-ciruela/60">{formatPrice(item.unitPrice)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty - 1)}
                  className="h-11 w-11 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm">{item.qty}</span>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty + 1)}
                  className="h-11 w-11 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.productId, item.variantId)}
                  className="ml-2 text-sm text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
```

por:

```tsx
            {items.map((item) => (
              <div
                key={`${item.productId}-${item.variantId ?? "base"}`}
                className="flex items-center gap-2 py-2"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
                  {item.imageUrl && (
                    <Image src={item.imageUrl} alt={item.name} fill className="object-contain" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-brand-ciruela">{item.name}</p>
                  <p className="text-xs text-brand-ciruela/60">{formatPrice(item.unitPrice)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty - 1)}
                  className="h-11 w-11 shrink-0 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm">{item.qty}</span>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty + 1)}
                  className="h-11 w-11 shrink-0 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.productId, item.variantId)}
                  className="ml-2 text-sm text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/payment-method-picker.tsx src/app/pos/venta-items-editor.tsx
git commit -m "feat: grilla de pago responsiva, accesibilidad y arreglo de ancho del carrito"
```

---

### Task 3: Categorías con imagen en móvil (`ProductBrowser`)

**Files:**
- Modify: `src/app/pos/product-browser.tsx`

**Interfaces:**
- Consumes: `PosCategoriaResult.imageUrl` (Task 1).

- [ ] **Step 1: Actualizar imports**

Reemplazar:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ScanBarcode } from "lucide-react";
import { Input } from "@/components/ui/input";
```

por:

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LayoutGrid, ScanBarcode } from "lucide-react";
import { Input } from "@/components/ui/input";
```

- [ ] **Step 2: Reemplazar el bloque de píldoras de categoría**

Reemplazar:

```tsx
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={`rounded-full border px-3 py-1 text-sm ${
            categoryId === null
              ? "border-brand-rosa bg-brand-rosa text-brand-crema"
              : "border-brand-rosa-claro text-brand-ciruela"
          }`}
        >
          Todos
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryId(cat.id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              categoryId === cat.id
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
```

por:

```tsx
      <div role="group" aria-label="Categorías" className="flex gap-3 overflow-x-auto pb-1 md:hidden">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          aria-pressed={categoryId === null}
          className="flex shrink-0 flex-col items-center gap-1"
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 bg-brand-rosa-claro ${
              categoryId === null ? "border-brand-rosa" : "border-transparent"
            }`}
          >
            <LayoutGrid className="h-6 w-6 text-brand-ciruela" />
          </span>
          <span className="text-xs text-brand-ciruela">Todos</span>
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryId(cat.id)}
            aria-pressed={categoryId === cat.id}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <span
              className={`relative h-14 w-14 overflow-hidden rounded-full border-2 bg-brand-rosa-claro ${
                categoryId === cat.id ? "border-brand-rosa" : "border-transparent"
              }`}
            >
              {cat.imageUrl && (
                <Image src={cat.imageUrl} alt={cat.name} fill className="object-cover" />
              )}
            </span>
            <span className="max-w-[4rem] truncate text-xs text-brand-ciruela">{cat.name}</span>
          </button>
        ))}
      </div>

      <div role="group" aria-label="Categorías" className="hidden flex-wrap gap-2 md:flex">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          aria-pressed={categoryId === null}
          className={`rounded-full border px-3 py-1 text-sm ${
            categoryId === null
              ? "border-brand-rosa bg-brand-rosa text-brand-crema"
              : "border-brand-rosa-claro text-brand-ciruela"
          }`}
        >
          Todos
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryId(cat.id)}
            aria-pressed={categoryId === cat.id}
            className={`rounded-full border px-3 py-1 text-sm ${
              categoryId === cat.id
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/pos/product-browser.tsx
git commit -m "feat: miniaturas de categoria con imagen en movil"
```

---

### Task 4: Accesibilidad en los chips de variante (`ProductCardPos`)

**Files:**
- Modify: `src/app/pos/product-card-pos.tsx`

**Interfaces:** Ninguna nueva — solo atributos ARIA.

- [ ] **Step 1: Agregar `role`/`aria-label`/`aria-pressed` a los chips de talla y color**

Reemplazar:

```tsx
          {tallas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tallas.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTalla(t)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    talla === t
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {colores.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {colores.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    color === c
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
```

por:

```tsx
          {tallas.length > 0 && (
            <div role="group" aria-label="Talla" className="flex flex-wrap gap-1">
              {tallas.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTalla(t)}
                  aria-pressed={talla === t}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    talla === t
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {colores.length > 0 && (
            <div role="group" aria-label="Color" className="flex flex-wrap gap-1">
              {colores.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    color === c
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/pos/product-card-pos.tsx
git commit -m "feat: accesibilidad en los chips de talla y color del POS"
```

---

### Task 5: `BackendSidebar` — Sheet controlable

**Files:**
- Modify: `src/components/admin/backend-sidebar.tsx`
- Modify: `src/components/admin/__tests__/backend-sidebar.test.tsx`

**Interfaces:**
- Produces: `BackendSidebar` gana 3 props opcionales — `open?: boolean`, `onOpenChange?: (open: boolean) => void`, `ocultarTriggerMovil?: boolean` (default `false`, comportamiento actual preservado) — consumidos por la Task 7 (`PosMobileShell`). Los consumidores existentes (`admin-nav.tsx`, `superadmin-nav.tsx`, el propio `layout.tsx` del POS antes de la Task 7) NO pasan estas props y no cambian de comportamiento.

- [ ] **Step 1: Reemplazar la función `BackendSidebar` completa**

Reemplazar (desde `export function BackendSidebar` hasta el final del archivo):

```tsx
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

por:

```tsx
export function BackendSidebar({
  sections,
  homeHref,
  open,
  onOpenChange,
  ocultarTriggerMovil = false,
}: {
  sections: SidebarSection[];
  homeHref: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ocultarTriggerMovil?: boolean;
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        {!ocultarTriggerMovil && (
          <div className="border-b border-brand-rosa-claro bg-white px-4 py-3 md:hidden print:hidden">
            <SheetTrigger
              aria-label="Menú"
              className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
            >
              <Menu className="h-6 w-6" />
            </SheetTrigger>
          </div>
        )}
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
    </>
  );
}
```

- [ ] **Step 2: Agregar los 2 tests nuevos**

En `src/components/admin/__tests__/backend-sidebar.test.tsx`, agregar estos 2 casos dentro del `describe("BackendSidebar", ...)` existente, después del test `"no rompe cuando el item no trae icono..."`:

```tsx
  it("muestra el trigger movil propio por defecto (ocultarTriggerMovil sin pasar)", () => {
    render(
      <BackendSidebar
        sections={[{ label: "POS", items: [{ href: "/pos", label: "Terminal" }] }]}
        homeHref="/pos"
      />,
    );
    expect(screen.getByLabelText("Menú")).toBeInTheDocument();
  });

  it("oculta el trigger movil propio cuando ocultarTriggerMovil es true", () => {
    render(
      <BackendSidebar
        sections={[{ label: "POS", items: [{ href: "/pos", label: "Terminal" }] }]}
        homeHref="/pos"
        ocultarTriggerMovil
      />,
    );
    expect(screen.queryByLabelText("Menú")).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Correr los tests y verificar que pasan**

Run: `pnpm vitest run src/components/admin/__tests__/backend-sidebar.test.tsx`
Expected: PASS (4 tests — 2 existentes + 2 nuevos)

- [ ] **Step 4: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/backend-sidebar.tsx src/components/admin/__tests__/backend-sidebar.test.tsx
git commit -m "feat: BackendSidebar acepta Sheet controlado (open/onOpenChange/ocultarTriggerMovil)"
```

---

### Task 6: `PosBottomNav` (barra de navegación inferior)

**Files:**
- Create: `src/components/pos/pos-bottom-nav.tsx`

**Interfaces:**
- Produces: `<PosBottomNav rolVendedor={string} onAbrirMas={() => void} />` — usado por la Task 7 (`PosMobileShell`).

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Receipt, Users, Package, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const TAB_POS = { href: "/pos", label: "POS", icon: Store };
const TAB_VENTAS = { href: "/pos/ventas", label: "Ventas", icon: Receipt };
const TAB_CLIENTES = { href: "/pos/clientes", label: "Clientes", icon: Users };
const TAB_INVENTARIO = { href: "/admin/productos", label: "Inventario", icon: Package };

export function PosBottomNav({
  rolVendedor,
  onAbrirMas,
}: {
  rolVendedor: string;
  onAbrirMas: () => void;
}) {
  const pathname = usePathname();
  const esAdminOSuperadmin = rolVendedor === "admin" || rolVendedor === "superadmin";

  const tabs = esAdminOSuperadmin
    ? [TAB_POS, TAB_VENTAS, TAB_INVENTARIO, TAB_CLIENTES]
    : [TAB_POS, TAB_VENTAS, TAB_CLIENTES];

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-brand-rosa-claro bg-white px-2 py-1.5 md:hidden print:hidden"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-xs",
              active ? "text-brand-rosa" : "text-brand-ciruela",
            )}
          >
            <Icon className="h-5 w-5" />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onAbrirMas}
        className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-xs text-brand-ciruela"
      >
        <Menu className="h-5 w-5" />
        Más
      </button>
    </nav>
  );
}
```

No lleva test dedicado (componente de navegación sin lógica de negocio propia, mismo criterio que `PosTopBar`/`PosStatusBar`).

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos en este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/pos-bottom-nav.tsx
git commit -m "feat: barra de navegacion inferior del POS para movil"
```

---

### Task 7: Header móvil condensado + integración en `layout.tsx`

**Files:**
- Create: `src/components/pos/pos-mobile-shell.tsx`
- Modify: `src/app/pos/(admin)/layout.tsx`
- Modify: `src/components/pos/pos-top-bar.tsx`
- Modify: `src/components/pos/pos-status-bar.tsx`

**Interfaces:**
- Consumes: `BackendSidebar` con `open`/`onOpenChange`/`ocultarTriggerMovil` (Task 5); `PosBottomNav` (Task 6); `NotificacionesStockBajo` (ya existente, sin cambios).
- Produces: `<PosMobileShell sections={SidebarSection[]} rolVendedor={string} stockBajo={LowStockItem[]} />` — usado por `layout.tsx`.

- [ ] **Step 1: Crear `PosMobileShell`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { BackendSidebar, type SidebarSection } from "@/components/admin/backend-sidebar";
import { PosBottomNav } from "./pos-bottom-nav";
import { NotificacionesStockBajo } from "./notificaciones-stock-bajo";
import type { LowStockItem } from "@/lib/admin/low-stock";

export function PosMobileShell({
  sections,
  rolVendedor,
  stockBajo,
}: {
  sections: SidebarSection[];
  rolVendedor: string;
  stockBajo: LowStockItem[];
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <>
      <BackendSidebar
        sections={sections}
        homeHref="/pos"
        open={menuAbierto}
        onOpenChange={setMenuAbierto}
        ocultarTriggerMovil
      />
      <header className="flex items-center justify-between border-b border-brand-rosa-claro bg-white px-4 py-3 md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Menú"
          className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Link href="/pos" className="font-script text-2xl text-brand-rosa">
          MeryLay
        </Link>
        <NotificacionesStockBajo items={stockBajo} />
      </header>
      <PosBottomNav rolVendedor={rolVendedor} onAbrirMas={() => setMenuAbierto(true)} />
    </>
  );
}
```

No lleva test dedicado (mismo criterio que `PosBottomNav`).

- [ ] **Step 2: `PosTopBar` se oculta en móvil**

En `src/components/pos/pos-top-bar.tsx`, reemplazar:

```tsx
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-rosa-claro bg-white px-6 py-4 print:hidden">
```

por:

```tsx
    <header className="hidden flex-wrap items-center justify-between gap-4 border-b border-brand-rosa-claro bg-white px-6 py-4 md:flex print:hidden">
```

- [ ] **Step 3: `PosStatusBar` se oculta en móvil**

En `src/components/pos/pos-status-bar.tsx`, reemplazar:

```tsx
    <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-brand-rosa-claro bg-white px-6 py-2 text-xs text-brand-ciruela/80 print:hidden">
```

por:

```tsx
    <footer className="sticky bottom-0 hidden flex-wrap items-center justify-between gap-3 border-t border-brand-rosa-claro bg-white px-6 py-2 text-xs text-brand-ciruela/80 md:flex print:hidden">
```

- [ ] **Step 4: Integrar en `layout.tsx`**

Reemplazar el archivo completo `src/app/pos/(admin)/layout.tsx`:

```tsx
import { Store, Receipt, CreditCard, Users, LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { buildLowStockItems, obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import type { SidebarSection } from "@/components/admin/backend-sidebar";
import { PosMobileShell } from "@/components/pos/pos-mobile-shell";
import { PosTopBar } from "@/components/pos/pos-top-bar";
import { PosStatusBar } from "@/components/pos/pos-status-bar";

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

  const sections: SidebarSection[] = [
    {
      label: "POS",
      items: [
        { href: "/pos", label: "Terminal", icon: <Store className="h-4 w-4 shrink-0" /> },
        { href: "/pos/ventas", label: "Ventas POS", icon: <Receipt className="h-4 w-4 shrink-0" /> },
        { href: "/pos/creditos", label: "Créditos", icon: <CreditCard className="h-4 w-4 shrink-0" /> },
        { href: "/pos/clientes", label: "Clientes", icon: <Users className="h-4 w-4 shrink-0" /> },
      ],
    },
  ];

  const esAdminOSuperadmin =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";

  if (esAdminOSuperadmin) {
    sections.push({
      label: "Panel",
      items: [
        {
          href: "/admin",
          label: "Volver al panel",
          icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
        },
      ],
    });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-brand-crema">
      <PosMobileShell sections={sections} rolVendedor={rolVendedor} stockBajo={stockBajo} />
      <div className="flex flex-1 flex-col">
        <PosTopBar
          nombreVendedor={nombreVendedor}
          rolVendedor={rolVendedor}
          stockBajo={stockBajo}
        />
        <main className="flex-1 px-6 py-8 pb-20 md:pb-8">{children}</main>
        <PosStatusBar nombreVendedor={nombreVendedor} />
      </div>
    </div>
  );
}
```

(Nota: `main` gana `pb-20 md:pb-8` — el padding extra en móvil evita que `PosBottomNav`, que es `fixed bottom-0`, tape el contenido final de la página.)

- [ ] **Step 5: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add src/components/pos/pos-mobile-shell.tsx src/components/pos/pos-top-bar.tsx src/components/pos/pos-status-bar.tsx "src/app/pos/(admin)/layout.tsx"
git commit -m "feat: header movil condensado y barra inferior integrados en el layout del POS"
```

---

### Task 8: Terminal POS — patrón de dos pantallas

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx`
- Modify: `src/app/pos/(admin)/pos-terminal.tsx`

**Interfaces:**
- Produces: `VentaItemsEditor` gana el prop opcional `mobileVistaDoble?: boolean` (default `false`) — solo `pos-terminal.tsx` lo activa. Los otros 2 consumidores (`editar-venta-form.tsx`, `pedido-editar-form.tsx`) no cambian.

- [ ] **Step 1: Reemplazar `venta-items-editor.tsx` completo**

```tsx
"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, Banknote, CreditCard, Landmark, ShoppingCart, Smartphone, Wallet } from "lucide-react";
import { PaymentMethodPicker, type PaymentMethodOption } from "./payment-method-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import {
  mergeCartItem,
  updateItemQty,
  removeItem,
  computeSubtotal,
  type LocalCartItem,
} from "@/lib/cart/local-cart";
import { ProductBrowser } from "./product-browser";
import type { Database } from "@/lib/supabase/database.types";
import type { CreditoVentaInput } from "@/lib/validation/credito";
import { ClienteSelector, type ClienteSeleccionado } from "./cliente-selector";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const METODOS_ABONO = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"] as const;

const METODOS_ABONO_OPTIONS: PaymentMethodOption<(typeof METODOS_ABONO)[number]>[] = [
  { value: "efectivo", label: "Efectivo", Icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", Icon: CreditCard },
  { value: "transferencia", label: "Transferencia", Icon: Landmark },
  { value: "nequi", label: "Nequi", Icon: Smartphone },
  { value: "daviplata", label: "Daviplata", Icon: Smartphone },
];

export function VentaItemsEditor({
  itemsIniciales = [],
  discountInicial = 0,
  paymentMethodInicial = "efectivo",
  clienteInicial = null,
  mostrarDescuento = true,
  mostrarMetodoPago = true,
  mostrarCliente = true,
  permitirCredito = true,
  mobileVistaDoble = false,
  textoBoton,
  textoBotonEnviando,
  onGuardar,
}: {
  itemsIniciales?: LocalCartItem[];
  discountInicial?: number;
  paymentMethodInicial?: PaymentMethod;
  clienteInicial?: ClienteSeleccionado | null;
  mostrarDescuento?: boolean;
  mostrarMetodoPago?: boolean;
  mostrarCliente?: boolean;
  permitirCredito?: boolean;
  mobileVistaDoble?: boolean;
  textoBoton: string;
  textoBotonEnviando: string;
  onGuardar: (
    items: LocalCartItem[],
    paymentMethod: PaymentMethod,
    discount: number,
    credito: CreditoVentaInput | null,
    customerId: string | null,
  ) => Promise<{ error?: string } | void>;
}) {
  const [items, setItems] = useState<LocalCartItem[]>(itemsIniciales);
  const [discount, setDiscount] = useState(discountInicial);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethodInicial);
  const [cliente, setCliente] = useState<ClienteSeleccionado | null>(clienteInicial ?? null);
  const [numCuotas, setNumCuotas] = useState(1);
  const [abonoInicial, setAbonoInicial] = useState(0);
  const [abonoInicialMetodo, setAbonoInicialMetodo] = useState<
    (typeof METODOS_ABONO)[number] | ""
  >("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [mostrandoCarritoMovil, setMostrandoCarritoMovil] = useState(false);

  const subtotal = computeSubtotal(items);
  const total = Math.max(subtotal - discount, 0);
  const esCredito = paymentMethod === "credito" && permitirCredito;
  const totalItems = items.reduce((sum, i) => sum + i.qty, 0);

  const metodosPagoPrincipal: PaymentMethodOption<PaymentMethod>[] = [
    { value: "efectivo", label: "Efectivo", Icon: Banknote },
    { value: "tarjeta", label: "Tarjeta", Icon: CreditCard },
    { value: "transferencia", label: "Transferencia", Icon: Landmark },
    { value: "nequi", label: "Nequi", Icon: Smartphone },
    { value: "daviplata", label: "Daviplata", Icon: Smartphone },
    ...(permitirCredito
      ? [{ value: "credito" as PaymentMethod, label: "Crédito", Icon: Wallet }]
      : []),
  ];

  const handleAdd = (item: LocalCartItem) => {
    setItems((prev) => mergeCartItem(prev, item));
  };

  const handleUpdateQty = (productId: string, variantId: string | null, qty: number) => {
    setItems((prev) => updateItemQty(prev, productId, variantId, qty));
  };

  const handleRemove = (productId: string, variantId: string | null) => {
    setItems((prev) => removeItem(prev, productId, variantId));
  };

  const handleSubmit = () => {
    setError(null);

    if (esCredito) {
      if (!cliente) {
        setError("Selecciona el cliente para la venta a crédito.");
        return;
      }
      if (numCuotas < 1) {
        setError("El número de cuotas debe ser al menos 1.");
        return;
      }
      if (abonoInicial > 0 && !abonoInicialMetodo) {
        setError("Selecciona el método de pago del abono inicial.");
        return;
      }
    }

    startSubmit(async () => {
      const credito: CreditoVentaInput | null = esCredito
        ? {
            numCuotas,
            abonoInicial,
            abonoInicialMetodo: abonoInicialMetodo || null,
          }
        : null;
      const result = await onGuardar(items, paymentMethod, discount, credito, cliente?.id ?? null);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <div className="grid gap-8 md:grid-cols-2">
        <div className={mobileVistaDoble && mostrandoCarritoMovil ? "hidden md:block" : "block"}>
          <ProductBrowser onAdd={handleAdd} />
        </div>

        <div
          className={`flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm ${
            mobileVistaDoble && !mostrandoCarritoMovil ? "hidden md:flex" : "flex"
          }`}
        >
          {mobileVistaDoble && (
            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={() => setMostrandoCarritoMovil(false)}
                aria-label="Volver a productos"
                className="rounded-md p-1 text-brand-ciruela hover:bg-brand-rosa-claro/30"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="font-heading text-xl text-brand-ciruela">Carrito de Compra</h2>
            </div>
          )}
          <h2
            className={`font-heading text-xl text-brand-ciruela ${
              mobileVistaDoble ? "hidden md:block" : ""
            }`}
          >
            Venta actual
          </h2>
          {items.length === 0 ? (
            <p className="text-sm text-brand-ciruela/60">
              Todavía no hay productos en la venta.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-brand-rosa-claro">
              {items.map((item) => (
                <div
                  key={`${item.productId}-${item.variantId ?? "base"}`}
                  className="flex items-center gap-2 py-2"
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
                    {item.imageUrl && (
                      <Image src={item.imageUrl} alt={item.name} fill className="object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-brand-ciruela">{item.name}</p>
                    <p className="text-xs text-brand-ciruela/60">{formatPrice(item.unitPrice)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty - 1)}
                    className="h-11 w-11 shrink-0 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-sm">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty + 1)}
                    className="h-11 w-11 shrink-0 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.productId, item.variantId)}
                    className="ml-2 text-sm text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          {mostrarDescuento && (
            <div>
              <label htmlFor="discount" className="text-sm text-brand-ciruela">
                Descuento (pesos)
              </label>
              <Input
                id="discount"
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          )}

          {mostrarMetodoPago && (
            <div>
              <label className="text-sm text-brand-ciruela">Método de pago</label>
              <PaymentMethodPicker
                options={metodosPagoPrincipal}
                value={paymentMethod}
                onChange={setPaymentMethod}
                groupLabel="Método de pago"
              />
            </div>
          )}

          {mostrarCliente && (
            <ClienteSelector
              cliente={cliente}
              onChange={setCliente}
              requerido={esCredito}
            />
          )}

          {esCredito && (
            <div className="flex flex-col gap-3 rounded-md border border-brand-oro/50 bg-brand-oro/10 p-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brand-ciruela" />
                <p className="text-sm font-semibold text-brand-ciruela">Datos del crédito</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="numCuotas" className="text-sm text-brand-ciruela">
                    Número de cuotas
                  </label>
                  <Input
                    id="numCuotas"
                    type="number"
                    min={1}
                    value={numCuotas}
                    onChange={(e) => setNumCuotas(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div>
                  <label htmlFor="abonoInicial" className="text-sm text-brand-ciruela">
                    Abono inicial (opcional)
                  </label>
                  <Input
                    id="abonoInicial"
                    type="number"
                    min={0}
                    value={abonoInicial}
                    onChange={(e) => setAbonoInicial(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              </div>
              {abonoInicial > 0 && (
                <div>
                  <label className="text-sm text-brand-ciruela">
                    Método de pago del abono inicial
                  </label>
                  <PaymentMethodPicker
                    options={METODOS_ABONO_OPTIONS}
                    value={abonoInicialMetodo}
                    onChange={setAbonoInicialMetodo}
                    compact
                    groupLabel="Método de pago del abono inicial"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-brand-rosa-claro pt-3 text-sm text-brand-ciruela">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {mostrarDescuento && (
              <div className="flex justify-between">
                <span>Descuento</span>
                <span>-{formatPrice(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-heading text-lg text-brand-rosa">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={items.length === 0 || isSubmitting}
            className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
          >
            {isSubmitting ? textoBotonEnviando : textoBoton}
          </Button>
        </div>
      </div>
      {mobileVistaDoble && items.length > 0 && !mostrandoCarritoMovil && (
        <button
          type="button"
          onClick={() => setMostrandoCarritoMovil(true)}
          aria-label={`Ver carrito (${totalItems} ${totalItems === 1 ? "producto" : "productos"})`}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-rosa text-brand-crema shadow-lg md:hidden"
        >
          <ShoppingCart className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-oro text-xs font-semibold text-brand-crema">
            {totalItems}
          </span>
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 2: Activar `mobileVistaDoble` en la terminal POS**

Reemplazar `src/app/pos/(admin)/pos-terminal.tsx` completo:

```tsx
"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import { registrarVenta } from "@/app/pos/sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount, credito, customerId) =>
        registrarVenta(items, paymentMethod, discount, credito, customerId)
      }
    />
  );
}
```

por:

```tsx
"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import { registrarVenta } from "@/app/pos/sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      mobileVistaDoble
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount, credito, customerId) =>
        registrarVenta(items, paymentMethod, discount, credito, customerId)
      }
    />
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx "src/app/pos/(admin)/pos-terminal.tsx"
git commit -m "feat: patron de dos pantallas (productos/carrito) en la terminal POS movil"
```

---

### Task 9: Verificación final

**Files:** Ninguno (solo verificación).

**Interfaces:** Ninguna.

- [ ] **Step 1: Verificar que compila todo el repo**

Run: `pnpm tsc --noEmit`
Expected: sin errores en todo el repo.

- [ ] **Step 2: Correr la suite completa**

Run: `pnpm vitest run`
Expected: todos los tests pasan (incluye los 2 nuevos de `listarCategoriasPos` y los 2 nuevos de `BackendSidebar`). Si ves fallos EXCLUSIVAMENTE en archivos no tocados por este plan relacionados con timeouts bajo ejecución paralela completa, es flakiness preexistente del entorno ya documentada en el sub-proyecto 3 — repórtalo igual, pero no es bloqueante. Cualquier fallo en un archivo que este plan creó o modificó SÍ es tu responsabilidad.

- [ ] **Step 3: Verificar el build de producción**

Antes de correr `pnpm build`, detener cualquier `pnpm dev` corriendo en este worktree (`tasklist /FI "IMAGENAME eq node.exe"`, mismo patrón usado en los sub-proyectos anteriores).

Run: `pnpm build`
Expected: build exitoso, incluyendo las rutas `/pos`, `/pos/ventas`, `/pos/clientes`, `/pos/venta/[id]/editar`, y `/admin/pedidos/[id]/editar` (todos los consumidores tocados por este plan).

- [ ] **Step 4: Commit final (si algo quedó pendiente)**

Si los 3 pasos anteriores pasaron limpio sin cambios de código, no hay nada que commitear en esta tarea — repórtalo como DONE sin commit nuevo. Si tuviste que corregir algo para que pasaran, haz commit de esa corrección con un mensaje descriptivo.

---

## Nota de verificación manual (no automatizable en esta sesión)

Igual que los sub-proyectos 1-4: `/pos/**` requiere sesión autenticada de `staff`/`admin`/`superadmin`, y el manejo en texto plano de la contraseña del superadmin está prohibido en esta sesión. La verificación visual final — que la barra inferior, el header condensado, el patrón de dos pantallas del carrito, las miniaturas de categoría, la grilla de pago responsiva, y los atributos de accesibilidad se vean y funcionen como se espera en un dispositivo/viewport móvil real — la hace el usuario en el preview desplegado, idealmente con las herramientas de emulación móvil del navegador o un teléfono real.
