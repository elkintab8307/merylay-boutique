# Diseño — Fase 7: Carrito y checkout — MeryLay Boutique

**Fecha**: 2026-08-06
**Estado**: Aprobado
**Alcance**: Roadmap del CLAUDE.md, sección 12 punto 7 ("Carrito y checkout:
carrito persistente + creación de pedidos (pago manual)"), implementando la
sección 7.1 (carrito, checkout) y la arquitectura de carrito de la sección 2.

## Fuera de alcance

Integración con pasarela de pago real (Wompi/Mercado Pago — queda para
"Extras", Fase 11). Cambiar el estado de un pedido desde el cliente (eso es
gestión de pedidos del admin, fuera del roadmap textual de esta fase).
Notificaciones por correo.

## Decisiones de diseño (confirmadas con el usuario)

- **Invitados**: carrito 100% en `localStorage`, sin tocar Supabase. Pueden
  navegar, agregar, editar cantidades y quitar ítems sin cuenta.
- **Autenticados**: carrito real en `carts`/`cart_items`, mutado vía Server
  Actions (mismo patrón que el admin de la Fase 5).
- **Checkout requiere sesión** (`orders.user_id` es obligatorio): un invitado
  que hace click en "Proceder al pago" se redirige a
  `/login?redirectTo=/checkout`.
- **Fusión del carrito al iniciar sesión/registrarse**: esto requiere
  modificar los Server Actions de login/registro de la Fase 3 para que ya no
  hagan `redirect()` internamente — devuelven éxito, el cliente (único lugar
  con acceso a `localStorage`) fusiona el carrito de invitado al carrito de
  Supabase del usuario, y **entonces** navega. Es la única modificación a
  código de una fase anterior en este plan.
- **Transacción de checkout atómica**: función Postgres `create_order`
  (`security definer`, migración 010) que, en una sola transacción: valida
  que el carrito sea del usuario autenticado, bloquea (`FOR UPDATE`) y
  verifica stock suficiente por ítem (aborta con error claro si falta),
  descuenta stock, genera el número de pedido, crea `orders` + `order_items`
  (con snapshot de nombre y variante), vacía el carrito. Evita sobreventa en
  escrituras concurrentes y pedidos a medias si algo falla.
- **Métodos de pago**: efectivo, tarjeta, transferencia, Nequi, Daviplata
  (mismas opciones que el POS, columna `orders.payment_method` ya es texto
  libre).
- **Después de pagar**: redirige a `/cuenta/pedidos/[id]?confirmado=1`, que
  sirve como confirmación (banner de éxito) y como vista de detalle general
  reutilizable. Se agrega `/cuenta/pedidos` con el listado de pedidos del
  usuario.
- **Sin contador de carrito en el header**: dado que el carrito de invitado
  vive solo en `localStorage` (dato que un Server Component no puede leer),
  se omite un badge con la cantidad de ítems para no mezclar renderizado
  servidor/cliente de forma forzada. El header solo gana un enlace estático
  "Carrito" y, si hay sesión, "Mis pedidos".
- **`VariantOption` gana el campo `id`**: la Fase 6 no necesitaba el UUID real
  de la variante (solo talla/color/sku/stock para filtros y selección visual),
  pero el carrito sí lo necesita como `cart_items.variant_id`. Se extiende el
  tipo y se actualiza la query de la página de producto y los tests
  existentes de la Fase 6 — el único otro cambio a una fase anterior.

## Arquitectura

Server Components por defecto para páginas de datos (`/carrito` cuando hay
sesión, `/checkout`, `/cuenta/pedidos*`); Client Components para el carrito
de invitado (`localStorage`), los controles de cantidad, y el formulario de
checkout. Lógica pura de carrito (fusionar cantidades, capar al stock,
calcular subtotal) extraída a `src/lib/cart/` para TDD. La operación
financiera (verificar stock, descontar, crear pedido) vive en una función
Postgres atómica, no en código de aplicación con múltiples pasos.

## Archivos

- `supabase/migrations/010_checkout_rpc.sql`
- `src/lib/cart/local-cart.ts`, `src/lib/cart/__tests__/local-cart.test.ts`
- `src/lib/cart/get-or-create-cart.ts`
- `src/lib/cart/merge-guest-cart-action.ts`
- `src/app/(store)/carrito/{page.tsx, actions.ts, guest-cart.tsx,
  authenticated-cart.tsx, cart-item-controls.tsx}`
- `src/lib/validation/checkout.ts`,
  `src/lib/validation/__tests__/checkout.test.ts`
- `src/app/(store)/checkout/{page.tsx, actions.ts, checkout-form.tsx}`
- `src/app/(store)/cuenta/pedidos/page.tsx`
- `src/app/(store)/cuenta/pedidos/[id]/page.tsx`
- Modifica: `src/app/(auth)/login/{actions.ts, login-form.tsx}`,
  `src/app/(auth)/registro/{actions.ts, registro-form.tsx}`
- Modifica: `src/lib/store/variants.ts`,
  `src/lib/store/__tests__/variants.test.ts`
- Modifica: `src/app/(store)/producto/[slug]/{page.tsx,
  product-variant-selector.tsx}`
- Modifica: `src/components/layout/site-header.tsx`

## Verificación

- `pnpm test` cubre la lógica pura de `src/lib/cart/local-cart.ts` (fusionar,
  actualizar cantidad, quitar, subtotal) y el schema zod de checkout.
- Verificación manual/script contra el proyecto real: agregar productos al
  carrito como invitado, iniciar sesión y confirmar que el carrito se fusionó,
  editar cantidades, completar el checkout, confirmar que el stock se
  descontó, que el pedido y sus ítems existen con el snapshot correcto, y que
  un segundo intento de comprar más unidades que el stock disponible falla
  con un mensaje claro sin dejar datos a medias.
- `pnpm build`, `pnpm lint`, `pnpm test` en verde antes de cerrar la fase.
