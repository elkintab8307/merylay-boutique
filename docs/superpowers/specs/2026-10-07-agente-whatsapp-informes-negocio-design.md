# Agente de WhatsApp — informes de negocio (ventas, productos, clientes)

> Extensión del agente de WhatsApp ya en producción (ver
> `2026-10-06-agente-whatsapp-design.md` y
> `2026-10-07-agente-whatsapp-v2-catalogo-fotos-voz-design.md`). El
> sistema hoy **no tiene ningún módulo de informes** — ni en el bot ni
> en el panel web (`CLAUDE.md` lo lista como Fase 12, todavía no
> construida) — así que este documento define la lógica de negocio desde
> cero, no solo cómo exponerla por WhatsApp.

## Objetivo

Los dueños (Elkin/Mary) piden por WhatsApp, en lenguaje natural, tres
informes de negocio que hoy no existen:

1. **Ventas por periodo**, desglosadas por canal y método de pago.
2. **Productos más vendidos** en un periodo, por cantidad y por ingresos.
3. **Informe de clientes**: ranking de mejores clientes, y el historial
   de compras de un cliente puntual.

Cada informe responde **en texto** (resumen inmediato) y, si el dueño lo
pide, **también en PDF** (detalle completo, descargable).

## Fuera de alcance

- Compras a proveedores (Fase 14 de `CLAUDE.md`, con sus propias tablas
  que todavía no existen) — ningún informe de este documento calcula
  ganancia neta real (ventas − costo de productos − gastos), solo
  ventas brutas y gastos por separado. **Gastos sí entra en este
  documento** (ver abajo): las tablas `expenses`/`expense_categories` ya
  existen en la base de datos (confirmado contra el esquema real, con
  filas reales ya registradas), aunque esa fase nunca se construyó en
  el panel web.
- Comparativas entre periodos ("¿vendí más que el mes pasado?") — se
  puede pedir cada periodo por separado, pero no hay un cálculo
  automático de variación.
- Filtros de fecha exactos ("del 1 al 15 de octubre") — confirmado con
  el dueño: por ahora solo rangos con nombre/días (`hoy`, `esta semana`,
  `este mes`, `los últimos N días`), igual que ya funciona
  `consultar_ventas` hoy (el modelo convierte el nombre a un número de
  días: "hoy" → 1, "esta semana" → 7, "este mes" → 30).
- Paginación completa de "todos los clientes" — el ranking tiene un
  tope (igual que el resto del bot ya hace con búsquedas de inventario).

## El problema de identidad de clientes (confirmado contra el esquema real)

Un cliente puede existir en **dos tablas distintas** según por dónde
compró, y no siempre están vinculadas:

- `profiles` (rol `customer`) — clientes de tienda web o WhatsApp,
  referenciados por `orders.user_id` (nunca nulo: todo pedido tiene un
  usuario, incluyendo las cuentas sintéticas que ya crea el bot para
  clientes de WhatsApp).
- `pos_customers` — clientes registrados en el POS presencial,
  referenciados por `pos_sales.customer_id` (nullable: una venta de
  mostrador puede no tener cliente identificado). `pos_customers.profile_id`
  es una FK opcional a `profiles` cuando ese cliente de POS **también**
  tiene cuenta de tienda/WhatsApp — ya existe un RPC
  (`listar_clientes_pos`) que unifica ambas fuentes para búsqueda, pero
  no suma gastos; este documento sí necesita sumarlos.

