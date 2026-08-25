# Selección de estampado por unidad

## Objetivo

El dueño del negocio simplificó su catálogo: una variante (talla/color) ya
no representa una sola prenda, sino un grupo de prendas idénticas en corte
y color pero con **estampados distintos**, subidas como varias imágenes de
esa misma variante. Cuando un cliente (tienda) o un vendedor (POS) elige
una talla y color con más de una imagen propia, debe poder marcar
exactamente cuáles estampados quiere — pudiendo pedir varias unidades de
la misma talla/color con estampados diferentes en una sola compra — y esa
elección debe quedar registrada en el pedido/venta para que el negocio
sepa cuál enviar.

## Contexto

- `product_images` ya tiene `variant_id` (fase "Imágenes por variante",
  2026-08-17): una imagen general (`variant_id null`) o de una variante
  específica. Con el nuevo flujo de catálogo, las imágenes de una variante
  SON sus estampados disponibles.
- El stock sigue siendo un solo número por variante
  (`product_variants.stock`), compartido entre todos sus estampados — no
  hay inventario por imagen individual. Fuera de alcance en esta fase.
- `cart_items`, `order_items` y `pos_sale_items` hoy solo referencian
  `product_id`/`variant_id`, sin ninguna noción de imagen elegida.
- `LocalCartItem` (`src/lib/cart/local-cart.ts`) es el tipo compartido
  entre el carrito de invitado (tienda) y el carrito en curso del POS
  (`venta-items-editor.tsx`). Identifica cada línea por
  `(productId, variantId)`.
- Cinco RPCs construyen o reconstruyen líneas de pedido/venta a partir de
  `cart_items` o de un jsonb de items: `create_order`,
  `create_order_wompi`, `update_order_items` (010/013/028), y
  `create_pos_sale`, `update_pos_sale` (011, con el ajuste de
  "cliente obligatorio" de 045).
- Puntos de entrada donde hoy se agrega algo al carrito: tienda
  (`ProductVariantSelector.handleAddToCart`) y POS
  (`ProductCardPos.confirmarAgregar`). Ambos ya resuelven la variante
  elegida antes de construir el `LocalCartItem`.
- Puntos de visualización de líneas ya compradas: `/admin/pedidos/[id]`,
  `/cuenta/pedidos/[id]`, recibo/detalle de venta POS
  (`/pos/venta/[id]`) — los tres seleccionan hoy `name_snapshot, qty,
  unit_price, line_total` sin ninguna referencia a imagen.

## Alcance

1. **Migración**: columna `image_id uuid null references
   product_images(id) on delete set null` en `cart_items`, `order_items`
   y `pos_sale_items`. `null` = sin estampado específico (producto sin
   variantes, o variante con 0-1 imagen propia).
2. **Modal de estampados** (componente compartido tienda + POS): checkbox
   por cada imagen propia de la variante elegida (`variant_id` de esa
   imagen = id de la variante seleccionada — nunca imágenes generales ni
   de otra variante). Al confirmar, una línea de carrito por cada imagen
   marcada, cantidad 1 cada una. Se abre solo si esa variante tiene **más
   de una** imagen propia; con 0 o 1, se agrega directo (comportamiento
   actual, sin cambio visible).
3. **Identidad de línea**: `LocalCartItem` gana `imageId: string | null`.
   La igualdad de línea (merge, actualizar cantidad, quitar, y el
   `existingQuery` de `addToCart`) pasa a comparar
   `(productId, variantId, imageId)`.
4. **Control de stock agregado por variante**: el stock disponible de una
   variante (`product_variants.stock`) se compara contra la suma de
   cantidades de TODAS las líneas del carrito que compartan esa
   `variantId` (no solo la línea que se está tocando) — tanto al agregar
   desde el modal como al subir cantidad de una línea ya en el carrito.
