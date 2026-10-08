# Agente de WhatsApp — consultas flexibles de productos, créditos y abonos

> Extensión del agente de WhatsApp ya en producción (ver
> `2026-10-06-agente-whatsapp-design.md`,
> `2026-10-07-agente-whatsapp-v2-catalogo-fotos-voz-design.md` y
> `2026-10-07-agente-whatsapp-informes-negocio-design.md`). Este documento
> nace de una queja real del dueño con una captura de pantalla: pidió "un
> informe con fotos de las camisetas talla S" y el bot respondió "No
> encontré ningún producto" a pesar de que esas camisetas sí existen.

## Motivación

El dueño reportó sentirse "muy limitado" por el bot y pidió, textualmente,
"un agente completo... que tenga total libertad de responder lo que sea".
Se investigó la causa raíz del bug concreto (ver "Bug ya corregido" abajo)
y se le pidieron ejemplos reales de preguntas que el bot no resuelve hoy.
Los 6 ejemplos dados se contrastaron contra el esquema real de la base de
datos, con este resultado:

- **4 de 6** ya son filtros normales de productos (texto/talla/categoría),
  solo que el bot de hoy no tiene un modo de "lista" (solo da conteos) ni
  un filtro por fecha de alta del producto.
- **2 de 6** ("qué cliente hizo abonos hoy", "cuántos créditos hay") usan
  datos que **ya existen** en la base (`pos_sales.payment_method =
  'credito'`, tablas `credit_installments`/`credit_payments`, con filas
  reales: 8 ventas a crédito, 5 abonos registrados) pero que el bot de
  WhatsApp nunca expone.

