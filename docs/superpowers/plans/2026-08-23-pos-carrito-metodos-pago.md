# Rediseño POS — Carrito y métodos de pago (sub-proyecto 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el `<select>` de método de pago por botones-ícono, mostrar una miniatura de imagen en cada línea del carrito, y dar al bloque de crédito un tratamiento visual propio — todo dentro del componente compartido `VentaItemsEditor`, sin cambiar lógica de negocio.

**Architecture:** Un nuevo componente presentacional y genérico `PaymentMethodPicker` (grilla de 3 columnas, ícono + etiqueta, controlado vía `value`/`onChange`) se reutiliza para el método de pago principal (6 opciones) y para el método del abono inicial dentro del bloque de crédito (5 opciones, variante `compact`). El resto de los cambios modifican directamente `venta-items-editor.tsx`: la fila de cada línea del carrito gana una miniatura, y el bloque de crédito gana un encabezado con ícono y una grilla de 2 columnas para sus inputs. Ningún cambio toca `onGuardar`, RPCs, ni server actions.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, lucide-react para íconos, `next/image` para las miniaturas.

**Spec:** `docs/superpowers/specs/2026-08-23-pos-carrito-metodos-pago-design.md`

## Global Constraints

- Cambio puramente visual/de interacción: no se modifica el contrato de `onGuardar`, ningún RPC, ni ninguna server action.
- Íconos lucide-react por método (verificados en la versión instalada): efectivo → `Banknote`, tarjeta → `CreditCard`, transferencia → `Landmark`, nequi → `Smartphone`, daviplata → `Smartphone`, crédito → `Wallet`.
- Grilla de botones de método de pago: siempre `grid grid-cols-3 gap-2`, tanto para 6 opciones (método principal) como para 5 (abono inicial).
- Miniatura de línea de carrito: 44×44px (`h-11 w-11`), `rounded-md`, `overflow-hidden`, fondo `bg-brand-rosa-claro`; si `item.imageUrl` es `null` se muestra solo el fondo, sin ícono ni texto "Sin imagen" (mismo criterio ya usado en `ProductCardPos` del sub-proyecto 3).
- El bloque de crédito conserva exactamente la misma lógica y validaciones (`numCuotas`, `abonoInicial`, `abonoInicialMetodo`, las validaciones de `handleSubmit`) — solo cambia el tratamiento visual.
- Aplica a los 3 consumidores de `VentaItemsEditor` vía el componente compartido; `pedido-editar-form.tsx` no requiere ningún cambio de código propio.
- Sin test unitario dedicado para `PaymentMethodPicker` ni para los cambios visuales en `venta-items-editor.tsx` — mismo criterio ya usado para `ProductCardPos`/`ProductBrowser` en el sub-proyecto 3 (componentes presentacionales/de interacción sin lógica de negocio propia).
- Verificación final: `pnpm tsc --noEmit` y `pnpm build` deben pasar limpio en todo el repo (cubre los 3 consumidores, incluido `pedido-editar-form.tsx`, que no se modifica pero debe seguir compilando).

---

### Task 1: `PaymentMethodPicker` (componente reutilizable)

**Files:**
- Create: `src/app/pos/payment-method-picker.tsx`

**Interfaces:**
- Produces: `type PaymentMethodOption<T extends string> = { value: T; label: string; Icon: LucideIcon }`;
  `PaymentMethodPicker<T extends string>({ options: PaymentMethodOption<T>[]; value: T | ""; onChange: (value: T) => void; compact?: boolean })` — usado por la Task 3 (método de pago principal) y la Task 4 (método del abono inicial).

- [ ] **Step 1: Crear el componente**

