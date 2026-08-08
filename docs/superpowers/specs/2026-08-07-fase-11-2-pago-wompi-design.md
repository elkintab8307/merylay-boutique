# Fase 11 (parte 2) — Integración de pago con Wompi: Diseño

> Sub-fase de la Fase 11 ("Extras", `CLAUDE.md` §12 punto 11). Cubre la
> "integración de pago (Wompi/Mercado Pago)" mencionada en el roadmap,
> eligiendo Wompi. El dashboard de métricas y la gestión de pedidos (otra
> sub-fase de la Fase 11) ya se completaron por separado.

## Objetivo

Permitir pago real y verificado en el checkout de la tienda vía Wompi
(tarjeta, PSE, Nequi, Bancolombia), preservando los métodos manuales
existentes (efectivo, transferencia) para quien prefiera pagar después.

## Alcance

1. Checkout con dos caminos: manual (sin cambios) y Wompi (nuevo).
2. Widget de Wompi embebido en la página de checkout.
3. Webhook de confirmación de pago, con verificación de firma.
4. Descuento de stock diferido hasta la confirmación del pago (solo para
   el camino Wompi).

Fuera de alcance: reembolsos automáticos, limpieza de pedidos `pendiente`
abandonados, Mercado Pago, cambios al checkout manual existente, cambios al
POS (usa un enum de pago totalmente distinto y no se toca).

## Credenciales

`.env.local` (ya presentes, agregadas por el dueño del proyecto —
`WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`,
`WOMPI_INTEGRITY_SECRET`). `WOMPI_PUBLIC_KEY` es la única que llega al
navegador (necesaria para inicializar el widget); las otras tres son
exclusivamente de servidor.

## Arquitectura

### Selector de método de pago (checkout)

`src/lib/validation/checkout.ts`: `paymentMethod` pasa de
`z.enum(["efectivo","tarjeta","transferencia","nequi","daviplata"])` a
`z.enum(["efectivo","transferencia","wompi"])`. Esto **no** afecta al POS:
`pos_sales.payment_method` usa el enum de Postgres `public.payment_method`
(`efectivo|tarjeta|transferencia|nequi|daviplata`), una entidad de base de
datos completamente separada del `orders.payment_method` (que es `text`
libre, validado solo por zod) — confirmado revisando las migraciones.

### Camino manual (sin cambios)

`confirmarPedido` sigue llamando a `create_order` (RPC existente) cuando
`paymentMethod` es `efectivo` o `transferencia`: descuenta stock de
inmediato, pedido queda en `pendiente`, redirige a la confirmación — igual
que hoy.

### Camino Wompi

**Paso 1 — crear el pedido sin tocar stock.** Nuevo RPC
`create_order_wompi(p_shipping_address jsonb)` (security definer, mismo
patrón de autenticación por `auth.uid()` que `create_order`):
- Valida que el carrito pertenezca al usuario autenticado.
- **Verifica** (sin `for update`, sin descontar) que cada ítem tenga stock
  suficiente — si no, lanza excepción igual que `create_order` hoy.
- Genera `order_number` único (mismo patrón `ORD-YYYYMMDD-xxxxxx`).
- Inserta `orders` (`status = 'pendiente'`, `payment_method = 'wompi'`) y
  `order_items` (con snapshot de nombre/variante, igual que hoy).
- Vacía el carrito.
- **No** modifica `products.stock` ni `product_variants.stock`.
- Retorna el pedido creado (necesitamos `order_number`, `id`, `total`).

**Paso 2 — firma de integridad.** Server Action `iniciarPagoWompi`, tras
llamar al RPC:
- Calcula `amountInCents = Math.round(pedido.total * 100)`.
- Calcula la firma: `SHA256(order_number + amountInCents + "COP" + WOMPI_INTEGRITY_SECRET)`
  (algoritmo de integridad de Wompi — concatenación de referencia, monto en
  centavos, moneda y el secreto, hasheado con SHA-256, codificado en hex).
- Retorna al cliente: `{ orderId, reference: order_number, amountInCents,
  currency: "COP", publicKey: WOMPI_PUBLIC_KEY, signature, redirectUrl }`.
  `WOMPI_PRIVATE_KEY`/`WOMPI_INTEGRITY_SECRET`/`WOMPI_EVENTS_SECRET` nunca
  salen del servidor.

**Paso 3 — widget en el navegador.** Client component `WompiCheckoutButton`:
- Carga `https://checkout.wompi.co/widget.js` (una sola vez, con
  `next/script`).
- Al hacer clic, instancia `WidgetCheckout` con los datos del paso 2 y lo
  abre (`.open(callback)`).
- El `callback` recibe el resultado del widget (no confiable como fuente de
  verdad — es solo para UX inmediata) y redirige a
  `/checkout/wompi/retorno?orderId=<id>&estado=<transaction.status>`.

