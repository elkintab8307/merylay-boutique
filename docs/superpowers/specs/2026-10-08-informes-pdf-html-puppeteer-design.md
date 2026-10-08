# Informes del bot de WhatsApp — migración de pdf-lib a HTML + Puppeteer

> Este documento nace de una queja real del dueño con un PDF adjunto
> (`informe-merylay.pdf`): el informe de productos con fotos se veía mal
> diseñado. La causa raíz tenía dos partes — un bug de agrupación de datos
> (ver "Bug encontrado" abajo) y una limitación de la herramienta de dibujo
> (`pdf-lib` no ajusta ni trunca texto automáticamente, así que nombres de
> producto largos se desbordaban sobre la tarjeta vecina). Se decidió con el
> dueño resolver ambas cosas a la vez, migrando la generación de PDFs a un
> motor real de HTML/CSS.

## Motivación

El diseño anterior (`pdf-marca.ts`, dibujado a mano con coordenadas X/Y sobre
`pdf-lib`) tiene un límite estructural: no hay wrap de texto, truncado, ni
layout automático. Cualquier nombre de producto o categoría más largo que el
ancho calculado se dibuja igual y se desborda visualmente sobre la tarjeta
siguiente. Corregir esto manualmente (calcular anchos, truncar con "...",
etc.) es posible pero parchado; HTML/CSS ya resuelve esto de forma nativa
(`text-overflow`, `white-space`, Grid/Flexbox) y además permite acercarse
mucho más al diseño de referencia que el dueño compartió (esquinas
redondeadas, sombras, tipografía real de Google Fonts) — cosas que `pdf-lib`
no soporta sin dibujar cada curva a mano.

**Decisión explícita con el dueño:** migrar **todos** los PDFs del bot
(tarjetas de producto Y tablas de informes de negocio) a este nuevo motor,
no solo los de fotos — para que el sistema use un solo mecanismo de
generación de PDF, consistente a futuro.

**Costo de infraestructura (investigado y confirmado con el dueño antes de
decidir):** el nuevo motor corre en una función serverless de Vercel con
Puppeteer + Chromium. Con el modelo de Fluid Compute de Vercel (cobra por
CPU real, no por tiempo de espera de red), el costo estimado por PDF es
~0.002 GB-horas — con el volumen real de este bot (un dueño pidiendo
informes por WhatsApp, no tráfico público masivo), esto no se acerca a la
cuota gratuita del plan Hobby (100 GB-horas/mes) ni genera cargos
perceptibles en Pro. Ver conversación de diseño para las cifras completas.

## Bug encontrado (independiente del motor de renderizado, se corrige igual)

`agruparPorProducto` (en `catalog.ts`, del plan anterior) agrupa las filas de
`buscarCatalogo` por `productId`. En el catálogo real de MeryLay, cada talla
de un mismo estilo es un **producto separado** (mismo nombre, SKU y
`product_id` distintos) — las tallas NO viven en `product_variants` para
estos productos. Resultado observado en producción: "Camiseta algodón
licrado manga doblada" en talla S, M, XL y XXL salían como **4 tarjetas
casi idénticas** en vez de una sola tarjeta con 4 insignias de talla, como
en el diseño de referencia del dueño.

**Fix:** agrupar por **nombre exacto** (`nombre.trim()`) en vez de
`productId`. Esto funciona para ambos casos reales del catálogo: productos
que sí usan `product_variants` (ya comparten `productId`, agrupan igual) y
productos que usan un producto separado por talla (ahora se agrupan por
nombre). Se mantiene el resto de la lógica de `agruparPorProducto` igual
(tallas/colores distintos, foto/categoría del primero disponible, rango de
precio, stock total).

## Arquitectura

```
Edge Function (Deno, supabase/functions/whatsapp-webhook)
  reports.ts / owner-actions.ts / catalog.ts
    llaman a generarPdfTabla(...) / generarPdfTarjetas(...)
    (MISMAS firmas que hoy — ningún call-site cambia)
        │
        ▼
  pdf-render.ts (reemplaza a pdf-marca.ts)
    hace fetch() a POST {SITE_URL}/api/pdf/render
    con header de secreto compartido
        │
        ▼ (HTTP)
Next.js / Vercel (src/app/api/pdf/render/route.ts)
  runtime nodejs, Puppeteer + @sparticuz/chromium
  construye el HTML (plantilla-tabla.ts / plantilla-tarjetas.ts)
  renderiza a PDF, devuelve los bytes crudos
        │
        ▼
  pdf-render.ts recibe los bytes, los devuelve a su llamador
  (reports.ts/owner-actions.ts/catalog.ts siguen llamando a
  subirYFirmar() exactamente igual que hoy — el almacenamiento en
  Supabase Storage y la firma del link NO se mueven a Vercel)
```