Crear `src/app/pos/payment-method-picker.tsx`:

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
}: {
  options: PaymentMethodOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(({ value: optionValue, label, Icon }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
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

No lleva test dedicado (componente presentacional puramente controlado,
mismo criterio ya usado en `ProductCardPos`/`ProductBrowser` en el
sub-proyecto 3 — sin test unitario propio).

- [ ] **Step 2: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos en este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/app/pos/payment-method-picker.tsx
git commit -m "feat: componente PaymentMethodPicker para botones-icono de metodo de pago"
```

---

### Task 2: Miniatura en cada línea del carrito

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx`

**Interfaces:**
- Consumes: `LocalCartItem.imageUrl` (`@/lib/cart/local-cart`, ya existente — poblado correctamente desde el sub-proyecto 3).

- [ ] **Step 1: Agregar el import de `next/image`**

En `src/app/pos/venta-items-editor.tsx`, agregar esta línea junto a los
demás imports (después de `import { Input } from "@/components/ui/input";`):

```tsx
import Image from "next/image";
```

- [ ] **Step 2: Agregar la miniatura a cada línea del carrito**

Reemplazar este bloque (dentro de `items.map((item) => (...))`):

```tsx
            {items.map((item) => (
              <div
                key={`${item.productId}-${item.variantId ?? "base"}`}
                className="flex items-center gap-2 py-2"
              >
                <div className="flex-1">
                  <p className="text-sm text-brand-ciruela">{item.name}</p>
                  <p className="text-xs text-brand-ciruela/60">{formatPrice(item.unitPrice)}</p>
                </div>
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
                <div className="flex-1">
                  <p className="text-sm text-brand-ciruela">{item.name}</p>
                  <p className="text-xs text-brand-ciruela/60">{formatPrice(item.unitPrice)}</p>
                </div>
```

(El resto del bloque — los botones `-`/`+`/cantidad/"Quitar" — no cambia.)

- [ ] **Step 3: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx
git commit -m "feat: miniatura de imagen en cada linea del carrito del POS"
```

---

### Task 3: Integrar `PaymentMethodPicker` en el método de pago principal

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx`

**Interfaces:**
- Consumes: `PaymentMethodPicker`, `PaymentMethodOption` (Task 1).
- Produces: constante `metodosPagoPrincipal: PaymentMethodOption<PaymentMethod>[]` (dentro del componente, depende de la prop `permitirCredito`) — no se reutiliza fuera de esta tarea.

- [ ] **Step 1: Agregar los imports de íconos y del picker**

Agregar estas líneas junto a los demás imports en
`src/app/pos/venta-items-editor.tsx` (después del import de
`next/image` agregado en la Task 2):

```tsx
import { Banknote, CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import { PaymentMethodPicker, type PaymentMethodOption } from "./payment-method-picker";
```

- [ ] **Step 2: Definir `metodosPagoPrincipal` dentro del componente**

Justo antes del `return (` del componente `VentaItemsEditor` (después
de la definición de `esCredito`), agregar:

```tsx
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
```

- [ ] **Step 3: Reemplazar el `<select>` de método de pago**

Reemplazar este bloque:

```tsx
        {mostrarMetodoPago && (
          <div>
            <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
              Método de pago
            </label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
              {permitirCredito && <option value="credito">Crédito</option>}
            </select>
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
            />
          </div>
        )}
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx
git commit -m "feat: botones-icono para el metodo de pago principal del POS"
```

---

### Task 4: Rediseño visual del bloque de crédito y verificación final

**Files:**
- Modify: `src/app/pos/venta-items-editor.tsx`

**Interfaces:**
- Consumes: `PaymentMethodPicker`, `PaymentMethodOption` (Task 1, ya importados por la Task 3); `Wallet`, `Banknote`, `CreditCard`, `Landmark`, `Smartphone` (ya importados por la Task 3).
- Produces: constante de módulo `METODOS_ABONO_OPTIONS: PaymentMethodOption<(typeof METODOS_ABONO)[number]>[]` — no se reutiliza fuera de esta tarea.

- [ ] **Step 1: Definir `METODOS_ABONO_OPTIONS` a nivel de módulo**

Agregar esta constante justo después de la definición existente de
`METODOS_ABONO` (`const METODOS_ABONO = [...] as const;`):

```tsx
const METODOS_ABONO_OPTIONS: PaymentMethodOption<(typeof METODOS_ABONO)[number]>[] = [
  { value: "efectivo", label: "Efectivo", Icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", Icon: CreditCard },
  { value: "transferencia", label: "Transferencia", Icon: Landmark },
  { value: "nequi", label: "Nequi", Icon: Smartphone },
  { value: "daviplata", label: "Daviplata", Icon: Smartphone },
];
```

- [ ] **Step 2: Rediseñar el bloque de crédito**

Reemplazar este bloque completo:

```tsx
        {esCredito && (
          <div className="flex flex-col gap-3 rounded-md border border-brand-oro/50 bg-brand-oro/10 p-3">
            <p className="text-sm font-semibold text-brand-ciruela">Datos del crédito</p>
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
            {abonoInicial > 0 && (
              <div>
                <label htmlFor="abonoInicialMetodo" className="text-sm text-brand-ciruela">
                  Método de pago del abono inicial
                </label>
                <select
                  id="abonoInicialMetodo"
                  value={abonoInicialMetodo}
                  onChange={(e) =>
                    setAbonoInicialMetodo(e.target.value as (typeof METODOS_ABONO)[number] | "")
                  }
                  className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
                >
                  <option value="">Selecciona un método</option>
                  {METODOS_ABONO.map((metodo) => (
                    <option key={metodo} value={metodo}>
                      {metodo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
```

por:

```tsx
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
                />
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 3: Verificar que compila y que la suite completa pasa**

Run: `pnpm tsc --noEmit`
Expected: sin errores en todo el repo.

Run: `pnpm vitest run`
Expected: todos los tests pasan (este sub-proyecto no agrega tests
nuevos; confirma que no se rompió nada existente). Si ves fallos
EXCLUSIVAMENTE en archivos fuera de `src/app/pos/` relacionados con
timeouts bajo ejecución paralela completa (ya documentado como
flakiness preexistente del entorno en el sub-proyecto 3), no es
atribuible a este cambio — repórtalo igual, pero no lo trates como
bloqueante. Cualquier fallo en `src/app/pos/**` o en archivos que este
plan modificó SÍ es tu responsabilidad.

- [ ] **Step 4: Verificar el build de producción**

Antes de correr `pnpm build`, detener cualquier `pnpm dev` corriendo
en este worktree (`tasklist /FI "IMAGENAME eq node.exe"`, mismo patrón
usado en los sub-proyectos anteriores).

Run: `pnpm build`
Expected: build exitoso, incluyendo las rutas `/pos`,
`/pos/venta/[id]/editar`, y `/admin/pedidos/[id]/editar` (los 3
consumidores de `VentaItemsEditor`).

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/venta-items-editor.tsx
git commit -m "feat: rediseno visual del bloque de credito del POS"
```

---

## Nota de verificación manual (no automatizable en esta sesión)

Igual que los sub-proyectos 1-3: `/pos/**` requiere sesión autenticada
de `staff`/`admin`/`superadmin`, y el manejo en texto plano de la
contraseña del superadmin está prohibido en esta sesión. La
verificación visual final — que la grilla de botones de pago, las
miniaturas del carrito, y el bloque de crédito rediseñado se vean y
funcionen como se espera en un navegador real, en los 3 consumidores —
la hace el usuario en el preview desplegado.
