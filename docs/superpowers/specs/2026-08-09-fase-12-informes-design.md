# Fase 12 — Informes: Diseño

> Ver `CLAUDE.md` §12 punto 12 para los requisitos originales. Tercera y
> última de tres sub-fases reordenadas (Gastos → Compras → Informes), ahora
> que existen datos reales de gastos (Fase 13) y costo/compras de producto
> (Fase 14) para calcular ganancia real en vez de aproximada.

## Objetivo

Dar visibilidad completa del negocio en un solo lugar del panel admin:
ventas (tienda + POS), productos más vendidos, stock bajo, ingresos por
método de pago, gastos, compras, y ganancia real —
`Ventas − Costo de productos vendidos − Gastos` — con gráficas.

## Alcance

Ocho rutas nuevas bajo `/admin/informes`, cada una (salvo el índice y stock
bajo) con su propio filtro de rango de fechas independiente:

1. `/admin/informes` — índice con tarjetas enlazando a cada informe.
2. `/admin/informes/ventas` — ventas combinadas tienda + POS por periodo.
3. `/admin/informes/productos` — productos más vendidos (top N).
4. `/admin/informes/stock-bajo` — productos/variantes con stock ≤ umbral
   (estado actual, sin filtro de fecha).
5. `/admin/informes/metodos-pago` — ingresos por método de pago.
6. `/admin/informes/gastos` — gastos por categoría y periodo.
7. `/admin/informes/compras` — compras por proveedor y periodo.
8. `/admin/informes/ganancia` — ganancia real con desglose de los tres
   componentes.

Fuera de alcance: exportar a PDF/Excel, comparación entre periodos
("este mes vs. el anterior"), informes por rango horario, costo histórico
real por venta (no hay tabla de historial de costos — ver más abajo),
alertas automáticas (correo/notificación) de stock bajo.

Acceso: solo `admin`/`superadmin` (protegido por el middleware existente
en `/admin/**`, `staff` sin acceso — mismo criterio que Gastos y Compras,
por exponer costos y ganancia).

## Arquitectura de datos: agregación en SQL, no `reduce()` en JS

La revisión final de la Fase 14 (Compras) encontró y corrigió un bug real:
`/admin/compras` sumaba totales trayendo la tabla `purchase_items` completa
a JavaScript, lo que se trunca **en silencio** pasado el límite por defecto
de PostgREST (1000 filas). Para Informes ese error sería aún más grave —
son las cifras con las que el negocio toma decisiones. Por eso cada informe
se apoya en una función SQL `stable security definer` (invocada vía
`.rpc()`, con el mismo patrón de verificación `is_admin()` que
`create_purchase`/`create_pos_sale`, pero sin bloqueo de filas por ser
solo lectura) que hace el `GROUP BY`/`SUM` dentro de Postgres y devuelve
filas ya agregadas por día y dimensión (canal, categoría, proveedor). El
grano diario acota el tamaño del resultado al número de días del rango
(máximo unos pocos miles para rangos de varios años), muy por debajo del
límite de 1000 filas de una consulta sin agregar — así que sumar esas
filas ya agregadas en el cliente (para pintar la gráfica o el total) es
seguro y no repite el error de Compras: la diferencia es que aquí Postgres
ya hizo el trabajo pesado de sumar transacciones, el cliente solo suma un
puñado de filas-resumen.

### Funciones SQL nuevas (migración, vía Supabase MCP)

Todas: `language plpgsql`, `security definer`, `stable`,
`set search_path = public`, primera línea `if not public.is_admin() then
raise exception 'No autorizado.'; end if;`, `revoke ... from public, anon;
grant execute ... to authenticated;` — mismo patrón de autorización que el
resto del proyecto, pero sin `for update` (no mutan nada).

