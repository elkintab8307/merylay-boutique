# Rediseño POS — Sub-proyecto 2: Módulo de clientes

> Sub-proyecto 2 de 5 del rediseño visual del POS. El sub-proyecto 1
> (layout y navegación) ya está implementado y en producción (PR #25).
> Los sub-proyectos 3-5 (navegación de productos, carrito/métodos de
> pago, capa móvil) tienen su propio ciclo de spec → plan →
> implementación, por separado.

## Contexto

Hoy el POS no tiene ningún concepto de "cliente" reutilizable:

- Una venta normal (no crédito) no guarda ningún dato del comprador.
- Una venta a crédito guarda `credit_customer_name`/`credit_customer_phone`
  como texto plano directamente en `pos_sales` — sin tabla propia, sin
  vínculo a ninguna cuenta, se re-escribe a mano en cada venta nueva
  aunque sea el mismo cliente de siempre.
- La tienda pública sí tiene clientes reales con cuenta
  (`profiles.role = 'customer'`, con `full_name`/`whatsapp`/`address`,
  poblados por el registro simplificado — migración `031_registro_clientes.sql`),
  pero un cliente de mostrador normalmente no quiere crear una cuenta con
  usuario/contraseña solo para comprar en persona.

Este sub-proyecto agrega un módulo de clientes propio del POS: buscar,
crear al vuelo y asociar un cliente a cualquier venta (con o sin
crédito), con vínculo automático a una cuenta de la tienda si el
teléfono coincide, y una página de administración con historial de
compras combinado.

## Decisiones de alcance (ya confirmadas con el usuario)

- **Modelo de datos**: tabla propia `pos_customers`, independiente de
  `auth.users`/`profiles` — no requiere cuenta ni autenticación. Si el
  teléfono coincide con `profiles.whatsapp` de un cliente ya registrado
  en la tienda, se vincula automáticamente (`profile_id`).
- **Crédito migra al mismo modelo**: las ventas a crédito dejan de usar
  `credit_customer_name`/`credit_customer_phone` como texto libre y
  pasan a usar el mismo selector/tabla de clientes que las ventas
  normales — un solo flujo de cliente en todo el POS.
- **Cliente opcional en ventas normales**: el vendedor puede dejar una
  venta sin cliente asignado (venta anónima de mostrador, igual que
  hoy). Crédito sigue exigiendo cliente (ya lo exige hoy).
- **Datos mínimos para crear un cliente al vuelo**: nombre + teléfono.
  Cédula y dirección quedan como campos opcionales, editables después.
- **Migración de datos históricos**: backfill automático — una
  migración SQL crea un `pos_customers` por cada nombre+teléfono
  distinto ya usado en crédito, enlaza las ventas viejas por
  `customer_id`, y luego elimina las columnas de texto ya redundantes.
- **Página `/pos/clientes`**: listado + detalle con historial de
  compras. El historial combina ventas del POS (siempre) con pedidos de
  la tienda online (`orders`) cuando el cliente está vinculado a una
  cuenta (`profile_id`).
- **Selector de cliente**: vive DENTRO de la tarjeta del carrito
  (`venta-items-editor.tsx`), como una sección más — mismo patrón que
  ya usan descuento/método de pago/crédito hoy. El botón "Cliente" de
  la barra superior (diferido en el sub-proyecto 1) deja de controlar
  la venta en curso y en su lugar enlaza a `/pos/clientes`.

## Diseño

### 1. Modelo de datos

Nueva tabla `pos_customers`:

```sql
create table public.pos_customers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  cedula text,
  direccion text,
  profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create unique index pos_customers_telefono_idx on public.pos_customers(telefono);
```

`telefono` se guarda ya normalizado (solo dígitos, mismo criterio que
`whatsappSchema` en `src/lib/validation/whatsapp.ts`:
`v.replace(/\D/g, "")`), para que la búsqueda y el índice único no se
rompan por formato (espacios, guiones, prefijo `+57`). El índice único
sobre el teléfono normalizado es lo que evita crear el mismo cliente
dos veces.

**Vínculo automático a `profiles`**: al crear un `pos_customers`, el
servidor busca un `profiles` cuyo `whatsapp` normalizado coincida con
el teléfono ingresado; si lo encuentra, guarda su `id` en `profile_id`
(si hay más de una coincidencia — `whatsapp` no tiene restricción única
en `profiles` — se usa la más reciente por `created_at`, sin bloquear
la creación del cliente).
Esta búsqueda usa el cliente admin (`createAdminClient()`, ya usado hoy
en `creditos/[id]/page.tsx` para leer usernames de staff) porque la RLS
de `profiles` (`profiles_select_own_or_superadmin`) no deja que un
`staff` lea el perfil de otro usuario — el vínculo se resuelve
server-side con service role, nunca se expone al cliente el listado de
perfiles ajenos.

`pos_customers` es una entidad interna del POS: RLS de solo
staff/admin/superadmin (mismo criterio que `pos_sales`), sin acceso
público ni de `customer`.

`pos_sales` gana una columna:

```sql
alter table public.pos_sales add column customer_id uuid references public.pos_customers(id);
```

### 2. Selector de cliente en el carrito

Nueva sección en `venta-items-editor.tsx` (afecta `/pos` y
`/pos/venta/[id]/editar`, que comparten este componente), con el mismo
patrón visual que la caja "Datos del crédito" ya existente:

- Un link "+ Agregar cliente" (o, si ya hay uno elegido, una línea con
  su nombre/teléfono y un botón "Cambiar").
- Al expandir: buscador por nombre o teléfono contra `pos_customers`
  (server action `buscarClientes(query)`, mismo patrón que
  `searchProducts` en `search-action.ts`), resultados en una lista
  simple, click para seleccionar.
- Si la búsqueda no encuentra nada: formulario inline nombre+teléfono
  ("Crear cliente nuevo"), que llama a una nueva server action
  `crearCliente(nombre, telefono)` y selecciona el cliente recién
  creado.
- El `customerId` elegido (o `null`) viaja junto con
  `items`/`paymentMethod`/`discount` al `onGuardar` existente.

**Crédito**: la caja "Datos del crédito" pierde sus campos de texto
libre "Cliente"/"Teléfono" — en su lugar usa esta misma sección de
selector (obligatoria cuando `paymentMethod === "credito"`, igual que
hoy exige nombre/teléfono). `CreditoVentaInput`
(`src/lib/validation/credito.ts`) cambia `clienteNombre`/`clienteTelefono`
por `customerId: string` (uuid).

### 3. Cambios en los RPCs

`create_pos_sale`: los parámetros `p_credit_customer_name`/
`p_credit_customer_phone` se reemplazan por `p_customer_id uuid default
null`. Validación: si `p_payment_method = 'credito'`, `p_customer_id`
es obligatorio (mismo mensaje de error que hoy tenía para nombre/
teléfono vacíos, adaptado). `pos_sales.customer_id` se llena con este
valor sin importar el método de pago (para ventas normales queda
`null` si el vendedor no asignó cliente).

`update_pos_sale` gana `p_customer_id uuid default null` — permite
asignar/cambiar el cliente de una venta normal ya registrada (las
ventas a crédito siguen bloqueadas para edición, sin cambios ahí).

Las páginas que hoy leen `credit_customer_name`/`credit_customer_phone`
directamente de `pos_sales` pasan a hacer join con `pos_customers` vía
`customer_id`:

- `src/app/pos/(admin)/venta/[id]/page.tsx` (recibo, sección de crédito)
- `src/app/pos/(admin)/creditos/page.tsx` (listado)
- `src/app/pos/(admin)/creditos/[id]/page.tsx` (detalle)

### 4. Migración de datos históricos

Una migración SQL, en este orden:

1. Agrega `pos_customers` y `pos_sales.customer_id` (sección 1).
2. Por cada combinación distinta de `credit_customer_name`+
   `credit_customer_phone` ya presente en `pos_sales`, inserta un
   `pos_customers` (teléfono normalizado igual que en la sección 1).
3. Actualiza `pos_sales.customer_id` de esas ventas para apuntar al
   `pos_customers` recién creado, haciendo match por nombre+teléfono.
4. Elimina las columnas `credit_customer_name`/`credit_customer_phone`
   de `pos_sales` (ya redundantes: la misma información vive ahora en
   `pos_customers` vía `customer_id`).

El vínculo automático a `profiles` (sección 1) también corre durante
el backfill, así que clientes de crédito históricos que además tengan
cuenta en la tienda quedan vinculados desde el día uno.

### 5. Página `/pos/clientes`

Nueva ruta dentro de `src/app/pos/(admin)/clientes/` (mismo grupo que
`ventas`/`creditos` — accesible a `staff`/`admin`/`superadmin`, mismo
criterio de `route-protection.ts` que ya cubre todo `/pos`). Se agrega
como cuarto ítem de la sección "POS" del sidebar (`BackendSidebar`,
icono `Users` de lucide-react).

- **Listado** (`/pos/clientes`): buscador por nombre/teléfono, tabla
  con nombre, teléfono, y si tiene cuenta vinculada.
- **Detalle** (`/pos/clientes/[id]`): datos editables (nombre, teléfono,
  cédula, dirección — no `profile_id`, ese vínculo es automático) y su
  historial de compras:
  - Ventas del POS (`pos_sales` por `customer_id`), siempre.
  - Si `profile_id` no es null, también sus pedidos de la tienda
    (`orders` por `user_id`), mezclados por fecha con las ventas del
    POS. Esta consulta a `orders`/`profiles` para un usuario que no es
    el propio `staff` necesita el cliente admin (mismo motivo que la
    sección 1: la RLS de `orders`/`profiles` es `owner_or_admin`, y
    `staff` no es `admin`).

El botón "Cliente" de la barra superior del POS (`PosTopBar`, hoy sin
acción real desde el sub-proyecto 1) pasa a ser un `Link` a
`/pos/clientes`.

## Fuera de alcance (explícitamente diferido)

- Categorías en píldoras, grilla de productos, botón "Scanner" →
  sub-proyecto 3.
- Rediseño visual del panel de carrito/métodos de pago como
  botones-ícono → sub-proyecto 4 (aunque este sub-proyecto SÍ toca
  `venta-items-editor.tsx` para agregar la sección de cliente, no
  rediseña su apariencia general).
- Capa móvil → sub-proyecto 5.
- Cualquier flujo para que el propio cliente (storefront) vea o
  gestione sus datos de `pos_customers` — esta tabla es 100% interna
  del POS, sin RLS pública.
- Fusionar/desduplicar manualmente un `pos_customers` con una cuenta de
  `profiles` cuando el teléfono no coincide exactamente (ej. el cliente
  cambió de número) — el vínculo automático por teléfono es el único
  mecanismo; no hay UI para vincular manualmente en este sub-proyecto.

## Testing

- Tests unitarios (Vitest, patrón ya usado en el repo) para:
  - `buscarClientes`/`crearCliente` (server actions, incluyendo el caso
    de vínculo automático a `profiles` por teléfono normalizado).
  - `creditoVentaSchema` actualizado (ahora valida `customerId`, no
    nombre/teléfono libres).
  - `registrarVenta`/`update_pos_sale`'s server action wrappers con el
    nuevo parámetro `customerId` (actualizando los tests existentes en
    `src/app/pos/__tests__/sale-action.test.ts`, que hoy aseveran los
    parámetros `p_credit_customer_name`/`p_credit_customer_phone`).
- Verificación manual: igual que en el sub-proyecto 1, `/pos/**`
  requiere sesión autenticada de staff/admin/superadmin y el manejo de
  la contraseña del superadmin en texto plano está prohibido en esta
  sesión — la verificación visual final la hace el usuario en el
  preview desplegado.

## Preguntas abiertas (a resolver en el plan de implementación, no bloquean el spec)

- Orden exacto de las tareas del plan: dado que este sub-proyecto toca
  esquema, RPCs, un componente compartido (`venta-items-editor.tsx`) y
  varias páginas de lectura, el plan de implementación necesita
  secuenciar con cuidado (esquema/migración primero, luego server
  actions, luego UI del selector, luego páginas de lectura que dependen
  del nuevo `customer_id`, luego la página `/pos/clientes` nueva).
- Ícono exacto para "Clientes" en el sidebar (`Users` es la
  recomendación, se verifica que exista en la versión instalada de
  `lucide-react` en la fase de plan, mismo criterio que ya se aplicó en
  el sub-proyecto 1 tras el error con el ícono de Facebook).
