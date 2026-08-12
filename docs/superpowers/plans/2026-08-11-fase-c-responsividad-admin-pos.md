# Rediseño — Fase C: Responsividad funcional en Admin y POS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los tres problemas de responsividad ya identificados
desde la Fase A: tablas de admin que se desbordan en móvil, dos
formularios con grid de columnas fijo, y botones táctiles pequeños en
el POS. Última fase del ciclo de rediseño (A → B1/B2/B3 → C), sin
cambios de comportamiento, datos ni contenido.

**Architecture:** Cambios de clases Tailwind puntuales sobre JSX ya
existente — ningún componente nuevo, ninguna lógica nueva. Las 16
páginas de tablas del admin comparten exactamente el mismo patrón de
apertura (`<table className="w-full border-collapse text-sm">`,
verificado con búsqueda en todo el proyecto), así que reciben el mismo
tratamiento mecánico. Los dos formularios con grid fijo ganan un
breakpoint `sm:` que los apila en una columna en móvil. El POS sube el
tamaño de sus botones de cantidad al mínimo táctil recomendado.

**Tech Stack:** Next.js App Router (Server + Client Components),
Tailwind v4.

## Global Constraints

- Sin cambios de comportamiento, datos, validación ni contenido visual
  — solo clases CSS/Tailwind sobre JSX ya existente.
- Sin cambios de paleta, tipografía ni componentes nuevos — esta fase
  es exclusivamente de responsividad funcional.
- Cada tabla de admin recibe exactamente el mismo tratamiento
  (envolver en `<div className="overflow-x-auto">`), preservando la
  indentación propia de cada archivo — no se reformatea nada más de
  esos archivos.

---

## Task 1: Scroll horizontal en las 16 tablas de admin

**Files:**
- Modify: `src/app/admin/categorias/page.tsx`
- Modify: `src/app/admin/productos/page.tsx`
- Modify: `src/app/admin/pedidos/page.tsx`
- Modify: `src/app/admin/gastos/page.tsx`
- Modify: `src/app/admin/gastos/categorias/page.tsx`
- Modify: `src/app/admin/compras/page.tsx`
- Modify: `src/app/admin/compras/proveedores/page.tsx`
- Modify: `src/app/admin/resenas/page.tsx`
- Modify: `src/app/admin/informes/ventas/page.tsx`
- Modify: `src/app/admin/informes/productos/page.tsx`
- Modify: `src/app/admin/informes/gastos/page.tsx`
- Modify: `src/app/admin/informes/ganancia/page.tsx`
- Modify: `src/app/admin/informes/compras/page.tsx`
- Modify: `src/app/admin/informes/metodos-pago/page.tsx`
- Modify: `src/app/admin/informes/stock-bajo/page.tsx`
- Modify: `src/app/superadmin/usuarios/page.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada consumido por otra task de este plan.

Los 16 archivos listados arriba contienen, cada uno, exactamente UN
elemento `<table className="w-full border-collapse text-sm">...</table>`
(confirmado con búsqueda de `<table` en todo `src/app`, cada archivo
aparece con exactamente un par apertura/cierre). La transformación es
idéntica y mecánica en los 16: envolver ese elemento `<table>` completo
(incluyendo su `<thead>` y `<tbody>`) en
`<div className="overflow-x-auto">...</div>`, preservando la
indentación que ya usa cada archivo (algunos indentan la tabla con 6
espacios, otros con 8 o 10, según su nivel de anidamiento — el `<div>`
nuevo va en ese mismo nivel, y el contenido de la tabla se indenta un
nivel más). No se cambia nada más de ningún archivo: encabezados,
botones, lógica de datos, imports, todo permanece igual.

- [ ] **Step 1: Ejemplo completo de referencia — `src/app/admin/categorias/page.tsx`**

Antes (líneas 25-57 del archivo):

```tsx
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
            <th className="py-2">Nombre</th>
            <th className="py-2">Slug</th>
            <th className="py-2">Orden</th>
            <th className="py-2">Activa</th>
            <th className="py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {categorias?.map((categoria) => (
            <tr key={categoria.id} className="border-b border-brand-rosa-claro/50">
              <td className="py-2">{categoria.name}</td>
              <td className="py-2 text-brand-ciruela/70">{categoria.slug}</td>
              <td className="py-2">{categoria.sort_order}</td>
              <td className="py-2">{categoria.is_active ? "Sí" : "No"}</td>
              <td className="flex gap-3 py-2">
                <Link
                  href={`/admin/categorias/${categoria.id}/editar`}
                  className="text-brand-rosa hover:underline"
                >
                  Editar
                </Link>
                <ToggleCategoriaButton
                  id={categoria.id}
                  isActive={categoria.is_active}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
