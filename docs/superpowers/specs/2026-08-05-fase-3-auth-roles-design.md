# Diseño — Fase 3: Auth y roles — MeryLay Boutique

**Fecha**: 2026-08-05
**Estado**: Aprobado
**Alcance**: Roadmap del CLAUDE.md, sección 12, fase 3 ("Auth y roles: registro/login,
profiles, helpers de rol, protección de rutas"). La protección de rutas por rol ya
se implementó en la Fase 1 (`src/proxy.ts`); esta fase agrega registro, login,
logout y helpers de rol.

## Fuera de alcance de este spec

"Mi cuenta" con historial de pedidos (depende de `orders` con UI real — Fase 7),
asignación de roles admin/staff desde un panel (Fase 9, superadmin), seed del
superadmin (Fase 4).

## Decisiones de diseño (confirmadas con el usuario)

- **Login por identificador único**: el formulario de login acepta un email O un
  username (para todos los roles, no solo superadmin) — coherente con que
  `profiles.username` ya es único para todos.
- **Resolución username → email**: ocurre en una Server Action server-only usando
  `SUPABASE_SERVICE_ROLE_KEY` (nunca expuesto al cliente), porque un usuario
  anónimo no puede leer `profiles` de otro usuario bajo RLS (por diseño). Se
  descarta una función RPC pública equivalente por el riesgo de enumeración de
  usernames/emails.
- **Header con sesión**: `SiteHeader` se vuelve un Server Component async que
  consulta la sesión actual y muestra "Iniciar sesión" o `username` + "Cerrar
  sesión".
- **Registro**: solo pide nombre, email, contraseña y confirmación — el
  `username` se autogenera vía el trigger `handle_new_user` (ya implementado en
  la Fase 2), consistente con la decisión tomada en esa fase.
- **Testing**: TDD para lógica pura (detección de email vs. username, schemas
  zod de validación). Las Server Actions que llaman a Supabase Auth (red real)
  se verifican manualmente contra el proyecto conectado, igual que se hizo con
  el proxy en la Fase 1.

## Arquitectura

Server Actions (`'use server'`) para registro, login y logout. Un cliente
Supabase adicional (`src/lib/supabase/admin.ts`) con la service role key,
importado únicamente desde Server Actions (nunca desde código que se envíe al
cliente), usado solo para la resolución username → email antes de autenticar.

## Archivos

- `src/lib/supabase/admin.ts` — cliente Supabase con `SUPABASE_SERVICE_ROLE_KEY`
  (server-only).
- `src/lib/auth/identifier.ts` — `isEmail(value: string): boolean` (función pura,
  TDD) + `resolveEmail(identifier: string): Promise<string | null>` (Server
  Action: si `isEmail` es `false`, busca `profiles.username` → `auth.users.email`
  vía el cliente admin; si es `true`, devuelve el mismo valor).
- `src/lib/auth/get-current-user.ts` — `getCurrentProfile()`: retorna
  `{ user, profile } | null` combinando la sesión de `auth` con la fila de
  `profiles` (server-side, usa `src/lib/supabase/server.ts`).
- `src/lib/auth/logout-action.ts` — Server Action `logout()`: `signOut()` +
  `redirect('/')`.
- `src/lib/validation/auth.ts` — `loginSchema` (`identifier: string` no vacío,
  `password: string` mínimo 6) y `registroSchema` (`fullName`, `email` válido,
  `password` mínimo 6, `confirmPassword` debe coincidir), con zod.
- `src/app/(auth)/login/page.tsx` — formulario cliente (react-hook-form +
  zodResolver) que llama a la Server Action `login()`.
- `src/app/(auth)/login/actions.ts` — Server Action `login(formData)`: valida
  con `loginSchema`, resuelve el identificador con `resolveEmail()`, llama
  `signInWithPassword()`, redirige a `redirectTo` (query param, ya soportado por
  `proxy.ts`) o `/` en éxito; retorna mensaje de error en español si falla.
- `src/app/(auth)/registro/page.tsx` — formulario cliente equivalente para
  registro.
- `src/app/(auth)/registro/actions.ts` — Server Action `registro(formData)`:
  valida con `registroSchema`, llama `signUp()` con `full_name` en los metadatos
  del usuario, redirige a `/` en éxito (el trigger de la Fase 2 ya crea el
  `profile` con `role='customer'` y username autogenerado).
- Modifica `src/components/layout/site-header.tsx`: pasa a `async function`,
  llama `getCurrentProfile()`, renderiza condicionalmente.

## Verificación

- `pnpm test` cubre `isEmail()` (casos con/sin `@`) y ambos schemas zod (casos
  válidos e inválidos: password corta, confirmación no coincide, email
  inválido, identificador vacío).
- Verificación manual end-to-end contra el proyecto Supabase conectado: registro
  de un cliente nuevo → confirma fila en `profiles` con `role='customer'` y
  username autogenerado → login con email → login con el username generado →
  logout → confirmar que `/admin` sigue redirigiendo a `/login` sin sesión.
- `pnpm build`, `pnpm lint`, `pnpm test` en verde antes de cerrar la fase.
