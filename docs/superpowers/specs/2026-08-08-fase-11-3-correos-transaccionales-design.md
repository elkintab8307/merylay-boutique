# Fase 11 (parte 3) — Correos transaccionales con Resend: Diseño

> Sub-fase de la Fase 11 ("Extras", `CLAUDE.md` §12 punto 11) — la última de
> las tres partes en que se dividió (dashboard/pedidos, pago con Wompi, y
> ahora correos). Cubre "correos transaccionales" del roadmap.

## Objetivo

Enviar correos automáticos al cliente en los momentos clave del ciclo de
compra: bienvenida al registrarse, confirmación cuando su pedido queda
pagado, y aviso cuando el admin cambia el estado de su pedido a
enviado/entregado/cancelado.

## Alcance

1. Correo de bienvenida al registrarse.
2. Correo de confirmación de pedido, disparado cuando el pedido queda
   `pagado` (no al crearse `pendiente`).
3. Correo de cambio de estado, para las transiciones a `enviado`,
   `entregado` o `cancelado`.
4. Módulo central de envío + plantillas con `@react-email/components`.

Fuera de alcance: correos al admin/staff (nuevo pedido, stock bajo — mejor
ubicados en la Fase 12), reenvío manual desde el panel, plantilla de
recuperación de contraseña (ya la maneja Supabase Auth), resúmenes/digests.

## Credenciales

`.env.local`: `RESEND_API_KEY` (ya presente, agregada por el dueño del
proyecto). Dominio `merylays.shop` ya verificado en Resend (SPF/DKIM
confirmados). Remitente: `pedidos@merylays.shop`.

## Arquitectura

### Principio de no bloqueo

Ningún flujo de negocio (registro, checkout, cambio de estado) debe fallar
ni revertirse por un correo que no se pudo enviar. `enviarCorreo` **nunca
lanza** — atrapa cualquier error de la API de Resend, lo registra con
`console.error` (mismo formato de log ya usado en el webhook de Wompi) y
retorna `{ error: string } | { id: string }` sin propagar la excepción.

**Se espera (`await`) cada envío**, a pesar de que conceptualmente sea
"fire and forget" en el sentido de que su resultado nunca bloquea la
operación de negocio: el proyecto despliega en Vercel (funciones
serverless), donde una promesa disparada sin `await` corre el riesgo de que
la función termine su ejecución antes de que la llamada HTTP a Resend
complete. Al esperarla (pero sin propagar sus errores), se garantiza que el
correo realmente se envía sin arriesgar la operación principal si Resend
falla.

### Módulo central

`src/lib/email/resend.ts`:
```ts
export async function enviarCorreo(params: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<{ error?: string }>
```
Usa el cliente oficial `resend` (paquete nuevo) con `RESEND_API_KEY`
(server-only, nunca se importa desde código de cliente). Remitente fijo
`"MeryLay Boutique <pedidos@merylays.shop>"`.

### Plantillas

`src/lib/email/templates/`, una por tipo, con `@react-email/components`
(paquete nuevo): `BienvenidaEmail`, `ConfirmacionPedidoEmail`,
`CambioEstadoEmail`. Se usan fuentes de sistema con fallback (Georgia/serif
para títulos, sans-serif para cuerpo) en vez de las Google Fonts de la
marca, ya que los clientes de correo no las cargan de forma confiable;
paleta de marca (rosa `#E96A9E`, dorado `#D9A441`, crema `#FFF8F4`, ciruela
`#6E2A44`) aplicada vía estilos inline, que sí son compatibles.

### Puntos de disparo

1. **Bienvenida** — `src/app/(auth)/registro/actions.ts`, tras un
   `signUp` exitoso (tanto si `data.session` existe como si no —
   independientemente de si Supabase exige confirmación de correo, el
   registro en sí ya ocurrió). Se envía con el `email`/`fullName` que ya
   están en `parsed.data`, sin consultas adicionales.

