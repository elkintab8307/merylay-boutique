# Fase 14 — Compras y costo de producto: Diseño

> Ver `CLAUDE.md` §12 punto 14 para los requisitos originales. Segunda de
> tres sub-fases reordenadas (Gastos → Compras → Informes) para que la
> futura Fase 12 pueda calcular ganancia real: Ventas − Costo de productos
> vendidos − Gastos.

## Objetivo

Registrar el costo real de cada producto, para que los futuros informes
puedan calcular ganancia real en vez de aproximada. Se hace mediante dos
mecanismos complementarios: edición manual del costo en el producto (uso
habitual) y un módulo formal de Compras a proveedores (uso puntual, que
además actualiza stock).

## Alcance

1. Costo de producto (`product_costs`): campo editable en el formulario de
   producto existente, aislado en una tabla separada por razones de
   seguridad (ver Arquitectura).
2. Proveedores (`suppliers`): CRUD simple, gestionado por admin.
3. Compras (`purchases`/`purchase_items`): registro de una compra a un
   proveedor con una o más líneas de producto, que atómicamente suma stock
   y sobrescribe el costo del producto comprado.

Fuera de alcance: costo por variante (se decidió costo a nivel de producto
general, no por talla/color), contabilidad FIFO/por lotes, devoluciones a
proveedor, múltiples monedas, adjuntar facturas escaneadas.

## Arquitectura

### Por qué el costo no vive en `products`

La tabla `products` tiene RLS de lectura pública (`products_select_active_or_admin`,
Fase 2) para que la tienda pueda mostrar el catálogo a cualquier visitante.
Si `cost_price` se agregara como columna de esa tabla, cualquier cliente
podría verlo inspeccionando la respuesta cruda de la API de Supabase, sin
importar que la UI nunca lo muestre — RLS es por fila, no por columna, y
este proyecto no usa privilegios a nivel de columna en ningún otro lugar.
Para que la decisión "solo admin/superadmin ve el costo" sea real (no una
omisión de la interfaz), el costo vive en una tabla separada
(`product_costs`) con su propio RLS restringido a `is_admin()`.

### Esquema (nuevas tablas, vía Supabase MCP)

```sql
create table public.product_costs (
  product_id uuid primary key references public.products(id),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  purchase_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  product_id uuid not null references public.products(id),
  qty integer not null check (qty > 0),
  unit_cost numeric(12,2) not null check (unit_cost > 0),
  line_total numeric(12,2) not null check (line_total > 0)
);
```

`product_costs.product_id` es la propia PK (relación uno a uno real, no
solo lógica) — un producto tiene a lo sumo un costo vigente, nunca
histórico por fila (el histórico, si se necesita después, se reconstruye
desde `purchase_items`).

### RLS

`product_costs`, `suppliers`, `purchases`, `purchase_items`: lectura y
escritura restringidas a `is_admin()` en las cuatro — mismo patrón que
`expenses`/`expense_categories` de la Fase 13. `staff` sin ninguna policy,
sin acceso alguno.

### RPC atómica para registrar una compra

Mismo patrón ya establecido en `create_order`/`create_pos_sale`/
`create_order_wompi`: una función `security definer` con bloqueo de fila
para evitar condiciones de carrera.

```sql
create function public.create_purchase(
  p_supplier_id uuid,
  p_purchase_date date,
  p_items jsonb  -- [{ productId, qty, unitCost }]
)
returns public.purchases
security definer
...
```

Dentro de la función, por transacción:
1. Valida `is_admin()` (mismo patrón que `create_pos_sale`).
2. Inserta la cabecera en `purchases`.
3. Por cada ítem del array `p_items`:
   - Bloquea la fila de `products` (`for update`).
   - Inserta en `purchase_items` (con `line_total = qty * unit_cost`
     calculado en la función, no confiado del cliente).
   - Suma stock: `update products set stock = stock + qty`.
   - Hace `upsert` en `product_costs` con `cost_price = unit_cost` (el
     costo de esta compra sobrescribe el anterior, según la decisión ya
     tomada — "el costo siempre refleja cuánto costaría reponerlo hoy").
4. Retorna la compra creada.

`revoke ... from public, anon; grant ... to authenticated;` — la función
en sí valida `is_admin()` internamente (igual que `create_pos_sale`), así
que cualquier usuario autenticado puede invocarla pero solo un admin pasa
la verificación interna.

### Panel admin

- `/admin/compras` — lista de compras (proveedor, fecha, total de la
  compra), enlaces a "Nueva compra" y a "Proveedores".
- `/admin/compras/nueva` — formulario: selector de proveedor (activos),
  fecha, y líneas dinámicas (producto + cantidad + costo unitario, con
  `useFieldArray` de react-hook-form, mismo patrón ya usado en
  `ProductoForm` para variantes), total calculado en vivo en el cliente
  (la función RPC recalcula del lado del servidor, el cliente solo es para
  feedback visual).
- `/admin/compras/proveedores` — CRUD de proveedores (nombre, teléfono,
  activo/inactivo), mismo patrón que `/admin/gastos/categorias`.
- `src/app/admin/productos/producto-form.tsx` gana un campo "Costo de
  compra" (numérico, opcional al crear — un producto puede no tener costo
  registrado todavía). Al guardar, si se envió un valor, se hace `upsert`
  en `product_costs` desde la Server Action de producto (no se toca la
  tabla `products` para nada relacionado al costo).
- `admin-nav.tsx` gana un enlace "Compras".

### Validación

`src/lib/validation/proveedor.ts`: `proveedorSchema` — `name` (mínimo 2
caracteres), `phone` (opcional), `isActive` (boolean).

`src/lib/validation/compra.ts`: `compraSchema` — `supplierId` (uuid),
`purchaseDate` (fecha ISO, no futura, mismo patrón corregido de Gastos:
`z.iso.date(...)` + refine), `items` (array, mínimo 1 elemento, cada uno
con `productId` uuid, `qty` entero positivo, `unitCost` número positivo).

`src/lib/validation/producto.ts` (existente): se le agrega un campo
opcional `costPrice` (número no negativo o `null`) al `productoSchema`
existente, para el nuevo campo del formulario.

## Manejo de errores

Mensajes en español, mismo patrón `{ error?: string }` de toda la app. El
RPC de compra usa `raise exception` con mensajes en español (mismo patrón
que `create_pos_sale`), capturados por la Server Action que la invoca.

## Testing

- TDD sobre `proveedorSchema` y `compraSchema` (casos válidos, cantidad/
  costo no positivos, fecha futura, array de ítems vacío).
- Verificación de integración contra Supabase real: RLS (staff sin acceso
  a `purchases`/`product_costs`/`suppliers`), y el flujo completo de
  `create_purchase` — antes/después de stock (debe sumar exactamente lo
  comprado), `product_costs` sobrescrito con el costo de la compra más
  reciente, y una segunda compra del mismo producto a otro costo
  confirmando que el costo se actualiza (no se promedia).

## UI

Sigue el patrón visual ya establecido en `/admin/gastos` (fondo
`brand-crema`, tarjetas blancas con borde `brand-rosa-claro`, botones
`brand-rosa`). El campo de costo en `ProductoForm` se ubica junto al
campo de precio de venta existente, con una nota aclaratoria de que es
información interna (no visible en la tienda pública).
