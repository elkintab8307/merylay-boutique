# Diseño — Fase 1 (Base) y Fase 2 (Datos) — MeryLay Boutique

**Fecha**: 2026-08-04
**Estado**: Aprobado
**Alcance**: Roadmap del CLAUDE.md, fases 1 y 2 (secciones 5, 6, 12). Las fases 3 en
adelante (auth/roles completo, seed superadmin, catálogo admin, tienda pública,
carrito/checkout, POS, superadmin, deploy) quedan fuera de este spec.

## Contexto

El proyecto arranca vacío (solo `CLAUDE.md` en la raíz, sin git). Hay un proyecto
Supabase ya conectado vía MCP (`umnyolwszwvavwcxzyfy`, project URL
`https://umnyolwszwvavwcxzyfy.supabase.co`), vacío (sin tablas). Node v22 y `pnpm`
disponibles localmente.

## Decisiones de arranque (confirmadas con el usuario)

- **Git**: repo local únicamente por ahora (`git init` + commits por fase). El
  remoto en GitHub y el deploy se conectan más adelante (Fase 10).
- **Proyecto Supabase**: usar `umnyolwszwvavwcxzyfy` para todas las migraciones.
- **Username en registro de cliente**: se autogenera desde el email (parte antes
  de `@`, normalizada) en el trigger `handle_new_user`, con reintento por sufijo
  numérico si colisiona. El formulario de registro (Fase 3) no pide username.
- **Estructura de carpetas**: con `src/` (`src/app`, `src/components`, `src/lib`),
  desviación del árbol literal de la sección 5 del CLAUDE.md, que se adapta a esta
  convención. `/public` y `/supabase/migrations` quedan fuera de `src/`.
- **Middleware**: desde la Fase 1 ya protege por rol `/admin/**`, `/pos/**`,
  `/superadmin/**` (no solo refresco de sesión), posible porque `profiles` se crea
  en la misma sesión de trabajo (Fase 2).
- **Assets de marca**: favicon e isotipo placeholder (monograma "ML" en rosa/dorado
  sobre crema, SVG) y logo de header en texto (Great Vibes) hasta que el dueño suba
  los archivos reales a `/public/brand`.
- **Storage buckets**: públicos con lectura directa (no URLs firmadas).
- **Migraciones**: por bloque temático, no por tabla individual.
- **Testing**: Vitest + Testing Library.

## Fase 1 — Base del proyecto

- Scaffold `create-next-app` (TypeScript estricto, Tailwind, App Router, `src/`,
  ESLint), gestor `pnpm`.
- Tokens de marca (sección 3 del CLAUDE.md) como variables CSS y extendidos en
  `tailwind.config.ts`: `brand.rosa` (#E96A9E), `brand.oro` (#D9A441),
  `brand.rosaSecundario` (#F29DB8), `brand.rosaMedio` (#F5B7C8),
  `brand.rosaClaro` (#F8D4DD), `brand.crema` (#FFF8F4), `brand.ciruela` (#6E2A44).
- Tipografía vía `next/font/google`: Great Vibes (script/acento), Playfair Display
  (títulos), Montserrat (cuerpo/UI), expuestas como variables CSS y clases
  Tailwind (`font-script`, `font-heading`, `font-body`).
- shadcn/ui inicializado sobre los tokens de marca (no gris genérico). Componentes
  mínimos iniciales: `button`, `card`, `separator`, `input`.
- `src/app/layout.tsx`: fuentes, metadata ("MeryLay Boutique — Inspiración
  Femenina"), favicon placeholder, logo de header en texto mientras no exista
  `/public/brand/logo-principal.png`.
- `src/app/(store)/page.tsx`: home placeholder que demuestra la identidad visual
  (hero con paleta y tipografía), sin catálogo real (eso es Fase 6).
- `src/lib/supabase/client.ts` (browser) y `src/lib/supabase/server.ts` (server),
  usando `@supabase/ssr`.
- `middleware.ts`: refresca sesión Supabase y protege por rol `/admin/**`
  (admin/superadmin), `/pos/**` (staff/admin/superadmin), `/superadmin/**`
  (superadmin), consultando `profiles.role`.
- Vitest + Testing Library configurado (sin tests de negocio todavía).
- `.gitignore` (incluye `.env.local`), `.env.local` con las variables de la
  sección 8, `.env.local.example` sin valores, versionado.
- `git init` local y commit al cerrar la fase.

## Fase 2 — Datos (migraciones, RLS, buckets, tipos)

Migraciones vía Supabase MCP (`apply_migration`), por bloque temático, en este
orden:

1. **`001_roles_y_profiles`**: enum `user_role`
   (superadmin/admin/staff/customer), tabla `profiles`, funciones
   `is_admin()`/`is_superadmin()` (security definer), trigger `handle_new_user`
   en `auth.users` (crea profile con `role='customer'`, username autogenerado con
   reintento ante colisión), RLS de `profiles`.
2. **`002_catalogo`**: `categories`, `products`, `product_variants`,
   `product_images`, FKs, índices en `slug`/`sku`, RLS (lectura pública solo
   `is_active`, escritura admin/superadmin).
3. **`003_carrito_y_pedidos`**: enum `order_status`, `carts`, `cart_items`,
   `orders`, `order_items`, RLS (dueño por `user_id` o `session_id`;
   admin/superadmin ven todo).
4. **`004_pos`**: enum `payment_method`, `pos_sales`, `pos_sale_items`, RLS
   (staff/admin/superadmin).
5. **`005_store_settings`**: tabla `store_settings`, RLS (lectura pública,
   escritura superadmin).
6. **`006_storage_buckets`**: buckets `product-images`, `category-images`,
   `brand` (públicos), políticas de storage (SELECT público,
   INSERT/UPDATE/DELETE admin/superadmin).

Sin datos de muestra: las tablas quedan vacías (el seed de superadmin es Fase 4,
fuera de este spec).

Después de aplicar todo: `generate_typescript_types` →
`src/lib/supabase/database.types.ts`.

## Verificación

- `get_advisors` (Supabase MCP) para revisar seguridad/rendimiento tras las
  migraciones.
- Consultas de prueba con `execute_sql` simulando roles `anon`/`authenticated`
  para confirmar: catálogo activo visible públicamente, `cart_items`/`orders` no
  visibles entre usuarios distintos.
- `pnpm build` y `pnpm lint` deben pasar antes de cerrar la Fase 1.
- Trigger `handle_new_user`: probado con emails que generan colisión de username
  para confirmar el reintento por sufijo numérico.

## Fuera de alcance de este spec

Formularios de registro/login, helpers de rol en la app (más allá del middleware
base), seed de superadmin, CRUD de admin, tienda pública funcional,
carrito/checkout, POS, panel superadmin, deploy a Vercel. Todo eso sigue el
roadmap de la sección 12 del CLAUDE.md en fases posteriores.