```sql
-- Ventas por dia y canal, solo pedidos pagado/enviado/entregado + todas
-- las ventas POS (no tienen estado "pendiente", una venta POS siempre es
-- un hecho consumado).
create function public.informe_ventas_serie(p_desde date, p_hasta date)
returns table (fecha date, canal text, monto numeric)

-- Top N productos por unidades e ingreso, combinando order_items
-- (pedidos calificados) y pos_sale_items, agrupado por product_id.
create function public.informe_productos_vendidos(
  p_desde date, p_hasta date, p_limit int default 10
)
returns table (product_id uuid, nombre text, qty numeric, ingreso numeric)

-- Ingreso por metodo de pago (valor crudo de orders.payment_method /
-- pos_sales.payment_method — "efectivo" y "transferencia" existen en
-- ambos canales y se combinan naturalmente bajo la misma clave; "wompi"
-- y "tarjeta"/"nequi"/"daviplata" quedan separados por ser rieles
-- distintos).
create function public.informe_metodos_pago(p_desde date, p_hasta date)
returns table (metodo text, total numeric)

-- Gastos por dia y categoria.
create function public.informe_gastos_serie(p_desde date, p_hasta date)
returns table (fecha date, categoria text, monto numeric)

-- Compras por dia y proveedor.
create function public.informe_compras_serie(p_desde date, p_hasta date)
returns table (fecha date, proveedor text, monto numeric)

-- Ganancia real por dia: ventas calificadas, costo de productos vendidos
-- (qty vendida x product_costs.cost_price VIGENTE — no hay historial de
-- costos, ver seccion siguiente), gastos, y unidades vendidas sin costo
-- registrado (para la advertencia visible). La resta ventas-costo-gastos
-- se calcula en SQL, no en el cliente, para que el numero de "ganancia"
-- tenga una unica fuente de verdad.
create function public.informe_ganancia_serie(p_desde date, p_hasta date)
returns table (
  fecha date,
  ventas numeric,
  costo_productos numeric,
  gastos numeric,
  ganancia numeric,
  unidades_sin_costo int
)
```

Stock bajo NO necesita una función nueva: es una consulta directa a
`products`/`product_variants` con `stock <= umbral`, ya cubierta por la
RLS existente (`products_select_active_or_admin` ya deja a un admin
autenticado leer todos los productos, activos o no).

## Fórmula de ganancia real y su limitación conocida

```
Ganancia = Ventas (pedidos pagado+enviado+entregado + ventas POS)
         − Σ(qty vendida × product_costs.cost_price vigente)
         − Gastos del periodo
```

`product_costs` no guarda historial — solo el costo vigente más reciente
(decisión ya tomada en la Fase 14: "el más reciente gana"). Por lo tanto,
la ganancia de periodos pasados se recalcula siempre con el costo de HOY,
no con el costo que tenía el producto en el momento de esa venta. Es la
única opción posible sin rediseñar el esquema para guardar un historial de
costos, y es consistente con cómo se planteó la Fase 14. Un producto
vendido sin ninguna fila en `product_costs` cuenta como costo 0 (nunca se
excluye la venta ni se rompe el cálculo), y `/admin/informes/ganancia`
muestra una advertencia visible con cuántas unidades y qué ingreso
quedaron con costo asumido en cero, usando la columna
`unidades_sin_costo` que devuelve `informe_ganancia_serie`, para que el
número de ganancia nunca se lea como más preciso de lo que realmente es.

## Umbral de stock bajo

Nueva clave en `store_settings` (tabla ya existente, key/value jsonb, sin
migración de esquema necesaria): `stock_bajo_umbral` (número entero). Se
agrega a `storeSettingsSchema` (`src/lib/validation/store-settings.ts`) y
al mapa `STORE_SETTINGS_KEYS`, y se edita desde el formulario de Ajustes
de tienda ya existente (`/superadmin/ajustes`) — por vivir en
`store_settings`, su escritura queda restringida a `superadmin` por la RLS
ya vigente de esa tabla (aunque cualquier `admin`/`superadmin` puede VER
el informe de stock bajo, solo `superadmin` puede cambiar el número). Si
no existe la fila todavía (tienda recién creada), el código usa un valor
por defecto de 5 unidades — sin migración de seed, mismo patrón disperso
que ya usa `store_settings` para el resto de sus claves.

## Filtro de rango de fechas

