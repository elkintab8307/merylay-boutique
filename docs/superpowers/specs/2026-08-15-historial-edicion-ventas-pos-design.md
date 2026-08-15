# Historial y edición de ventas del POS

## Objetivo

Agregar una sección de historial de ventas del POS (accesible a
staff/admin/superadmin, igual que el resto del POS) y la capacidad de
editar una venta ya registrada línea por línea (solo admin/superadmin),
con reajuste automático de stock.

## Contexto

- El POS ya registra ventas vía `create_pos_sale` (RPC transaccional con
  bloqueo de filas), y `/pos/venta/[id]` ya muestra el recibo de una
  venta puntual — pero no existe ninguna forma de listar las ventas
  pasadas ni de corregir una.
- RLS de `pos_sales`/`pos_sale_items` ya permite `for all` a cualquier
  `is_staff_or_above()` (política preexistente, no se toca) — el
  historial de lectura no necesita cambios de RLS.
- Decisiones ya tomadas: solo admin/superadmin puede **editar** una
  venta (staff solo la ve); sin límite de tiempo para editar; sin
  registro de auditoría por ahora; sin botón de anular venta completa
  (fuera de alcance de esta fase).

## Alcance

1. **`/pos/ventas`** (nueva, staff/admin/superadmin): lista las ventas
   del POS (fecha, número, método de pago, total), cada fila enlaza al
   recibo existente en `/pos/venta/[id]`.
2. **`/pos/venta/[id]`**: gana un botón "Editar venta", visible solo si
   el usuario actual es admin/superadmin.
3. **`/pos/venta/[id]/editar`** (nueva, protegida por rol
   admin/superadmin — server-side, no solo ocultando el botón): misma
   experiencia del terminal POS (buscar, agregar, ajustar cantidad,
   quitar, descuento, método de pago), precargada con los ítems
   actuales de la venta. Al guardar, aplica los cambios y reajusta
   stock automáticamente.
4. **`update_pos_sale`** (nueva función RPC `security definer`,
   transaccional): restaura el stock de los ítems actuales, valida
   stock para el nuevo conjunto, reemplaza los ítems, recalcula
   subtotal/total, actualiza `pos_sales`. No modifica `sale_number`,
   `staff_id` ni `created_at` de la venta original.
5. **`VentaItemsEditor`** (nuevo componente compartido, cliente): la
   parte interactiva de `PosTerminal` (buscador + lista de ítems +
   descuento + método de pago) extraída a un componente parametrizado
   por ítems iniciales y texto/acción del botón de guardar, para que
   crear y editar una venta compartan la misma UI sin duplicarla.

Fuera de alcance: anular/cancelar una venta completa; límite de tiempo
para editar; permiso de staff para editar; registro de auditoría de
ediciones; paginación avanzada o filtros de fecha en el historial (se
puede agregar después si la lista crece mucho).

## Arquitectura

### Datos

Sin cambios de esquema. `pos_sales`/`pos_sale_items` ya tienen todo lo
necesario. RLS existente (`is_staff_or_above()` para `for all`) cubre
la lectura del historial sin cambios.

### `/pos/ventas` (listado)

Server Component: consulta `pos_sales` ordenada por `created_at`
descendente (límite razonable, p. ej. 50 más recientes — sin paginación
en esta fase, ver "Fuera de alcance"), tabla con fecha, número, método
de pago, total, enlace a `/pos/venta/[id]`.

### Stock disponible al editar

Al precargar la venta en `/pos/venta/[id]/editar`, el stock "editable"
de cada línea ya vendida es `stock_actual_del_producto_o_variante +
cantidad_ya_vendida_en_esta_venta` (la cantidad ya vendida sigue
descontada del stock real hasta que se guarde la edición, así que hay
que sumarla de vuelta para no subestimar el máximo disponible en la
UI).

### `VentaItemsEditor`

`src/app/pos/venta-items-editor.tsx` (nuevo, cliente): recibe
`itemsIniciales: LocalCartItem[]`, `onGuardar: (items, paymentMethod,
discount) => Promise<{error?: string}>`, `textoBoton: string`,
`descuentoInicial?: number`, `paymentMethodInicial?: PaymentMethod`.
Contiene el buscador de productos, la lista de ítems con +/-/quitar, el
campo de descuento, el selector de método de pago, y el botón de
guardar — exactamente el bloque central que hoy vive inline en
`PosTerminal`.

`PosTerminal` pasa a ser un wrapper delgado que usa `VentaItemsEditor`
con `itemsIniciales: []` y `onGuardar` llamando a `registrarVenta`
(sin cambios de comportamiento).

`/pos/venta/[id]/editar/page.tsx` (Server Component) resuelve la venta
+ ítems + stock disponible ajustado, y renderiza un
`EditarVentaForm` (cliente) que usa `VentaItemsEditor` con los ítems
precargados y `onGuardar` llamando a la nueva acción `actualizarVenta`.

### `actualizarVenta` (acción de servidor) + `update_pos_sale` (RPC)

`src/app/pos/venta/[id]/editar/actions.ts`: valida rol admin/superadmin
(`requireAdmin`, ya usado en el resto del panel), llama al RPC
`update_pos_sale(p_sale_id, p_items, p_payment_method, p_discount)`, y
redirige al recibo actualizado.

RPC (nueva migración), mismo patrón transaccional que
`create_pos_sale` (bloqueo de filas con `for update`):
1. Verifica `public.is_admin()` (no `is_staff_or_above` — editar es
   más restrictivo que crear).
2. Bloquea la fila de `pos_sales` (`for update`).
3. Por cada ítem ACTUAL de la venta: suma de vuelta su `qty` al stock
   del producto/variante (revierte el descuento original).
4. Verifica stock suficiente para el nuevo conjunto de ítems (mismo
   chequeo que `create_pos_sale`, con bloqueo de filas).
5. Borra los `pos_sale_items` actuales, inserta los nuevos.
6. Descuenta stock del nuevo conjunto.
7. Actualiza `pos_sales`: `subtotal`, `discount`, `total`,
   `payment_method`. `sale_number`, `staff_id`, `created_at` no
   cambian.
8. Devuelve la venta actualizada.

### Botón "Editar venta" en el recibo

`/pos/venta/[id]/page.tsx`: resuelve el perfil actual (mismo patrón que
ya usa `/pos/page.tsx` para decidir si mostrar "Volver al panel"), y si
es admin/superadmin, muestra un enlace a `/pos/venta/[id]/editar` junto
al botón de imprimir. La ruta `/pos/venta/[id]/editar` en sí queda
protegida server-side (redirige o 404 si no es admin/superadmin) — el
botón oculto es solo conveniencia de UI, no la única barrera.

## Testing

- `update_pos_sale`: sin test unitario dedicado (lógica SQL
  transaccional, mismo criterio ya usado en el proyecto para RPCs).
- Verificación manual: crear una venta de prueba, editarla (cambiar
  cantidad de un ítem, agregar otro producto, cambiar método de pago),
  confirmar que el stock queda correcto y el recibo refleja los
  cambios; confirmar que un usuario `staff` no puede acceder a
  `/pos/venta/[id]/editar` (redirige).
- `pnpm build && pnpm lint && pnpm test` en verde.

## UI

Mismos tokens de marca y mismo lenguaje visual que el resto del POS
(`bg-brand-rosa`, `border-brand-rosa-claro`, `shadow-brand-sm`). Sin
componentes ni patrones nuevos — `VentaItemsEditor` es una extracción,
no un rediseño.
