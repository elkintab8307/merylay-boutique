# Disponibilidad de stock por estampado (foto)

## Objetivo

Cada unidad física de una variante (talla/color) puede tener un estampado
distinto: el negocio compra varias camisetas "tela Fría, talla M, Azul"
pero cada una con una foto/impresión diferente, y cada foto representa
exactamente una prenda física única. Hoy el stock es un número que el
admin escribe a mano por variante, sin relación mecánica con las fotos
subidas — por eso una foto puede quedar visible en la tienda o el POS
después de que esa prenda específica ya se vendió. El objetivo es que en
cuanto se vende el estampado de una foto puntual, esa foto deje de
aparecer como opción en cualquier parte del sistema (tienda, POS,
inventario), sin afectar la disponibilidad de las demás fotos de la misma
variante.

## Contexto

- La fase "Selección de estampado por unidad" (2026-08-25) ya conectó
  `cart_items`, `order_items` y `pos_sale_items` a una foto puntual vía
  `image_id`, y ya obliga a elegir 1 foto por unidad cuando una variante
  tiene más de una imagen propia. Esta fase construye directamente sobre
  esa base: cada línea de venta ya identifica una foto exacta.
- `product_variants.stock` (`int`) es hoy un número que el admin escribe a
  mano en `producto-form.tsx` y que los RPCs de venta (`create_order`,
  `create_order_wompi` + `confirm_order_payment_wompi`, `update_order_items`,
  `create_pos_sale`, `update_pos_sale`) leen/verifican/restan con `qty`.
- Dato real (verificado en producción antes de este diseño): de 29
  variantes con fotos propias, 27 ya tienen `stock` exactamente igual al
  número de fotos que tienen — es decir, el admin ya mantiene esa relación
  a mano en la práctica. Las 2 excepciones son "Camiseta tela Fría", talla
  S, colores Negra y Blanco: ambas con `stock = 0` pero **1 foto todavía
  presente** — el mismo problema que describe este diseño, ya ocurriendo
  hoy. Ninguna variante tiene `stock` MAYOR al número de fotos, es decir,
  no existe hoy ningún caso real de "stock genérico sin foto".
- `product_images` no tiene ninguna noción de disponibilidad; solo
  `variant_id`, `is_primary`, `sort_order`.
- `EstampadoPickerModal` (`src/components/store/estampado-picker-modal.tsx`)
  recibe la lista de fotos ya armada por quien lo abre — no filtra nada
  internamente. Los que arman esa lista hoy son: `product-detail-interactive.tsx`
  / `product-variant-selector.tsx` (tienda), `product-card-pos.tsx` (POS) y
  `carrito/page.tsx` + `authenticated-cart.tsx`/`guest-cart.tsx` (para
  "Cambiar estampado" desde el carrito ya armado).
- `producto-form.tsx` tiene un input numérico de stock por variante
  (línea ~390) validado por `productoSchema` (`variantes[].stock:
  z.number().int().min(0)`, `src/lib/validation/producto.ts`), y
  `admin/productos/actions.ts` (`createProducto`/`updateProducto`) escribe
  ese valor directo a `product_variants.stock` al guardar.
- `src/lib/admin/low-stock.ts` (alerta de stock bajo, campanita del POS)
  lee `product_variants.stock` tal cual — sin cambios necesarios aquí,
  porque la columna se sigue pudiendo leer igual, solo cambia quién la
  escribe.
- Los 5 RPCs de venta más `confirm_order_payment_wompi` son los únicos
  puntos que hoy escriben `product_variants.stock`. `create_order_wompi`
  es especial: solo VERIFICA stock al crear el pedido, pero no lo
  descuenta — el descuento real ocurre en `confirm_order_payment_wompi`,
  cuando el webhook de Wompi confirma el pago. Ese hueco (un pedido Wompi
  pendiente no reserva stock) ya existe hoy con el modelo numérico; este
  diseño lo mantiene igual, no lo corrige — está fuera de alcance.
- No existe hoy ningún flujo que restaure stock al cancelar un pedido
  (`orders.status = 'cancelado'` es una actualización de estado simple,
  sin RPC asociado que reponga `product_variants.stock`). Este diseño
  mantiene ese mismo comportamiento para las fotos: cancelar un pedido NO
  libera automáticamente sus fotos. Ampliarlo queda fuera de alcance.

## Alcance