**Por qué mantener las firmas de `generarPdfTabla`/`generarPdfTarjetas`:**
cero cambios en `reports.ts`, `owner-actions.ts`, ni en los call-sites de
`catalog.ts` — solo cambia la implementación interna de esas dos funciones
(antes dibujaban con `pdf-lib`, ahora hacen una petición HTTP). Esto acota
el blast radius del cambio a `pdf-render.ts` (antes `pdf-marca.ts`) más el
nuevo código en el repo Next.js.

**Por qué el renderizador NO sube a Storage directamente:** mantiene la
separación de responsabilidades que ya existe (`subirYFirmar` en
`catalog.ts` es la única fuente de verdad para subir/firmar PDFs), y evita
darle al endpoint de Vercel credenciales de `service_role` de Supabase que
no necesita para su única tarea (renderizar HTML a PDF).

## Contrato del endpoint (`POST /api/pdf/render`)

**Seguridad (fail-closed, mismo patrón que `WOMPI_EVENTS_SECRET` y
`NOTIFICAR_PEDIDO_SECRET` ya usados en este repo):** header
`x-pdf-render-secret` debe coincidir con `PDF_RENDER_SECRET` del entorno.
Sin ese env var configurado, o si no coincide, se rechaza con 403 ANTES de
tocar el cuerpo o lanzar Chromium — nunca se renderiza "por si acaso".

**Cuerpo de la petición**, discriminado por `tipo`:

```ts
// Tabla (informe_ventas, productos_mas_vendidos, informe_clientes,
// informe_gastos, informe_creditos, informe_abonos, informe de productos
// sin fotos) — mismos 3 argumentos que ya recibe generarPdfTabla hoy.
type CuerpoTabla = {
  tipo: "tabla";
  titulo: string;
  encabezados: string[];
  filas: string[][];
};

// Tarjetas (informe de productos con fotos del dueño, catálogo de
// clientes, cotización) — mismos 5 argumentos que ya recibe
// generarPdfTarjetas hoy.
type CuerpoTarjetas = {
  tipo: "tarjetas";
  titulo: string;
  subtitulo: string;
  fotoHeroUrl: string | null;
  estadisticas: { valor: string; etiqueta: string }[];
  tarjetas: {
    fotoUrl: string | null;
    nombre: string;
    pills: { etiqueta: string; valores: string[] }[];
    precio: number | null;
    nota?: string;
  }[];
};
```

**Respuesta:** `200` con `Content-Type: application/pdf` y los bytes del
PDF en el cuerpo. Errores de Chromium/renderizado devuelven `500` con un
JSON `{ error: string }` — `pdf-render.ts` en la Edge Function los propaga
como una excepción (igual que hoy propaga un fallo de `pdf-lib`), y el
`try/catch` ya existente en `handler.ts` lo convierte en el mensaje de
disculpa genérico al dueño/cliente.

**Runtime de Vercel:** `export const runtime = "nodejs"` (Puppeteer no
corre en el Edge Runtime) y `export const maxDuration = 60` (el máximo que
funciona tanto en Hobby como en Pro sin depender de que el dueño tenga
Fluid Compute activado) — suficiente margen para el arranque de Chromium
más la descarga de fotos de producto en un informe con varias tarjetas. Si
en producción esto resulta corto (informes con muchas fotos), subir este
valor requiere el plan Pro con Fluid Compute; se deja como ajuste futuro
puntual, no bloquea este plan.

## Diseño visual (HTML/CSS)

Dos plantillas, cada una una función pura `(datos) => string` que devuelve
el HTML completo (con `<style>` inline, sin dependencias de build-time):

- **`plantilla-tabla.ts`**: encabezado de marca (logo + título, banda
  dorada), tabla HTML real (`<table>`) con encabezados y filas, pie de
  página — mismo contenido que `generarPdfTabla` ya produce hoy, sin
  cambios de datos, solo de motor.
- **`plantilla-tarjetas.ts`**: encabezado grande (logo + título de dos
  líneas + foto destacada a la derecha), banda de estadísticas, cuadrícula
  CSS Grid de 3 columnas de tarjetas con **esquinas redondeadas**,
  **sombra**, imagen con `object-fit: cover` (evita distorsión de aspecto),
  nombre con `-webkit-line-clamp: 2; text-overflow: ellipsis` (nunca se
  desborda, se corta con "…" tras 2 líneas), insignias de Tallas/Categoría
  como `<span>` con `border-radius: 999px` (pill real), precio y stock.
  Fuentes: Google Fonts (`<link>` a Playfair Display + Montserrat,
  igual que pide CLAUDE.md sección 3 — más simple y confiable que el hack
  de CDN de fontsource que usaba `pdf-marca.ts`). Logo e imágenes de
  producto se referencian por URL absoluta (`SITE_URL`/Supabase Storage);
  Chromium las descarga como un navegador real.

