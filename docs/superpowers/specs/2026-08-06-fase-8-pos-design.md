# Diseño — Fase 8: POS interno — MeryLay Boutique

**Fecha**: 2026-08-06
**Estado**: Aprobado
**Alcance**: Roadmap del CLAUDE.md, sección 12 punto 8 ("POS interno: venta
presencial, descuento, métodos de pago, recibo, descuento de stock"),
implementando la sección 7.3 al pie de la letra.

## Fuera de alcance

Gestión/edición de ventas ya registradas, reportes de caja, cierre de turno.
No hay tabla de "carrito de POS" — la venta es estado efímero de una sesión
de caja, no persistente entre dispositivos.

## Decisiones de diseño (confirmadas con el usuario)

- **Transacción atómica**: función Postgres `create_pos_sale` (`security
  definer`, migración 011), mismo patrón que `create_order` de la Fase 7 —
  valida rol `staff`/`admin`/`superadmin`, bloquea y verifica stock por ítem,
  descuenta, crea `pos_sales` + `pos_sale_items` en una sola transacción.
  Necesario porque `staff` no tiene permiso para actualizar `products`/
  `product_variants` directamente (solo `admin`).
- **Descuento**: monto fijo en pesos (no porcentaje), coherente con
  `pos_sales.discount` (`numeric`, sin columna de porcentaje en el esquema).
- **Sin carrito persistente**: la venta en curso vive en estado de React del
  lado del cliente, reutilizando la lógica pura del carrito de invitado de
  la Fase 7 (`mergeCartItem`, `updateItemQty`, `removeItem`,
  `computeSubtotal`) — misma forma de datos, sin duplicar lógica ni tests.
- **Búsqueda**: por nombre o SKU, solo productos activos, con selector
  compacto de talla/color inline cuando el producto tiene variantes
  (reutiliza `getVariantOptions`/`findMatchingVariant` de la Fase 6).
- **Recibo imprimible**: página `/pos/venta/[id]` con logo/isotipo e
  "Inspiración Femenina", usando CSS de impresión que oculta todo excepto el
  recibo (no requiere modificar el header/nav existentes).
- **Sin lógica pura nueva que testear**: toda la lógica de carrito
  reutilizada ya está cubierta por los tests de la Fase 7.

## Arquitectura

`src/app/pos/page.tsx` (Server Component delgado) renderiza `<PosTerminal />`
(Client Component) que maneja búsqueda, carrito de venta, descuento, método
de pago y el envío final vía Server Action. El envío invoca el RPC atómico.

## Archivos

- `supabase/migrations/011_pos_sale_rpc.sql`
- `src/app/pos/search-action.ts` (`searchProducts`)
- `src/app/pos/sale-action.ts` (`registrarVenta`)
- `src/app/pos/product-search-result.tsx`
- `src/app/pos/pos-terminal.tsx`
- `src/app/pos/page.tsx`
- `src/app/pos/venta/[id]/page.tsx`, `print-button.tsx`
- Modifica: `src/app/globals.css` (CSS de impresión)

## Verificación

- `pnpm build`, `pnpm lint`, `pnpm test` en verde (sin tests nuevos
  esperados, ver arriba).
- Verificación manual/script contra el proyecto real: login como `adminsu`
  (o un `staff`), buscar un producto, agregarlo con cantidad y descuento,
  elegir método de pago, registrar la venta, confirmar que el stock se
  descontó y que la venta + sus ítems existen correctamente. Confirmar que
  un intento de vender más unidades que el stock disponible falla sin dejar
  datos a medias (mismo caso que se probó en el checkout de la Fase 7).
- Confirmar que un `customer` no puede acceder a `/pos` (ya cubierto por el
  proxy, se revalida porque ahora hay una página real detrás).
