# SKU automático de productos y variantes — Diseño

## Objetivo

Eliminar la captura manual del SKU en el formulario de productos. El SKU se
genera solo, con un formato legible y predecible, tanto para el producto
como para cada una de sus variantes (talla/color).

## Alcance

1. Generación automática del SKU de producto al crearlo, con prefijo por
   categoría + secuencial.
2. Generación automática del SKU de cada variante, derivado del SKU del
   producto y su talla/color.
3. El campo SKU desaparece de `ProductoForm` (producto y variantes).
4. El SKU del producto se muestra de solo lectura al editar.
5. Validación nueva: no se permiten dos variantes con la misma combinación
   de talla+color en el mismo producto.

Fuera de alcance: reasignar/regenerar el SKU de un producto ya creado;
editar manualmente el SKU en algún caso especial (por ejemplo, para igualar
el código de un proveedor); códigos de barra o escaneo (el buscador del POS
ya hace `ilike` sobre `sku`, cualquier formato de texto funciona igual).

## Formato

- **Producto**: `PREFIJO-000001`. El prefijo son hasta 3 letras derivadas
  del nombre de la categoría (sin tildes, solo letras, mayúsculas — ej.
  "Pijamas" → `PIJ`, "Ropa Interior" → `ROP`). Si el producto no tiene
  categoría, o el nombre de la categoría no aporta ninguna letra utilizable,
  el prefijo es `GEN`. El número es un secuencial de 6 dígitos, con ceros a
  la izquierda, que **nunca decrece ni se reutiliza**.
- **Variante**: `<SKU del producto>-<TALLA>-<COLOR>` (las partes que
  existan; una variante puede tener solo talla, solo color, o ambas). Cada
  parte se normaliza igual que el `slug` del producto (sin tildes,
  mayúsculas, espacios → guiones). Ejemplo: producto `PIJ-000001`, variante
  talla M / color Rosa → `PIJ-000001-M-ROSA`; solo color "Azul Marino" →
  `PIJ-000001-AZUL-MARINO`.

## Por qué el contador es por prefijo, no global

Un contador único global (`GEN-000001`, `GEN-000002`, ...) mezclaría
categorías distintas en la misma secuencia y el número dejaría de
comunicar nada. Un contador por prefijo (`PIJ-000001`, `PIJ-000002`,
`BLU-000001`, ...) mantiene cada categoría con su propia numeración
consecutiva. Si dos categorías distintas comparten accidentalmente el
mismo prefijo de 3 letras (ej. "Vestidos" y "Vestidos de baño" → ambas
`VES`), sus productos comparten esa secuencia — es una coincidencia
aceptable (el SKU sigue siendo único), no un error; si el negocio lo nota
y le molesta, se soluciona renombrando una de las categorías, sin tocar
código.

## Inmutabilidad del SKU

El SKU del producto se calcula **una sola vez, al crear el producto**, y
`updateProducto` nunca vuelve a tocar esa columna — ni siquiera si la
categoría cambia después. Esto es intencional: un SKU no debe cambiar una
vez asignado (romper esa expectativa confundiría a cualquiera que ya lo
tenga anotado o impreso).

El SKU de una variante sí se recalcula cada vez que el producto se guarda,
porque `updateProducto` ya "borra y reinserta" todas las variantes en cada
edición (estrategia existente desde antes de este cambio). Como es una
función pura de `(sku del producto, talla, color)`, recalcularlo produce
el mismo valor si nada cambió, y el valor correcto si la talla/color de esa
variante sí cambiaron. Esto no rompe nada: en todo el sistema, las ventas
(`order_items`, `pos_sale_items`) y las compras (`purchase_items`)
referencian una variante por su `id` interno (uuid), nunca por su `sku` —
el SKU de variante es puramente informativo.

## Arquitectura

### Tabla nueva: contador por prefijo

```sql
create table public.sku_counters (
  prefix text primary key,
  siguiente int not null default 1
);
```

Sin políticas RLS propias (nadie la consulta directamente desde el
cliente; solo la toca la función `generar_sku_producto` vía
`security definer`, que ya valida `is_admin()` — mismo patrón que
`product_costs`, que tampoco tiene policies para roles no-admin).

### Función SQL: `generar_sku_producto`

`security definer`, con el mismo patrón de autorización que
`create_purchase`/`create_pos_sale` (`is_admin()` primero, `raise
exception 'No autorizado.'` si no lo es). Recibe el `category_id` (puede
ser `null`), resuelve el nombre de la categoría, deriva el prefijo, e
incrementa el contador de forma atómica con un `insert ... on conflict do
update ... returning`, el mismo patrón de "obtener siguiente valor" que
ya usa el UPSERT de `product_costs` para "el más reciente gana" — aquí
aplicado a un contador en vez de a un costo. El incremento queda protegido
por el bloqueo de fila implícito del `on conflict do update`, así que dos
llamadas concurrentes con el mismo prefijo nunca reciben el mismo número.