1. **Migración de esquema**: columna `product_images.vendida boolean not
   null default false`. Función/trigger que recalcula
   `product_variants.stock` como el conteo de fotos no vendidas de esa
   variante, disparado en insert/update/delete de `product_images`.
2. **Backfill**: para las variantes donde el número de fotos supera el
   stock actual, las fotos "sobrantes" (más allá del stock) se marcan
   `vendida = true`. Con los datos reales de hoy, esto solo toca las 2
   filas ya identificadas (Camiseta tela Fría S/Negra y S/Blanco). Al
   final del backfill, se recalculan todos los `product_variants.stock`
   una vez con la misma lógica del trigger, como verificación de cierre.
3. **RPCs de venta**: `create_order`, `confirm_order_payment_wompi`,
   `update_order_items`, `create_pos_sale`, `update_pos_sale` dejan de
   restar/sumar `product_variants.stock` a mano para líneas con
   `image_id`; en su lugar marcan/desmarcan `product_images.vendida` de
   esa foto puntual (el trigger del punto 1 se encarga de que el número
   de stock quede correcto). Líneas sin `image_id` (productos sin
   variantes, o variantes con 0-1 foto) siguen restando el número de
   `products.stock` o `product_variants.stock` exactamente como hoy — no
   tienen foto que marcar.
4. **Protección anti-doble-venta**: marcar una foto como vendida se hace
   con un `update ... where id = X and vendida = false` condicional; si
   no afecta ninguna fila, esa foto ya se vendió (por ejemplo, a otro
   cliente que pagó primero) y la operación se rechaza con un mensaje
   claro, sin completar la venta/pedido para esa línea.
5. **Selector de estampado**: en los 3 puntos donde se arma la lista de
   `EstampadoOption[]` que recibe `EstampadoPickerModal` (tienda, POS,
   carrito), se excluyen las fotos con `vendida = true`.
6. **Formulario de producto**: se quita el input numérico de stock por
   variante; se muestra un texto de solo lectura ("X disponibles",
   calculado a partir de las fotos existentes). Cada foto de variante
   gana un botón "Marcar vendida" / "Marcar disponible" para
   correcciones manuales (prenda dañada, perdida, o regalada sin pasar
   por una venta registrada).
7. **Sin cambios**: `low-stock.ts`, las tarjetas del catálogo/POS, el
   modal de inventario del POS — todos siguen leyendo
   `product_variants.stock` sin saber que ahora es calculado. El stock de
   productos SIN variantes (`products.stock`) no cambia en absoluto.

**Fuera de alcance**: reservar una foto mientras un pedido Wompi está
pendiente de pago (hueco preexistente, ver Contexto); liberar
automáticamente una foto al cancelar un pedido/venta (tampoco existe hoy
para el stock numérico); permitir más de una unidad física por foto
(confirmado que no aplica: 1 foto = 1 unidad, siempre); un modelo paralelo
de "stock genérico sin foto" para variantes sin fotos — si una variante no
tiene ninguna foto, su stock calculado es simplemente 0 hasta que se le
suba al menos una.

## Arquitectura

### Migración `048_disponibilidad_por_estampado.sql`

```sql
alter table public.product_images
  add column vendida boolean not null default false;

create or replace function public.recalcular_stock_variante()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- NEW/OLD no estan asignados fuera de su operacion (referenciar
  -- new.* en un DELETE, u old.* en un INSERT, lanza error en plpgsql) —
  -- por eso cada bloque se guarda primero con TG_OP.
  -- Recalcula la variante nueva (insert/update) y, si un update reasigna
  -- variant_id a otra variante, tambien la variante vieja que perdio la
  -- foto — sin esto, mover una foto de variante dejaria el stock de la
  -- variante de origen desactualizado hasta el proximo cambio ahi.
  if TG_OP in ('INSERT', 'UPDATE') and new.variant_id is not null then
    update public.product_variants
    set stock = (
      select count(*) from public.product_images
      where variant_id = new.variant_id and vendida = false
    )
    where id = new.variant_id;
  end if;

  if TG_OP in ('DELETE', 'UPDATE') and old.variant_id is not null
     and (TG_OP = 'DELETE' or old.variant_id is distinct from new.variant_id) then
    update public.product_variants
    set stock = (
      select count(*) from public.product_images
      where variant_id = old.variant_id and vendida = false
    )
    where id = old.variant_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_stock_variante on public.product_images;
create trigger trg_recalcular_stock_variante
after insert or update of vendida, variant_id or delete on public.product_images
for each row execute function public.recalcular_stock_variante();

-- Backfill: marca como vendidas las fotos que sobrepasan el stock actual
-- de cada variante (hoy, solo afecta las 2 filas ya identificadas).
with fotos_ordenadas as (
  select
    pi.id,
    pv.stock,
    row_number() over (partition by pi.variant_id order by pi.sort_order, pi.id) as posicion
  from public.product_images pi
  join public.product_variants pv on pv.id = pi.variant_id
)
update public.product_images
set vendida = true
where id in (select id from fotos_ordenadas where posicion > stock);

-- Recalculo final de cierre: garantiza que product_variants.stock quede
-- exactamente igual al conteo de fotos no vendidas para toda variante
-- con fotos propias.
update public.product_variants pv
set stock = (
  select count(*) from public.product_images pi
  where pi.variant_id = pv.id and pi.vendida = false
)
where exists (select 1 from public.product_images pi where pi.variant_id = pv.id);
```