**Regla para los dos informes de clientes de este documento:** agrupar
ventas de `orders` por `user_id` y de `pos_sales` por `customer_id`;
cuando un `pos_customers.profile_id` está seteado, sus ventas de POS se
suman dentro de la misma fila que su `profile_id` (un cliente que compra
tanto en línea como en tienda aparece una sola vez, con el total
combinado). Las ventas de POS sin `customer_id` ("venta de mostrador sin
cliente") se excluyen del ranking — no hay a quién atribuirlas.

## Nuevas acciones del dueño

Todas comparten el mismo patrón de periodo que ya usa `consultar_ventas`:
`{"dias": entero >= 1}` ("hoy" = 1; el modelo convierte "esta semana"/"este
mes" a 7/30 como ya hace hoy). Las tres ganan además un `"conPdf": boolean`
opcional (default false) — igual que el patrón `conFotos` ya usado en
`buscar_inventario`, el dueño pide el PDF solo si realmente lo quiere
("mándamelo en pdf", "quiero el detalle completo").

### `informe_ventas`

Params: `{"dias": entero >= 1, "conPdf": boolean}`.

- **Texto**: total general del periodo + desglose por canal
  (web/whatsapp/pos) + desglose por método de pago (`efectivo`, `tarjeta`,
  `transferencia`, `nequi`, `daviplata`, `credito` para POS; `wompi`/pago
  manual para `orders`). **Reemplaza a `consultar_ventas`** en el prompt
  del dueño (misma información que antes — el total — más el desglose
  nuevo): dos acciones tan parecidas confundirían al modelo sobre cuál
  usar para "cuánto vendí hoy". La función `consultarVentas` en
  `owner-actions.ts` queda eliminada; su lógica de suma
  `orders`/`pos_sales` se reutiliza dentro de `informeVentas`.
- **PDF** (si `conPdf`): mismo resumen arriba + una tabla con cada
  pedido/venta individual del periodo (fecha, canal, método de pago,
  total), ordenada por fecha descendente, con un tope de 200 filas.

### `productos_mas_vendidos`

Params: `{"dias": entero >= 1, "limite": entero >= 1 (default 10), "conPdf": boolean}`.

- **Texto**: tabla de hasta `limite` productos (nombre, unidades
  vendidas, ingresos generados), ordenada por unidades vendidas de
  mayor a menor. Fuente: `order_items` (join `orders`, filtrando estado
  vendido y fecha) `UNION` `pos_sale_items` (join `pos_sales`, filtrando
  fecha), agrupado por `product_id` usando el nombre actual del producto
  (no el `name_snapshot`, que puede quedar desactualizado si el producto
  cambió de nombre).
- **PDF** (si `conPdf`): misma tabla sin el tope de `limite` (hasta 50
  productos).

### `informe_clientes`

Params: `{"dias": entero >= 1, "limite": entero >= 1 (default 10), "conPdf": boolean}`.

- **Texto**: ranking de hasta `limite` clientes (nombre, total gastado,
  número de compras) en el periodo, aplicando la regla de identidad de
  arriba, ordenado por total gastado de mayor a menor.
- **PDF** (si `conPdf`): misma tabla sin el tope de `limite` (hasta 50
  clientes).

### `informe_gastos`

Params: `{"dias": entero >= 1, "conPdf": boolean}`.

- **Texto**: total gastado en el periodo + desglose por categoría
  (`expense_categories.name`; los gastos sin categoría se agrupan como
  "Sin categoría"). Fuente: `expenses` filtrado por `expense_date` dentro
  del periodo (es una columna `date`, no `timestamptz` — se compara con
  la fecha, no con la hora exacta).
- **PDF** (si `conPdf`): tabla con cada gasto individual (fecha,
  categoría, descripción, monto), ordenada por fecha descendente, con el
  mismo tope de 200 filas que `informe_ventas`.

### `historial_cliente` (nueva, complementa a `buscar_cliente`)

Params: `{"nombreOTelefono": string}`.

`buscar_cliente` ya existe y sigue igual (búsqueda rápida por
nombre/teléfono, sin historial). Esta acción nueva es para cuando el
dueño quiere ver las compras de un cliente puntual: busca el cliente
(misma lógica de coincidencia que `buscar_cliente`, tomando la primera
coincidencia si hay varias — si hay ambigüedad real, responde pidiendo
precisar), y devuelve su historial de compras (fecha, canal, total de
cada una) más el total acumulado y número de compras. Solo texto — no
tiene versión PDF en esta ronda (es información puntual de un cliente,
no un informe para archivar).

## Seguridad y límites (mismas reglas ya vigentes, aplicadas aquí)

- Todas estas son acciones de **lectura** — no pasan por el gate de
  confirmación que exigen las acciones de escritura.
- Ninguna consulta usa SQL generado por el modelo — `dias`, `limite`,
  `conPdf`, `nombreOTelefono` son los únicos parámetros, siempre
  tipados/validados antes de construir cualquier consulta.
- Topes explícitos en cada informe (10 en texto, 50/200 en PDF) — ningún
  informe puede quedar sin límite superior.

## Testing

Mismo enfoque TDD con Vitest. Casos mínimos nuevos:

- `informe_ventas`: desglosa correctamente por canal y método de pago;
  con `conPdf`, genera el PDF con la tabla de pedidos/ventas; sin
  resultados en el periodo, mensaje claro.
- `productos_mas_vendidos`: combina `order_items` y `pos_sale_items` del
  mismo producto en una sola fila; ordena por cantidad; respeta `limite`
  en texto, usa el tope de 50 en PDF.
- `informe_clientes`: un cliente que compra por web y por POS (con
  `pos_customers.profile_id` seteado) aparece una sola vez con el total
  combinado; una venta de POS sin `customer_id` no aparece en el
  ranking; ordena por total gastado.
- `historial_cliente`: cliente encontrado por nombre parcial devuelve su
  historial completo y el total acumulado; cliente no encontrado,
  mensaje claro; varias coincidencias ambiguas, pide precisar.
- `informe_gastos`: desglosa correctamente por categoría (incluyendo
  gastos sin categoría); con `conPdf`, genera el PDF con el detalle;
  sin gastos en el periodo, mensaje claro.
