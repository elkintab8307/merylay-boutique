# Favoritos (lista de deseos)

## Objetivo

Permitir que cualquier visitante de la tienda marque productos como
favoritos y los vuelva a ver después, sin importar si tiene cuenta o no.
Es una función nueva de datos/lógica, independiente del refresco visual
de la Fase B — se implementa primero, como su propia fase.

## Contexto: patrón ya existente (carrito de invitado)

El carrito ya resuelve el mismo problema (invitado vs. registrado) y es
el precedente que sigue este diseño:

- **Invitado**: el carrito vive enteramente en `localStorage`
  (`src/lib/cart/local-cart.ts`, clave `merylay-cart`) — nunca toca
  Supabase. `carts.session_id` existe en el esquema pero no se usa en
  ningún flujo real; el patrón de invitado implementado es 100% cliente.
- **Registrado**: el carrito vive en las tablas `carts`/`cart_items`,
  con RLS por `user_id = auth.uid()`.
- **Fusión al iniciar sesión**: `login-form.tsx` lee el carrito local
  tras un login exitoso, llama a `mergeGuestCart` (server action) para
  subirlo a la tabla, y limpia el `localStorage`.
- **Bifurcación en el punto de acción**: `ProductVariantSelector` decide
  en el cliente, según si `currentUserId` existe, si escribe directo a
  `localStorage` o llama a un server action con `useTransition`.

Favoritos replica este mismo patrón completo, con una tabla nueva en
vez de reutilizar `carts`.

## Alcance

1. Botón de corazón (`FavoriteButton`) para marcar/desmarcar un
   producto como favorito — sin variante, un favorito por producto.
2. Persistencia: `localStorage` para invitados, tabla `favorites` en
   Supabase para usuarios con sesión.
3. Fusión de favoritos de invitado a la cuenta al iniciar sesión.
4. El corazón aparece en: `ProductCard` (home, categorías) y en la
   página de detalle de producto.
5. Página nueva `/favoritos` con la lista completa, opción de quitar y
   de agregar al carrito desde ahí — misma estructura invitado/registrado
   que `/carrito`.
6. Link "Favoritos" en el header de la tienda, junto a "Carrito".

Fuera de alcance: variante específica (talla/color) por favorito;
notificaciones de reabastecimiento o cambio de precio; vista de
favoritos para el panel admin; rediseño visual de páginas existentes
(home, categoría, detalle) — eso es Fase B. El estilo visual del
`FavoriteButton` y de `/favoritos` usa los componentes/tokens de marca
ya existentes (`Button`, colores `brand-*`, sombras `shadow-brand-*` de
la Fase A), sin adelantar el rediseño de Fase B.

## Arquitectura

### Modelo de datos

Migración nueva `supabase/migrations/021_favoritos.sql`:

```sql
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index favorites_user_id_idx on public.favorites(user_id);

alter table public.favorites enable row level security;

create policy "favorites_owner_only"
  on public.favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

Sin bypass de `is_admin()`: es una lista personal, el panel admin no
necesita gestionarla. Un producto solo puede estar una vez por usuario
(`unique(user_id, product_id)`).

### Invitados: `local-favorites.ts`

`src/lib/favorites/local-favorites.ts` — funciones puras, mismo estilo
que `local-cart.ts`:

```ts
export type LocalFavoriteItem = {
  productId: string;
  slug: string;
  name: string;
  price: number;
  imageUrl: string | null;
};
```

Funciones: `getLocalFavorites()`, `saveLocalFavorites(items)`,
`toggleLocalFavorite(items, item)` (agrega si no existe, quita si ya
existe — devuelve el array actualizado), `isFavorite(items, productId)`.
Clave de almacenamiento: `merylay-favoritos`.

### Registrados: server actions

`src/app/(store)/favoritos/actions.ts`:

```ts
export async function addFavorite(productId: string): Promise<{ error?: string }>
export async function removeFavorite(productId: string): Promise<{ error?: string }>
```

Ambas requieren sesión (igual que `addToCart`), insertan/eliminan en
`favorites` filtrando por `user_id = auth.uid()` (RLS ya lo garantiza,
pero el filtro explícito documenta la intención), y hacen
`revalidatePath("/favoritos")`.

### Fusión al iniciar sesión

`src/lib/favorites/merge-guest-favorites-action.ts`, función
`mergeGuestFavorites(items: LocalFavoriteItem[])`: inserta cada
producto en `favorites` para el usuario autenticado, ignorando
duplicados (`upsert` con `onConflict: "user_id,product_id"` e
`ignoreDuplicates: true`, o un insert envuelto en captura de error de
restricción única). Se llama desde `login-form.tsx`, junto a
`mergeGuestCart`, leyendo `getLocalFavorites()` y limpiando el
`localStorage` de favoritos tras la fusión exitosa.

### `FavoriteButton`

`src/components/store/favorite-button.tsx` (client component):

```ts
{
  productId: string;
  currentUserId: string | null;
  initialFavorite: boolean;
  product: { slug: string; name: string; price: number; imageUrl: string | null };
}
```

Ícono `Heart` de `lucide-react` (relleno cuando es favorito, contorno
cuando no). Mismo patrón de bifurcación que `ProductVariantSelector`:

- Con sesión: `useTransition` + `addFavorite`/`removeFavorite`,
  actualización optimista del ícono.
- Sin sesión: lee/escribe `localStorage` directamente vía
  `toggleLocalFavorite`.

Para invitados, el estado inicial que llega del servidor siempre es
"no favorito" (el servidor no puede leer `localStorage`). El componente
corrige esto en un `useEffect` al montar — si `currentUserId` es `null`,
llama a `isFavorite(getLocalFavorites(), productId)` y ajusta el estado
— mismo patrón de hidratación en dos pasos que ya usa `GuestCart`
(`loaded` state) para evitar mismatch servidor/cliente.

### Puntos de integración

- **`ProductCard`** (`src/components/store/product-card.tsx`): gana
  `id: string` a `ProductCardData` (falta hoy — la tarjeta solo maneja
  `slug`, no el id del producto), y dos props nuevas al componente:
  `currentUserId: string | null`, `initialFavorite: boolean`. Renderiza
  `<FavoriteButton>` posicionado en la esquina superior de la imagen.
- **Home** (`src/app/(store)/page.tsx`) y **categoría**
  (`src/app/(store)/categoria/[slug]/page.tsx`): agregan `id` a la
  proyección de `ProductCardData`. Si hay usuario autenticado, una
  consulta extra (`select product_id from favorites where user_id = X`)
  arma un `Set<string>` que decide `initialFavorite` por tarjeta. Para
  invitados, `initialFavorite` siempre `false` desde el servidor (se
  autocorrige en el cliente, como se explicó arriba).
- **Detalle de producto** (`producto/[slug]/page.tsx`): ya obtiene
  `user` para `ProductVariantSelector`; se agrega una consulta a
  `favorites` (solo si hay usuario) para el `initialFavorite` de ese
  producto, y se renderiza `FavoriteButton` junto al precio.
- **Página `/favoritos`** (`src/app/(store)/favoritos/`): mismo patrón
  de `carrito/page.tsx` — Server Component que bifurca por sesión.
  - Con sesión: consulta `favorites` + `products` + imagen principal,
    renderiza `AuthenticatedFavorites` (lista con nombre, precio,
    imagen, botón "Quitar" y botón "Agregar al carrito" reutilizando
    la lógica de `addToCart`).
  - Sin sesión: renderiza `GuestFavorites` (client component), lee
    `localStorage`, mismas acciones equivalentes en local.
- **Header** (`src/components/layout/site-header.tsx`): agrega
  `<Link href="/favoritos">Favoritos</Link>` junto al link "Carrito"
  existente, visible para todos.

### Tipos de Supabase

Tras aplicar la migración (vía MCP de Supabase), regenerar
`database.types.ts` para incluir la tabla `favorites`.

## Testing

- `src/lib/favorites/__tests__/local-favorites.test.ts`: mismo enfoque
  que `local-cart.test.ts` — casos para agregar, quitar, verificar
  pertenencia, no duplicar. Es la lógica pura y crítica de esta fase
  (CLAUDE.md §13 pide TDD en este tipo de lógica).
- Verificación general: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual (documentada, no bloqueante si no hay navegador
  disponible en la sesión): marcar/desmarcar favorito como invitado y
  como registrado, confirmar que sobrevive un refresh, confirmar que
  al iniciar sesión los favoritos de invitado aparecen en `/favoritos`.

## UI

Se usan los componentes y tokens de marca ya existentes (`Button`,
paleta `brand-*`, sombras `shadow-brand-*` de la Fase A) — sin rediseño
de página. La referencia visual de vidamia.co que se compartió (banners
promocionales, sección de reseñas, tarjetas de producto con badges de
descuento, "compra por categoría") se guarda como insumo para la
**Fase B**, que sí rediseña el contenido visual de la tienda pública
manteniendo la paleta e identidad de MeryLay.
