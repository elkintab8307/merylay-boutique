# Agente de WhatsApp con IA — Diseño

> Nuevo subsistema (no es una fase del roadmap original de `CLAUDE.md`).
> Basado en el documento de referencia `MERYLAY_BOUTIQUE_WHATSAPP_AGENT.md`
> (patrón ya probado en producción en otro proyecto del mismo desarrollador,
> "bioreformas"), adaptado a este esquema real de base de datos.

## Objetivo

Un agente de WhatsApp impulsado por IA que:
1. Responda a clientes (catálogo, precios, stock, fotos, políticas, cotizaciones).
2. Tome pedidos y cobre con Wompi dentro de la conversación.
3. Avise a los dos números del dueño cuando entre una venta nueva, sea del
   canal que sea (web, WhatsApp o POS).
4. Le dé a esos dos números acceso total de lectura y escritura sobre el
   negocio (reportes, productos, pedidos, stock) en lenguaje natural.

## Alcance

Incluye: webhook de Meta Cloud API, agente con function-calling (OpenAI
`gpt-4o-mini`), flujo de cliente (catálogo en vivo, carrito conversacional,
cotización en PDF, pedido + pago Wompi vía link), flujo de dueño (consultas
y acciones estructuradas sobre el negocio, con confirmación antes de
escribir), notificación de venta nueva multi-canal, registro automático de
clientes de WhatsApp reusando la convención de cuentas sin email que ya
existe en `/registro`.

Fuera de alcance: WhatsApp Flows nativo de Meta, pago sin salir de
WhatsApp (se usa un link que abre el widget de Wompi en el navegador),
atención humana en vivo / traspaso a un agente humano, soporte
multi-idioma, cambios al checkout web o al POS existentes (solo se les
agrega la columna `channel` / el webhook de notificación, sin tocar su
lógica).

## Identidad de los números

- **Dueños** (acceso total): `+573215879805` → *Elkin*, `+573102862373` →
  *Mary*. Lista fija en una variable de entorno
  (`WHATSAPP_OWNER_NUMBERS=573215879805,573102862373`, normalizada a solo
  dígitos) — no en base de datos, para no depender de una tabla para algo
  que cambia casi nunca. El agente los saluda por su nombre (mapeo fijo en
  código, no en la variable de entorno).
- **Cualquier otro número**: cliente. Flujo de cliente completo (catálogo,
  pedidos, pagos, registro automático).

## Arquitectura

Todo corre en **Supabase Edge Functions** (Deno), separado por completo del
despliegue de Vercel — decisión explícita del dueño del proyecto para
aislar costo/runtime de WhatsApp del resto de la app Next.js.

```
supabase/functions/
  whatsapp-webhook/
    index.ts        # Verifica firma HMAC, responde 200 ya, EdgeRuntime.waitUntil(procesar)
    adapters.ts      # Envío/recepción Meta Cloud API (texto, imagen por link, documento por link)
    agent.ts          # OpenAI function-calling; system prompt distinto si es dueño o cliente
    handler.ts         # Orquestador: sesión -> agente -> acción -> log
    flows/
      db.ts            # getSupabase() memoizado con SERVICE_ROLE_KEY
      catalog.ts        # Búsqueda en vivo + generación de PDF (catálogo y cotización)
      customers.ts       # buscar/crear perfil de cliente por teléfono
      orders.ts            # crear pedido + link de pago Wompi
      owner-actions.ts      # funciones de escritura/lectura para Elkin y Mary
  notificar-pedido/
    index.ts        # Recibe el Database Webhook (orders/pos_sales insert), manda WhatsApp a Elkin y Mary
```

Ninguno de estos archivos comparte código con `src/lib/supabase/*` del
proyecto Next.js: corren en Deno, con su propio cliente de
`@supabase/supabase-js` vía `npm:` y su propia `SERVICE_ROLE_KEY` leída de
`Deno.env.get(...)`.

### Flujo de un mensaje entrante