Componente cliente reutilizable `RangoFechaFiltro`
(`src/app/admin/informes/rango-fecha-filtro.tsx`), con botones de preset
(Hoy / Esta semana / Este mes / Este año) y dos campos de fecha para rango
personalizado. Escribe `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` en la URL de
la página actual (`router.push` con los search params actualizados); cada
página (Server Component) lee esos params en el servidor. Si faltan o son
inválidos, cae al valor por defecto **Este mes** (día 1 del mes en curso
hasta hoy), calculado con una función pura reutilizable
`rangoMesActual()` en `src/lib/informes/rango-fecha.ts` (fácil de probar
con una fecha fija inyectada).

Validación: `src/lib/validation/informes.ts` — `rangoFechaSchema` con
`desde`/`hasta` (`z.iso.date(...)`, mismo patrón corregido ya establecido
en Gastos/Compras) y un `refine` de que `hasta >= desde`. No se exige que
`hasta` no sea futura (a diferencia de `gastoSchema`/`compraSchema`,
aquí SÍ tiene sentido consultar "hasta hoy" con `hasta` = hoy, pero
también podría ser razonable un reporte que llegue hasta el día actual
inclusive — no se bloquea fecha futura porque el propio preset "Este año"
podría, en teoría, generar un `hasta` igual a hoy sin problema; simplemente
no se valida explícitamente contra el futuro porque no aporta protección
real aquí — la query simplemente no devolverá filas para fechas futuras).

## Gráficas

Componente `chart` de shadcn/ui (`pnpm dlx shadcn@latest add chart`, trae
Recharts como dependencia — primera vez que este proyecto usa una
librería de gráficas). Paleta de series: rosa `#E96A9E` (serie principal),
dorado `#D9A441` (serie secundaria/comparación), ciruela `#6E2A44` (texto/
ejes). Un componente cliente de gráfica por informe (ya que Recharts
requiere `"use client"`), ubicado junto a su página:
`grafica-ventas.tsx`, `grafica-productos.tsx`, `grafica-metodos-pago.tsx`,
`grafica-gastos.tsx`, `grafica-compras.tsx`, `grafica-ganancia.tsx`.

- Ventas: líneas por canal (tienda/POS) por día.
- Productos: barras horizontales, top N por unidades.
- Métodos de pago: gráfica de torta (dona) con el total por método.
- Gastos: barras apiladas por categoría, por día.
- Compras: barras apiladas por proveedor, por día.
- Ganancia: líneas de ventas/costo/gastos/ganancia por día.

Cada página muestra también una tabla con los mismos datos (para lectura
exacta y accesibilidad), la gráfica es un complemento visual, no la única
fuente de la cifra.

## Navegación

`admin-nav.tsx` gana un enlace "Informes" después de "Compras".

## Manejo de errores

Mensajes en español, mismo patrón `{ error?: string }` donde aplique
(las páginas de informes son Server Components de solo lectura; si una
RPC falla se muestra un mensaje de error inline en vez de romper la
página, mismo patrón ya usado en `/admin/compras`).

## Testing

- TDD sobre `rangoFechaSchema` (rango válido, `hasta` antes de `desde`,
  fechas malformadas) y sobre `rangoMesActual()` (con una fecha fija
  inyectada, para que el test no dependa del día real de ejecución).
- Verificación de integración contra Supabase real: `staff` sin acceso a
  ninguna de las 6 funciones RPC nuevas (mismo patrón `is_admin()` ya
  verificado en Compras); cada función devuelve los totales correctos
  contra datos de prueba conocidos (crear un pedido pagado, una venta POS,
  un gasto y una compra de montos conocidos, y confirmar que cada informe
  los refleja exactamente); `informe_ganancia_serie` con un producto sin
  costo registrado confirma `unidades_sin_costo > 0` y costo asumido en 0
  para esa línea; limpieza total de datos de prueba al final, sin residuo.

## UI

Sigue el patrón visual ya establecido en `/admin/gastos` y `/admin/compras`
(fondo `brand-crema`, tarjetas blancas con borde `brand-rosa-claro`,
botones `brand-rosa`). El índice `/admin/informes` usa tarjetas con ícono
y descripción breve de cada informe (lucide-react, ya en uso en el
proyecto).
