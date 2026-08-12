# Pulido visual de Admin y POS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar `shadow-brand-sm`/`hover:shadow-brand-md` (tokens ya
existentes desde la Fase A) a las 23 tarjetas "a mano" del proyecto que
quedaron sin sombra de marca, y envolver las dos columnas del POS en
el mismo estilo de tarjeta que usa el resto del admin.

**Architecture:** Cambios de clases Tailwind puntuales sobre JSX ya
existente — ningún componente nuevo, ninguna lógica nueva. Mismo
patrón mecánico ya usado en la Fase C.

**Tech Stack:** Next.js App Router, Tailwind v4.

## Global Constraints

- Sin cambios de comportamiento, datos, lógica ni tipografía/paleta —
  solo clases CSS/Tailwind.
- Cada tarjeta existente gana `shadow-brand-sm`; las que además son un
  `<Link>` clickeable ganan también `hover:shadow-brand-md` (sin
  quitar el `hover:border-brand-rosa` que ya tengan).
- El POS gana el estilo de tarjeta en sus dos columnas sin cambiar
  ningún contenido ni lógica de `pos-terminal.tsx`.

---

## Task 1: Sombra de marca en las 23 tarjetas existentes

**Files:**
- Modify: `src/app/admin/page.tsx` (4 ocurrencias)
- Modify: `src/app/admin/compras/compra-form.tsx` (1 ocurrencia)
- Modify: `src/app/admin/informes/compras/page.tsx` (1 ocurrencia)
- Modify: `src/app/admin/informes/gastos/page.tsx` (1 ocurrencia)
- Modify: `src/app/admin/informes/ventas/page.tsx` (3 ocurrencias)
- Modify: `src/app/admin/informes/ganancia/page.tsx` (4 ocurrencias)
- Modify: `src/app/admin/informes/metodos-pago/page.tsx` (1 ocurrencia)
- Modify: `src/app/admin/informes/page.tsx` (1 ocurrencia)
- Modify: `src/app/admin/gastos/page.tsx` (1 ocurrencia)
- Modify: `src/app/admin/pedidos/[id]/page.tsx` (2 ocurrencias)
- Modify: `src/app/pos/venta/[id]/page.tsx` (1 ocurrencia)
- Modify: `src/app/(store)/cuenta/pedidos/[id]/page.tsx` (2 ocurrencias)
- Modify: `src/app/(store)/checkout/page.tsx` (1 ocurrencia)

**Interfaces:**
- Consumes: tokens `shadow-brand-sm`/`shadow-brand-md` (ya existentes
  desde la Fase A, `src/app/globals.css`).
- Produces: nada consumido por otra task de este plan.

Cada fila de la tabla siguiente es una ocurrencia exacta: busca el
texto "Antes" (coincide con una sola línea en el archivo indicado) y
reemplázalo por el texto "Después". No cambies nada más de ningún
archivo.

- [ ] **Step 1: `src/app/admin/page.tsx` (4 ocurrencias)**

Antes (línea 74):
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

Antes (línea 86, dentro de un `<Link>`):
```
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 hover:border-brand-rosa"
```
Después:
```
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm hover:border-brand-rosa hover:shadow-brand-md"
```

Antes (línea 96, dentro de un `<Link>` — mismo texto que la línea 86,
es la SEGUNDA ocurrencia de esa cadena exacta en el archivo, aplica el
mismo reemplazo):
```
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 hover:border-brand-rosa"
```
Después:
```
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm hover:border-brand-rosa hover:shadow-brand-md"
```

Antes (línea 106):
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después (es la SEGUNDA ocurrencia de esta cadena exacta en el archivo,
la primera es la línea 74 ya reemplazada arriba):
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 2: `src/app/admin/compras/compra-form.tsx` (1 ocurrencia)**

Antes (línea 192):
```
      <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
      <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 3: `src/app/admin/informes/compras/page.tsx` (1 ocurrencia)**

Antes (línea 68):
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 4: `src/app/admin/informes/gastos/page.tsx` (1 ocurrencia)**

Antes (línea 68):
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 5: `src/app/admin/informes/ventas/page.tsx` (3 ocurrencias)**

Las líneas 52, 58 y 64 son las tres idénticas:
```
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Reemplaza las TRES ocurrencias por:
```
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 6: `src/app/admin/informes/ganancia/page.tsx` (4 ocurrencias)**

Las líneas 58, 64, 72 y 78 son las cuatro idénticas:
```
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Reemplaza las CUATRO ocurrencias por:
```
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 7: `src/app/admin/informes/metodos-pago/page.tsx` (1 ocurrencia)**

Antes (línea 44):
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 8: `src/app/admin/informes/page.tsx` (1 ocurrencia)**

Antes (línea 66, dentro de un `<Link>`):
```
            className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4 hover:border-brand-rosa"
```
Después:
```
            className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm hover:border-brand-rosa hover:shadow-brand-md"
```

- [ ] **Step 9: `src/app/admin/gastos/page.tsx` (1 ocurrencia)**

Antes (línea 111):
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 10: `src/app/admin/pedidos/[id]/page.tsx` (2 ocurrencias)**

Antes (línea 59):
```
      <div className="flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
      <div className="flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

