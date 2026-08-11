# CLAUDE.md — MeryLay Boutique · E-commerce

> Documento maestro para Claude Code. Describe qué construir, con qué stack,
> cómo trabajar y en qué orden. Léelo completo antes de empezar cada sesión.

---

## 0. Cómo debes trabajar (workflow obligatorio)

- **Plugin Superpowers**: úsalo para todo el ciclo. Empieza con `/superpowers:brainstorm`
  para afinar requisitos, luego `write-plan`, luego `execute-plan`. Aplica TDD
  (tests que fallan antes de implementar) y la revisión de código integrada.
  - Instalar (una sola vez): `/plugin marketplace add obra/superpowers` y
    `/plugin install superpowers@superpowers-marketplace`.
- **Skill de diseño (UX/UI)**: usa el skill de *frontend-design* para toda la
  interfaz. La tienda debe verse premium y femenina, NO como plantilla genérica
  de IA. Respeta la identidad de marca de la sección 3.
- **MCP de Supabase**: crea tablas, migraciones, RLS, buckets y tipos con el MCP,
  no a mano en el dashboard.
- **MCP de Vercel**: crea el proyecto, variables de entorno y despliegues con el MCP.
- **Commits atómicos**: haz `git commit` después de cada paso funcional, con
  mensajes claros en español. No acumules cambios grandes sin commitear.
- **Idioma**: todo el producto (UI, mensajes, correos) en **español**.
- **Nunca** subas secretos al repo. Todo lo sensible va en `.env.local` (gitignored).

---

## 1. Resumen del proyecto

MeryLay Boutique es una marca de moda femenina (pijamas y ropa) con el lema
**"Inspiración Femenina"**. Este proyecto es su tienda en línea, con dos grandes áreas:

1. **Frontend público (tienda)**: catálogo por categorías, detalle de producto,
   carrito de compras, registro/login de clientes y checkout.
2. **Backend / panel administrativo**: subir y organizar productos por categorías,
   gestionar inventario, y un **POS interno** para ventas presenciales.
3. **SuperAdmin**: acceso y control total (usuarios, productos, ventas, ajustes).

---

## 2. Stack técnico

- **Framework**: Next.js (App Router) + TypeScript.
- **UI**: Tailwind CSS + shadcn/ui. Íconos con lucide-react.
- **Backend**: Supabase (Postgres, Auth, Storage, RLS, Edge Functions si hacen falta).
- **Estado del carrito**: React Context + persistencia en Supabase (o localStorage
  para invitados, migrando al carrito del usuario al iniciar sesión).
- **Deploy**: Vercel.
- **Gestor de paquetes**: pnpm (preferido) o npm.
- **Validación**: zod. **Formularios**: react-hook-form.

---

## 3. Identidad de marca (aplícala en todo el UI)

### Paleta oficial (usa exactamente estos hex)
| Rol | Hex |
|-----|-----|
| Rosa fuerte — principal, botones/CTA, acentos | `#E96A9E` |
| Dorado — detalles premium, íconos, líneas | `#D9A441` |
| Rosa — secundario, degradados | `#F29DB8` |
| Rosa medio — fondos suaves, tarjetas | `#F5B7C8` |
| Rosa claro — fondos delicados, secciones | `#F8D4DD` |
| Crema — fondo base, espacios en blanco | `#FFF8F4` |
| Ciruela — texto sobre fondos claros (sugerido) | `#6E2A44` |

Define estos colores como variables CSS / tokens de Tailwind
(`brand.rosa`, `brand.oro`, `brand.crema`, etc.).

### Tipografía (Google Fonts)
- **Acento / logo**: `Great Vibes` (script) — solo para toques especiales.
- **Títulos**: `Playfair Display` (o `Cinzel` para encabezados en mayúsculas).
- **Cuerpo / UI**: `Montserrat` (legible en tamaños pequeños; ideal para web).

### Logo e isotipos
- Logo principal en `/public/brand/logo-principal.png`.
- Isotipos circulares (perfil, favicon): `/public/brand/isotipo-*.png`.
- El favicon debe salir del isotipo circular (variante ML dentro de círculo).
- Los archivos los subirá el dueño a `/public/brand/`.

### Tono visual
Elegante, femenino, romántico. Bordes suaves, mucho aire, detalles dorados finos,
fotografía de producto sobre fondos crema/rosa. Evita saturar de rosa: usa crema
como base y rosa/oro como acentos.

---

## 4. Roles y autenticación

Auth con **Supabase Auth** (email + contraseña). Los roles viven en la tabla
`profiles.role`:

- `superadmin` — control total. Único que gestiona usuarios y ajustes globales.
- `admin` — gestiona productos, categorías, inventario, pedidos y POS.
- `staff` — puede operar el POS y ver productos (sin borrar ni gestionar usuarios).
- `customer` — cliente de la tienda pública (registro abierto).