Ninguna política RLS nueva: `vendida` es una columna más de
`product_images`, ya cubierta por las políticas existentes (lectura
pública si el producto está activo, escritura solo `admin`/`superadmin`).
El trigger corre con `security definer` porque las políticas de
`product_variants` no permiten `update` a clientes/staff comunes, y
las funciones de venta (`create_order`, `create_pos_sale`, etc.) ya son
`security definer` — el trigger hereda ese mismo nivel de confianza.

### RPCs de venta

Patrón común en los 5 puntos que hoy tocan `product_variants.stock` por
`qty`: cuando la línea trae `image_id`, la operación pasa de
`update product_variants set stock = stock ± qty` a
`update product_images set vendida = <true|false> where id = image_id
and vendida = <false|true>` (con chequeo de filas afectadas para
detectar doble-venta, ver siguiente subsección). Cuando `image_id` es
`null` (producto sin variantes, o variante con 0-1 foto), el
comportamiento no cambia: se sigue restando/sumando el número
directamente.

**`create_order`**: el loop "Descontar stock" pasa de
`update product_variants set stock = stock - v_item.qty` a, cuando
`ci.image_id is not null`:

```sql
update public.product_images
set vendida = true
where id = ci.image_id and vendida = false;

if not found then
  raise exception 'Uno de los estampados elegidos ya no está disponible. Actualiza tu carrito e intenta de nuevo.';
end if;
```

El loop de verificación previo ("Verificar stock disponible") ya no
necesita bloquear `product_variants`/`products` por fila para líneas con
`image_id` — el `for update` se reemplaza por
`select vendida from product_images where id = ci.image_id for update`,
y la condición de fallo es `vendida = true` en vez de
`stock < qty`.

**`confirm_order_payment_wompi`**: mismo cambio en su loop de descuento,
usando `order_items.image_id`. Este es el punto real donde una venta
Wompi "se hace efectiva" (ver Contexto) — el `greatest(stock - qty, 0)`
actual para líneas sin imagen se mantiene igual.

**`update_order_items`** y **`update_pos_sale`**: ambos siguen el patrón
"restaurar todo lo actual, verificar lo nuevo, descontar lo nuevo,
borrar e insertar". Para líneas con `image_id`:
- Restaurar (loop inicial): `update product_images set vendida = false
  where id = <image_id de la línea actual>` (sin condición — restaurar
  siempre debe poder ejecutarse).
- Verificar + descontar (loops siguientes): mismo patrón de
  `update ... where id = image_id and vendida = false` +ausencia de
  filas = error, que en `create_order`.

**`create_pos_sale`**: mismo patrón que `create_order` en su loop de
descuento, usando el `imageId` de cada elemento de `p_items`.

### Formulario de producto (`producto-form.tsx`)

- Se quita el bloque `<label>Stock</label><Input type="number"
  {...register('variantes.${index}.stock')} />` (línea ~389-397). En su
  lugar, un texto de solo lectura: `{imagenesDeVariante.length > 0 ?
  `${imagenesDeVariante.filter(img => !img.vendida).length} disponibles`
  : "Sin fotos"}`.