2. **Confirmación de pedido — pago manual** —
   `src/app/(store)/checkout/actions.ts` (`confirmarPedido`), tras un
   `create_order` exitoso, usando el email de la sesión activa (ya
   disponible vía `supabase.auth.getUser()`, mismo cliente ya creado en la
   función). Se envía **antes** del `redirect(...)` final (`redirect()` en
   Next.js interrumpe la ejecución lanzando una excepción especial — todo
   lo que deba ejecutarse debe ir antes de esa llamada).

3. **Confirmación de pedido — Wompi** —
   `src/app/api/webhooks/wompi/route.ts`, tras un `confirm_order_payment_wompi`
   exitoso (dentro del bloque que ya maneja el caso `APPROVED`). El webhook
   no tiene sesión de usuario, así que el email del cliente se obtiene con
   el cliente de service role (`createAdminClient()`, ya usado en este
   mismo archivo) vía `admin.auth.admin.getUserById(order.user_id)`.

4. **Cambio de estado** — `src/app/admin/pedidos/actions.ts`
   (`cambiarEstadoPedido`), tras un `update` exitoso, **solo** si
   `nuevoEstado` es `enviado`, `entregado` o `cancelado` (nunca para
   `pendiente`→`pagado`, que ya tiene su propio correo de confirmación por
   otra vía, ni para una transición a un estado igual al actual). El email
   del cliente se obtiene igual que en el punto 3: `cambiarEstadoPedido`
   corre en contexto de admin, no del cliente dueño del pedido, así que se
   necesita `createAdminClient()` para leer `auth.users`.

### Lógica pura extraída (testeable sin mocks de Resend)

`src/lib/email/notificaciones.ts`:
```ts
export function debeNotificarCambioEstado(nuevoEstado: string): boolean
```
Devuelve `true` solo para `"enviado" | "entregado" | "cancelado"`. Un solo
lugar que decide la regla de negocio "qué transiciones envían correo",
reutilizado por `cambiarEstadoPedido` y testeado de forma aislada.

## Contenido de cada correo

- **Bienvenida**: nombre del cliente, mensaje de bienvenida a "Inspiración
  Femenina", enlace a la tienda (`/`).
- **Confirmación de pedido**: número de pedido, lista de ítems (nombre,
  variante si aplica, cantidad, precio), total, dirección de envío, método
  de pago, enlace a `/cuenta/pedidos/[id]`.
- **Cambio de estado**: número de pedido, nuevo estado con mensaje
  contextual en español ("Tu pedido fue enviado" / "Tu pedido fue
  entregado" / "Tu pedido fue cancelado"), enlace a `/cuenta/pedidos/[id]`.

## Manejo de errores

- `enviarCorreo` nunca lanza (ver arriba); todo llamador trata su resultado
  como informativo, nunca como condición de fallo del flujo de negocio.
- Si por alguna razón el email del cliente no está disponible en el
  contexto (no debería ocurrir — Supabase Auth siempre lo requiere), se
  omite el envío con un log, sin intentar adivinar o construir un email.

## Testing

- TDD sobre `debeNotificarCambioEstado` (los 3 estados que sí notifican, los
  que no deberían, valores inválidos).
- Verificación de integración: script `.mjs` desechable que llama a
  `enviarCorreo` directamente contra la API real de Resend (dominio ya
  verificado), enviando cada una de las 3 plantillas a una dirección de
  prueba del dueño del proyecto, confirmando que Resend responde con un
  `id` de envío exitoso (no se puede verificar "llegó a la bandeja de
  entrada" de forma automatizada, pero sí que la API la aceptó sin error).

## UI

No hay UI nueva — estos correos no tienen contraparte visual en la
aplicación, más allá de las plantillas mismas (que son la "UI" en este
caso). Sigue la paleta e identidad de marca ya definida en `CLAUDE.md` §3.