Reglas:
- El registro público crea siempre rol `customer`.
- Los roles `admin`/`staff` los asigna el `superadmin` desde el panel.
- Protege rutas con middleware: `/admin/**` requiere `admin`/`superadmin`;
  `/pos/**` requiere `staff`/`admin`/`superadmin`; `/superadmin/**` solo `superadmin`.

### SuperAdmin (credenciales)
- **Usuario**: `adminsu`
- **Email de login (Supabase Auth)**: `adminsu@merylayboutique.com`
  (Supabase Auth usa email; permite login por usuario mapeando `adminsu` → ese email.)
- **Contraseña**: se lee de `SUPERADMIN_PASSWORD` en `.env.local` (ver sección 9).
  **No la escribas en el código ni en el repo.** Cámbiala tras el primer login.

---

## 5. Arquitectura de carpetas

```
/app
  /(store)            # tienda pública
    /page.tsx         # home
    /categoria/[slug]
    /producto/[slug]
    /carrito
    /checkout
    /cuenta           # perfil, pedidos del cliente
  /(auth)
    /login /registro
  /admin              # panel admin (productos, categorías, inventario, pedidos)
  /pos                # punto de venta interno
  /superadmin         # gestión de usuarios y ajustes
  /api                # route handlers si se necesitan
/components           # UI reutilizable (usar frontend-design skill)
/lib
  /supabase           # clientes browser/server, helpers
  /auth               # helpers de rol, middleware
/supabase
  /migrations         # SQL versionado (creado vía MCP)
/public/brand         # logo e isotipos
```

---

## 6. Modelo de datos (Postgres + RLS)

Crea todo vía migraciones con el MCP de Supabase. Esquema mínimo:

- **profiles**: `id (uuid, = auth.users.id)`, `username (unique)`, `full_name`,
  `role (enum superadmin|admin|staff|customer, default customer)`, `phone`,
  `created_at`. Trigger que crea el profile al registrarse un usuario.
- **categories**: `id`, `name`, `slug (unique)`, `description`, `image_url`,
  `parent_id (nullable, self FK)`, `sort_order`, `is_active`, `created_at`.
- **products**: `id`, `name`, `slug (unique)`, `description`, `category_id (FK)`,
  `price (numeric)`, `compare_at_price (nullable)`, `sku (unique)`, `stock (int)`,
  `is_active`, `is_featured`, `created_at`, `updated_at`.
- **product_variants** (tallas/colores): `id`, `product_id (FK)`, `name` (ej. "Talla M / Rosa"),
  `sku (unique)`, `price_override (nullable)`, `stock (int)`.
- **product_images**: `id`, `product_id (FK)`, `url`, `alt`, `sort_order`, `is_primary`.
- **carts**: `id`, `user_id (nullable FK profiles)`, `session_id (nullable)`, `created_at`.
- **cart_items**: `id`, `cart_id (FK)`, `product_id (FK)`, `variant_id (nullable FK)`,
  `qty`, `unit_price`.
- **orders**: `id`, `order_number (unique)`, `user_id (FK)`, `status
  (enum: pendiente|pagado|enviado|entregado|cancelado)`, `subtotal`, `shipping`,
  `total`, `payment_method`, `shipping_address (jsonb)`, `created_at`.
- **order_items**: `id`, `order_id (FK)`, `product_id`, `variant_id`, `name_snapshot`,
  `qty`, `unit_price`, `line_total`.
- **pos_sales**: `id`, `sale_number (unique)`, `staff_id (FK profiles)`, `subtotal`,
  `discount`, `total`, `payment_method (enum: efectivo|tarjeta|transferencia|nequi|daviplata)`,
  `created_at`.
- **pos_sale_items**: `id`, `sale_id (FK)`, `product_id`, `variant_id`, `qty`,
  `unit_price`, `line_total`.
- **store_settings**: `id`, `key`, `value (jsonb)` — datos de la tienda (nombre,
  logo, envío, contacto, redes).

### Funciones de rol (security definer)
Crea `is_admin()` y `is_superadmin()` que consultan `profiles.role` del usuario
autenticado, para usarlas en las políticas RLS.

### RLS (activar en todas las tablas)
- **profiles**: cada quien lee/edita su fila; `superadmin` lee/edita todas.
- **categories / products / product_variants / product_images**: lectura pública
  solo si `is_active`; escritura solo `admin`/`superadmin`.
- **carts / cart_items**: solo el dueño (`user_id = auth.uid()`), o por `session_id`
  para invitados.
- **orders / order_items**: el cliente ve solo los suyos; `admin`/`superadmin` ven todos.
- **pos_sales / pos_sale_items**: `staff`/`admin`/`superadmin`.
- **store_settings**: lectura pública; escritura solo `superadmin`.