1. Meta llama a `whatsapp-webhook` → `index.ts` verifica la firma
   (`X-Hub-Signature-256`, HMAC-SHA256 con `META_APP_SECRET`). Si no
   verifica, responde 403 y no procesa nada.
2. Responde `200` inmediatamente y sigue procesando dentro de
   `EdgeRuntime.waitUntil(...)`.
3. Si el `message_id` del proveedor ya existe en `whatsapp_messages`,
   descarta (idempotencia — Meta reintenta webhooks).
4. `handler.ts` carga o crea la sesión (`whatsapp_sessions`, por
   `phone_number`), determina si el remitente es dueño o cliente.
5. Si es cliente nuevo (sin perfil aún), `customers.ts` le crea una cuenta
   (ver sección siguiente) antes de continuar.
6. `agent.ts` llama a OpenAI con el system prompt correspondiente y las
   funciones (tools) permitidas para ese rol, usando el historial reciente
   de `whatsapp_messages` como contexto.
7. El modelo devuelve una función a ejecutar (o `chat` para respuesta
   libre). `handler.ts` la ejecuta vía el flow correspondiente.
8. `adapters.ts` envía la respuesta por la Graph API de Meta. Se loguea el
   mensaje saliente en `whatsapp_messages`.

## Identificación y registro de clientes

Este proyecto **ya tiene** la pieza exacta que se necesita para esto —
nada nuevo que inventar:

- `profiles.whatsapp` (migración `031_registro_clientes.sql`) guarda el
  teléfono tal cual, y `handle_new_user()` deriva el `username` de ese
  número cuando no hay email.
- `registro()` (`src/app/(auth)/registro/actions.ts`) ya registra clientes
  **sin email real**, creando un email sintético
  `${digitosTelefono}@merylay.local` vía `auth.admin.createUser(...)`.
- `buscar_profile_por_telefono(p_telefono)` (migración
  `044_buscar_profile_por_telefono.sql`) ya busca un perfil por teléfono
  normalizado (solo dígitos).

El bot reusa exactamente esta convención:

1. Al primer mensaje de un número, llama a `buscar_profile_por_telefono`.
   Si ya existe (porque se registró antes en la web, o porque ya habló con
   el bot antes), reusa ese `profiles.id` como identidad del cliente.
2. Si no existe, crea la cuenta igual que `registro()` sin email:
   `auth.admin.createUser({ email: '${digitos}@merylay.local', email_confirm: true, user_metadata: { whatsapp: digitos } })`.
   El trigger `handle_new_user()` ya existente crea el `profile` (rol
   `customer`, `username` = dígitos del teléfono) sin tocar ese trigger.
3. **Acceso web, si lo pide**: el cliente puede pedirle al bot "quiero ver
   mis pedidos en la página". Una función del agente
   (`generar_acceso_web`) genera una contraseña aleatoria con
   `admin.auth.admin.updateUserById(id, { password })` y se la manda por
   WhatsApp junto con su usuario (su propio número). Como el `username`
   derivado es el mismo número de teléfono, inicia sesión en
   `/login` exactamente igual que cualquier cuenta registrada sin email —
   **cero cambios** en `/login` o `/registro`.
4. Todos los pedidos que tome el bot quedan en `orders.user_id` = ese
   mismo `profiles.id`, así que el historial en "Mi cuenta" siempre incluye
   lo comprado por WhatsApp, sin pasos de "vinculación" manuales.

## Catálogo y cotizaciones

- **Consulta en vivo**: `catalog.ts` consulta `products` /
  `product_variants` / `product_images` / `categories` directo (vía
  `service_role`, sin pasar por RLS) para responder precio/stock/variantes
  reales. Las fotos se envían a WhatsApp pasando la URL pública del bucket
  `product-images` directo como `image.link` — Meta las descarga él mismo,
  no hace falta subir el archivo primero.
