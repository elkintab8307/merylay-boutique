# Diseño — Fase 4: Seed del superadmin — MeryLay Boutique

**Fecha**: 2026-08-06
**Estado**: Aprobado
**Alcance**: Roadmap del CLAUDE.md, sección 12 punto 4, implementando la sección 9
("Seed del SuperAdmin") al pie de la letra: `scripts/seed-superadmin.ts`,
idempotente, que crea/asegura el usuario `adminsu` con rol `superadmin`.

## Fuera de alcance

Login por username para el superadmin ya funciona de forma genérica desde la
Fase 3 (`resolveEmail()` busca cualquier `profiles.username`, no solo
`adminsu`) — no se necesita lógica especial. Cambiar la contraseña tras el
primer login es responsabilidad del dueño del proyecto, no del script.

## Decisiones de diseño (confirmadas con el usuario)

- **Runner**: `tsx` (dev dependency), invocado como `pnpm seed:superadmin`.
- **Carga de env**: el script carga `.env.local` explícitamente con `dotenv`
  (Next.js no inyecta variables de entorno a scripts standalone fuera de su
  runtime).
- **Idempotencia**: intenta `admin.auth.admin.createUser()`; si falla porque
  el email ya está registrado, busca el usuario existente con
  `admin.auth.admin.listUsers()` en vez de fallar el script.
- **Rol y username**: el trigger `handle_new_user` (Fase 2) ya crea la fila en
  `profiles` automáticamente al crear el usuario en `auth.users` (vía
  `email_confirm: true`, sin necesidad de confirmación por correo). El script
  hace un `UPDATE` explícito de `role='superadmin'` y `username` al valor de
  `SUPERADMIN_USERNAME`, para que el resultado sea determinista sin importar
  si la fila ya existía de una corrida anterior.
- **Seguridad**: la contraseña se lee solo de `SUPERADMIN_PASSWORD` (entorno),
  nunca se escribe en código ni se imprime en consola. El script aborta con un
  mensaje claro si falta alguna variable de entorno requerida.

## Archivos

- `scripts/seed-superadmin.ts` — script principal.
- `package.json` — nuevo script `seed:superadmin`, nuevas dev dependencies
  `tsx` y `dotenv`.

## Verificación

- Ejecutar `pnpm seed:superadmin` dos veces seguidas contra el proyecto
  Supabase real: la primera crea el usuario, la segunda no falla (idempotente)
  y confirma que el `profile` sigue teniendo `role='superadmin'`.
- Confirmar por SQL (`execute_sql`) que `profiles.role='superadmin'` y
  `profiles.username='adminsu'` para el usuario con `email=SUPERADMIN_EMAIL`.
- `pnpm build`, `pnpm lint` en verde (el script vive fuera del build de
  Next.js pero debe compilar sin errores de tipos).