5. **Cambiar estampado ya en el carrito**: cada línea de una variante con
   más de una imagen muestra un botón "Cambiar estampado" que reabre el
   modal en modo selección única, preseleccionando la imagen actual de
   esa línea, y actualiza solo esa línea (no crea una línea nueva).
6. **Persistencia end-to-end**: los cinco RPCs de la sección Contexto
   arrastran `image_id` desde `cart_items`/el jsonb de entrada hasta
   `order_items`/`pos_sale_items`.
7. **Visualización**: miniatura del estampado elegido junto a cada línea
   en `/admin/pedidos/[id]`, `/cuenta/pedidos/[id]` y el recibo/detalle de
   venta POS (`/pos/venta/[id]`). Si `image_id` es `null` (línea sin
   estampado específico), no se muestra miniatura — sin cambio visual
   para esas líneas.

**Fuera de alcance**: stock independiente por estampado (sigue siendo por
variante, como hoy); selector de estampado nuevo dentro del editor de
pedidos/ventas existente (`/pos/venta/[id]/editar`,
`/admin/pedidos/[id]/editar`) — esas pantallas no ganan la posibilidad de
*elegir* un estampado distinto; imagen "principal" por estampado (sigue
existiendo solo `is_primary` a nivel de producto, sin cambios).

**Sí en alcance, aunque no es una funcionalidad nueva visible**:
preservar el `image_id` ya elegido al pasar por esos dos editores. Ambos
reconstruyen TODAS las líneas en cada guardado (`update_order_items`/
`update_pos_sale` borran e reinsertan) reutilizando `VentaItemsEditor`
sobre `LocalCartItem[]` — sin este paso, editar la cantidad de una línea
borraría en silencio el estampado que el cliente ya había elegido para
ella. Los loaders de esas dos pantallas
(`pos/venta/[id]/editar/page.tsx`, `admin/pedidos/[id]/editar/page.tsx`)
agregan `image_id` a su select de `pos_sale_items`/`order_items` y lo
mapean sin cambios al `imageId` de cada `LocalCartItem` inicial; al
guardar, ese valor viaja de vuelta intacto porque ya forma parte del tipo
`LocalCartItem` que arman los items enviados a
`update_pos_sale`/`update_order_items`. No se agrega ningún control
nuevo en la UI de estas dos pantallas para cambiarlo.

## Arquitectura

### Migración

```sql
alter table public.cart_items
  add column image_id uuid references public.product_images(id) on delete set null;
alter table public.order_items
  add column image_id uuid references public.product_images(id) on delete set null;
alter table public.pos_sale_items
  add column image_id uuid references public.product_images(id) on delete set null;

create index idx_cart_items_image_id on public.cart_items(image_id);
create index idx_order_items_image_id on public.order_items(image_id);
create index idx_pos_sale_items_image_id on public.pos_sale_items(image_id);
```

Ninguna política RLS cambia: `image_id` es una columna más dentro de
tablas que ya están cubiertas por las políticas existentes (dueño del
carrito/pedido, o `staff`/`admin`/`superadmin` para POS).

### Componente `EstampadoPickerModal` (nuevo, compartido)

`src/components/store/estampado-picker-modal.tsx` (o ubicación equivalente
accesible desde `src/app/(store)/producto/[slug]/` y `src/app/pos/`).

```ts
type EstampadoOption = { imageId: string; url: string; alt: string | null };

function EstampadoPickerModal({
  open,
  images,               // EstampadoOption[] — imagenes de la variante elegida
  seleccionInicial,      // string[] — vacio en modo "agregar"; 1 elemento en modo "cambiar"
  modoUnico,              // boolean — true cuando se abre desde "Cambiar estampado"
  onConfirm,              // (imageIds: string[]) => void
  onClose,
}: { ... })
```

Usa el mismo primitivo `Sheet`/diálogo ya usado en el proyecto (Base UI,
como `components/ui/sheet.tsx`) en variante modal centrada. En modo
selección múltiple el botón de confirmar dice "Agregar N al carrito" (N =
imágenes marcadas, deshabilitado con N=0); en modo único, "Cambiar" con
una sola selección posible (radio, no checkbox).