Colores: los mismos tokens de marca de siempre (`#E96A9E`, `#D9A441`,
`#F29DB8`, `#F5B7C8`, `#F8D4DD`, `#FFF8F4`, `#6E2A44`), ahora como variables
CSS en vez de objetos `rgb()` de `pdf-lib`.

## Limpieza

- `pdf-marca.ts` se reemplaza por `pdf-render.ts` (nuevo contenido: solo el
  cliente HTTP + las 2 funciones con sus firmas actuales). Todo lo que
  dibujaba con `pdf-lib` (`cargarFuentesMarca`, `cargarLogoMarca`,
  `dibujarEncabezado`, `dibujarPiePagina`, `dibujarPill`,
  `dibujarTarjetaProducto`, `embedFotoDesdeUrl`, `generarPdfTarjetas`,
  `generarPdfTabla` con `pdf-lib`) se elimina.
- `supabase/functions/deno.json`: se quitan las dependencias `pdf-lib` y
  `@pdf-lib/fontkit` (sin más consumidores en la Edge Function tras este
  cambio).
- `agruparPorProducto` en `catalog.ts`: cambia su clave de agrupación de
  `productId` a `nombre` (ver "Bug encontrado" arriba).

## Variables de entorno nuevas

```env
# En Supabase (Edge Function secrets):
PDF_RENDER_SECRET=...        # mismo valor que en Vercel
# SITE_URL ya existe — se reutiliza para apuntar a {SITE_URL}/api/pdf/render

# En Vercel (Production + Preview, igual que RESEND_API_KEY):
PDF_RENDER_SECRET=...        # mismo valor que en Supabase
```

Fail-closed: si `PDF_RENDER_SECRET` falta en el lado de la Edge Function,
`pdf-render.ts` nunca manda la petición (rechaza localmente con un error
claro); si falta en Vercel, el endpoint rechaza con 403 cualquier petición.
Ninguno de los dos lados "funciona a medias" sin el secreto.

## Fuera de alcance

- No se migra la generación de ningún PDF del sitio Next.js en sí (facturas,
  recibos, etc.) — hoy no existe ninguno (`pdf-lib` está en el `package.json`
  raíz pero sin ningún uso real en `src/`, confirmado por grep).
- No se cambia el almacenamiento/firma de URLs de Supabase Storage
  (`subirYFirmar` sigue igual).
- No se agrega un segundo motor de renderizado de respaldo si Chromium
  falla — un fallo de Puppeteer se propaga como cualquier otro error del
  bot hoy (disculpa genérica al usuario, registrado en logs). Si esto
  resulta ser un problema real de confiabilidad en producción, se evalúa
  aparte.

## Testing

- **`plantilla-tabla.ts`/`plantilla-tarjetas.ts`** (Next.js, Vitest): son
  funciones puras `(datos) => string` — se prueban con aserciones sobre el
  HTML devuelto (contiene el título, una fila/tarjeta por dato, el nombre
  truncado no rompe el HTML, sin fotos cae a un placeholder, etc.), sin
  Puppeteer real.
- **`src/app/api/pdf/render/route.ts`**: prueba del guard de seguridad
  (sin secreto o con uno incorrecto → 403, nunca llega a lanzar Chromium) y
  del despacho por `tipo` (llama a la plantilla correcta) con Puppeteer
  mockeado — no se lanza un Chromium real en el test suite.
- **`pdf-render.ts`** (Supabase Edge Function, Vitest/Deno): prueba que
  arma el `fetch()` con el header correcto y el cuerpo esperado para cada
  `tipo`, y que un `PDF_RENDER_SECRET` ausente lanza localmente sin llegar
  a hacer la petición.
- **`agruparPorProducto`**: actualizar los tests existentes (de
  `productId` a `nombre` como clave) + un caso nuevo que fija el bug real
  (mismo nombre, `productId` distinto, tallas distintas → una sola fila
  agrupada).
- Verificación manual final: generar un PDF de muestra real (con el
  catálogo de producción) y revisarlo visualmente antes de dar el trabajo
  por terminado — mismo criterio que se usó para el PDF que motivó este
  cambio.
