# Sistema de crédito para el POS — Diseño

> Spec arquitectónico. Sigue el flujo Superpowers: este documento es la
> autoridad; el plan de implementación (writing-plans) argumenta desde aquí.

## 1. Resumen y objetivo

Hoy el POS (`/pos`) solo registra ventas con pago completo e inmediato
(`payment_method`: efectivo, tarjeta, transferencia, nequi, daviplata). No
existe forma de vender a crédito (pago diferido en cuotas).

Este sistema agrega:

1. Una opción de venta a crédito en el POS: se especifica cliente, teléfono,
   número de cuotas y (opcionalmente) un abono inicial.
2. Una sección administrativa (`/pos/creditos`, accesible a staff — mismo
   patrón que "Ventas POS") con el listado de créditos
   otorgados, su estado (al día / vencido / pagado) y un detalle por crédito
   donde se registran los abonos hasta saldar la deuda.
3. Integración con Informes: los créditos no cuentan como ingreso al momento
   de la venta, sino que cada abono se reconoce como ingreso cuando se recibe
   (criterio de caja para este tipo de venta), y se añade visibilidad de
   cartera pendiente / vencida / cobrada.

## 2. Alcance

Dentro de alcance:
- Registrar una venta del POS como crédito (con o sin abono inicial).
- Generar un calendario de cuotas automático (montos iguales, mensual).
- Registrar abonos contra un crédito, con reparto FIFO sobre las cuotas.
- Listado y detalle de créditos en el panel admin.
- Bloqueo de edición de items en ventas a crédito (evita corromper saldos).
- Ajuste de los reportes de ingresos existentes para no contar dos veces.

Fuera de alcance (no se construye en este plan):
- Notificaciones/recordatorios automáticos de cuotas vencidas (WhatsApp,
  email, etc.).
- Intereses o recargos por mora.
- Renegociación de un calendario de cuotas ya generado (cambiar número de
  cuotas o fechas después de creado el crédito).
- Créditos desde la tienda pública (checkout online) — esto es exclusivo
  del POS presencial.

## 3. Modelo de datos

### 3.1 `payment_method` (enum existente, se extiende)

Se agrega el valor `'credito'`. Los valores existentes
(`efectivo`, `tarjeta`, `transferencia`, `nequi`, `daviplata`) no cambian.

`'credito'` solo es válido como `pos_sales.payment_method` (marca la venta
completa como crédito). Nunca es válido como `credit_payments.payment_method`
(un abono siempre se paga con un método real).

### 3.2 `pos_sales` (tabla existente, se agregan columnas)

```sql
alter table public.pos_sales
  add column credit_customer_name text,
  add column credit_customer_phone text;
```

Ambas nullable. Se llenan únicamente cuando `payment_method = 'credito'`;
para el resto de ventas quedan `null`. `create_pos_sale` valida que ambas
vengan no vacías cuando el método es crédito.

### 3.3 `credit_installments` (nueva)

El calendario de cuotas de un crédito.

```sql
create type public.credit_installment_status as enum ('pendiente', 'parcial', 'pagada');

create table public.credit_installments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete cascade,
  numero int not null check (numero > 0),
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status public.credit_installment_status not null default 'pendiente',
  unique (sale_id, numero)
);

create index credit_installments_sale_id_idx on public.credit_installments(sale_id);
create index credit_installments_due_date_idx on public.credit_installments(due_date) where status <> 'pagada';
```

Invariante: `paid_amount <= amount`. `status` se deriva de `paid_amount` vs
`amount` (0 → `pendiente`; 0 < paid < amount → `parcial`; paid = amount →
`pagada`) y solo lo actualiza el RPC de abono, nunca el cliente.

### 3.4 `credit_payments` (nueva)

Los abonos recibidos contra un crédito.

```sql
create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  staff_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index credit_payments_sale_id_idx on public.credit_payments(sale_id);

alter table public.credit_payments
  add constraint credit_payments_method_not_credito
  check (payment_method <> 'credito');
```

`on delete restrict` (no `cascade`): una venta con abonos registrados nunca
se puede borrar (ver §6, Borrado).

El **saldo pendiente** de un crédito es siempre calculado, nunca
almacenado: `pos_sales.total - coalesce(sum(credit_payments.amount), 0)`
para esa `sale_id`. Evita que una columna desnormalizada se desincronice.

### 3.5 RLS

Mismo patrón que `pos_sales`/`pos_sale_items` (migración 004):

```sql
alter table public.credit_installments enable row level security;
alter table public.credit_payments enable row level security;

create policy "credit_installments_staff_access"
  on public.credit_installments for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());

create policy "credit_payments_staff_access"
  on public.credit_payments for all
  using (public.is_staff_or_above())
  with check (public.is_staff_or_above());
```

