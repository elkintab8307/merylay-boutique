# Rediseño visual del backend (admin + POS + superadmin)

## Objetivo

Reemplazar la apariencia actual del backend interno (barra superior
simple, tablas de texto plano sin jerarquía, inputs de archivo crudos
del navegador) por un entorno de trabajo con aspecto de dashboard
profesional: panel lateral organizado, listados con jerarquía visual
clara, un panel de inicio con métricas reales, y un control de subida
de imágenes con marca propia. Es un cambio de **presentación**, no de
lógica de negocio: ninguna consulta, RPC, validación ni Server Action
existente cambia de comportamiento.

## Contexto

- El backend hoy son 3 áreas con navegación independiente:
  `/admin/**` (`admin-nav.tsx`), `/superadmin/**` (`superadmin-nav.tsx`),
  y `/pos` (sin navegación propia, pantalla completa a propósito para
  el flujo de cobro).
- `admin-nav.tsx` ya tiene 10 enlaces en una sola fila — no escala más
  sin reorganizarse.
- Los listados (`/admin/productos`, `/admin/pedidos`, `/admin/gastos`,
  `/admin/compras`, `/admin/resenas`, las 7 subpáginas de
  `/admin/informes`, `/pos/ventas`, `/superadmin/usuarios`) son todos
  variaciones de la misma tabla HTML sin estilo: texto plano, sin
  miniatura, sin distinción visual de estado.
- El input de subir imágenes en `producto-form.tsx` (general y por
  variante, agregado en la fase anterior) es el selector crudo del
  navegador — "Elegir archivos · Sin archivos seleccionados".
- Ya existen primitivas shadcn/ui reutilizables: `Button`, `Input`,
  `Card`, `Sheet` (usado hoy para el drawer móvil vía
  `MobileNavSheet`), y `ChartContainer`/`ChartTooltip`/etc. en
  `src/components/ui/chart.tsx` (envoltorio de `recharts`, ya usado en
  las gráficas de `/admin/informes/*`). No existen `Table` ni `Badge`
  — se crean en esta fase.
- Ya existen RPCs reutilizables para el panel de inicio:
  `informe_ventas_serie(p_desde, p_hasta)` (serie diaria tienda/POS,
  usada en `/admin/informes/ventas`) e
  `informe_productos_vendidos(p_desde, p_hasta, p_limit)` (top
  productos, usada en `/admin/informes/productos`).
- Identidad de marca (CLAUDE.md sección 3): paleta `brand.rosa`
  (`#E96A9E`), `brand.oro` (`#D9A441`), `brand.crema` (`#FFF8F4`),
  `brand.ciruela` (`#6E2A44`), tipografía `Playfair Display` (títulos)
  / `Montserrat` (cuerpo) — no cambia, se aplica de forma más
  consistente en los componentes nuevos.

## Decisiones ya validadas (brainstorming)

1. **Layout**: panel lateral (sidebar) con secciones agrupadas, no
   barra superior ampliada.
2. **Listados**: cuadrícula de tarjetas solo para **Productos** (tiene
   foto); tabla refinada para todo lo demás.
3. **Subida de imágenes**: botón estilizado con vista previa en
   miniatura, sin zona de arrastre.
4. **Panel de inicio**: dashboard avanzado con gráfico de ventas de 7
   días + productos más vendidos + ventas del mes, reutilizando los
   RPCs de Informes.
5. **`/pos` (terminal de cobro)**: se queda pantalla completa, **sin**
   sidebar — no se le quita ancho al flujo de cobro. `/pos/ventas` y
   `/pos/venta/[id]` (+ `/editar`) sí llevan el sidebar nuevo, como el
   resto del backend.

## Alcance

Fuera de alcance: cambiar cualquier query, RPC, validación zod, Server
Action, o regla de negocio existente; rediseñar la tienda pública
(`(store)`) — ya tiene su propio sistema visual de las fases
anteriores; agregar funcionalidad nueva a los listados (filtros,
paginación) más allá de lo que ya existe hoy — eso es un proyecto
aparte si se pide después; cambiar la paleta de colores o tipografía
de marca.

## Arquitectura

### 1. Sidebar y layouts

`src/components/admin/backend-sidebar.tsx` (nuevo, client component):
recibe `sections: { label: string; items: { href: string; label: string; icon: LucideIcon }[] }[]`
y `currentUserLabel`/`onCerrarSesion` si aplica, resalta el `href`
activo comparando con `usePathname()`. En escritorio es una columna
fija a la izquierda (`w-60`, `border-r`, fondo blanco); en móvil se
oculta y se sustituye por un botón de menú que abre el mismo `Sheet`
que ya usa `MobileNavSheet` (mismo patrón, contenido reorganizado por
secciones en vez de lista plana).