```sql
create function public.generar_sku_producto(p_category_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_categoria text;
  v_prefijo text;
  v_numero int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_category_id is not null then
    select name into v_nombre_categoria
    from public.categories
    where id = p_category_id;
  end if;

  v_prefijo := upper(left(
    regexp_replace(
      translate(
        coalesce(v_nombre_categoria, 'General'),
        'áéíóúÁÉÍÓÚñÑ',
        'aeiouAEIOUnN'
      ),
      '[^a-zA-Z]', '', 'g'
    ),
    3
  ));

  if v_prefijo = '' then
    v_prefijo := 'GEN';
  end if;

  insert into public.sku_counters (prefix, siguiente)
  values (v_prefijo, 1)
  on conflict (prefix) do update set siguiente = sku_counters.siguiente + 1
  returning siguiente into v_numero;

  return v_prefijo || '-' || lpad(v_numero::text, 6, '0');
end;
$$;

revoke execute on function public.generar_sku_producto(uuid) from public, anon;
grant execute on function public.generar_sku_producto(uuid) to authenticated;
```

`createProducto` llama esta función antes del `insert` en `products`, y
usa el valor devuelto como `sku`.

### Función pura: SKU de variante

`src/lib/sku.ts`, consumida por `createProducto` y `updateProducto` al
construir cada fila de `product_variants`:

```ts
function normalizarParteSku(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generarSkuVariante(
  skuProducto: string,
  talla: string | null,
  color: string | null,
): string {
  const partes = [talla, color]
    .filter((valor): valor is string => Boolean(valor))
    .map(normalizarParteSku)
    .filter(Boolean);
  return [skuProducto, ...partes].join("-");
}
```

### Cambios en `productoSchema`/`varianteSchema`

- `productoSchema` pierde el campo `sku` (ya no lo envía el cliente).
- `varianteSchema` pierde el campo `sku`.
- `productoSchema` gana un `.refine` a nivel de array `variantes`: rechaza
  si dos variantes tienen la misma combinación de talla+color (comparando
  en minúsculas y sin espacios extra), con mensaje "Ya existe una variante
  con esa talla y color."

### Cambios en `createProducto`/`updateProducto`

- `createProducto`: llama `generar_sku_producto` con `parsed.data.categoryId`
  antes del `insert` de `products`; usa el resultado como `sku`. Si la RPC
  falla, retorna error sin crear nada. Al construir las filas de
  `product_variants`, usa `generarSkuVariante(skuGenerado, variante.talla, variante.color)`.
- `updateProducto`: dejar de incluir `sku` en el `.update()` de `products`
  (columna intocada). Agregar `.select("sku").single()` a ese mismo
  `update` para recuperar el sku vigente (no cambia, pero hace falta su
  valor para derivar el sku de las variantes reinsertadas). Al reconstruir
  `product_variants`, usa `generarSkuVariante(skuDelProducto, variante.talla, variante.color)`
  igual que en creación.

### Cambios en el formulario y páginas

- `ProductoForm`: se elimina el campo "SKU" del bloque principal y el
  campo "SKU" de cada fila de variante. Se agrega, solo cuando
  `productoId` está definido (modo edición) y se recibe una nueva prop
  `skuActual: string`, una línea de texto de solo lectura mostrando el
  SKU vigente (sin input, sin `register`).
- `nuevo/page.tsx`: quita `sku: ""` de `defaultValues` y `sku: ""` del
  ítem inicial de `variantes`.
- `[id]/editar/page.tsx`: quita `sku: producto.sku` y `sku: v.sku` de
  `defaultValues`; pasa `skuActual={producto.sku}` a `ProductoForm`.

## Testing

- TDD sobre `generarSkuVariante` (con y sin talla, con y sin color, con
  tildes/espacios en el color, ambas partes presentes).
- TDD sobre el `.refine` de `productoSchema` (dos variantes con
  talla+color idénticos se rechazan; distintas combinaciones se aceptan).
- Los tests existentes de `producto.test.ts`/`varianteSchema` que hoy
  incluyen `sku` en sus fixtures se actualizan quitando ese campo (ya no
  existe en el schema).
- Verificación de integración contra Supabase real: `generar_sku_producto`
  con dos categorías distintas produce prefijos y secuencias
  independientes; dos llamadas seguidas con la misma categoría producen
  números consecutivos sin salto ni repetición; sin categoría produce
  `GEN-000001`; un usuario no-admin no puede invocar la función.

## UI

Sin cambios de layout más allá de quitar los dos inputs de SKU y agregar
una línea de texto informativo en modo edición, siguiendo el estilo ya
usado para textos auxiliares como el de "Costo de compra" (`text-xs
text-brand-ciruela/60`).
