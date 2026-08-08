# Fase 13 — Gastos: Diseño

> Ver `CLAUDE.md` §12 punto 13 para los requisitos originales. Primera de
> tres sub-fases (Gastos → Compras → Informes) reordenadas para que los
> informes de la Fase 12 puedan calcular ganancia real desde el principio,
> en vez de aproximada.

## Objetivo

Permitir que admin/superadmin registren los gastos generales del negocio
(renta, servicios, nómina, insumos, etc.), categorizados y con fecha, para
que los informes de la Fase 12 puedan restarlos de los ingresos.

## Alcance

1. Categorías de gasto personalizables (CRUD, gestionadas por
   admin/superadmin).
2. Registro de gastos (CRUD), cada uno con categoría, descripción, monto y
   fecha.
3. Listado con filtro por rango de fechas y por categoría, con total
   acumulado del periodo filtrado.

Fuera de alcance: adjuntar comprobantes/facturas, gastos recurrentes
automáticos, flujos de aprobación, gastos por sucursal, acceso de `staff`
(sin lectura ni escritura).

## Arquitectura

### Esquema (nuevas tablas, vía Supabase MCP)

```sql
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories(id),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index expenses_expense_date_idx on public.expenses(expense_date);
create index expenses_category_id_idx on public.expenses(category_id);
```

`category_id` usa `references` simple (no `on delete cascade`) — una
categoría con gastos asociados no se puede borrar por la restricción de FK
por defecto; se desactiva (`is_active = false`) en su lugar, mismo patrón
que `categories` de productos.

### RLS

Ambas tablas: lectura y escritura (`insert`/`update`/`delete`) restringidas
a `is_admin()` (que ya cubre `admin` y `superadmin`, función existente
desde la Fase 1). `staff` no tiene ninguna policy — sin acceso alguno,
incluida la lectura, ya que la información financiera de gastos es
sensible.

### Seed de categorías iniciales

Parte de la misma migración, como `insert` de datos (no como un enum de
código, para que sigan siendo editables): Renta, Servicios, Nómina,
Insumos/Empaques, Marketing, Transporte/Domicilios, Mantenimiento, Otros.

### Panel admin

- `/admin/gastos` — lista de gastos con filtro por rango de fechas
  (`desde`/`hasta`) y por categoría (querystring, mismo patrón que
  `?status=` de `/admin/pedidos`), total acumulado del periodo filtrado
  mostrado en una tarjeta sobre la tabla. Botón "Nuevo gasto".
- `/admin/gastos/nuevo` y `/admin/gastos/[id]/editar` — formulario con
  categoría (select poblado con categorías activas), descripción, monto,
  fecha. Mismo patrón visual de `CategoriaForm`/`ProductoForm`.
- `/admin/gastos/categorias` — CRUD de categorías (nombre, activa/inactiva),
  mismo patrón que `/admin/categorias` (lista + toggle activo/inactivo, sin
  borrado físico).
- `admin-nav.tsx` gana un enlace "Gastos".

### Validación

`src/lib/validation/gasto.ts`: `gastoSchema` (zod) — `categoryId` (uuid),
`description` (string, mínimo 3 caracteres), `amount` (número positivo),
`expenseDate` (string de fecha ISO, no futura — un gasto no puede
registrarse con fecha futura). `expenseCategoriaSchema`: `name` (string,
mínimo 2 caracteres), `isActive` (boolean).

## Manejo de errores

Mensajes en español, mismo patrón `{ error?: string }` de toda la app.
`amount <= 0` y `expense_date` futura se validan tanto en zod (cliente)
como quedan protegidos por el `check` de la migración (monto) del lado de
base de datos.

## Testing

- TDD sobre `gastoSchema` y `expenseCategoriaSchema` (casos válidos,
  monto negativo/cero, fecha futura, descripción vacía).
- Verificación de integración: script contra Supabase real confirmando (a)
  `staff` no puede leer ni escribir en `expenses`/`expense_categories` —
  RLS lo bloquea; (b) `admin` puede crear una categoría, crear un gasto en
  ella, y el filtro por rango de fechas/categoría en la consulta de listado
  retorna los resultados esperados; limpieza de datos de prueba al final.

## UI

Sigue el patrón visual establecido en `/admin/categorias` y
`/admin/productos` (fondo `brand-crema`, tarjetas blancas con borde
`brand-rosa-claro`, botones `brand-rosa`). El total acumulado del periodo
se destaca en una tarjeta con `formatPrice()`, mismo componente ya usado en
el dashboard y en pedidos.
