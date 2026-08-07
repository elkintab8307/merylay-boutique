# Fase 11.1 — Dashboard de métricas + Gestión de pedidos: Diseño

> Sub-fase de la Fase 11 ("Extras", `CLAUDE.md` §12 punto 11), que se dividió
> en tres subsistemas independientes (dashboard de métricas, integración de
> pago, correos transaccionales). Esta sub-fase cubre el primero, más un
> vacío descubierto durante el brainstorming: la gestión de pedidos del
> admin (`CLAUDE.md` §7.2) nunca se construyó — solo existe la vista de
> "Mis pedidos" del cliente (Fase 7).

## Objetivo

Darle al admin/superadmin visibilidad del negocio (ventas del día, pedidos
pendientes, stock bajo) y la capacidad de procesar pedidos (verlos, cambiar
su estado), ya que la métrica de "pedidos pendientes" no tiene utilidad sin
un lugar donde actuar sobre ellos.

## Alcance

1. `/admin/pedidos` — listar todos los pedidos, ver detalle, cambiar estado.
2. `/admin` — dashboard con 3 métricas: ventas de hoy, pedidos pendientes,
   stock bajo.

Fuera de alcance: filtros avanzados de pedidos (solo `?status=`), edición de
ítems de un pedido, notificaciones, gráficas/series de tiempo (eso es
Fase 12 — Informes). Sin migraciones nuevas.

## Arquitectura

### `/admin/pedidos`

- `page.tsx` (Server Component): lee `searchParams.status` opcional; consulta
  `orders` (todas las columnas necesarias para la lista) ordenadas por
  `created_at desc`, filtradas por `status` si viene en la URL. El "cliente"
  mostrado en la lista sale de `shipping_address->fullName` (jsonb, ya
  guardado en el checkout de la Fase 7) — no se hace join con `profiles`
  para mantener la consulta simple, igual que hace la vista de detalle del
  cliente.
- `[id]/page.tsx` (Server Component): igual a
  `src/app/(store)/cuenta/pedidos/[id]/page.tsx` pero sin el filtro
  `.eq("user_id", user.id)` (el admin puede ver cualquier pedido), más un
  selector de estado (client component) debajo del resumen.
- `estado-pedido-select.tsx` (Client Component): `<select>` con los 5
  valores del enum `order_status`, dispara `cambiarEstadoPedido` en
  `onChange` vía `useTransition` + `router.refresh()` — mismo patrón que
  `ToggleCategoriaButton` (Fase 5) y `UserRowActions` (Fase 9).
- `actions.ts`:
  ```ts
  export async function cambiarEstadoPedido(
    orderId: string,
    nuevoEstado: string,
  ): Promise<{ error?: string }>
  ```
  `requireAdmin()` primero; valida `nuevoEstado` con
  `z.enum(["pendiente","pagado","enviado","entregado","cancelado"])`;
  actualiza `orders.status` vía el cliente RLS-scoped normal (la policy
  `orders_update_admin` de la migración 003 ya permite `update` a
  `is_admin()`, sin cambios de esquema); `revalidatePath` de la lista y el
  detalle.

### `/admin` (dashboard)

- `page.tsx` (Server Component), reemplaza el 404 actual de la ruta índice
  de `/admin` (hoy no hay `page.tsx` ahí, solo subrutas). Calcula, en
  paralelo (`Promise.all`):
  1. **Ventas de hoy**: `orders` con `created_at >= inicio del día` (hora
     local Colombia) y `status <> 'cancelado'`, sumando `total`; y
     `pos_sales` con `created_at >= inicio del día`, sumando `total`.
     Se muestran los dos valores por separado más la suma combinada.
  2. **Pedidos pendientes**: `count` de `orders` con `status = 'pendiente'`,
     enlazado a `/admin/pedidos?status=pendiente`.
  3. **Stock bajo** (umbral = 2): usa una función pura
     `src/lib/admin/low-stock.ts` →
     ```ts
     export type LowStockItem = {
       productId: string;
       productName: string;
       variantLabel: string | null; // "Talla M / Rosa", o null si no aplica
       stock: number;
     };
     export function buildLowStockItems(
       products: { id: string; name: string; stock: number }[],
       variants: { id: string; product_id: string; talla: string | null; color: string | null; stock: number }[],
       threshold: number,
     ): LowStockItem[]
     ```
     Lógica: un producto con variantes se representa por sus variantes
     (una fila por variante con `stock <= threshold`); un producto sin
     variantes se representa por su propio `stock` si `<= threshold`.
     Ordenado por `stock` ascendente, limitado a 10 en la UI (el límite se
     aplica en `page.tsx`, no en la función pura, para que sea testeable
     sin acoplar el límite de UI a la lógica de negocio).
     `page.tsx` consulta `products` (`id, name, stock`) y `product_variants`
     (`id, product_id, talla, color, stock`) completas — el catálogo es
     chico, no amerita paginar en el servidor para este cálculo.

### Constante de umbral

`LOW_STOCK_THRESHOLD = 2` como constante exportada desde
`src/lib/admin/low-stock.ts`, usada tanto por la función pura como por
`page.tsx` — un solo lugar para cambiarla si el dueño pide otro valor más
adelante.

## Manejo de errores

- `cambiarEstadoPedido` retorna `{ error: string } | {}`, mensajes en
  español ("No autorizado.", "Estado inválido.", "No se pudo actualizar el
  pedido."), mismo patrón de toda la app.
- Si `orders`/`pos_sales`/`products`/`product_variants` fallan al leer en el
  dashboard, se muestra un mensaje de error en vez de métricas en cero
  silenciosas (lección de la Fase 9: nunca tragar errores de lectura sin
  avisar).

## Testing

- TDD sobre `buildLowStockItems` (productos con y sin variantes, mezcla de
  ambos, umbral exacto vs. por debajo/por encima, orden ascendente).
- Verificación de integración: script `.mjs` desechable que crea datos de
  prueba (un pedido pendiente, un producto con stock bajo) y confirma que
  las métricas del dashboard reflejan los números esperados, más
  `cambiarEstadoPedido` de principio a fin contra la base real; limpieza al
  final. Complementado con `pnpm build/lint/test`.

## UI

Sigue el patrón visual de `/admin` (fondo `brand-crema`, tarjetas blancas
con borde `brand-rosa-claro`). Dashboard: 3 tarjetas de métricas en fila
(o apiladas en móvil), la de stock bajo con lista debajo. `admin-nav.tsx`
gana un enlace "Pedidos"; el enlace "Inicio"/logo del nav lleva a `/admin`.