### Storage (buckets)
- `product-images` (lectura pública), `category-images` (lectura pública),
  `brand` (lectura pública). Subida solo para `admin`/`superadmin`.

---

## 7. Funcionalidades por área

### 7.1 Tienda pública (frontend)
- Home con destacados (`is_featured`), banner de marca y categorías.
- Listado por categoría con filtros (precio, talla/color) y orden.
- Detalle de producto: galería de imágenes, variantes (talla/color), stock,
  botón "Agregar al carrito".
- Carrito: editar cantidades, quitar ítems, subtotal.
- Checkout: datos de envío, método de pago, crear `order`. MVP con pago
  **manual** (transferencia / contra entrega). Deja preparada la integración
  futura con **Wompi** o **Mercado Pago** (populares en Colombia).
- Registro/login de clientes; página "Mi cuenta" con historial de pedidos.

### 7.2 Panel admin
- CRUD de **productos** (con variantes e imágenes; subida a Storage).
- CRUD de **categorías** (con jerarquía y orden).
- Gestión de **inventario** (stock por producto/variante).
- Gestión de **pedidos**: ver, cambiar estado.
- Dashboard con métricas básicas (ventas del día, pedidos pendientes, stock bajo).

### 7.3 POS interno (`/pos`)
- Buscar producto por nombre/SKU, agregarlo a una venta.
- Carrito de venta presencial con cantidades y descuento.
- Elegir método de pago (efectivo, tarjeta, transferencia, Nequi, Daviplata).
- Registrar la venta en `pos_sales` y **descontar stock** automáticamente.
- Generar comprobante/recibo imprimible (con logo e "Inspiración Femenina").

### 7.4 SuperAdmin (`/superadmin`)
- Gestión de **usuarios y roles** (asignar admin/staff, desactivar).
- Ajustes de la tienda (`store_settings`).
- Acceso total a todos los módulos anteriores.

---

## 8. Variables de entorno

`.env.local` (NUNCA se commitea; ya está en `.gitignore`):

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # solo en servidor; nunca en el cliente
SUPERADMIN_EMAIL=adminsu@merylayboutique.com
SUPERADMIN_USERNAME=adminsu
SUPERADMIN_PASSWORD=...              # pon aquí la contraseña; cámbiala tras el 1er login

# Wompi (Fase 11.2) — todas obligatorias para que el pago en línea funcione
WOMPI_PUBLIC_KEY=...                 # llave pública del comercio (va al widget)
WOMPI_PRIVATE_KEY=...                # llave privada; solo servidor
WOMPI_EVENTS_SECRET=...              # secreto de eventos: valida la firma del webhook
WOMPI_INTEGRITY_SECRET=...           # secreto de integridad: firma la referencia del pago

# Resend (Fase 11.3) — obligatoria para que salgan los correos transaccionales
RESEND_API_KEY=...                   # API key de Resend; SOLO servidor, nunca en el cliente