### Punto de entrada — tienda (`ProductVariantSelector`)

`handleAddToCart` cambia:

1. Si `variantSeleccionada` tiene 0 o 1 imagen propia
   (`imagenesDeVariante.length <= 1`, dato ya disponible vía
   `getImagesForVariant`/las imágenes que ya recibe `product-detail-interactive.tsx`),
   agrega directo como hoy, con `imageId = imagenesDeVariante[0]?.id ?? null`.
2. Si tiene más de una, abre `EstampadoPickerModal` en modo múltiple. Al
   confirmar con N imágenes marcadas, construye N `LocalCartItem` (mismo
   `productId`/`variantId`/precio, `imageId` distinto cada uno) y los
   agrega en secuencia (logueado: N llamadas a `addToCart`; invitado: N
   `mergeCartItem` sobre el array antes de un solo `saveLocalCart`).

Requiere que `ProductVariantSelector` reciba las imágenes de cada
variante (ya las tiene disponible el padre `product-detail-interactive.tsx`
desde la fase de imágenes por variante — se pasan como prop nueva).

### Punto de entrada — POS (`ProductCardPos`)

`confirmarAgregar` sigue el mismo patrón: si la variante elegida
(`variantSeleccionada`) tiene más de una imagen propia, abre el modal en
vez de agregar directo. `buscarProductosPos`
(`product-browser-action.ts`) debe devolver además las imágenes por
variante (hoy solo trae `imageUrl` — la principal del producto): se
extiende la consulta a `product_images.select("product_id, variant_id,
url, is_primary")` y se agrupan por `variant_id` en el resultado
(`PosProductoResult.variants[].images: EstampadoOption[]`).

### `local-cart.ts`

```ts
export type LocalCartItem = {
  productId: string;
  variantId: string | null;
  imageId: string | null;   // nuevo
  slug: string;
  name: string;
  unitPrice: number;
  qty: number;
  imageUrl: string | null;  // pasa a ser la URL del estampado elegido si imageId no es null
  stock: number;
};
```