Tres archivos de configuración de secciones, cada uno una función
async que ya conoce el rol (reemplazan la lógica hoy inline en
`admin-nav.tsx`/`superadmin-nav.tsx`):

- `src/app/admin/admin-nav.tsx` (modificado): pasa a construir
  `sections` agrupadas — **Catálogo** (Productos, Categorías),
  **Ventas** (Pedidos, POS, Ventas POS), **Negocio** (Gastos, Compras,
  Informes) — y agrega la sección **Superadmin** solo si
  `role === "superadmin"`, igual que hoy.
- `src/app/superadmin/superadmin-nav.tsx` (modificado): una sola
  sección con Panel, Usuarios, Ajustes.
- `src/app/pos/ventas/` y `src/app/pos/venta/[id]/`: no tienen layout
  propio hoy (heredan directo de `src/app/layout.tsx`, la tienda
  pública). Se **mueven** a `src/app/pos/(admin)/ventas/` y
  `src/app/pos/(admin)/venta/[id]/` (el paréntesis en `(admin)` es un
  route group de Next.js: no aparece en la URL, así que
  `/pos/(admin)/ventas` se sigue sirviendo en `/pos/ventas` tal cual
  hoy — ningún enlace existente se rompe). Se agrega
  `src/app/pos/(admin)/layout.tsx` con el mismo `BackendSidebar`.
  `src/app/pos/page.tsx` (la terminal) queda **fuera** del route group,
  en `src/app/pos/`, y sigue pantalla completa sin sidebar.

`src/app/admin/layout.tsx` y `src/app/superadmin/layout.tsx` cambian
de `<Nav /> + <div className="mx-auto max-w-6xl px-6 py-10">` a
`<div className="flex"><Sidebar />` `<main className="flex-1 px-6 py-8">`,
quitando el límite de ancho `max-w-6xl` (el sidebar ya acota el
contenido, y las tablas/tarjetas aprovechan más espacio horizontal).

### 2. `<Table>` (`src/components/ui/table.tsx`, nuevo)

Wrapper de presentación sobre `<table>` nativo, sin lógica de datos —
los componentes que ya arman filas (`ToggleProductoButton`, etc.) no
cambian su lógica, solo el marcado que las envuelve:

```tsx
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

Uso: cada página de listado reemplaza su `<table>`/`<thead>`/`<tbody>`/
`<tr>`/`<td>` crudos por estos componentes, columna por columna, sin
tocar de dónde vienen los datos.

### 3. `<Badge>` (`src/components/ui/badge.tsx`, nuevo)

```tsx
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

Cada listado decide su propio mapeo estado→variante en el lugar donde
hoy ya calcula el texto (p. ej. `is_active ? "success" : "neutral"`,
`status === "pagado" ? "success" : status === "cancelado" ? "danger" : "warning"`)
— no se centraliza ese mapeo, porque los estados posibles son distintos
por entidad (productos, pedidos, ventas POS, gastos, compras).

### 4. Tarjetas de producto (`src/app/admin/productos/page.tsx`, reescrito)

Reemplaza la tabla por una cuadrícula (`grid grid-cols-1 sm:grid-cols-2
lg:grid-cols-3 xl:grid-cols-4 gap-4`) de tarjetas: imagen principal
(`product_images` filtrando `is_primary`, con fallback "Sin imagen"
igual que en la tienda pública), nombre, SKU, precio, `<Badge>` de
stock (`stock === 0` → danger "Agotado", `stock <= umbral` → warning
"Stock bajo", si no → neutral con la cantidad) y de estado
(activo/inactivo), y los mismos enlaces "Editar"/`ToggleProductoButton`
de hoy. La query gana un `select` de `product_images` filtrado a
`is_primary = true` (join o segunda consulta, igual patrón que ya usa
`producto/[slug]/page.tsx` en la tienda pública).

### 5. Botón de subir imágenes (`src/components/admin/image-upload-button.tsx`, nuevo)

Reemplaza el `<input type="file">` visible en `producto-form.tsx` (dos
usos: imágenes generales, imágenes por variante) por:

```tsx
"use client";
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
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => onChange(Array.from(e.target.files ?? []))}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="w-fit border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
      >
        <ImagePlus className="h-4 w-4" /> {label}
      </Button>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative h-16 w-16">
              <img
                src={URL.createObjectURL(file)}
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

`producto-form.tsx` sustituye sus dos `<input type="file" ...>` crudos
(el general en `handleImageChange`, y el de cada variante en
`handleVariantImageChange`) por `<ImageUploadButton>`, pasando el
`files`/`onChange` que ya calcula cada handler — **la lógica de
`validarTamanoTotal`, `variantImageFiles`, y el envío a
`createProducto`/`updateProducto` no cambia**, solo el marcado del
control. `URL.createObjectURL` se libera con
`URL.revokeObjectURL` en un `useEffect` de limpieza por archivo, para
no acumular URLs de blob mientras el formulario está abierto.

### 6. Panel de inicio avanzado (`src/app/admin/page.tsx`, reescrito)

Se agregan, junto a las 3 tarjetas ya existentes (ventas de hoy,
pedidos pendientes, stock bajo):

- **Ventas de hoy con variación vs. ayer**: se calcula también el
  rango de ayer (`inicioDelDiaBogota` aplicado a `new Date(Date.now() -
  86400000)` como límite inferior, el inicio de hoy como límite
  superior) y se muestra `+N%`/`-N%` en texto pequeño bajo el monto. Si
  ayer fue $0, no se muestra porcentaje (evita división por cero).
- **Ventas del mes**: nueva función pura
  `src/lib/date/inicio-del-mes.ts` → `inicioDelMesBogota(ahora: Date =
  new Date()): string`, mismo patrón que `inicioDelDiaBogota` pero al
  día 1 del mes actual en hora de Bogotá. Se suma `orders.total` +
  `pos_sales.total` desde ese punto.
- **Gráfico de ventas (7 días)**: `supabase.rpc("informe_ventas_serie",
  { p_desde: <hace 6 días>, p_hasta: <hoy> })`, renderizado con
  `<GraficaVentas>` (el componente ya existe en
  `src/app/admin/informes/ventas/grafica-ventas.tsx` — se reutiliza tal
  cual, sin duplicar el `chartConfig`).
- **Productos más vendidos (mini)**: `supabase.rpc(
  "informe_productos_vendidos", { p_desde: <hace 6 días>, p_hasta:
  <hoy>, p_limit: 5 })`, listado simple (nombre + unidades), sin
  gráfico propio — solo texto, para no saturar el panel de inicio.

La sección de "Stock bajo" existente no cambia de lógica, solo pasa a
usar `<Table>`/`<TableRow>` en vez de los `divide-y` actuales.

### 7. Migración del resto de listados (sin cambio de lógica)

Cada página reemplaza su tabla cruda por `<Table>`/`<TableHeader>`/
`<TableRow>`/`<TableCell>` y agrega `<Badge>` donde hoy muestra un
estado como texto plano. Inventario completo:

- `/admin/pedidos` (estado del pedido → badge)
- `/admin/gastos` y `/admin/gastos/categorias`
- `/admin/compras` y `/admin/compras/proveedores`
- `/admin/resenas` (aprobada/pendiente → badge)
- `/admin/informes/ventas`, `/productos`, `/ganancia`, `/gastos`,
  `/metodos-pago`, `/stock-bajo`, `/compras` (las 7 subpáginas — solo
  la tabla de cada una, las gráficas ya existentes no cambian)
- `/admin/categorias`
- `/pos/ventas` (dentro del nuevo route group con sidebar)
- `/superadmin/usuarios` (rol → badge)

Ninguna de estas páginas cambia su query, su Server Action, ni agrega
paginación/filtros nuevos — es exclusivamente el marcado de
presentación.

## Testing

- Sin tests nuevos de lógica (es una capa de presentación; las
  funciones puras nuevas sí se testean: `inicioDelMesBogota` sigue el
  mismo patrón de test que ya tiene `inicioDelDiaBogota` en
  `src/lib/date/__tests__/`).
- Verificación manual en navegador por área, tras migrarla: sidebar en
  escritorio y en móvil (drawer), cada listado migrado, el formulario
  de producto con el nuevo botón de imágenes (crear y editar), y el
  panel de inicio con datos reales.
- `pnpm build && pnpm lint && pnpm test` en verde antes de cerrar cada
  tarea, igual que el resto del proyecto.

## UI

Mismos tokens de marca (`brand.rosa`, `brand.oro`, `brand.crema`,
`brand.ciruela`) y tipografías ya establecidas — este rediseño
reorganiza el marcado y la jerarquía visual, no introduce una paleta ni
tipografía nueva. Los colores de `<Badge>` (verde/ámbar/rojo) son la
única paleta nueva, reservada exclusivamente para indicadores de
estado — no se usan en botones ni títulos.