# Pixeles de seguimiento (Fase A del rediseno) — opcionales, solo tienda publica
NEXT_PUBLIC_META_PIXEL_ID=...         # ID del Pixel de Meta/Facebook Ads
NEXT_PUBLIC_TIKTOK_PIXEL_ID=...       # ID del Pixel de TikTok Ads
```

Si falta `WOMPI_INTEGRITY_SECRET`, `WOMPI_PUBLIC_KEY` o `WOMPI_EVENTS_SECRET`, el
código **falla cerrado** (rechaza el pago o el webhook y lo registra en consola);
nunca calcula firmas con un secreto vacío.

`RESEND_API_KEY` es **solo de servidor** y debe existir en Vercel tanto en
**Production como en Preview**. A diferencia de los secretos de Wompi, aquí el
diseño es deliberadamente *fail-open*: los correos son un efecto secundario que
nunca debe romper un flujo de negocio, así que si la variable falta,
`enviarCorreo` solo registra un `console.error` y sigue. Consecuencia práctica:
**si se olvida cargarla, la funcionalidad de correos no falla — simplemente no
envía nada, en silencio.** Verifícala en cada entorno tras el despliegue.

Los pixeles de seguimiento siguen el mismo criterio *fail-open* que
`RESEND_API_KEY`: si `NEXT_PUBLIC_META_PIXEL_ID` o
`NEXT_PUBLIC_TIKTOK_PIXEL_ID` faltan, ese pixel específico simplemente no
se carga — sin error, sin romper el sitio. Solo se cargan en la tienda
pública (grupos de rutas `(store)` y `(auth)`), nunca en `/admin`, `/pos`
ni `/superadmin`.

En Vercel, carga estas mismas variables con el MCP de Vercel (Production + Preview),
excepto que el `SERVICE_ROLE_KEY` solo debe existir en el entorno de servidor.

---

## 9. Seed del SuperAdmin (seguro)

Crea un script `scripts/seed-superadmin.ts` que:
1. Lea `SUPERADMIN_EMAIL`, `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD` del entorno.
2. Cree el usuario en Supabase Auth con el service role key (`auth.admin.createUser`),
   con email confirmado.
3. Inserte/actualice su fila en `profiles` con `role = 'superadmin'` y el username.
4. Sea **idempotente** (si ya existe, no falla).

**Seguridad**: la contraseña nunca se escribe en el código ni en el repo; solo se
lee del entorno. Muestra en consola un aviso recordando cambiarla tras el primer login.

Login por usuario: permite escribir `adminsu` en el formulario y, si no es un email,
resuélvelo a `SUPERADMIN_EMAIL` (o busca el email por `username` en `profiles`).

---

## 10. MCP (Supabase + Vercel)

- **Supabase MCP**: úsalo para listar tablas, crear migraciones, aplicar RLS,
  generar tipos TypeScript y crear buckets. Si no está conectado, pídele al dueño
  autenticarse ("Authenticate with Supabase MCP").
  - Añadirlo (referencia): `claude mcp add --transport http supabase <URL_DEL_SERVIDOR>`
    con las cabeceras/credenciales que indique Supabase.
- **Vercel MCP**: úsalo para crear el proyecto, enlazar el repo, cargar variables
  de entorno y disparar despliegues.
- Genera los tipos de Supabase (`database.types.ts`) y manténlos sincronizados
  tras cada cambio de esquema.

---

## 11. Despliegue en Vercel

1. Repo en GitHub; conéctalo a Vercel (vía MCP).
2. Framework preset: Next.js. Build por defecto.
3. Carga las variables de entorno (sección 8).
4. Primer deploy a producción; verifica que la tienda pública carga y que
   `/admin`, `/pos` y `/superadmin` quedan protegidos por rol.
5. Dominio: primero funciona el subdominio gratis (`*.vercel.app`). Luego se
   vincula el dominio propio (ver instrucciones aparte).

---

## 12. Roadmap por fases (haz commit al terminar cada una)

1. **Base**: crear proyecto Next.js + Tailwind + shadcn, tokens de marca, layout,
   fuentes, cliente Supabase, middleware de auth.
2. **Datos**: migraciones de todas las tablas + RLS + buckets + tipos (vía MCP).
3. **Auth y roles**: registro/login, `profiles`, helpers de rol, protección de rutas.
4. **Seed superadmin** (sección 9).
5. **Admin — catálogo**: CRUD de categorías y productos con imágenes/variantes.
6. **Tienda pública**: home, categorías, detalle de producto.
7. **Carrito y checkout**: carrito persistente + creación de pedidos (pago manual).
8. **POS interno**: venta presencial, descuento, métodos de pago, recibo, descuento de stock.
9. **SuperAdmin**: gestión de usuarios/roles y ajustes de tienda.
10. **Deploy en Vercel** + verificación de roles y dominio.
11. **Extras**: dashboard de métricas, integración de pago (Wompi/Mercado Pago),
    correos transaccionales.
12. **Informes**: todos los informes importantes del sistema — ventas (tienda +
    POS) por periodo, productos más vendidos, stock bajo, ingresos por
    método de pago, etc. — con el fin de dar visibilidad completa del
    negocio. El cálculo de ganancia es aproximado hasta la Fase 14 (Compras),
    ya que todavía no existe costo de producto registrado.
13. **Gastos**: módulo para registrar gastos generales del negocio (renta,
    servicios, nómina, insumos, etc.), categorizados y con fecha, para
    poder restar gastos de los ingresos en los informes de la Fase 12.
14. **Compras**: módulo de compras a proveedores (proveedor, fecha, cantidad,
    costo unitario) que registra el costo real de cada producto y actualiza
    el stock. Con esto, los informes de la Fase 12 pueden calcular la
    ganancia real: Ventas − Costo de productos vendidos − Gastos.

---

## 13. Estándares y seguridad

- TypeScript estricto; nada de `any` sin justificación.
- Server Components por defecto; Client Components solo cuando se necesite interacción.
- **RLS siempre activo**; nunca uses el `service_role` en el cliente.
- Valida toda entrada con zod (servidor y cliente).
- Precios en enteros de centavos o `numeric` — evita floats para dinero.
- Accesibilidad: contraste suficiente (ojo con texto sobre rosa claro; usa ciruela `#6E2A44`).
- Mensajes de error claros y en español.
- Tests con el enfoque TDD de Superpowers en la lógica crítica (carrito, stock, roles, POS).
