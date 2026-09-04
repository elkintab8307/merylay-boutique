# Stock del producto automático (suma de variantes)

## Objetivo

`products.stock` (el número de stock a nivel de producto) es hoy un campo
que el admin escribe a mano en el formulario de producto. Para productos
**con variantes** ese número no tiene relación mecánica con la realidad:
el stock real de esas prendas vive en `product_variants.stock` (que ya se
calcula solo, del conteo de fotos no vendidas — diseño "disponibilidad por
estampado", migración 048). El resultado es que el listado del admin
muestra un número de stock viejo/incorrecto para los productos con
variantes, y el admin siente que tiene que corregirlo a mano.

El objetivo: para productos **con variantes**, `products.stock` pasa a
calcularse solo como la **suma del stock de todas sus variantes**, sin
tocar los RPCs de venta ni la tienda, de modo que el listado del admin (y
cualquier otro lugar que lea `products.stock`) muestre la cantidad real.
Para productos **sin variantes**, `products.stock` sigue siendo 100%
manual — no hay de dónde calcularlo.

## Contexto

- **Migración 048** (`disponibilidad_por_estampado`): agregó
  `product_images.vendida` y el trigger `trg_recalcular_stock_variante`
  (AFTER INSERT/UPDATE OF vendida,variant_id/DELETE en `product_images`),
  que mantiene `product_variants.stock` = conteo de fotos no vendidas de
  esa variante. Esa migración decidió **explícitamente no tocar**
  `products.stock` (lo dejó como dato manual). Este diseño construye el
  siguiente escalón sobre esa base.
- **`src/lib/store/stock.ts`** (`productoAgotado`): la tienda ya **no
  confía** en `product.stock` cuando el producto tiene variantes —
  calcula la disponibilidad desde `stocksVariantes`. Patrón probado, se
  mantiene igual.
- **`src/lib/admin/low-stock.ts`**: la alerta de stock bajo (dashboard,
  campanita del POS) ya separa: para productos con variantes solo mira
  `product_variants.stock`; para productos sin variantes mira
  `products.stock` (línea ~55). Ya es correcto — sin cambios.
- **`src/app/admin/informes/stock-bajo/page.tsx`**: ya separa productos
  sin variante (`p.stock`) de variantes (`v.stock`). Ya es correcto — sin
  cambios.
- **`src/app/admin/productos/page.tsx`** (el listado que motivó este
  pedido): la insignia `"N unidades"` lee `producto.stock` crudo — es el
  único lugar del admin que muestra el número equivocado para productos
  con variantes. Ya consulta `product_variants` (para los chips de tallas,
  PR #44).
- **Los 5 RPCs de venta** (`create_order`, `confirm_order_payment_wompi`,
  `update_order_items`, `create_pos_sale`, `update_pos_sale`): para una
  línea con `variant_id` (con o sin `image_id`), **siempre** terminan
  cambiando `product_variants.stock` — directo (`stock = stock ± qty`) o
  vía el trigger de `vendida`. Nunca tocan `products.stock` para líneas de
  variante. Solo tocan `products.stock` en la rama `else` (línea sin
  `variant_id` ni `image_id` = producto sin variantes). Por eso **ningún
  RPC necesita cambios**: el trigger nuevo se cuelga de los cambios que
  ya ocurren en `product_variants.stock`.
- **`producto-form.tsx`**: input numérico `Stock` a nivel de producto
  (siempre visible, `register("stock", { valueAsNumber: true })`, línea
  ~478). El bloque "Disponibles" por variante ya muestra
  `imagenesDeVariante.filter((img) => !img.vendida).length` — la misma
  cuenta que necesitamos sumar.
- **`admin/productos/actions.ts`**: `createProducto` inserta
  `stock: parsed.data.stock`; `updateProducto` lo pone en el payload de
  `update`. `updateProducto` **siempre** re-`upsert`ea/inserta/borra las
  variantes enviadas (via `diffVariantes`), pero el `upsert` de variantes
  existentes **no** incluye la columna `stock` en su SET — o sea, un
  `upsert` de variante sin cambios reales **no** dispara
  `AFTER UPDATE OF stock`. Solo INSERT (variante nueva) y DELETE (variante
  quitada) disparan el trigger nuevo en un `updateProducto`.
- **`products.stock`**: `int not null default 0 check (stock >= 0)`.
- Migraciones se aplican con el MCP de Supabase
  (`mcp__supabase__apply_migration`), nunca a mano. Los tipos
  (`database.types.ts`) se regeneran con el MCP tras el cambio de esquema
  (aquí no cambia el esquema de columnas — solo se agrega una función y un
  trigger — así que la regeneración de tipos es opcional; se corre igual
  como verificación).

## Alcance

1. **Migración `050_stock_producto_automatico.sql`**: función +
   trigger que mantiene `products.stock` = `sum(product_variants.stock)`
   para productos con variantes; backfill único de todos los productos
   con variantes.
2. **`producto-form.tsx`**: para productos con variantes, el input
   numérico `Stock` se reemplaza por un texto de solo lectura con el
   total calculado. Para productos sin variantes, el input queda igual.
3. **`admin/productos/actions.ts`**: `createProducto` inserta `stock: 0`
   cuando hay variantes; `updateProducto` omite `stock` del payload
   cuando hay variantes. Sin variantes: sin cambios.
4. **Sin cambios**: los 5 RPCs de venta, `src/lib/store/stock.ts`,
   `low-stock.ts`, `informes/stock-bajo`, el modal de inventario del POS,
   las tarjetas de catálogo/POS, y la lógica de la insignia en
   `admin/productos/page.tsx` (lee `producto.stock`, que tras la
   migración ya es correcto).
5. **`productoSchema`** (`src/lib/validation/producto.ts`): sin cambios.
   El formulario sigue enviando el `stock` original para productos con
   variantes (número válido), pero `actions.ts` ya no lo usa en ese caso.

**Fuera de alcance**: cambiar cómo la tienda calcula disponibilidad
(sigue usando `productoAgotado` sobre las variantes); un modelo de stock
automático para productos sin variantes (no existe relación de la cual
derivarlo — quedaría manual); reservar/liberar stock en pedidos Wompi
pendientes o cancelados (huecos preexistentes documentados en el diseño
048); mostrar un desglose de stock por talla en el listado (los chips de
tallas del PR #44 ya dan ese contexto).

## Arquitectura

### Migración `050_stock_producto_automatico.sql`

```sql
-- Stock del producto automatico: para productos CON variantes,
-- products.stock deja de escribirse a mano y pasa a ser la suma del
-- stock de todas sus variantes (que a su vez ya se calcula solo del
-- conteo de fotos no vendidas, migracion 048). Productos SIN variantes:
-- products.stock sigue siendo manual, este trigger nunca los toca.

create or replace function public.recalcular_stock_producto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- NEW/OLD solo estan asignados dentro de su operacion.
  if TG_OP in ('INSERT', 'UPDATE') and new.product_id is not null then
    update public.products
    set stock = (
      select coalesce(sum(stock), 0)
      from public.product_variants
      where product_id = new.product_id
    )
    where id = new.product_id;
  end if;

  -- DELETE, o UPDATE que reasigna product_id (raro): recalcula tambien
  -- el producto viejo que perdio la variante.
  if TG_OP in ('DELETE', 'UPDATE') and old.product_id is not null
     and (TG_OP = 'DELETE' or old.product_id is distinct from new.product_id) then
    update public.products
    set stock = (
      select coalesce(sum(stock), 0)
      from public.product_variants
      where product_id = old.product_id
    )
    where id = old.product_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_stock_producto on public.product_variants;
create trigger trg_recalcular_stock_producto
after insert or update of stock, product_id or delete on public.product_variants
for each row execute function public.recalcular_stock_producto();

-- Backfill unico: deja products.stock igual a la suma de sus variantes
-- para todo producto que tenga al menos una variante.
update public.products p
set stock = (
  select coalesce(sum(pv.stock), 0)
  from public.product_variants pv
  where pv.product_id = p.id
)
where exists (select 1 from public.product_variants pv where pv.product_id = p.id);
```

**RLS / seguridad**: no hay columnas nuevas ni políticas nuevas. El
trigger corre `security definer` (igual que
`recalcular_stock_variante`) porque las políticas de `products` no
permiten `update` a clientes/staff, y las funciones de venta que
disparan la cadena ya son `security definer` — el trigger hereda esa
confianza.

**Encadenamiento de triggers**: `update product_images` →
`trg_recalcular_stock_variante` (AFTER, en `product_images`) →
`update product_variants.stock` → `trg_recalcular_stock_producto`
(AFTER, en `product_variants`) → `update products.stock`. Dos niveles,
sin recursión (`products` no tiene trigger que vuelva a `product_variants`).
Todo dentro de la transacción que originó el cambio (venta, edición del
formulario, o el toggle "Marcar vendida").

**Casos**:
- Producto sin variantes: 0 filas en `product_variants` → el trigger
  nunca se dispara para él → `products.stock` intacto (manual).
- Primera variante de un producto: INSERT en `product_variants` →
  trigger → `products.stock` = `sum` (0 si la variante no tiene fotos
  todavía). El producto "cambia de régimen" a stock calculado.
- Borrar la última variante: DELETE → trigger → `sum` = 0 →
  `products.stock` = 0. El producto vuelve a ser "sin variantes" con
  stock 0; el formulario vuelve a mostrar el input manual y el admin
  puede fijarlo.
- Venta (tienda o POS) de una línea de variante: el RPC cambia
  `product_variants.stock` (directo o vía `vendida`) → trigger →
  `products.stock` baja. Restaurar (editar/quitar la línea) lo sube de
  vuelta, por el mismo camino.

### Formulario de producto (`producto-form.tsx`)

El bloque actual (línea ~476-489):

```tsx
<div>
  <label htmlFor="stock" className="text-sm text-brand-ciruela">Stock</label>
  <Input id="stock" type="number" {...register("stock", { valueAsNumber: true })} />
  {errors.stock && <p className="text-sm text-red-600">{errors.stock.message}</p>}
</div>
```

pasa a:

```tsx
{fields.length > 0 ? (
  <div>
    <label className="text-sm text-brand-ciruela">Stock</label>
    <p className="flex min-h-10 items-center text-sm text-brand-ciruela">
      {existingImages.filter((img) => img.variant_id !== null && !img.vendida).length} unidades
      <span className="ml-2 text-xs text-brand-ciruela/60">
        — se calcula solo, sumando las fotos disponibles de cada variante
      </span>
    </p>
  </div>
) : (
  <div>
    <label htmlFor="stock" className="text-sm text-brand-ciruela">Stock</label>
    <Input id="stock" type="number" {...register("stock", { valueAsNumber: true })} />
    {errors.stock && <p className="text-sm text-red-600">{errors.stock.message}</p>}
  </div>
)}
```

- `fields` es el array de `useFieldArray` de variantes — `fields.length > 0`
  identifica "producto con variantes" de forma consistente con el resto
  del formulario.
- El total = fotos de variante no vendidas en `existingImages`. En un
  producto nuevo (aún sin `existingImages`) mostrará `0` hasta guardar;
  tras guardar, el trigger y la recarga dejan el número correcto.
- No se registra `stock` en RHF para productos con variantes → el valor
  de `defaultValues.stock` fluye sin tocarse (y `actions.ts` lo ignora).

### Acciones (`admin/productos/actions.ts`)

- **`createProducto`**: en el `.insert(...)` de `products`, cambiar
  `stock: parsed.data.stock` por
  `stock: parsed.data.variantes.length > 0 ? 0 : parsed.data.stock`.
  Al insertar luego las variantes, el trigger recalcula.
- **`updateProducto`**: construir el payload de `.update(...)` de
  `products` sin la clave `stock` cuando
  `parsed.data.variantes.length > 0`; con `stock: parsed.data.stock`
  cuando no hay variantes. (La columna queda como está; el trigger la
  mantiene por los INSERT/DELETE de variantes de esta misma llamada, o
  por las ventas / toggles de foto entre ediciones.)
- Nada más cambia en estas funciones.

### Listado de productos (`admin/productos/page.tsx`)

Sin cambios. La insignia ya lee `producto.stock`; tras la migración ese
número es la suma real de las variantes. Los chips de tallas (PR #44)
quedan como contexto.

## Testing

### SQL (verificación, no TDD — mismo criterio que la migración 048)

Antes de aplicar a producción, en una branch de Supabase
(`mcp__supabase__create_branch`) o con `execute_sql` contra un producto
de prueba:

1. Producto con 2 variantes con `stock` 3 y 2 → tras el backfill,
   `products.stock` = 5.
2. `update product_images set vendida = true` en una foto de una de esas
   variantes → esa variante baja a 2 (trigger 048) → `products.stock`
   baja a 4 (trigger nuevo).
3. `insert` de una variante nueva sin fotos para ese producto →
   `products.stock` sigue en 4 (suma +0).
4. `delete` de esa variante nueva → `products.stock` sigue en 4.
5. Simular una venta con `create_pos_sale` de una línea con `image_id`
   de ese producto → `products.stock` baja en 1; `update_pos_sale`
   quitando la línea → sube en 1.
6. Producto **sin** variantes: `update products set stock = 9` a mano →
   ningún trigger se dispara, queda en 9.
7. `mcp__supabase__get_advisors` (security y performance) sin alertas
   nuevas.

### Vitest

- **`src/app/admin/productos/__tests__/producto-form.test.tsx`**:
  - Con `variantes` no vacío y `imagenesExistentes` con N fotos de
    variante no vendidas → se muestra el texto "N unidades / se calcula
    solo…" y **no** hay `<input id="stock">`.
  - Con `variantes: []` → se muestra el `<input id="stock">` como hoy
    (los tests existentes de guardado siguen pasando).
- **`src/app/admin/productos/__tests__/actions.test.ts`**:
  - `createProducto` con variantes → el `insert` a `products` lleva
    `stock: 0`.
  - `createProducto` sin variantes → el `insert` lleva
    `stock: <valor del form>`.
  - `updateProducto` con variantes → el `update` a `products` **no**
    incluye la clave `stock`.
  - `updateProducto` sin variantes → el `update` incluye `stock`.
- `pnpm build && pnpm lint && pnpm test` en verde.

### Verificación manual en navegador

1. En `/admin/productos/<id>/editar` de un producto con variantes: el
   campo Stock aparece como texto de solo lectura con el total; editar
   otro campo y guardar no lo altera.
2. En un producto sin variantes: el input de Stock sigue editable y se
   guarda.
3. En `/admin/productos`: la insignia de un producto con variantes
   muestra la suma real (coincide con la suma de "X disponibles" de sus
   variantes en el formulario).
4. Vender ese producto por la tienda y por el POS → la insignia del
   listado baja en consecuencia.

## UI

Sin componentes nuevos. En el formulario, un `<Input type="number">` se
reemplaza condicionalmente por un `<p>` de solo lectura con el mismo
estilo tipográfico que el resto de campos (`text-sm text-brand-ciruela`,
nota en `text-xs text-brand-ciruela/60`). El listado del admin no cambia
visualmente — la insignia existente solo muestra un número correcto.
