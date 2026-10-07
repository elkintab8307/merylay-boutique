# Agente de WhatsApp — v2: catálogo abierto, fotos, botón de compra y voz

> Extensión del subsistema descrito en
> `2026-10-06-agente-whatsapp-design.md` (ya implementado y en
> producción). Este documento solo cubre lo que cambia/se agrega; todo lo
> no mencionado aquí (verificación de firma, idempotencia, identidad de
> clientes, pago Wompi, notificación de venta nueva) sigue igual.

## Objetivo

1. Los dueños (Elkin/Mary) pueden preguntar de forma abierta por
   inventario — por categoría, talla, color o texto libre — y recibir
   conteo exacto, stock total y fotos reales, no una lista parcial sin
   avisar. También pueden pedir un informe en PDF con fotos y precios de
   cualquier subconjunto del catálogo.
2. Los clientes reciben atención más completa: el bot saluda con
   cordialidad, pregunta qué necesitan, y cuando buscan un producto le
   manda foto real + precio + stock + un botón de WhatsApp para
   agregarlo al carrito, sin que tengan que escribir nada más.
3. Tanto dueños como clientes pueden mandar notas de voz — el bot las
   transcribe y las procesa exactamente igual que un mensaje escrito.

## Fuera de alcance

- Respuestas en audio (texto-a-voz) — solo se transcribe lo que entra; la
  respuesta siempre es texto/fotos/PDF, igual que hoy.
- Consultas en SQL libre / "literalmente cualquier pregunta" — en su
  lugar, un catálogo de acciones más amplio que cubre el espacio real de
  preguntas de negocio (ver sección de acciones). Decisión explícita del
  dueño del proyecto tras explicarle el riesgo de dejar que el modelo
  genere consultas arbitrarias contra una base de datos que mueve dinero
  e inventario real.
- Checkout directo desde el botón de una foto — el botón agrega al
  carrito conversacional (`whatsapp_sessions.session_data`), igual que
  escribir "agrégalo"; el cliente sigue confirmando el pedido completo
  como hoy (`confirmar_pedido`).
- Normalizar valores de `talla` existentes (`Xl` vs `XL`, `Unica` vs
  `Única`) — las búsquedas son case-insensitive así que no bloquean nada,
  pero no se corrige el dato en esta ronda.
- Carrusel nativo de WhatsApp — Meta Cloud API no lo expone de forma
  simple; en su lugar, un mensaje interactivo (foto + texto + botón) por
  producto, hasta un tope por respuesta.

## Confirmado contra el esquema real

- `products`/`product_variants` **no tienen** columna de material/tela.
  Atributos como "licrado", "algodón", "tela fría", "piel de durazno" ya
  viven en el **nombre del producto o de la categoría** (ej. categoría
  "Camiseta algodón licrado manga doblada con pedrería"). `description`
  está vacío en todos los productos actuales. Por eso la búsqueda por
  texto libre debe matchear contra `products.name` **y**
  `categories.name`, no inventar un campo nuevo.
- Todas las fotos del catálogo hoy son `.jpg`/`.png` (confirmado con una
  consulta real a `product_images.url`) — `pdf-lib` soporta ambos
  formatos de forma nativa (`embedJpg`/`embedPng`), sin conversión.
- Volumen actual: 40 productos, 121 variantes, 126 imágenes, 8
  categorías. Los topes de esta sección (50 filas por búsqueda, 10 fotos
  por respuesta en vivo) dejan margen holgado para crecer sin rediseñar.

## Primitiva compartida: búsqueda de catálogo

`catalog.ts` gana una función que generaliza y reemplaza a la actual
`buscarProductos(consulta)`:

```ts
interface FiltrosCatalogo {
  texto?: string;   // contra products.name O categories.name (ILIKE)
  talla?: string;   // contra product_variants.talla (ILIKE)
  color?: string;   // contra product_variants.color (ILIKE)
}

function buscarCatalogo(filtros: FiltrosCatalogo): Promise<ProductoEncontrado[]>
```

