# Edición de pedidos de tienda

## Objetivo

Permitir a un admin/superadmin editar los productos de un pedido de la
tienda ya registrado (agregar, quitar, cambiar cantidades), con
reajuste automático de stock — el mismo tipo de corrección que ya
existe para las ventas del POS, aplicada ahora a `orders`.

## Contexto

- `/admin/pedidos` ya existe: lista y detalle de pedidos, con cambio de
  estado (`cambiarEstadoPedido`) — pero sin edición de productos.
- `orders`/`order_items` no tienen ninguna lógica de reajuste de stock
  hoy: ni siquiera cancelar un pedido restaura el stock (gap
  preexistente, no se toca en esta fase).
- Los pedidos pueden pagarse con `payment_method = "wompi"` (cobro real
  ya procesado por el banco) o con métodos manuales (transferencia,
  contra entrega). Decisión ya tomada: se permite editar cualquier
  pedido, incluidos los pagados con Wompi, mostrando una advertencia
  visible de que el cobro real no se ajusta automáticamente.
- `VentaItemsEditor` (creado en la fase anterior para el POS) ya
  resuelve búsqueda + lista de ítems + cantidades — se reutiliza aquí
  en vez de duplicar esa UI.
- Ya existe el enlace "Ventas POS" en la navegación del admin (fase
  anterior); esta fase no toca la navegación.

## Alcance

1. **RPC `update_order_items`** (nuevo, transaccional,
   `security definer`, exige `is_admin()`): restaura stock de los
   ítems actuales del pedido, valida y descuenta stock del nuevo
   conjunto, reemplaza `order_items` (con `name_snapshot`
   reconstruido), recalcula `subtotal`/`total` de `orders`
   (`total = subtotal + shipping`, `shipping` sin tocar). No modifica
   `status`, `payment_method`, `shipping_address`, `order_number`,
   `user_id` ni `created_at`.
2. **`VentaItemsEditor` gana `mostrarDescuento?`/`mostrarMetodoPago?`**
   (ambas `true` por defecto — el POS no cambia de comportamiento).
3. **`/admin/pedidos/[id]/editar`** (nueva): carga el pedido + ítems,
   calcula el stock editable (`stock_actual + qty_ya_reservada`),
   muestra advertencia si `payment_method === "wompi"`, renderiza
   `VentaItemsEditor` con `mostrarDescuento={false}`
   `mostrarMetodoPago={false}`.
4. **`/admin/pedidos/[id]`** gana un botón "Editar pedido".

Fuera de alcance: restaurar stock al cancelar un pedido; editar
`shipping` o `payment_method` desde el editor; reembolsos o ajustes
reales del cobro de Wompi (solo la advertencia visible); cambios a
`/admin/pedidos` (el listado) o a la navegación del admin.

## Arquitectura

### `update_order_items`

Mismo patrón transaccional que `update_pos_sale`
(`supabase/migrations/027_editar_venta_pos.sql`): bloqueo de filas con
`for update`, restaurar → validar → descontar → reemplazar ítems →
actualizar totales. Firma:
`update_order_items(p_order_id uuid, p_items jsonb) returns public.orders`.
Sin parámetro de descuento ni método de pago (no aplican a `orders`).
El `name_snapshot` de cada línea nueva se reconstruye igual que en
`create_order` (`010_checkout_rpc.sql`): nombre del producto, con
`" (talla / color)"` si tiene variante.

### `VentaItemsEditor`

`src/app/pos/venta-items-editor.tsx` (modificado): dos props nuevas,
`mostrarDescuento?: boolean = true` y `mostrarMetodoPago?: boolean = true`.
Cuando son `false`, esas dos secciones del formulario no se renderizan
(el estado interno de `discount`/`paymentMethod` sigue existiendo para
no reescribir la lógica de `onGuardar`, simplemente no se muestran ni
se pueden editar — `onGuardar` para el editor de pedidos ignora esos
dos parámetros).

### Página y acción

`src/app/admin/pedidos/[id]/editar/page.tsx` (nueva): sin chequeo de
rol propio (ya cubierto por el middleware de `/admin/**`). Resuelve
`orders` + `order_items` + productos/variantes involucrados, construye
`LocalCartItem[]` con el stock ajustado. Si
`pedido.payment_method === "wompi"`, renderiza un aviso visible antes
del editor.

`src/app/admin/pedidos/[id]/editar/actions.ts` (nueva):
`actualizarPedidoItems(orderId, items)` — `requireAdmin()`, llama al
RPC, `revalidatePath`, redirige a `/admin/pedidos/${orderId}`.

`src/app/admin/pedidos/[id]/editar/pedido-editar-form.tsx` (nueva,
cliente): usa `VentaItemsEditor` con `mostrarDescuento={false}`
`mostrarMetodoPago={false}`, `textoBoton="Guardar cambios"`.

`src/app/admin/pedidos/[id]/page.tsx` (modificado): botón "Editar
pedido" enlazando a `/admin/pedidos/${pedido.id}/editar`.

## Testing

- Sin tests dedicados para el RPC (mismo criterio ya usado para
  `update_pos_sale`).
- Verificación manual: editar un pedido con pago manual y otro con
  Wompi (confirmar que aparece la advertencia), agregar/quitar/cambiar
  cantidades, confirmar stock correcto y que `status`/`payment_method`
  no cambian.
- `pnpm build && pnpm lint && pnpm test` en verde.

## UI

Mismos tokens de marca ya establecidos. La advertencia de Wompi usa el
mismo estilo de aviso ya usado en el proyecto para mensajes de alerta
(fondo/borde de advertencia, texto claro en español).