Antes (línea 86):
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 text-sm text-brand-ciruela">
```
Después:
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 text-sm text-brand-ciruela shadow-brand-sm">
```

- [ ] **Step 11: `src/app/pos/venta/[id]/page.tsx` (1 ocurrencia)**

Antes (línea 53):
```
        className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-6"
```
Después:
```
        className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-6 shadow-brand-sm"
```

- [ ] **Step 12: `src/app/(store)/cuenta/pedidos/[id]/page.tsx` (2 ocurrencias)**

Antes (línea 65):
```
      <div className="mb-8 flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
      <div className="mb-8 flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

Antes (línea 81):
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 text-sm text-brand-ciruela">
```
Después:
```
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 text-sm text-brand-ciruela shadow-brand-sm">
```

- [ ] **Step 13: `src/app/(store)/checkout/page.tsx` (1 ocurrencia)**

Antes (línea 51):
```
      <div className="mb-8 flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4">
```
Después:
```
      <div className="mb-8 flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
```

- [ ] **Step 14: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 15: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/compras/compra-form.tsx "src/app/admin/informes/compras/page.tsx" "src/app/admin/informes/gastos/page.tsx" "src/app/admin/informes/ventas/page.tsx" "src/app/admin/informes/ganancia/page.tsx" "src/app/admin/informes/metodos-pago/page.tsx" src/app/admin/informes/page.tsx src/app/admin/gastos/page.tsx "src/app/admin/pedidos/[id]/page.tsx" "src/app/pos/venta/[id]/page.tsx" "src/app/(store)/cuenta/pedidos/[id]/page.tsx" "src/app/(store)/checkout/page.tsx"
git commit -m "fix: agrega sombra de marca a las tarjetas de admin, POS y tienda que quedaron sin ella"
```

---

## Task 2: Tarjetas en las columnas del POS

**Files:**
- Modify: `src/app/pos/pos-terminal.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada consumido por otra task de este plan.

- [ ] **Step 1: Envolver la columna "Buscar producto"**

En `src/app/pos/pos-terminal.tsx`, busca:

```tsx
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-xl text-brand-ciruela">Buscar producto</h2>
```

Reemplázalo por:

```tsx
      <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        <h2 className="font-heading text-xl text-brand-ciruela">Buscar producto</h2>
```

- [ ] **Step 2: Envolver la columna "Venta actual"**

En el mismo archivo, busca:

```tsx
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-xl text-brand-ciruela">Venta actual</h2>
```

Reemplázalo por:

```tsx
      <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        <h2 className="font-heading text-xl text-brand-ciruela">Venta actual</h2>
```

No cambies nada más de este archivo — el resto del contenido de ambas
columnas (búsqueda, resultados, lista de ítems, descuento, método de
pago, totales, botón de registrar venta) queda exactamente igual,
ahora dentro de la tarjeta.

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/pos/pos-terminal.tsx
git commit -m "fix: envuelve las columnas del POS en tarjetas con sombra de marca"
```

---

## Task 3: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-2.

- [ ] **Step 1: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 (Windows) y arranca uno limpio con `pnpm dev`
en segundo plano si hace falta.

- [ ] **Step 2: Verificar que las páginas responden**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pos
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/checkout
```

Expected: `/admin` y `/pos` devuelven `307`/`302` (redirigen a login
sin sesión); `/checkout` devuelve `200` o redirige según la lógica ya
existente de carrito vacío — en cualquier caso, ninguno debe devolver
`500`.

- [ ] **Step 3: Confirmar que las 23 ocurrencias quedaron con sombra**

```bash
grep -c "shadow-brand-sm" src/app/admin/page.tsx src/app/admin/compras/compra-form.tsx "src/app/admin/informes/compras/page.tsx" "src/app/admin/informes/gastos/page.tsx" "src/app/admin/informes/ventas/page.tsx" "src/app/admin/informes/ganancia/page.tsx" "src/app/admin/informes/metodos-pago/page.tsx" src/app/admin/informes/page.tsx src/app/admin/gastos/page.tsx "src/app/admin/pedidos/[id]/page.tsx" "src/app/pos/venta/[id]/page.tsx" "src/app/(store)/cuenta/pedidos/[id]/page.tsx" "src/app/(store)/checkout/page.tsx"
```

Expected: `admin/page.tsx` con `4`, `informes/ventas/page.tsx` con
`3`, `informes/ganancia/page.tsx` con `4`, `admin/pedidos/[id]/page.tsx`
con `2`, `(store)/cuenta/pedidos/[id]/page.tsx` con `2`, el resto con
`1` cada uno.

```bash
grep -c "shadow-brand-sm" src/app/pos/pos-terminal.tsx
```

Expected: `2`.

- [ ] **Step 4: Detener el servidor**

Detener el servidor de desarrollo si se levantó en el Step 1.

- [ ] **Step 5: Nota para el reporte final**

Deja anotado en tu reporte que la verificación visual completa
(confirmar que las tarjetas del admin, informes, POS y checkout se ven
con sombra de marca de forma coherente) no se hizo de forma interactiva
en navegador — recomienda al usuario ese recorrido manual.

No hay commit en esta tarea (es solo verificación).

---

## Cierre

Al completar la Task 3, invocar `superpowers:finishing-a-development-branch`
sobre la rama de este ajuste (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
