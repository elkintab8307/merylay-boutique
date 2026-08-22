# Rediseño POS — Sub-proyecto 1: Layout y navegación

> Sub-proyecto 1 de 5 del rediseño visual del sistema POS. Los demás
> (módulo de clientes, navegación de productos, carrito/métodos de pago,
> capa móvil) tienen su propio ciclo de spec → plan → implementación,
> por separado.

## Contexto

El POS (`/pos/**`) tiene hoy una mezcla inconsistente de layouts:
`/pos/ventas`, `/pos/creditos` y `/pos/venta/[id]` viven dentro del route
group `(admin)` y por lo tanto ya usan el sidebar compartido
(`BackendSidebar`, el mismo componente que usa `/admin`). La terminal en
sí (`/pos/page.tsx`) vive **fuera** de ese grupo y se renderiza sola, sin
sidebar, con una barra ad-hoc de "Volver al panel" + título + link al
historial.

El usuario compartió dos mockups de referencia (desktop y móvil,
guardados en `d:\TRABAJOS\MARY\`) que muestran el look objetivo completo
del POS: sidebar persistente con íconos, barra superior con título,
acciones y usuario, y una barra de estado inferior. Este sub-proyecto
lleva la terminal a ese layout, cerrando además la inconsistencia
estructural descrita arriba.

Los sub-proyectos 2-5 (selector de clientes, categorías/grilla de
productos, carrito y métodos de pago, capa móvil) NO se tocan aquí.

## Decisiones de alcance (ya confirmadas con el usuario)

- **Botón "Cliente"** del mockup (top bar): **no se incluye todavía**.
  Queda para el sub-proyecto 2 (selector real de clientes), que es su
  propio módulo.
- **Botón "Imprimir"**: función real. Reimprime el último recibo
  registrado por el vendedor logueado (no un placeholder).
- **Barra de estado inferior**: mezcla simple — Vendedor y Conexión son
  reales, Fecha/Hora es reloj real del navegador, "Caja actual" es un
  texto fijo ("Caja Principal"), porque no existe (ni está planeado) un
  sistema real de múltiples cajas.
- **Notificaciones**: campanita funcional desde ya, mostrando alertas
  reales de stock bajo (reutilizando la lógica ya existente en el
  listado de productos del admin).
- **Scanner**: fuera de alcance de este sub-proyecto (pertenece al
  sub-proyecto 3, navegación de productos); no aparece en este diseño.

## Diseño

### 1. Sidebar

Se extiende `BackendSidebar` (`src/components/admin/backend-sidebar.tsx`)
para aceptar un ícono opcional por ítem, sin romper su uso actual en
`admin-nav.tsx` (que sigue sin pasar íconos):

```ts
export type SidebarSection = {
  label: string;
  items: { href: string; label: string; icon?: LucideIcon }[];
};
```

`NavLinks` renderiza el ícono (si existe) antes del label, mismo tamaño
en ambas variantes (desktop `<aside>` y drawer móvil `Sheet`), sin
cambiar la lógica de estado activo/hover existente.

`src/app/pos/(admin)/layout.tsx` pasa íconos a sus 3 ítems existentes
(ningún ítem nuevo — "Cliente" queda fuera, ver Decisiones de alcance):

| Ítem | Ícono lucide-react |
|---|---|
| Terminal | `Store` |
| Ventas POS | `Receipt` |
| Créditos | `CreditCard` |

Los tres existen en la versión de `lucide-react` instalada (se verifica
en la tarea de implementación con un import de prueba antes de usarlos
— lección de la Fase de calificaciones, donde `Facebook` no existía en
esta versión).

### 2. Mover la terminal al route group `(admin)`

`src/app/pos/page.tsx` y `src/app/pos/pos-terminal.tsx` se mueven a
`src/app/pos/(admin)/page.tsx` y `src/app/pos/(admin)/pos-terminal.tsx`
(el route group no cambia la URL: sigue siendo `/pos`). Al entrar al
grupo, la terminal hereda automáticamente `PosAdminLayout` (sidebar +
`<main>`), igual que sus hermanos `/pos/ventas` y `/pos/creditos`.

Se elimina de `page.tsx` el link ad-hoc "Volver al panel" y el `<h1>` +
"Ver historial de ventas" sueltos: esa navegación pasa a vivir en la
nueva barra superior (sección 3) y en el sidebar. El `import` de
`sale-action.ts` en `pos-terminal.tsx` no cambia (ruta relativa dentro
del mismo directorio padre `src/app/pos/`).

### 3. Barra superior (top bar)

Nuevo componente `src/components/pos/pos-top-bar.tsx`, un client
component montado dentro de `PosAdminLayout` (o directamente en
`page.tsx` de la terminal — ver Preguntas abiertas más abajo), con:

- **Título + saludo**: "Punto de Venta" y "¡Bienvenida/o, {nombre}!"
  usando `currentUser.profile.full_name` (mismo patrón ya usado en
  `getCurrentProfile()`).
- **Botón "Imprimir"**: server action `reimprimirUltimoRecibo()` que
  busca la venta más reciente de `pos_sales` con
  `staff_id = auth.uid()` (columna ya indexada,
  `pos_sales_staff_id_idx`), ordenada por `created_at desc`, límite 1.
  Si existe, navega a `/pos/venta/[id]?print=1`. Esa página ya
  renderiza el recibo y ya tiene `<PrintButton>`
  (`src/app/pos/(admin)/venta/[id]/print-button.tsx`); se le agrega un
  `useEffect` que dispara `window.print()` automáticamente cuando la
  URL trae `?print=1`, reutilizando el recibo existente en vez de
  duplicar su layout. Si el vendedor no tiene ninguna venta registrada
  aún, el botón se deshabilita (mismo criterio visual que otros botones
  deshabilitados del POS) con `title="Todavía no hay ventas registradas"`.
- **Campana de notificaciones**: `Bell` de lucide-react con badge de
  conteo. Reutiliza `obtenerUmbralStockBajo()` y `buildLowStockItems()`
  (`src/lib/admin/low-stock.ts`, ya existentes, mismos usados en
  `/admin/productos`) para traer productos/variantes con stock bajo.
  Al hacer click abre un dropdown (`shadcn` `Popover` o `DropdownMenu`,
  ya usados en el proyecto) listando cada `LowStockItem` (nombre +
  variante + stock), sin acción de "marcar como leído" (no existe ese
  concepto hoy; es solo lectura del estado real de inventario).
- **Usuario**: nombre + rol (`currentUser.profile.role`) del usuario
  logueado, sin acciones adicionales (sin dropdown de "cerrar sesión"
  aquí — eso ya vive en otro lugar del layout admin y no se duplica).

Sin botón "Cliente" (confirmado, diferido a sub-proyecto 2). Sin
"Scanner" (pertenece a sub-proyecto 3).

### 4. Barra de estado inferior

Nuevo componente `src/components/pos/pos-status-bar.tsx`, client
component, fijo al fondo de la terminal (`sticky bottom-0`, dentro de
`print:hidden` como el resto del sidebar/top bar, para que no aparezca
en el recibo impreso):

- **Caja actual**: texto fijo `"Caja Principal"`.
- **Vendedor**: nombre real del `currentUser` (recibido como prop desde
  el server component padre, mismo patrón que el top bar).
- **Fecha / Hora**: reloj real actualizado cada segundo con
  `useEffect` + `setInterval`, formateado con `toLocaleDateString("es-CO")`
  / `toLocaleTimeString("es-CO")` (mismo locale que ya usa
  `/pos/ventas`).
- **Conexión**: `navigator.onLine` leído en cliente, con listeners
  `online`/`offline` para actualizarlo en vivo; texto "En línea" /
  "Sin conexión" con un punto de color (verde/rojo) usando los tokens
  de marca existentes.

### 5. Alcance visual general

Toda la paleta y tipografía reutiliza los tokens de marca ya definidos
en `globals.css` (`brand-rosa`, `brand-oro`, `brand-ciruela`,
`brand-crema`, etc.) — no se introduce ninguna paleta nueva para el
POS. El objetivo visual es acercarse a la disposición de los mockups
(sidebar + top bar + status bar), no clonar pixel-por-pixel cada
detalle decorativo que no tenga contraparte funcional real en el
sistema.

## Fuera de alcance (explícitamente diferido)

- Botón "Cliente" real → sub-proyecto 2.
- Categorías en píldoras, grilla de productos con imágenes/swatches,
  botón "Scanner" → sub-proyecto 3.
- Rediseño del panel de carrito y métodos de pago como botones-ícono →
  sub-proyecto 4 (afecta `venta-items-editor.tsx`, compartido con
  `/pos/venta/[id]/editar`).
- Barra de pestañas inferior móvil, pantalla de carrito separada,
  "venta rápida" → sub-proyecto 5.

## Testing

- Tests unitarios (Vitest, patrón ya usado en el repo) para:
  - `BackendSidebar` con y sin `icon` en los items (no rompe el caso
    sin ícono usado por `admin-nav.tsx`).
  - Lógica de "buscar última venta del vendedor actual" (puede probarse
    igual que otras server actions del proyecto, con un cliente
    Supabase mockeado).
- Verificación manual: dado que `/pos/**` requiere sesión autenticada de
  `staff`/`admin`/`superadmin` y el manejo de la contraseña del
  superadmin en texto plano está prohibido en esta sesión, la
  verificación visual final de este sub-proyecto la hace el usuario
  directamente en el navegador tras el despliegue a preview — se deja
  explícito en el PR, igual que en el historial de ventas POS (PR #24).

## Preguntas abiertas (a resolver en el plan de implementación, no bloquean el spec)

- Si el top bar/status bar se montan dentro de `PosAdminLayout` (y por
  lo tanto aparecen también en `/pos/ventas`, `/pos/creditos`,
  `/pos/venta/[id]`) o solo dentro de la página de la terminal
  (`/pos`). Recomendación: montarlos en `PosAdminLayout` para dar
  consistencia visual a todo el módulo POS, ya que el mockup los
  muestra como parte del "shell" del POS, no solo de la terminal — se
  confirma en la fase de plan si hace falta ajustar detalles por
  página (p. ej. el botón "Imprimir" tiene más sentido en todas las
  páginas del POS, no solo en la terminal).