- Una fila por "unidad pedible" (variante, o producto base si no tiene
  variantes) — mismo shape que `ProductoEncontrado` ya existente, con
  foto principal, precio, stock, nombre, talla, color.
- Si no se pasa ningún filtro, es inválido (siempre debe haber al menos
  `texto`, `talla` o `color` — igual que hoy `consulta` es obligatorio).
- Tope de 50 filas — acota también cuánto puede tardar un PDF que la use.

Tanto el `buscar_producto` del cliente como el `buscar_inventario` del
dueño son capas finas sobre esta misma función, con distinto formato de
respuesta (ver abajo). Esto reemplaza la actual `consultarProducto` de
`owner-actions.ts` (que solo buscaba por `name`/`sku`): sus pruebas
existentes para SKU exacto se preservan pasando el SKU como `texto`.

## Acciones del dueño (reemplaza/amplía `ACCIONES_DUENO`)

Lectura (inmediatas):

- **`buscar_inventario`**: params `{texto?, talla?, color?}` (reemplaza a
  `consultar_producto`; el modelo debe usarla también para "cuántos/
  cuántas tenemos de X" y "qué stock hay de X/en talla Y"). Responde con
  un encabezado — "Encontré N producto(s) con M unidad(es) en stock en
  total" — y manda hasta 10 fotos (imagen + *caption* con nombre, talla/
  color, precio y stock; **sin botón**, el dueño no agrega al carrito).
  Si hay más de 10 coincidencias, lo dice y sugiere pedir el informe PDF.
- **`generar_informe_pdf`**: mismos params `{texto?, talla?, color?}` —
  genera un PDF con **todas** las coincidencias (hasta el tope de 50 de
  `buscarCatalogo`, sin el tope de 10 de los mensajes en vivo), una fila
  por producto con foto, nombre, talla/color, precio y stock, subido al
  bucket `whatsapp-docs` y mandado como documento (mismo mecanismo de
  link firmado de corta duración que ya usan `generar_catalogo_pdf` y
  `generar_cotizacion_pdf`).

Las demás acciones de lectura (`consultar_ventas`, `consultar_stock_bajo`,
`buscar_cliente`, `consultar_pedido`) no cambian. Las de escritura
(`actualizar_precio_producto`, `actualizar_stock`, `cambiar_estado_pedido`,
`activar_o_desactivar_producto`) tampoco — siguen exigiendo confirmación
previa, sin excepción.

## Acciones del cliente (amplía `ACCIONES_CLIENTE`)

- **`buscar_producto`**: params `{consulta?, talla?, color?}` (antes solo
  `consulta`; `consulta` sigue aceptando texto libre tipo "pijama" o
  "camisetas"). En vez de una lista de texto con ids entre corchetes,
  manda hasta 10 **mensajes interactivos** de WhatsApp — uno por unidad
  encontrada: foto + nombre/talla/color/precio/stock + un botón
  **"Agregar al carrito"**. Si hay más de 10, lo dice y ofrece
  `generar_catalogo_pdf` filtrado por la misma búsqueda.
- **`generar_catalogo_pdf`**: gana los mismos filtros opcionales
  `{texto?, talla?, color?}` (antes siempre era el catálogo completo). Sin
  filtros, se comporta igual que hoy — el catálogo completo.
- El resto de acciones del cliente (`agregar_al_carrito`,
  `quitar_del_carrito`, `generar_cotizacion_pdf`, `confirmar_pedido`,
  `generar_acceso_web`, `chat`) no cambian de contrato, aunque `chat`
  gana una instrucción de tono (ver "Tono de atención" abajo).

## Botón interactivo "Agregar al carrito"