- **Carrito conversacional**: mientras el cliente va agregando productos,
  el estado (ítems, cantidades) vive en `whatsapp_sessions.session_data`
  (jsonb) — no en la tabla `carts` del checkout web, que está pensada para
  sesión de navegador. El bot le muestra el resumen con precios y total en
  cada paso.
- **PDF de catálogo completo**: función `generar_catalogo_pdf`, genera un
  PDF desde los productos activos en el momento (no un archivo estático
  que se desactualiza), lo sube a un bucket privado nuevo
  `whatsapp-docs`, y manda un link firmado de corta duración (10 min) como
  `document.link`.
- **PDF de cotización personalizada**: función `generar_cotizacion_pdf`,
  mismo mecanismo pero solo con los ítems que el cliente tiene en su
  carrito conversacional en ese momento — para cuando solo quiere un
  documento con precios, sin confirmar pedido todavía.

## Pedido y pago (Wompi vía link)

El widget de Wompi es JavaScript de navegador — no se puede embeber dentro
de WhatsApp. El flujo real:

1. Cliente confirma su pedido en el chat (`confirmar_pedido`).
2. Nuevo RPC `crear_pedido_wompi_whatsapp(p_user_id uuid, p_items jsonb, p_shipping_address jsonb)`
   — mismo patrón que `create_order_wompi` (migración `013_wompi_pago.sql`)
   pero **sin depender de `auth.uid()` ni de la tabla `carts`** (el bot no
   tiene sesión de usuario ni usa esa tabla): recibe los ítems
   explícitamente, valida stock, inserta en `orders`/`order_items` con
   `channel = 'whatsapp'`, `payment_method = 'wompi'`, `status = 'pendiente'`.
   Revocado de `public`/`anon`/`authenticated`, otorgado solo a
   `service_role` (igual que `confirm_order_payment_wompi`).
3. El bot calcula la firma de integridad igual que `wompi-actions.ts` y
   construye un link a una página nueva del sitio
   (`/checkout/wompi/whatsapp/[orderId]`) que abre el widget directo con
   esos datos (sin pasar por el formulario de checkout normal).
4. El cliente paga en su navegador. El webhook de Wompi **que ya existe**
   (`src/app/api/webhooks/wompi/route.ts` → `confirm_order_payment_wompi`)
   confirma el pago exactamente igual que un pedido web — no se toca nada
   de esa ruta, porque no le importa de qué canal vino el pedido.
5. El bot no necesita enterarse del resultado del pago en tiempo real
   dentro del chat: la notificación al dueño (siguiente sección) se
   dispara igual por el `INSERT`/cambio en `orders`, no por el bot.

## Acciones de Elkin y Mary (lectura total + escritura confirmada)

Sin herramienta de SQL libre — un conjunto explícito de funciones en
`owner-actions.ts`, cada una validada con Zod, ejecutadas con
`service_role`. Ejemplos mínimos a implementar:

- Lectura: `consultar_ventas(periodo)`, `consultar_stock_bajo()`,
  `buscar_cliente(nombre_o_telefono)`, `consultar_pedido(numero_o_id)`,
  `consultar_producto(nombre_o_sku)`.
- Escritura (con confirmación previa obligatoria — ver siguiente punto):
  `actualizar_precio_producto`, `actualizar_stock`,
  `cambiar_estado_pedido`, `activar_o_desactivar_producto`,
  `crear_categoria`, `editar_categoria`.

**Confirmación antes de escribir**: cuando el modelo decide una función de
escritura, `handler.ts` no la ejecuta de inmediato — responde describiendo
el cambio exacto que va a hacer y espera un mensaje de confirmación
("sí"/"confirmo") en el turno siguiente antes de ejecutarla. Las funciones
de lectura no necesitan esto. Este conjunto de funciones es extensible: si
falta una acción puntual más adelante, se agrega como una función nueva,
nunca como acceso a SQL arbitrario.

## Notificación de venta nueva (todos los canales)