## 4. Flujo del POS

### 4.1 Crear una venta a crédito

En `VentaItemsEditor` (`src/app/pos/venta-items-editor.tsx`), el selector
"Método de pago" gana la opción **"Crédito"**. Al seleccionarla, se
muestran (reemplazando/complementando el selector normal, todavía dentro
del mismo formulario):

- **Cliente** (texto, obligatorio)
- **Teléfono** (texto, obligatorio)
- **Número de cuotas** (entero ≥ 1, obligatorio)
- **Abono inicial** (numérico, opcional, default 0)
- Si el abono inicial es > 0: un selector de **método de pago del abono**
  (mismos valores del enum, sin `'credito'`)

El resto del formulario (buscador de productos, cantidades, descuento) no
cambia.

### 4.2 RPC `create_pos_sale` (se extiende, no se reemplaza)

Firma actual (migración 011):

```sql
create_pos_sale(p_items jsonb, p_payment_method payment_method, p_discount numeric default 0)
```

Nueva firma:

```sql
create_pos_sale(
  p_items jsonb,
  p_payment_method payment_method,
  p_discount numeric default 0,
  p_credit_customer_name text default null,
  p_credit_customer_phone text default null,
  p_credit_num_cuotas int default null,
  p_credit_abono_inicial numeric default 0,
  p_credit_abono_metodo payment_method default null
)
```

Cuando `p_payment_method = 'credito'`:

1. Valida `p_credit_customer_name` y `p_credit_customer_phone` no vacíos, y
   `p_credit_num_cuotas >= 1`. Si `p_credit_abono_inicial > 0`, valida que
   `p_credit_abono_metodo` no sea `'credito'` y no sea null.
2. Valida `p_credit_abono_inicial >= 0` y `<= v_total` (no puede el abono
   inicial exceder o igualar el total de forma que no quede nada que
   financiar de forma coherente — si `abono_inicial = v_total`, el crédito
   se crea ya pagado, lo cual es válido: cuotas todas generadas y marcadas
   `pagada` de inmediato vía el mismo reparto FIFO del paso 4).
3. Sigue el mismo camino de siempre: verifica y descuenta stock, inserta
   `pos_sales` (con `credit_customer_name`/`credit_customer_phone`
   poblados), inserta `pos_sale_items`.
4. Calcula `v_saldo_financiar := v_total - p_credit_abono_inicial`. Genera
   `p_credit_num_cuotas` filas en `credit_installments`: divide
   `v_saldo_financiar` entre el número de cuotas con `numeric` (2
   decimales); la **última cuota** recibe el residuo de redondeo (para que
   la suma de cuotas sea exactamente `v_saldo_financiar` centavo a
   centavo). `due_date` de la cuota N = fecha de la venta + `30 * N` días.
   - Caso `v_saldo_financiar = 0` (abono inicial cubre el 100%): igual se
     generan las N cuotas con monto 0 cada una — **no**, esto violaría el
     `check (amount > 0)`. En este caso especial se genera **una sola
     cuota** de monto simbólico igual a `v_total`, y el paso 5 la marca de
     inmediato como pagada vía el abono inicial. (Nota para quien
     implemente: este caso borde se cubre con un test dedicado.)
5. Si `p_credit_abono_inicial > 0`: inserta una fila en `credit_payments`
   (`amount = p_credit_abono_inicial`, `payment_method =
   p_credit_abono_metodo`, `staff_id = auth.uid()`) y aplica el algoritmo
   de reparto FIFO (§4.3) sobre las cuotas recién creadas.

### 4.3 Algoritmo de reparto FIFO (compartido entre creación y abonos)

Dado un monto de abono `v_monto` y una venta `v_sale_id`:

1. Selecciona las cuotas de `v_sale_id` con `status <> 'pagada'`, ordenadas
   por `numero` ascendente, con `for update`.
2. Para cada cuota, en orden: `v_disponible_en_cuota := amount -
   paid_amount`. Si `v_monto <= 0`, detiene el ciclo.
   - `v_aplicado := least(v_monto, v_disponible_en_cuota)`
   - `update credit_installments set paid_amount = paid_amount + v_aplicado,
     status = case when paid_amount + v_aplicado >= amount then 'pagada'
     else 'parcial' end where id = <cuota>`
   - `v_monto := v_monto - v_aplicado`
3. Si al terminar el ciclo `v_monto > 0` (el abono es mayor que todo lo
   pendiente), la transacción se rechaza (ver validación de sobrepago en
   §4.4) — este paso solo se alcanza cuando el abono ya fue validado como
   ≤ saldo pendiente, así que en la práctica `v_monto` termina en 0.