```

Después (misma indentación exterior, todo el contenido de la tabla
sube un nivel):

```tsx
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Nombre</th>
              <th className="py-2">Slug</th>
              <th className="py-2">Orden</th>
              <th className="py-2">Activa</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {categorias?.map((categoria) => (
              <tr key={categoria.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{categoria.name}</td>
                <td className="py-2 text-brand-ciruela/70">{categoria.slug}</td>
                <td className="py-2">{categoria.sort_order}</td>
                <td className="py-2">{categoria.is_active ? "Sí" : "No"}</td>
                <td className="flex gap-3 py-2">
                  <Link
                    href={`/admin/categorias/${categoria.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleCategoriaButton
                    id={categoria.id}
                    isActive={categoria.is_active}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
```

Aplica este mismo cambio a `src/app/admin/categorias/page.tsx`.

- [ ] **Step 2: Aplicar el mismo cambio a los otros 15 archivos**

Para cada uno de los siguientes archivos, localiza su único
`<table className="w-full border-collapse text-sm">...</table>` y
aplícale exactamente la misma transformación del Step 1 (envolver en
`<div className="overflow-x-auto">`, indentar el contenido un nivel
más, preservar la indentación exterior propia del archivo, no tocar
nada más):

- `src/app/admin/productos/page.tsx`
- `src/app/admin/pedidos/page.tsx`
- `src/app/admin/gastos/page.tsx`
- `src/app/admin/gastos/categorias/page.tsx`
- `src/app/admin/compras/page.tsx`
- `src/app/admin/compras/proveedores/page.tsx`
- `src/app/admin/resenas/page.tsx`
- `src/app/admin/informes/ventas/page.tsx`
- `src/app/admin/informes/productos/page.tsx`
- `src/app/admin/informes/gastos/page.tsx`
- `src/app/admin/informes/ganancia/page.tsx`
- `src/app/admin/informes/compras/page.tsx`
- `src/app/admin/informes/metodos-pago/page.tsx`
- `src/app/admin/informes/stock-bajo/page.tsx`
- `src/app/superadmin/usuarios/page.tsx`

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/categorias/page.tsx src/app/admin/productos/page.tsx src/app/admin/pedidos/page.tsx src/app/admin/gastos/page.tsx "src/app/admin/gastos/categorias/page.tsx" src/app/admin/compras/page.tsx "src/app/admin/compras/proveedores/page.tsx" src/app/admin/resenas/page.tsx "src/app/admin/informes/ventas/page.tsx" "src/app/admin/informes/productos/page.tsx" "src/app/admin/informes/gastos/page.tsx" "src/app/admin/informes/ganancia/page.tsx" "src/app/admin/informes/compras/page.tsx" "src/app/admin/informes/metodos-pago/page.tsx" "src/app/admin/informes/stock-bajo/page.tsx" src/app/superadmin/usuarios/page.tsx
git commit -m "fix: agrega scroll horizontal a las tablas del admin en pantallas angostas"
```

---

## Task 2: Grid responsivo en `compra-form.tsx` y variantes de `producto-form.tsx`

**Files:**
- Modify: `src/app/admin/compras/compra-form.tsx`
- Modify: `src/app/admin/productos/producto-form.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada consumido por otra task de este plan.

- [ ] **Step 1: Editar `compra-form.tsx`**

En `src/app/admin/compras/compra-form.tsx`, busca la línea (dentro del
`.map` de `fields`, el contenedor de cada fila de ítem de compra):

```tsx
              className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] items-end gap-3 rounded-md border border-brand-rosa-claro p-3"
```

Reemplázala por:

```tsx
              className="grid grid-cols-1 items-end gap-3 rounded-md border border-brand-rosa-claro p-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]"
```

No cambies nada más de ese archivo.

- [ ] **Step 2: Editar `producto-form.tsx`**

En `src/app/admin/productos/producto-form.tsx`, busca la línea (dentro
del `.map` de `fields` de variantes, el contenedor de cada fila de
variante):

```tsx
            className="grid grid-cols-4 items-end gap-2 rounded-md border border-brand-rosa-claro p-3"
```

Reemplázala por:

```tsx
            className="grid grid-cols-2 items-end gap-2 rounded-md border border-brand-rosa-claro p-3 sm:grid-cols-4"
```

No cambies nada más de ese archivo.

- [ ] **Step 3: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos. Presta atención especial a
`src/app/admin/productos/__tests__/producto-form.test.tsx` (el único
test de renderizado de componente del proyecto) — no debería verse
afectado porque no depende de clases exactas de grid, solo de roles y
texto.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/compras/compra-form.tsx src/app/admin/productos/producto-form.tsx
git commit -m "fix: grid responsivo en compra-form y variantes de producto-form"
```

---

## Task 3: Botones táctiles en el POS

**Files:**
- Modify: `src/app/pos/pos-terminal.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada consumido por otra task de este plan.

- [ ] **Step 1: Editar los botones de cantidad**

En `src/app/pos/pos-terminal.tsx`, busca las dos ocurrencias de esta
clase (una en el botón "-", otra en el botón "+", ambas dentro de la
lista de ítems de "Venta actual"):

```tsx
                  className="h-7 w-7 rounded-md border border-brand-rosa-claro text-brand-ciruela"
```

Reemplaza AMBAS ocurrencias por:

```tsx
                  className="h-11 w-11 rounded-md border border-brand-rosa-claro text-brand-ciruela"
```

No cambies nada más de ese archivo (los `<select>` de
`product-search-result.tsx`, el botón "Agregar" compartido, y el resto
del layout del POS quedan iguales — ya usan el componente `Button`
compartido con tamaño adecuado desde la Fase A).

- [ ] **Step 2: Verificar build, lint y tests**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 3: Commit**

```bash
git add src/app/pos/pos-terminal.tsx
git commit -m "fix: botones de cantidad mas grandes en el POS para uso tactil"
```

---

## Task 4: Verificación de integración

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-3.

- [ ] **Step 1: Confirmar que no hay un servidor de desarrollo obsoleto**

Verifica el puerto 3000 (Windows) y arranca uno limpio con `pnpm dev`
en segundo plano si hace falta.

- [ ] **Step 2: Verificar que las páginas de admin siguen respondiendo**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/categorias
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/productos
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pos
```

Expected: `307` o `302` en los tres (redirigen a login sin sesión —
confirma que las rutas siguen protegidas y responden sin error 500
tras los cambios).

- [ ] **Step 3: Confirmar en código que las 16 tablas quedaron envueltas**

```bash
grep -c "overflow-x-auto" src/app/admin/categorias/page.tsx src/app/admin/productos/page.tsx src/app/admin/pedidos/page.tsx src/app/admin/gastos/page.tsx "src/app/admin/gastos/categorias/page.tsx" src/app/admin/compras/page.tsx "src/app/admin/compras/proveedores/page.tsx" src/app/admin/resenas/page.tsx "src/app/admin/informes/ventas/page.tsx" "src/app/admin/informes/productos/page.tsx" "src/app/admin/informes/gastos/page.tsx" "src/app/admin/informes/ganancia/page.tsx" "src/app/admin/informes/compras/page.tsx" "src/app/admin/informes/metodos-pago/page.tsx" "src/app/admin/informes/stock-bajo/page.tsx" src/app/superadmin/usuarios/page.tsx
```

Expected: cada archivo listado con `:1` (una sola ocurrencia de
`overflow-x-auto`) — si alguno aparece con `:0`, esa Task 1 quedó
incompleta y hay que corregirla antes de continuar.

- [ ] **Step 4: Detener el servidor**

Detener el servidor de desarrollo si se levantó en el Step 1.

- [ ] **Step 5: Nota para el reporte final**

Deja anotado en tu reporte que la verificación visual completa
(achicar la ventana del navegador o usar las herramientas de
dispositivo móvil para confirmar que las tablas se desplazan
horizontalmente en vez de romper el layout, que los formularios de
compra/variantes se apilan en una columna en móvil, y que los botones
de cantidad del POS son más fáciles de tocar) no se hizo de forma
interactiva en navegador — recomienda al usuario ese recorrido manual,
igual que en fases anteriores de este proyecto. Esta es la última fase
del ciclo completo de rediseño (A, B1, B2, B3, C) — señálalo en el
reporte.

No hay commit en esta tarea (es solo verificación).

---

## Cierre de fase

Al completar la Task 4, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir. Con esto
se cierra el ciclo completo de rediseño iniciado en la Fase A.
