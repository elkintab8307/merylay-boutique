# Rediseño POS — Sub-proyecto 5: Capa móvil

> Sub-proyecto 5 de 5 (último) del rediseño visual del POS. Los
> sub-proyectos 1 (layout y navegación), 2 (módulo de clientes), 3
> (navegación de productos) y 4 (carrito y métodos de pago) ya están
> en producción (PR #25, #26, #27, #28).

## Contexto

Hasta ahora el rediseño del POS ha sido desktop-first. El layout
compartido (`src/app/pos/(admin)/layout.tsx`, sub-proyecto 1) usa un
sidebar fijo en escritorio con un `Sheet` lateral (hamburguesa) en
móvil (`BackendSidebar`, ya existente), pero el resto del contenido
—`PosTopBar`, `PosStatusBar`, la grilla de dos columnas de
`VentaItemsEditor`, la grilla de productos de `ProductBrowser`, la
grilla de `PaymentMethodPicker`— no tiene ningún tratamiento
específico para pantallas angostas: todo se apila o se recorta según
el comportamiento por defecto de Flexbox/Grid, sin un breakpoint
`md:` deliberado en la mayoría de estos componentes.

El usuario compartió un mockup móvil (dos pantallas: terminal POS y
carrito de compra) que revela una arquitectura de navegación y de
pantallas bastante distinta a la actual:

- Barra de navegación inferior fija con pestañas (no el
  hamburger+Sheet de hoy como único mecanismo).
- Un header compacto (hamburguesa + logo + campana de notificaciones)
  en vez del `PosTopBar` actual (título + bienvenida + botones).
- El carrito de compra es una pantalla separada (con flecha de
  regreso), no un panel al lado de la navegación de productos.
- Categorías como miniaturas circulares con imagen y scroll
  horizontal, no las píldoras de texto actuales.
- Grilla de métodos de pago en 2 columnas, no 3.

Este sub-proyecto también resuelve dos hallazgos que quedaron
diferidos explícitamente hacia aquí en revisiones anteriores: la
presión de ancho en la fila del carrito (miniatura + steppers sin
`shrink-0` consistente) y una pasada de accesibilidad (`aria-pressed`/
`aria-label`) sobre los 6 grupos de botones-toggle del módulo POS.

## Decisiones de alcance (ya confirmadas con el usuario)

- **Fidelidad al mockup**: completa — barra de navegación inferior,
  header condensado, carrito como vista separada, categorías con
  imagen, grilla de pago en 2 columnas.
- **Patrón de dos pantallas del carrito**: solo aplica a la terminal
  POS (`/pos`, vía `pos-terminal.tsx`). Los otros 2 consumidores de
  `VentaItemsEditor` (edición de venta, edición de pedidos) reciben
  solo el apilado vertical responsivo del grid de 2 columnas, sin el
  patrón de vista doble.
- **Favoritos**: NO se agregan. El ícono de corazón del mockup se
  omite — se mantiene la decisión ya tomada en el sub-proyecto 3
  ("favorites es un concepto de cliente de tienda, no de staff").
- **Rutas de la barra inferior**: "Inventario" apunta a
  `/admin/productos` (la página real de gestión de stock), visible
  SOLO para `admin`/`superadmin` — el rol `staff` no tiene acceso a
  `/admin/**` (`src/lib/auth/route-protection.ts`), así que su barra
  muestra 4 pestañas (sin Inventario) en vez de 5. "Más" abre el mismo
  `Sheet` que ya usa `BackendSidebar`, reutilizado tal cual.
- **Header y footer**: el header móvil se condensa a hamburguesa +
  logo + campana de notificaciones (reemplaza el hamburger-row +
  `PosTopBar` que hoy se apilan en 2 filas). `PosStatusBar` se oculta
  en móvil — la barra de pestañas inferior ocupa ese espacio visual.
  En escritorio, todo el header/footer actual permanece sin cambios.
- **Categorías en móvil**: miniaturas circulares con imagen y scroll
  horizontal, SOLO en móvil. Las píldoras de texto actuales de
  `ProductBrowser` se mantienen sin cambios en escritorio.
- **Grilla de métodos de pago**: 2 columnas en móvil, 3 en escritorio
  (antes fija en 3 en todos los tamaños).
- **Arreglo de presión de ancho del carrito**: incluido — `shrink-0`
  en los botones -/+ del stepper, `min-w-0 truncate` en el nombre del
  producto.
- **Pasada de accesibilidad**: incluida — `role="group"` +
  `aria-label` + `aria-pressed` en los 6 sitios de botones-toggle del
  módulo POS (píldoras de categoría, chips de talla, chips de color,
  `PaymentMethodPicker` en sus 2 usos).
- **Breakpoint**: `md` (768px) en todo, mismo criterio ya usado en
  `BackendSidebar` (sub-proyecto 1) y en el grid de
  `VentaItemsEditor` (sub-proyecto 4) — consistencia con el resto del
  código, no se introduce un breakpoint nuevo.

## Diseño

### 1. Navegación móvil: barra inferior + header condensado

**Nuevo componente `src/components/pos/pos-bottom-nav.tsx`** (client
component, `md:hidden`, `fixed bottom-0`): recibe `rolVendedor: string`
como prop desde `layout.tsx` (ya se calcula ahí,
`currentUser?.profile.role`). Renderiza 4 o 5 pestañas según el rol:

```ts
const TABS_BASE = [
  { href: "/pos", label: "POS", icon: Store },
  { href: "/pos/ventas", label: "Ventas", icon: Receipt },
  { href: "/pos/clientes", label: "Clientes", icon: Users },
];
const TAB_INVENTARIO = { href: "/admin/productos", label: "Inventario", icon: Package };
```

Para `admin`/`superadmin`: `[POS, Ventas, Inventario, Clientes, Más]`
(5 pestañas, `Inventario` insertado en la 3ra posición). Para `staff`:
`[POS, Ventas, Clientes, Más]` (4 pestañas, sin Inventario). La
pestaña "Más" no es un `Link` — es un botón que abre el mismo `Sheet`
que ya renderiza `BackendSidebar` en su versión móvil (ver punto 2).

Cada pestaña usa el mismo criterio de estado activo ya establecido en
`BackendSidebar` (`currentPath === item.href`, color `brand-rosa`).

**Header condensado**: dentro de `layout.tsx`, el bloque
`hamburger-row + PosTopBar` que hoy se apilan en 2 filas en móvil se
reemplaza por un nuevo header (`md:hidden`) con: el mismo trigger de
`Sheet` que ya usa `BackendSidebar` (se extrae su lógica de apertura
para reutilizarla, ver punto 2), el logo `MeryLay` centrado
(`font-script`, mismo estilo que el sidebar), y
`NotificacionesStockBajo` (componente ya existente, sin cambios) a la
derecha. En escritorio (`md:flex`), `BackendSidebar` + `PosTopBar` +
`PosStatusBar` siguen exactamente igual que hoy — cero cambios
visuales en escritorio en todo este punto.

**`PosStatusBar` se oculta en móvil**: gana `hidden md:flex` en su
`<footer>` (hoy es `flex flex-wrap` siempre visible). En escritorio no
cambia.

### 2. Extraer el trigger del `Sheet` de `BackendSidebar`

Para que tanto el nuevo header (hamburguesa) como la pestaña "Más" de
`PosBottomNav` puedan abrir el mismo menú lateral sin duplicar
markup, `BackendSidebar` expone su `Sheet` mediante un patrón
controlado: un nuevo estado `open`/`onOpenChange` opcional en las
props de `BackendSidebar`, con un valor por defecto no controlado
(comportamiento actual sin cambios si nadie pasa las props). El
`layout.tsx` del POS crea un único estado `menuAbierto` (client
component pequeño, o se sube el estado a un wrapper) y lo comparte
entre el trigger del header, la pestaña "Más", y el `Sheet` de
`BackendSidebar` — así solo existe una instancia del menú, abierta
desde 2 lugares distintos en móvil.

### 3. Terminal POS: patrón de dos pantallas

`VentaItemsEditor` gana un prop opcional:

```ts
mobileVistaDoble?: boolean; // default false
```

Solo `pos-terminal.tsx` lo activa (`mobileVistaDoble={true}`). Cuando
está activo:

- Nuevo estado local `mostrandoCarritoMovil: boolean` (default
  `false`).
- El contenedor raíz dejа de ser `grid gap-8 md:grid-cols-2` fijo;
  pasa a usar clases condicionales: el panel de `ProductBrowser` es
  `block md:block` cuando `!mostrandoCarritoMovil`, `hidden md:block`
  cuando sí; el panel del carrito es lo inverso. En escritorio
  (`md:`) ambos son siempre visibles lado a lado, sin importar el
  estado — el toggle solo tiene efecto por debajo de `md`.
- Botón flotante de carrito (`md:hidden`, `fixed bottom-20 right-4`
  — por encima de `PosBottomNav`): visible solo cuando
  `items.length > 0` y `!mostrandoCarritoMovil`, con badge mostrando
  la cantidad total de ítems (`items.reduce((sum, i) => sum + i.qty, 0)`).
  Al tocarlo, `setMostrandoCarritoMovil(true)`.
- Header simple dentro de la vista de carrito (`md:hidden`): flecha
  de regreso (`ArrowLeft` de lucide-react) que hace
  `setMostrandoCarritoMovil(false)`, más el título "Carrito de
  Compra".
- Cuando `mobileVistaDoble` es `false` (los otros 2 consumidores), el
  comportamiento es el de hoy: `grid gap-8 md:grid-cols-2` sin
  condicionales — en móvil ambos paneles se apilan verticalmente uno
  debajo del otro (comportamiento ya casi automático de Grid en una
  columna), sin botón flotante ni vista separada.

### 4. Categorías con imagen (solo móvil)

`listarCategoriasPos` (`src/app/pos/product-browser-action.ts`) agrega
`image_url` al `select` de `categories` y al tipo
`PosCategoriaResult`:

```ts
export type PosCategoriaResult = {
  id: string;
  name: string;
  imageUrl: string | null;
};
```

`ProductBrowser` gana una fila de miniaturas (`md:hidden`, `flex gap-3
overflow-x-auto`) antes de la fila de píldoras de texto: cada
categoría es un círculo (`h-14 w-14 rounded-full`, mismo criterio de
fallback `bg-brand-rosa-claro` que las tarjetas de producto) con el
nombre debajo (`text-xs`, centrado). La fila de píldoras de texto
actual gana `hidden md:flex` (antes `flex flex-wrap`, siempre
visible). El estado `categoryId` y la lógica de selección no cambian
— ambas filas (miniaturas en móvil, píldoras en escritorio) controlan
la misma variable de estado.

### 5. `PaymentMethodPicker`: grilla responsiva

Un solo cambio de clase en `src/app/pos/payment-method-picker.tsx`:

```diff
-<div className="grid grid-cols-3 gap-2">
+<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
```

Sin cambios de props ni de lógica — el componente sigue siendo
puramente controlado.

### 6. Presión de ancho en la línea del carrito

En `venta-items-editor.tsx`, dentro del `items.map(...)`:

- Los dos botones -/+ ganan `shrink-0` (hoy `h-11 w-11` sin
  `shrink-0`, compiten por espacio con el nombre del producto).
- El contenedor del nombre/precio (`<div className="flex-1">`) gana
  `min-w-0`, y el `<p>` del nombre gana `truncate` — así un nombre
  largo se recorta con elipsis en vez de empujar los botones de
  cantidad fuera del área táctil.

### 7. Pasada de accesibilidad

Los 6 sitios de botones-toggle del módulo POS ganan `role="group"` +
`aria-label` en su contenedor, y `aria-pressed={activo}` en cada
botón individual:

1. Píldoras de categoría (`ProductBrowser`, versión escritorio Y la
   nueva versión móvil de miniaturas).
2. Chips de talla (`ProductCardPos`).
3. Chips de color (`ProductCardPos`).
4. `PaymentMethodPicker` — el componente ya es compartido por 2 usos
   (método principal, método del abono inicial), así que el
   `aria-label` se recibe como prop nueva (`groupLabel: string`,
   requerida) en vez de estar hardcodeada, para que cada uso pase su
   propio texto ("Método de pago", "Método de pago del abono
   inicial").

Ningún cambio de comportamiento visual — son atributos ARIA puros,
sin clases CSS nuevas fuera de lo ya descrito en los puntos
anteriores.

## Fuera de alcance (explícitamente diferido)

- Favoritos (corazón en las tarjetas de producto) — decisión de
  sub-proyecto 3 se mantiene.
- Página de inventario dedicada dentro de `/pos` — "Inventario"
  enlaza a la página de administración de productos ya existente
  (`/admin/productos`), no se crea una vista nueva.
- Rediseño visual adicional de `/admin/productos` para verse mejor en
  móvil — fuera del namespace `/pos`, fuera de este rediseño.
- Soporte offline / PWA — el ícono de conexión (`PosStatusBar`) ya
  existe pero su lógica no cambia; solo se oculta visualmente en
  móvil.

## Testing

- Sin lógica de negocio nueva (es un sub-proyecto de layout/
  interacción/accesibilidad), mismo criterio que sub-proyectos 3 y 4:
  sin test unitario dedicado para los componentes de layout/nav.
- Excepción: `listarCategoriasPos` ya tiene tests existentes
  (sub-proyecto 3) que deben actualizarse para cubrir el nuevo campo
  `imageUrl` en el resultado — se extiende el test existente, no se
  crea uno nuevo.
- Verificación: `pnpm tsc --noEmit`, `pnpm vitest run`, y `pnpm build`
  deben pasar limpio, cubriendo los 3 consumidores de
  `VentaItemsEditor` y las rutas nuevas/tocadas (`/pos`, `/pos/ventas`,
  `/pos/clientes`, `/pos/venta/[id]/editar`,
  `/admin/pedidos/[id]/editar`).
- Verificación manual: igual que los sub-proyectos anteriores,
  `/pos/**` requiere sesión autenticada y la contraseña del
  superadmin no se maneja en texto plano en esta sesión. La
  verificación visual final — que la barra inferior, el header
  condensado, el patrón de dos pantallas del carrito, las miniaturas
  de categoría, y la grilla de pago se vean y funcionen como se
  espera en un dispositivo/viewport móvil real — la hace el usuario
  en el preview desplegado, idealmente con las herramientas de
  emulación móvil del navegador o un teléfono real.

## Preguntas abiertas (a resolver en el plan de implementación, no bloquean el spec)

- Nombre exacto de archivos/props puede ajustarse levemente en la
  fase de plan si choca con una convención ya establecida que no se
  detectó aquí — el contrato de datos (`PosCategoriaResult.imageUrl`,
  `mobileVistaDoble`, `PaymentMethodPicker`'s `groupLabel`) es lo que
  no cambia.
- El mecanismo exacto para compartir el estado `open` del `Sheet`
  entre el header y `PosBottomNav` (punto 2) se decide en el plan —
  puede ser un estado `useState` en un pequeño wrapper client
  component dentro de `layout.tsx`, o promoviendo `BackendSidebar` a
  aceptar `open`/`onOpenChange` controlado. Cualquiera de las dos
  formas cumple el contrato: un solo `Sheet`, abierto desde 2
  triggers.