- `variantes[].stock` se quita de `productoSchema`
  (`src/lib/validation/producto.ts`) y de los payloads que
  `createProducto`/`updateProducto` (`admin/productos/actions.ts`)
  insertan/actualizan para cada variante — la columna queda con su
  default (`0`) hasta que se le suban fotos, que es el valor correcto
  para una variante nueva sin fotos todavía.
- Cada foto de variante (bloque `imagenesDeVariante.map`, línea ~421)
  gana, junto a "Marcar principal"/"Eliminar", un tercer botón
  "Marcar vendida" (o "Marcar disponible" si `image.vendida` ya es
  `true`) que llama a una nueva server action
  `toggleImagenVendida(imageId: string, vendida: boolean)` — `update`
  directo de `product_images.vendida` (el trigger recalcula el stock
  solo), luego refresca la lista local igual que `handleSetPrimary`.
  `ProductImage` (tipo local del formulario) gana el campo `vendida:
  boolean`, y el `select` de imágenes existentes que arma la página que
  renderiza `ProductoForm` (`admin/productos/[id]/editar/page.tsx` y la
  ruta de creación) agrega `vendida` a sus columnas.

### Selector de estampado — exclusión de fotos vendidas

En los 3 lugares que arman `EstampadoOption[]` para
`EstampadoPickerModal`, se agrega `.filter((img) => !img.vendida)` (o el
equivalente en el `select` de Supabase, `.eq("vendida", false)`) antes de
mapear al tipo `EstampadoOption`:

- Tienda: donde `product-detail-interactive.tsx`/
  `product-variant-selector.tsx` resuelven `imagenesDeVariante` para la
  variante elegida.
- POS: `buscarProductosPos` (`product-browser-action.ts`), que ya agrupa
  `product_images` por `variant_id` — su `select` agrega `vendida` y el
  agrupamiento descarta las marcadas `vendida = true`.
- Carrito ("Cambiar estampado"): `carrito/page.tsx`, donde se arma
  `estampadosDisponibles` por variante — mismo filtro. La foto que la
  línea ya tiene elegida se mantiene visible aunque esté vendida (para
  que el usuario vea cuál tiene actualmente), pero las demás opciones se
  filtran igual.

## Testing

- Unitarios (Postgres, vía `execute_sql` en un entorno de prueba o script
  dedicado): el trigger `recalcular_stock_variante` — insertar una foto
  nueva sube el stock en 1; marcar `vendida = true` lo baja en 1; borrar
  una foto no vendida lo baja en 1; borrar una foto ya vendida no cambia
  el stock.
- Unitarios TS: los 3 puntos que arman `EstampadoOption[]` filtran fotos
  con `vendida = true` — mismo patrón de mocks ya usado para
  `buscarProductosPos` (`product-browser-action.test.ts`).
- Unitarios TS: `toggleImagenVendida` (nueva server action) — patrón de
  mock ya usado en `actions.test.ts` para `eliminarProducto`.
- Verificación manual en navegador:
  1. Variante con 3 fotos: completar una venta (tienda, pago manual)
     eligiendo 1 de las 3 → esa foto deja de aparecer en el selector de
     estampado para esa variante, en tienda y en POS; el stock mostrado
     baja de 3 a 2.
  2. Repetir en el POS (`create_pos_sale`).
  3. Editar esa venta/pedido y quitar la línea → la foto vuelve a
     aparecer como opción; el stock vuelve a 3.
  4. Dos pestañas intentando comprar el mismo estampado (única foto de
     una variante) casi al mismo tiempo → solo una debe completar la
     venta; la otra debe recibir el mensaje de "ya no está disponible".
  5. En el formulario de producto: quitar el campo de stock, ver el
     conteo calculado, usar "Marcar vendida" manualmente en una foto sin
     pasar por una venta → confirmar que desaparece del selector y que el
     stock calculado baja.
  6. Confirmar que las 2 variantes con la anomalía original (Camiseta
     tela Fría S/Negra, S/Blanco) quedan con stock 0 y su foto marcada
     vendida tras aplicar la migración.
- `pnpm build && pnpm lint && pnpm test` en verde.

## UI

Sin componentes nuevos de UI compleja — el formulario de producto gana un
botón de texto más por foto (mismo estilo que "Marcar principal"/
"Eliminar" ya existentes, `text-brand-rosa hover:underline` /
`text-red-600 hover:underline`). El selector de estampado
(`EstampadoPickerModal`) no cambia visualmente: solo recibe una lista más
corta cuando hay fotos vendidas.