Un **Database Webhook de Supabase** (configurado vía MCP, no a mano en el
dashboard) sobre `INSERT` en `orders` y en `pos_sales`, apuntando a la
Edge Function `notificar-pedido`. Recibe el row completo insertado,
arma un resumen (cliente si aplica, ítems, total, canal) y le manda un
WhatsApp a Elkin y a Mary vía la misma Graph API de Meta. Dispara sin
importar si el pedido vino del checkout web, del POS o del propio bot —
la lógica vive en la base de datos, no repetida en cada flujo.

## Modelo de datos — cambios necesarios

```sql
-- Canal de origen del pedido (default 'web' para no romper filas existentes)
alter table public.orders
  add column channel text not null default 'web'
  check (channel in ('web', 'whatsapp', 'pos'));

-- Estado de conversación en curso
create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  customer_id uuid references public.profiles(id),
  session_data jsonb not null default '{}',
  last_interaction timestamptz not null default now()
);

-- Log de mensajes (auditoría + idempotencia por message_id del proveedor)
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text unique,
  message_body text,
  created_at timestamptz not null default now()
);
```

RLS activado en las dos tablas nuevas, sin políticas públicas (solo
`service_role` las toca, igual que recomienda el documento de
referencia). Bucket nuevo `whatsapp-docs` (privado) para los PDFs de
catálogo/cotización.

**Columnas reales de `product_variants`** (confirmadas contra las
migraciones vigentes, no solo la 002 original): `name`, `sku`,
`price_override`, `stock`, `talla`, `color` (migración
`009_variantes_talla_color.sql`), `nueva_coleccion_desde` (migración
`052_nueva_coleccion.sql`). El catálogo en vivo debe mostrar talla/color
reales, no inventar un formato propio.

**Estampado (`image_id`)**: cuando una variante tiene más de una foto
propia, `order_items`/`pos_sale_items`/`cart_items` registran en
`image_id` cuál imagen específica eligió el cliente (migración
`046_seleccion_estampado.sql`). El nuevo RPC
`crear_pedido_wompi_whatsapp` debe aceptar `image_id` opcional por ítem y
guardarlo igual, para que un pedido de WhatsApp se vea en el panel admin
exactamente igual que uno del checkout web (foto de estampado elegida
incluida).

## Variables de entorno / secrets nuevos

```
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_VERIFY_TOKEN=          # inventado, usado solo para el handshake del webhook
META_APP_SECRET=
OPENAI_API_KEY=
WHATSAPP_OWNER_NUMBERS=573215879805,573102862373
```

Se cargan con `supabase secrets set ...` (nunca en texto plano en el
repo). `META_VERIFY_TOKEN` se genera una vez y se pega también en el
dashboard de Meta for Developers al configurar el webhook.

## Seguridad (no negociable, por experiencia real del proyecto de referencia)

1. Verificar siempre la firma del webhook en producción — nunca un flag
   `SKIP_VERIFY`.
2. Responder `200` ya, procesar en `waitUntil`.
3. Idempotencia por `provider_message_id` (constraint `unique` en
   `whatsapp_messages`).
4. `getSupabase()` memoizado, una sola vez, con `SERVICE_ROLE_KEY`.
5. Nunca hardcodear secretos — todo vía `Deno.env.get(...)`.
6. RLS activado desde la misma migración que crea cada tabla nueva.
7. Ninguna función de escritura de `owner-actions.ts` acepta SQL o
   identificadores de tabla/columna generados por el modelo — siempre
   parámetros tipados y validados con Zod.

## Testing

Vitest, mockeando `Deno`, `@supabase/supabase-js` y `agent.ts` — mismo
enfoque que ya usa el proyecto de referencia y que sigue el resto de este
repo (TDD: tests que fallan antes de implementar, por sección 0 de
`CLAUDE.md`). Casos mínimos: verificación de firma (válida/invalida),
idempotencia (mismo `message_id` dos veces), creación de cliente nuevo vs
reconocimiento de cliente existente por teléfono, bloqueo de acción de
escritura sin confirmación previa, cálculo de firma de integridad Wompi
para el RPC nuevo.