Mensaje tipo `interactive`/`button` de la Graph API de Meta: header =
imagen del producto, body = nombre + talla/color + precio + stock, un
botón `reply` cuyo `id` codifica los ids reales:
`add:<productId>:<variantId|->` (`-` cuando el producto no tiene
variante). Nuevo helper en `_shared/meta.ts`:

```ts
function enviarBotonProducto(
  to: string,
  opts: { fotoUrl: string; cuerpo: string; botonId: string; botonTitulo: string },
): Promise<void>
```

Cuando el cliente toca el botón, Meta reenvía un mensaje entrante de tipo
`interactive` con `button_reply.id`. **Este toque nunca pasa por el
modelo de IA** — se parsea el `id`, se valida el formato
(`add:<uuid>:(<uuid>|-)`; cualquier otra cosa responde un mensaje
genérico en vez de reventar) y se ejecuta la misma lógica que ya usa hoy
`agregar_al_carrito` dentro de `ejecutarAccionCliente` (se extrae a una
función compartida para no duplicarla): vuelve a consultar
`obtenerProductoParaCarrito` contra la base de datos real — nunca se
confía en nombre/precio/stock codificados en el botón — y revalida stock
antes de sumarlo a `sessionData.cart`. La respuesta de confirmación es la
misma que ya existe para "agregar al carrito" por texto.

La idempotencia ya existente (dedupe por `provider_message_id` en
`whatsapp_messages`) cubre un reintento de webhook de Meta sobre el mismo
toque de botón, sin cambios adicionales.

## PDF con fotos (mecánica compartida)

Nueva función en `catalog.ts`, usada tanto por `generar_informe_pdf`
(dueño) como por `generar_catalogo_pdf` filtrado (cliente):

```ts
interface FilaPdf {
  fotoUrl: string | null;
  nombre: string;
  detalle: string;   // "talla M, color rosa" para el informe/catálogo; "x2" para la cotización
  precio: number;
  nota?: string;     // ej. "stock: 5" en el informe del dueño; omitido en la cotización
}

function generarPdfConFotos(titulo: string, filas: FilaPdf[]): Promise<Uint8Array>
```

`buscar_inventario`/`generar_informe_pdf` y `generar_catalogo_pdf` mapean
cada `ProductoEncontrado` a una `FilaPdf` (`detalle` = talla/color, `nota`
= stock); `generar_cotizacion_pdf` mapea cada `ItemCarrito` de la sesión
(`detalle` = `x${qty}`, sin `nota`). Por cada fila: descarga la foto
(`fetch(fotoUrl)` → `arrayBuffer`), la embebe con `embedJpg` o `embedPng`
según la extensión de la URL, y la dibuja junto al texto, paginando
cuando se llena la página. Si la descarga de una foto puntual falla, esa
fila se dibuja sin imagen (solo texto) en vez de abortar todo el PDF — un
error de red en una sola foto no debe tumbar el informe completo.

`generar_catalogo_pdf` (cliente) y `generar_cotizacion_pdf` (cotización
del carrito) pasan a usar esta misma rutina en vez de la actual
`pdfDesdeLineas`: la cotización del cliente también lleva fotos de cada
ítem de su carrito, por la misma razón que el resto de este diseño —
consistencia y porque la rutina ya existe una vez construida para el
informe del dueño. `pdfDesdeLineas` queda sin usos y se elimina.

## Tono de atención al cliente

El *system prompt* del rol `customer` en `agent.ts` gana una instrucción
explícita: saludar con cordialidad en el primer mensaje de la
conversación, preguntar qué necesita el cliente, y usar un tono cálido
consistente con la marca ("Inspiración Femenina"). Esto es un cambio de
texto del prompt, no de código — se ajusta en el plan de implementación
junto con las nuevas acciones.

## Mensajes de voz

WhatsApp manda una nota de voz como `type: "audio"` con un `audio.id`
(media id) — el audio real no viaja en el payload del webhook.