**Conclusión de diseño:** no hace falta un motor de SQL libre generado por
el modelo (eso violaría la regla ya escrita en
`2026-10-07-agente-whatsapp-informes-negocio-design.md`: *"Ninguna
consulta usa SQL generado por el modelo"*). Alcanza con generalizar la
búsqueda de productos (mas filtros, mas formatos de respuesta) y agregar
dos informes nuevos sobre datos que ya existen. Se decidió explícitamente
así con el dueño, comparando los dos caminos (constructor de filtros vs.
SQL libre) y sus riesgos.

## Bug ya corregido (contexto, no parte de este plan)

La causa raíz de la queja original ya se corrigió por separado (PR
`fix-busqueda-singular-plural`): los nombres de producto están en
singular ("Camiseta algodón licrado") pero el dueño pregunta en plural
("camisetas"), y la coincidencia por substring exacto no encontraba nada.
Este plan **depende** de que ese fix ya esté en `master` (reutiliza
`candidatosSingularPlural` de `catalog.ts`).

## Alcance

### 1. `consultar_productos` — generaliza `buscar_inventario` + `generar_informe_pdf`

Reemplaza ambas acciones por una sola, más flexible. `buscarCatalogo` (los
filtros texto/talla/color que ya existen) se extiende con un filtro nuevo;
la novedad principal es que la respuesta ya no es solo un conteo.

**Params:**
```
{
  "texto": string | null,
  "talla": string | null,
  "color": string | null,
  "agregadoDesdeDias": entero >= 1 | null,
  "formato": "conteo" | "lista" | "pdf_fotos" | "pdf_tabla",
  "conFotos": boolean
}
```
- Al menos uno de texto/talla/color/agregadoDesdeDias es obligatorio
  (mismo criterio que hoy: sin ningún filtro, se pregunta en vez de
  reventar o traer todo el catálogo).
- `agregadoDesdeDias`: filtra por `products.created_at >= ahora - N días`
  (columna ya existente, confirmada contra el esquema real).
- `formato` (con su propio criterio de cuándo usar cada uno, para que el
  modelo lo decida bien):
  - `"conteo"` (default si el dueño solo pregunta cantidad/existencia,
    ej. "cuántas camisetas hay") — el comportamiento de hoy:
    "Encontré N producto(s) con M unidad(es) en stock en total."
  - `"lista"` (cuando el dueño pide "un listado"/"dame la lista"/"cuáles
    son", sin pedir fotos ni PDF) — texto con un renglón por producto:
    nombre, talla/color si aplica, precio, stock. Tope de 10 líneas en
    texto (igual que el resto del bot); si hay más, se avisa y se sugiere
    pedir el PDF.
  - `"pdf_fotos"` (cuando el dueño pide fotos/imágenes en el informe) —
    el PDF con fotos que ya existe (`generarPdfConFotos`), que ahora
    también muestra la categoría del producto en el detalle de cada fila.
  - `"pdf_tabla"` (cuando el dueño pide "un informe" sin fotos, o pide
    explícitamente que sea sin fotos, ej. ejemplo 3 del dueño: "una lista
    sin foto... agregadas en los últimos 2 días") — tabla con marca
    (`generarPdfTabla`, igual que los informes de negocio), columnas:
    nombre, talla/color, categoría, precio, stock.
- `conFotos` solo aplica quando `formato` no es ya un PDF — controla si el
  modo `"conteo"`/`"lista"` en vivo manda también las fotos (como ya hace
  `buscar_inventario` hoy). Si `formato` es `"pdf_fotos"` o `"pdf_tabla"`,
  `conFotos` se ignora (el formato ya lo decide).

**Elimina:** las acciones `buscar_inventario` y `generar_informe_pdf` del
prompt del dueño y del switch de `handler.ts` (se reemplazan por esta).
`owner-actions.ts` pierde `buscarInventario`/`generarInformePdf`, cuya
lógica se mueve/fusiona dentro de la nueva función.

### 2. `informe_creditos` — ventas a crédito

**Params:** `{"dias": entero >= 1, "conPdf": boolean}`.

- Fuente: `pos_sales` donde `payment_method = 'credito'`, en el periodo.
- **Texto:** total vendido a crédito en el periodo + cuántas ventas +
  cuántas tienen saldo pendiente (al menos una cuota en
  `credit_installments` con `status` distinto de `'pagada'`).
- **PDF** (tabla con marca): una fila por venta a crédito — fecha,
  cliente (misma lógica de fusión de identidad que `informe_clientes`:
  `pos_sales.customer_id` → `pos_customers` → `profile_id` si está
  vinculado), productos (nombres de `pos_sale_items`, concatenados),
  total, saldo pendiente (`sum(credit_installments.amount) -
  sum(credit_installments.paid_amount)` para esa venta). Tope de 200
  filas (igual que el resto de PDFs de detalle).

### 3. `informe_abonos` — pagos hechos contra ventas a crédito

**Params:** `{"dias": entero >= 1, "conPdf": boolean}`.

- Fuente: `credit_payments` en el periodo, unido a `pos_sales` (para
  llegar al cliente, misma lógica de fusión de identidad).
- **Texto:** total abonado en el periodo + cuántos abonos.
- **PDF** (tabla con marca): fecha, cliente, monto, método de pago del
  abono, a qué venta corresponde (`pos_sales.sale_number`).
- "¿Qué cliente hizo abonos hoy?" → el dueño pide esto con `dias: 1`; el
  texto de respuesta debe nombrar a cada cliente que abonó (no solo el
  total), ya que es la pregunta literal que motivó este informe — a
  diferencia de los otros informes de este documento, aquí el texto
  (no solo el PDF) debe listar cada abono individual si son pocos
  (mismo tope de 10 que el resto del bot; con `dias` cortos como 1, en la
  práctica siempre serán pocos).

## Seguridad y límites (mismas reglas ya vigentes)

- Todas son acciones de lectura, sin gate de confirmación.
- Ningún parámetro nuevo se concatena en SQL libre: `agregadoDesdeDias`
  se convierte a fecha igual que `dias` en los otros informes;
  `texto`/`talla`/`color` siguen pasando por `escaparValorFiltro`/
  `.ilike()` ya existentes. **Sigue sin haber SQL generado por el
  modelo** — esta es la decisión explícita de diseño de este documento
  (ver "Motivación"), no un descuido.
- Topes explícitos en cada formato (10 en texto/lista, 50/200 en PDF).
- Los montos y conteos los calcula siempre el servidor; el modelo nunca
  computa aritmética de negocio.

## Fuera de alcance

- Un motor de consultas libres (SQL generado por el modelo) — evaluado y
  descartado explícitamente con el dueño por el riesgo de exposición de
  datos y por romper la regla de seguridad ya escrita para los informes
  de negocio. Si en el futuro aparece una pregunta real que esta
  generalización no pueda expresar, se evalúa puntualmente entonces.
- Filtros compuestos sobre otros "sujetos" (ventas, gastos, clientes) más
  allá de lo que ya cubren los informes existentes — este documento solo
  generaliza productos y agrega créditos/abonos, que es lo que los
  ejemplos reales del dueño necesitaban.
- Registrar nuevos abonos/créditos desde WhatsApp (son acciones de
  escritura; este documento es solo de lectura/informes).

## Testing

Mismo enfoque TDD con Vitest. Casos mínimos nuevos:

- `consultar_productos`: cada `formato` devuelve la forma esperada
  (conteo sigue igual que hoy; lista devuelve un renglón por producto y
  respeta el tope de 10; pdf_fotos incluye categoría; pdf_tabla genera
  una tabla con marca); `agregadoDesdeDias` filtra correctamente por
  `created_at`; sin ningún filtro, pide precisar en vez de reventar.
- `informe_creditos`: desglosa total y cuenta ventas con saldo pendiente;
  el PDF junta cliente (con la fusión de identidad) + productos + saldo
  por venta; sin ventas a crédito en el periodo, mensaje claro.
- `informe_abonos`: total y conteo de abonos; el texto lista cada abono
  individual cuando son pocos; el PDF liga cada abono a su venta; sin
  abonos en el periodo, mensaje claro.