`sameItem` compara también `imageId`. El control de stock agregado
(sección Alcance #4) se implementa en una función pura nueva,
`stockUsadoPorVariante(items, variantId): number` (suma de `qty` de todas
las líneas con esa `variantId`), usada tanto en `mergeCartItem`/
`updateItemQty` (invitado) como en el server action `addToCart`/
`updateCartItemQty` (logueado, vía una consulta equivalente agregando
sobre `cart_items` antes de aceptar el cambio).

### `addToCart` (server action, tienda logueada)

Gana un parámetro `imageId: string | null`. El `existingQuery` que busca
una línea igual agrega `.eq("image_id", imageId)` (o `.is("image_id",
null)` cuando corresponde) antes de decidir si actualiza cantidad o
inserta una fila nueva.

### Carrito — mostrar y cambiar estampado

`carrito/page.tsx`: el select de `cart_items` agrega `image_id`; se
batch-consulta `product_images(id, url)` para esos ids y también **todas
las imágenes de cada `variant_id` presente** (para poder ofrecer
"Cambiar estampado"). `CartItemView` gana `imageUrl: string | null` y,
cuando la variante tiene más de una imagen, `estampadosDisponibles:
EstampadoOption[]`.

`AuthenticatedCart`/`CartItemControls`: miniatura junto al nombre
(`imageUrl`); si `estampadosDisponibles` tiene más de un elemento, botón
"Cambiar estampado" que abre `EstampadoPickerModal` en modo único
(preseleccionando `imageId` actual) y llama a una nueva server action
`updateCartItemImage(cartItemId, imageId)` (`update` directo sobre esa
fila de `cart_items`), luego `router.refresh()`.

`GuestCart`: mismo tratamiento pero client-side puro — el modal actualiza
el `imageId` de la línea correspondiente en el array de `LocalCartItem` y
guarda con `saveLocalCart`.

### RPCs

**`create_order` / `create_order_wompi`**: el `insert into order_items
(...)  select ...` agrega `ci.image_id` a la lista de columnas/valores
seleccionados desde `cart_items`.

**`update_order_items`**: cada elemento de `p_items` (jsonb) acepta
`imageId` opcional; el `insert into order_items` final lo incluye
(`nullif(v_item->>'imageId', '')::uuid`).

**`create_pos_sale`**: mismo tratamiento — cada elemento de `p_items`
acepta `imageId` opcional, el `insert into pos_sale_items` lo incluye.

**`update_pos_sale`**: mismo tratamiento que `update_order_items`.

Ninguna de las cuatro cambia su firma (siguen recibiendo jsonb) — el
cambio es interno al shape esperado dentro del jsonb y a las columnas del
insert. Los llamadores TypeScript (`sale-action.ts`, `checkout/actions.ts`,
`wompi-actions.ts`, `venta/[id]/editar/actions.ts`,
`admin/pedidos/[id]/editar/actions.ts`) agregan `imageId: item.imageId ??
null` al construir cada elemento del array que ya arman hoy.

### Visualización en detalle/recibo

`/admin/pedidos/[id]`, `/cuenta/pedidos/[id]`, `/pos/venta/[id]`: el
select de `order_items`/`pos_sale_items` agrega `image_id`; se
batch-consulta `product_images(id, url)` para los ids no nulos presentes,
y se renderiza una miniatura pequeña (mismo tamaño/estilo que las
miniaturas ya usadas en `pos/clientes/[id]/historial-compras.tsx`) junto
a cada línea que tenga `image_id`. Líneas sin estampado (`image_id null`)
se ven exactamente igual que hoy.

## Testing

- Unitarios: `sameItem`/`mergeCartItem`/`updateItemQty`/`removeItem` en
  `local-cart.ts` con `imageId` distinto — confirmar que dos líneas de la
  misma variante con `imageId` diferente NO se combinan, y que con el
  mismo `imageId` sí. Nueva función `stockUsadoPorVariante` con casos de
  varias líneas de la misma variante.
- Unitarios: el punto donde `addToCart` arma el `existingQuery`/decide
  update-vs-insert, siguiendo el mismo patrón de mocks ya usado en
  `sale-action.test.ts`/`customer-actions.test.ts` (mock de
  `createClient`, se verifica que el filtro incluye `image_id`).
- Verificación manual en navegador (ambos flujos, tienda y POS):
  1. Producto con una variante de 3 imágenes propias: elegir talla/color,
     clic en agregar, marcar 2 de las 3 en el modal → 2 líneas separadas
     en el carrito, cada una con su miniatura.
  2. Aumentar cantidad de una de esas líneas hasta el límite de stock de
     la variante (compartido con la otra línea) → confirmar que el tope
     respeta la suma de ambas líneas, no solo la que se está subiendo.
  3. "Cambiar estampado" en una línea del carrito → confirmar que
     reemplaza esa línea sin crear una nueva ni tocar las demás.
  4. Completar checkout (pago manual) y confirmar que
     `/cuenta/pedidos/[id]` y `/admin/pedidos/[id]` muestran la miniatura
     correcta por línea.
  5. Repetir 1-3 en el POS (`ProductCardPos` + `venta-items-editor`),
     completar la venta y confirmar la miniatura en `/pos/venta/[id]`.
  6. Producto/variante con 0 o 1 imagen propia: confirmar que el
     comportamiento de agregar al carrito no cambia (sin modal).
- `pnpm build && pnpm lint && pnpm test` en verde.

## UI

Mismos tokens de marca. El modal reutiliza el primitivo `Sheet` (Base UI)
ya usado en el proyecto — sin librería nueva. Miniaturas con el mismo
tratamiento visual (`rounded-md border border-brand-rosa-claro
object-cover`) ya usado en las galerías y en el historial de compras del
POS.