1. `adapters.ts`: `parsearMensajeEntrante` devuelve una unión discriminada
   en vez de un solo shape:
   ```ts
   type MensajeEntrante =
     | { kind: "texto"; messageId: string; from: string; texto: string }
     | { kind: "audio"; messageId: string; from: string; mediaId: string }
     | { kind: "boton"; messageId: string; from: string; botonId: string };
   ```
2. Nuevos helpers en `_shared/meta.ts`: `obtenerUrlMedia(mediaId)` (GET
   `/{media-id}` con `META_ACCESS_TOKEN`, devuelve la URL real) y
   `descargarMedia(url)` (GET esa URL, mismo token — Meta exige
   autenticación también para descargar el archivo).
3. Nuevo módulo `voice.ts`:
   ```ts
   function transcribirAudio(mediaId: string): Promise<string>
   ```
   Descarga el audio y lo manda a la API de transcripción de OpenAI
   (`/v1/audio/transcriptions`, modelo `whisper-1`, mismo
   `OPENAI_API_KEY` que ya se usa para el chat — no se necesita ningún
   secreto nuevo) y devuelve el texto.
4. `handler.ts`: si el mensaje entrante es `kind: "audio"`, se transcribe
   primero; el texto resultante **entra al mismo flujo que un mensaje
   escrito** (mismo historial, mismo `decidirAccion`, mismas acciones de
   fotos/PDF/carrito) — desde ese punto es indistinguible de texto
   tipeado. Si la transcripción falla o devuelve una cadena vacía
   (silencio, formato no soportado), se responde "No pude entender tu
   nota de voz, ¿puedes escribirla o intentarlo de nuevo?" sin llegar a
   llamar a `decidirAccion`.

## Variables de entorno / secrets

Ninguna nueva — todo reutiliza `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`
y `OPENAI_API_KEY` ya configurados.

## Modelo de datos

Sin cambios — ni tablas ni columnas nuevas. Todo el diseño usa el esquema
ya existente (`products`, `product_variants`, `product_images`,
`categories`, `whatsapp_sessions.session_data` para el carrito
conversacional).

## Seguridad (se suma a las 7 reglas ya vigentes del documento v1)

8. El `id` de un botón de WhatsApp nunca se usa para calcular precio,
   stock o nombre — solo para identificar `productId`/`variantId`, que se
   vuelven a consultar contra la base de datos real antes de cualquier
   cambio al carrito.
9. Un mensaje transcrito desde audio se trata exactamente igual que un
   mensaje de texto del usuario — ninguna acción de escritura del dueño
   se ejecuta "más rápido" ni "sin confirmar" por venir de una nota de
   voz; pasa por el mismo *gate* de confirmación que ya existe.
10. Un `id` de botón con formato inesperado nunca se interpola en una
    consulta ni se usa para construir texto ejecutable — se valida con
    una expresión regular fija antes de extraer los uuids.

## Testing

Mismo enfoque TDD con Vitest que el resto del proyecto. Casos mínimos
nuevos:

- `buscarCatalogo`: filtra por texto contra nombre de producto y de
  categoría a la vez; filtra por talla/color; combina varios filtros;
  respeta el tope de 50; sin ningún filtro, falla de forma clara.
- `buscarInventario`/`generarInformePdf` (dueño): resume conteo + stock
  total; avisa truncamiento sobre 10 en el mensaje en vivo; el PDF incluye
  hasta 50 sin ese tope de 10; sin coincidencias, mensaje claro.
- Botón "Agregar al carrito": id bien formado agrega el producto/variante
  correcto revalidando stock; id con producto ya sin stock responde
  "agotado" sin tocar el carrito; id malformado responde un mensaje
  genérico sin lanzar una excepción sin capturar.
- `transcribirAudio`: transcripción exitosa devuelve el texto; fallo de
  la API o transcripción vacía se maneja sin llegar a `decidirAccion`.
- `generarPdfConFotos`: una foto que falla al descargar no aborta el PDF
  completo (esa fila queda sin imagen).