Esta lógica vive como un bloque `plpgsql` compartido (mismo cuerpo dentro
de `create_pos_sale` para el abono inicial, y dentro de
`registrar_abono_credito` para abonos posteriores) — no hace falta
extraerla a una función SQL aparte para el alcance de este plan.

### 4.4 RPC `registrar_abono_credito` (nuevo)

```sql
registrar_abono_credito(p_sale_id uuid, p_amount numeric, p_payment_method payment_method)
returns public.credit_payments
```

1. Requiere `is_staff_or_above()`.
2. Bloquea la venta: `select payment_method, total from pos_sales where id
   = p_sale_id for update`. Si no existe o `payment_method <> 'credito'`,
   error.
3. Valida `p_payment_method <> 'credito'`.
4. Calcula saldo pendiente actual (`total - coalesce(sum(credit_payments.amount),
   0)` para esa venta, dentro de la misma transacción). Si `p_amount <= 0`
   o `p_amount > v_saldo`, error ("El abono no puede superar el saldo
   pendiente.").
5. Inserta la fila en `credit_payments`.
6. Aplica el reparto FIFO (§4.3) con `p_amount`.
7. Retorna la fila de `credit_payments` insertada.

```sql
revoke execute on function public.registrar_abono_credito(uuid, numeric, payment_method) from public, anon;
grant execute on function public.registrar_abono_credito(uuid, numeric, payment_method) to authenticated;
```

## 5. Panel administrativo

### 5.1 Navegación y ubicación

`/admin/**` requiere rol `admin`/`superadmin` por middleware (regla de
CLAUDE.md §4) — pero ya se acordó que **staff también puede registrar
abonos** (mismo nivel que puede operar el POS). Por eso esta sección vive
bajo `/pos/**`, no bajo `/admin/**`, replicando exactamente el patrón ya
usado por "Ventas POS" (`src/app/pos/(admin)/ventas/page.tsx`, accesible a
staff sin ningún `requireAdmin()`, protegido únicamente por RLS):

- `/pos/creditos` (listado)
- `/pos/creditos/[id]` (detalle + registrar abono)

Ambas páginas van dentro del route group `src/app/pos/(admin)/`, junto a
`ventas/` y `venta/[id]/`, y heredan el mismo `layout.tsx` (sidebar POS).
El nombre `(admin)` es solo organizativo (route group, no aparece en la
URL) — no es un gate de rol.

En `src/app/admin/admin-nav.tsx`, dentro de la sección "Ventas", se agrega
un enlace cruzado (igual que ya existe para "Ventas POS"):

```ts
{ href: "/pos/creditos", label: "Créditos" },
```

### 5.2 Listado (`/pos/creditos`)

Server Component. Consulta `pos_sales` donde `payment_method = 'credito'`,
con el saldo calculado (subconsulta contra `credit_payments`) y el estado
derivado contra `credit_installments`:

- **Pagado**: saldo calculado = 0.
- **Vencido**: existe alguna `credit_installments` con `status <> 'pagada'`
  y `due_date < current_date`.
- **Al día**: ninguno de los dos anteriores.

Columnas: cliente (nombre + teléfono), fecha de venta, total, saldo
pendiente, estado (badge de color: verde=pagado, ámbar=al día,
rojo=vencido). Filtro por estado vía query param (`?estado=vencido`, etc.,
mismo patrón que otros listados admin del proyecto). Cada fila enlaza a
`/pos/creditos/[id]`.

### 5.3 Detalle (`/pos/creditos/[id]`)

Server Component que muestra:
- Datos del cliente y de la venta (reutiliza la vista de items ya usada en
  `/pos/venta/[id]/page.tsx`).
- Tabla de `credit_installments`: número, fecha, monto, pagado, estado.
- Historial de `credit_payments`: fecha, monto, método, quién lo recibió
  (join a `profiles.username`).
- `<AbonoForm>` (Client Component nuevo): monto + método de pago → Server
  Action que llama `registrar_abono_credito`. Muestra el saldo pendiente
  actualizado tras cada envío (revalidación de la página).
- Botón de impresión del recibo del abono más reciente, reutilizando el
  patrón de `src/app/pos/(admin)/venta/[id]/print-button.tsx`.

### 5.4 Bloqueo de edición

En `src/app/pos/(admin)/venta/[id]/editar/page.tsx` (y su `actions.ts`),
se agrega la misma guarda ya usada para Wompi pendiente (migración 029):
si `payment_method = 'credito'`, la página no renderiza
`<EditarVentaForm>` y en su lugar muestra un aviso ("Esta venta es un
crédito y no se puede editar; gestiona los abonos desde Créditos.") con
enlace a `/pos/creditos/[id]`. El Server Action de guardado también
rechaza la operación server-side (defensa en profundidad, mismo criterio
que el bloqueo Wompi).

## 6. Informes

### 6.1 Problema

`018_informes.sql` (ingreso por método de pago, líneas ~76-106) unifica
`orders.total` y `pos_sales.total` como ingreso realizado en la fecha de
la venta/pedido. Con crédito, el `total` de la venta no es dinero recibido
en esa fecha — el dinero llega en cada abono.

### 6.2 Regla

En toda consulta de informes que sume ingresos:
- Se **excluyen** las filas de `pos_sales` con `payment_method = 'credito'`
  de la suma directa de `total`.
- Se **incluyen** las filas de `credit_payments` como una fuente adicional
  de ingreso, fechadas por `credit_payments.created_at` y con método de
  pago `credit_payments.payment_method` (nunca `'credito'`, ya que ese
  valor nunca se usa en esa columna).

Esto aplica a: ingreso por método de pago, ventas/ingresos por periodo, y
el cálculo de ganancia aproximada (ventas − costo − gastos) de la Fase 12,
que pasa a tratar cada abono como el evento de "venta cobrada" para
créditos, en vez del total al momento de la venta.

### 6.3 Nueva sección "Créditos" en Informes

Tres cifras para el periodo seleccionado:
- **Cartera pendiente**: suma de saldos (calculados) de todos los créditos
  con saldo > 0, sin importar cuándo se otorgaron.
- **Monto vencido**: suma de `amount - paid_amount` de toda
  `credit_installments` con `status <> 'pagada'` y `due_date < current_date`.
- **Cobrado en abonos** (dentro del periodo del informe): suma de
  `credit_payments.amount` con `created_at` en el rango seleccionado — esta
  es la cifra que ya cuenta como ingreso en las otras secciones del
  informe, mostrada aquí también de forma agregada para contexto de
  cartera.

## 7. Validaciones y casos borde

- **Sobrepago de un abono**: rechazado en `registrar_abono_credito` (§4.4
  paso 4).
- **Cuotas**: `p_credit_num_cuotas >= 1`; con 1 cuota, equivale a "todo el
  saldo vence en 30 días" (no es un caso especial de código).
- **Cuota de monto 0** (abono inicial cubre el 100%): ver caso especial en
  §4.2 paso 4 — se genera una sola cuota simbólica ya pagada, en vez de N
  cuotas de $0 (que violarían `check (amount > 0)`).
- **Redondeo**: la última cuota absorbe el residuo de la división, de
  forma que `sum(credit_installments.amount) = v_saldo_financiar` siempre,
  centavo a centavo.
- **Estado "Vencido"**: se calcula en cada consulta al listado/detalle, no
  se almacena — evita que quede desactualizado por falta de un job
  programado.
- **Borrado**: `credit_payments` usa `on delete restrict` sobre `sale_id`;
  no se expone ninguna acción de borrado de venta a crédito con abonos
  (coherente con que el resto del sistema tampoco permite borrar pedidos u
  otras ventas ya registradas).
- **Edición de venta a crédito**: bloqueada por completo (§5.4), sin
  importar si ya tiene abonos o no — más simple y consistente que
  distinguir "sin abonos todavía" (decisión tomada en brainstorming).

## 8. Testing (TDD, igual que el resto del proyecto)

Casos mínimos a cubrir con tests (unitarios donde aplique, y verificación
SQL vía `execute_sql`/tests de RPC donde no hay equivalente en TS):

- Reparto FIFO: un abono que cubre exactamente una cuota; uno que cubre
  una cuota y deja resto en la siguiente (parcial); uno que cubre todas
  las cuotas restantes exactamente (crédito queda pagado).
- Redondeo: total no divisible exacto entre el número de cuotas (ej.
  $100.000 ÷ 3) — la suma de las cuotas debe igualar el saldo a financiar.
- Caso especial de abono inicial = 100% del total.
- Rechazo de sobrepago (abono > saldo pendiente).
- Rechazo de edición de venta a crédito (página no renderiza el
  formulario; el Server Action también rechaza).
- Informes: una venta a crédito sin abonos no debe sumar a "ingreso por
  método de pago"; un abono sí debe sumar, con la fecha y método
  correctos, y no debe duplicarse con el total de la venta.
- Validación de campos obligatorios (cliente, teléfono, número de cuotas)
  cuando `payment_method = 'credito'`.

## 9. Fuera de este plan (seguimiento futuro)

- Recordatorios de cuotas próximas a vencer o vencidas (WhatsApp/email).
- Intereses o recargos por mora.
- Editar el calendario de cuotas de un crédito ya creado.
- Créditos originados desde la tienda pública.
