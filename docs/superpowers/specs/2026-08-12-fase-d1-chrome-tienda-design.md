# Rediseño — Fase D1: Header, menú lateral y pie de página

## Objetivo

Reemplazar el "chrome" global de la tienda pública (header, navegación,
sin pie de página hoy) por el patrón visto en tiendas de referencia
(capturas de Aura Glam y otras tiendas sobre la misma plantilla):
header minimalista de solo íconos, menú lateral con categorías y
redes sociales, y un pie de página nuevo con ubicación y horario. Es
la primera de tres sub-fases (D1 Chrome, D2 Home, D3 Buscador y
catálogo) de un nuevo ciclo de rediseño, aprobado por el usuario a
partir de 6 capturas de referencia.

## Contexto

- Referencia (6 capturas del usuario): header sticky con buscar/
  carrito/menú; menú lateral con logo circular + nombre, buscador,
  lista de categorías con conteo de productos, sección "Síguenos"
  (WhatsApp/Instagram/TikTok); pie de página con nombre de tienda,
  redes sociales, "Ubicación" (dirección) y "Horario" (tabla día por
  día con horas o "Cerrado").
- El proyecto no tiene pie de página hoy. `store_settings` ya tiene
  campos de redes sociales (`redesInstagram/Facebook/Tiktok/Whatsapp`,
  Fase B1) pero **nunca se renderizan en ningún lado público** — esta
  fase es su primer uso real.
- El logo (`/public/brand/logo-principal.png`) sigue siendo un archivo
  estático subido por el dueño, no editable desde el panel — decisión
  ya tomada, consistente con `CLAUDE.md` §3.
- No existe hoy una página que liste TODOS los productos activos
  (solo hay páginas por categoría) ni un buscador. El menú y el header
  de esta fase necesitan enlazar a algo real, así que D1 incluye una
  versión mínima de `/productos` (grid simple, sin orden/filtro) que
  la Fase D3 luego mejora con buscador real y toolbar de orden/filtro.
  El ícono de buscar de esta fase enlaza a `/productos` como
  comportamiento temporal — D3 lo reemplaza por búsqueda real.

## Alcance

1. **Header minimalista**: logo circular pequeño (enlaza a inicio) a
   la izquierda; buscar, carrito (con contador de unidades) y menú a
   la derecha. Sticky (se mantiene visible al hacer scroll).
2. **Carrito con contador**: mismo patrón de hidratación ya usado por
   `FavoriteButton` — invitados calculan el conteo desde `localStorage`
   al montar en el cliente; usuarios con sesión reciben el conteo ya
   calculado por el servidor.
3. **Menú lateral** (reemplaza el trigger actual "Categorías" del
   header): logo circular + nombre de la tienda arriba; sección
   "Categorías" (Todos los productos + cada categoría activa con su
   conteo de productos); sección "Mi cuenta" (iniciar sesión / mis
   pedidos + cerrar sesión según haya sesión, más el enlace a
   Favoritos — todo lo que hoy vive en la barra superior de texto se
   reubica aquí); sección "Síguenos" (WhatsApp/Instagram/TikTok/
   Facebook, cada uno solo si tiene URL configurada).
4. **Pie de página nuevo**: nombre de la tienda, redes sociales (mismo
   criterio de "solo si está configurado"), "Ubicación" (dirección) y
   "Horario" (tabla de 7 días, cada uno abierto con horas o cerrado) —
   ambos campos nuevos, editables desde Ajustes.
5. **`/productos` (versión mínima)**: todos los productos activos,
   mismo `ProductCard` ya usado en home/categoría, sin toolbar de
   orden/filtro todavía (lo agrega D3).

Fuera de alcance de esta sub-fase: rediseño de la home (hero con
insignia circular, categorías en íconos, barra de mensaje promocional
— Fase D2); buscador funcional y toolbar de orden/filtro en
`/productos` (Fase D3); logo editable desde el panel (fuera de alcance
permanente, ya decidido).

## Arquitectura

### Datos

`store_settings` gana dos keys nuevas, mismo patrón que las existentes:

- `direccion`: string simple.
- `horario`: jsonb, arreglo de 7 días —
  `{ dia: "lunes"|...|"domingo", abierto: boolean, desde: string, hasta: string }[]`.

Ambos de lectura pública, escritura solo superadmin (políticas ya
existentes de `store_settings`).

### Conteo de productos por categoría

El menú lateral necesita, por cada categoría activa, cuántos productos
activos tiene. Se resuelve con una sola consulta
(`products.select("category_id").eq("is_active", true)`) y se agrupa
en un `Map<categoryId, count>` en el propio Server Component — mismo
patrón ya usado para mapear imágenes/tallas por producto en home y
categoría, sin RPC ni N+1 consultas.

### Carrito — conteo con hidratación en dos pasos

`src/components/store/cart-badge.tsx` (client component): recibe
`initialCount: number` (ya resuelto por el servidor para usuarios con
sesión, o `0` para invitados) y `currentUserId: string | null`. Si es
invitado, en un `useEffect` al montar suma las cantidades de
`getLocalCart()` y corrige el número — mismo patrón de corrección de
hidratación en dos pasos que ya usa `FavoriteButton` para invitados.

### Componentes nuevos

- `src/components/layout/site-header.tsx` (reescrito): logo pequeño +
  tres botones de ícono (buscar → `/productos`, carrito con
  `CartBadge`, menú → abre `SiteMenuSheet`).
- `src/components/layout/site-menu-sheet.tsx` (nuevo, sobre el `Sheet`
  ya existente de shadcn/Base UI — mismo componente base que
  `MobileNavSheet`, pero con contenido propio y más rico; no se
  modifica `MobileNavSheet`, que sigue usándose tal cual en
  `admin-nav.tsx`/`superadmin-nav.tsx`).
- `src/components/layout/site-footer.tsx` (nuevo): se agrega a
  `PublicLayoutShell` (Fase B1), debajo de `children`, para que
  aparezca en toda la tienda pública (`(store)` y `(auth)`).
- `src/components/store/cart-badge.tsx` (nuevo).
- `src/app/(store)/productos/page.tsx` (nuevo, versión mínima).

### Admin

`AjustesForm` (Fase B1) gana dos campos nuevos: dirección (texto) y un
editor de horario (7 filas: día, checkbox "Abierto", hora desde/hasta
— deshabilitadas si no está marcado "Abierto").

## Testing

- Sin lógica de negocio pura nueva más allá del conteo de tallas ya
  probado indirectamente — el agrupamiento de conteo por categoría es
  simple y sigue el mismo patrón sin test dedicado ya usado en fases
  anteriores para agrupamientos similares.
- Verificación: `pnpm build && pnpm lint && pnpm test` en verde.
- Revisión manual: abrir el menú lateral y confirmar categorías/
  conteos/redes sociales, agregar algo al carrito como invitado y
  como usuario con sesión y confirmar que el contador del header
  cambia, revisar el pie de página con y sin horario/dirección
  configurados.

## UI

Mismos tokens de marca ya establecidos (`brand-rosa`, `brand-oro`,
`brand-crema`, `brand-ciruela`, `shadow-brand-*`). El pie de página usa
`brand-ciruela` como fondo oscuro con texto `brand-crema`, tomando la
paleta ya definida en `CLAUDE.md` §3, no colores nuevos.