**Paso 4 — página de retorno.** `src/app/(store)/checkout/wompi/retorno/page.tsx`:
- Lee el pedido real de la base de datos (fuente de verdad) y muestra su
  estado actual (`pendiente`/`pagado`/`cancelado`), con un mensaje
  contextual según el `estado` que reportó el widget en la URL ("tu pago
  está siendo confirmado", "pago aprobado", "pago rechazado — intenta de
  nuevo o elige otro método"). Enlaza a "Mis pedidos" para revisar el
  estado definitivo más tarde. Sin polling — el webhook (paso 5) suele
  tardar segundos, y el pedido real siempre es visible en "Mis pedidos".

**Paso 5 — webhook.** `src/app/api/webhooks/wompi/route.ts` (Route Handler,
POST, sin autenticación de Supabase — la autenticación es la firma del
evento):
- Verifica `signature.checksum` recalculando el hash con
  `signature.properties`, el `timestamp` del evento y `WOMPI_EVENTS_SECRET`
  (algoritmo de firma de eventos de Wompi). Si no coincide, responde 401 y
  no procesa nada.
- Busca el pedido por `order_number = data.transaction.reference`.
- Según `data.transaction.status`:
  - `APPROVED` → llama al RPC `confirm_order_payment_wompi(p_order_id,
    p_wompi_transaction_id)`.
  - `DECLINED` / `VOIDED` / `ERROR` → actualiza `orders.status = 'cancelado'`
    directamente (sin RPC especial, no hay stock que tocar).
  - `PENDING` → no hace nada.
- Responde 200 rápido (Wompi reintenta si no recibe 2xx).

**Paso 6 — confirmación atómica.** Nuevo RPC
`confirm_order_payment_wompi(p_order_id uuid, p_wompi_transaction_id text)`
(security definer, `revoke ... from public, anon, authenticated; grant ...
to service_role` — igual que `handle_new_user`, invocable solo desde el
webhook vía el cliente de service role):
- Si el pedido ya está `pagado`, no hace nada (idempotencia — Wompi puede
  reenviar el mismo evento).
- Si sigue `pendiente`: bloquea (`for update`) y descuenta stock de cada
  `order_item` (mismo patrón que `create_order`/`create_pos_sale`), marca
  `status = 'pagado'`, guarda `wompi_transaction_id`.
- Caso borde reconocido y aceptado para este alcance: si el stock ya no
  alcanza en este momento (se agotó entre la creación del pedido y la
  confirmación del pago), el pedido se marca `pagado` de todas formas — ya
  se recibió el dinero — pero puede quedar sobrevendido. Se resuelve a mano
  (reembolso manual vía dashboard de Wompi); automatizarlo queda fuera de
  esta fase.

### Esquema

Una sola migración: `alter table public.orders add column
wompi_transaction_id text;` (nullable). No se necesita una columna de
referencia de pago separada — `order_number` ya es único y sirve como
referencia de Wompi.

## Manejo de errores

- `create_order_wompi` y `confirm_order_payment_wompi` lanzan excepciones
  con mensajes en español, igual que `create_order`/`create_pos_sale`.
- El webhook nunca debe devolver un error 500 por un fallo de negocio
  esperado (p. ej. pedido no encontrado) — responde 200 igualmente para que
  Wompi no reintente indefinidamente un evento que nunca va a resolverse,
  pero registra el problema en logs de servidor.
- La página de retorno maneja el caso de que el pedido no exista (URL
  manipulada) con un mensaje genérico, no un error sin contexto.

## Testing

- Sin TDD de lógica pura nueva más allá de la función de cálculo de firma
  (`calcularFirmaWompi` / `verificarFirmaWebhook`), que sí es pura y
  testeable de forma aislada (dado un secreto y unos valores conocidos, el
  hash resultante es determinista y verificable).
- Verificación de integración contra el **sandbox real de Wompi**: crear un
  pedido de prueba, completar el widget con una tarjeta de prueba de Wompi,
  confirmar que el webhook llega, que la firma se valida, que el stock se
  descuenta solo después de la aprobación (nunca antes), y que reenviar el
  mismo evento no descuenta el stock dos veces (idempotencia). Limpieza de
  datos de prueba al final, mismo patrón que fases anteriores.

## UI

El selector de método de pago del checkout gana una tercera opción visual
("Pagar en línea con Wompi") con los logos de los métodos que soporta
(tarjeta, PSE, Nequi, Bancolombia — Wompi los muestra dentro de su propio
widget, no hace falta reproducirlos en nuestra UI). Sigue la paleta de
marca (`brand-rosa` para el botón de pago, `brand-crema`/`brand-rosa-claro`
para el resto).
