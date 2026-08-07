# Fase 9 — SuperAdmin: Diseño

> Ver `CLAUDE.md` §4, §7.4, §12 punto 9 para los requisitos originales.

## Objetivo

Dar al rol `superadmin` un panel (`/superadmin`) para gestionar usuarios/roles
y los ajustes generales de la tienda, completando el control total descrito
en la sección 4 de `CLAUDE.md`. La ruta ya está protegida por `proxy.ts`
(Fase 1/3), que exige `role = 'superadmin'` para cualquier `/superadmin/**`.

## Alcance

1. Gestión de usuarios: listar, cambiar rol (`customer|staff|admin`),
   bloquear/reactivar acceso.
2. Ajustes de la tienda: formulario estructurado sobre `store_settings`.

Fuera de alcance (no pedido en el roadmap de esta fase): búsqueda/filtro de
usuarios, historial de auditoría, invitaciones por correo, edición de
`full_name`/`phone` de otros usuarios.

## Arquitectura

### Estructura de rutas

```
/app/superadmin
  layout.tsx            # protegido + nav (Usuarios, Ajustes)
  superadmin-nav.tsx
  /usuarios
    page.tsx             # lista de profiles + estado de bloqueo
    actions.ts           # cambiarRol(), bloquearUsuario(), reactivarUsuario()
    user-row-actions.tsx # client component: selects + botones por fila
  /ajustes
    page.tsx             # formulario de store_settings
    actions.ts           # guardarAjustes()
    ajustes-form.tsx      # client component
```

### Autorización

`src/lib/admin/require-superadmin.ts` — nuevo helper, mismo patrón que
`require-admin.ts` de la Fase 5, pero exige exactamente `role === 'superadmin'`.
Se invoca al inicio de cada Server Action de `/superadmin/**` como defensa en
profundidad (el proxy ya bloquea la ruta, pero las Server Actions deben
validar por sí mismas, igual que en Admin y POS).

### Gestión de usuarios

- **Lectura**: `profiles` se lee con el cliente de servidor normal (RLS ya
  permite a superadmin leer todas las filas). El estado de bloqueo
  (`banned_until`) vive en `auth.users`, no expuesto por RLS/PostgREST, así
  que se obtiene con el cliente de service role (`src/lib/supabase/admin.ts`,
  ya existente desde la Fase 3) vía `supabase.auth.admin.listUsers()`.
  Unión en JS por `id` (mismo patrón de "join en memoria" usado en el resto
  del proyecto — admin, tienda, POS — para evitar riesgos de tipado con
  selects anidados de PostgREST).
- **Cambiar rol** (`cambiarRol(userId, nuevoRol)`):
  - `nuevoRol` restringido a `'customer' | 'staff' | 'admin'` (zod enum) —
    nunca se ofrece `'superadmin'` en la UI, conforme a CLAUDE.md §4
    ("los roles admin/staff los asigna el superadmin"). Esa es la única vía
    para crear un superadmin en el sistema.
  - Guard de auto-modificación: si `userId === auth.uid()` del actor, la
    acción rechaza con "No puedes cambiar tu propio rol."
  - Usa el cliente de servidor normal (`update` sobre `profiles`, permitido
    por RLS a superadmin).
- **Bloquear/reactivar** (`bloquearUsuario(userId)` / `reactivarUsuario(userId)`):
  - Usa el cliente de service role: `supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' })`
    para bloquear (100 años ≈ indefinido, es el valor que documenta Supabase
    para "ban permanente"); `{ ban_duration: 'none' }` para reactivar.
  - Guard de auto-bloqueo: si `userId === auth.uid()` del actor, rechaza con
    "No puedes bloquearte a ti mismo."
  - Un usuario bloqueado no puede iniciar sesión (Supabase Auth lo impide a
    nivel de `signInWithPassword`), efecto real de "desactivar".

### Ajustes de la tienda

`store_settings` (`key text unique`, `value jsonb`) ya existe con RLS:
lectura pública, escritura solo superadmin. Claves fijas para este MVP:

| key                    | value (jsonb)          | Campo en el formulario          |
|------------------------|-------------------------|----------------------------------|
| `nombre_tienda`        | `"MeryLay Boutique"`    | Texto                            |
| `contacto_email`       | `"correo@ejemplo.com"`  | Texto (validado como email)      |
| `contacto_telefono`    | `"3001234567"`          | Texto                            |
| `envio_costo_defecto`  | `15000`                 | Número (pesos COP, entero ≥ 0)   |
| `redes_instagram`      | `"https://..."`         | URL opcional                     |
| `redes_facebook`       | `"https://..."`         | URL opcional                     |
| `redes_tiktok`         | `"https://..."`         | URL opcional                     |
| `redes_whatsapp`       | `"https://wa.me/..."`   | URL opcional                     |

`guardarAjustes(input)` valida `input` con un zod schema
(`storeSettingsSchema`), y hace *upsert* (`on conflict (key) do update`) de
las 8 filas dentro de una única llamada a Supabase (`upsert` con array,
`onConflict: "key"`). No requiere una función RPC atómica: no hay condición
de carrera real (no compite con stock ni dinero), y todas las filas son
independientes entre sí — un upsert parcial no corrompe ningún invariante de
negocio.

La página de ajustes lee las 8 claves existentes (`select * from
store_settings where key in (...)`) y precarga el formulario; si una clave no
existe aún (primera vez), el campo se muestra vacío/con placeholder.

No se requieren migraciones nuevas — el esquema de `profiles` y
`store_settings` ya cubre todo lo necesario.

## Manejo de errores

- Server Actions devuelven `{ error: string } | { success: true }` (mismo
  patrón establecido en Fases 5, 7, 8).
- Mensajes en español: "No autorizado.", "No puedes cambiar tu propio rol.",
  "No puedes bloquearte a ti mismo.", "Rol inválido.", errores de validación
  de zod para ajustes.

## Testing

- **TDD (Vitest, lógica pura)**:
  - `src/lib/validation/store-settings.ts` — `storeSettingsSchema` (zod):
    tests de valores válidos/ inválidos (email mal formado, costo de envío
    negativo, URLs mal formadas).
  - `src/lib/admin/user-guards.ts` — funciones puras `puedeCambiarRol(actorId,
    targetId)` y `puedeBloquear(actorId, targetId)` (ambas `actorId !==
    targetId`), extraídas para poder testear la regla de auto-modificación
    sin mockear Supabase.
- **Verificación de integración** (sin navegador, método ya establecido):
  script `.mjs` con cliente service-role + cliente de usuario de prueba:
  1. Crear usuario de prueba (`customer`), promoverlo a `staff` como
     superadmin, verificar acceso a `/pos` vía `curl` (redirect vs 200).
  2. Bloquearlo, verificar que `signInWithPassword` falla.
  3. Reactivarlo, verificar que `signInWithPassword` vuelve a funcionar.
  4. Intentar que el superadmin se autobloquee/autocambie rol → verificar
     rechazo.
  5. Guardar ajustes de tienda, releer y verificar persistencia.
  6. Limpiar todos los datos de prueba al final.

## UI

Sigue el patrón visual de `/admin` (fondo `brand-crema`, nav superior con
`AdminNav`-style, tarjetas blancas con borde `brand-rosa-claro`). Tabla de
usuarios: username, nombre, rol (select inline), estado (badge "Activo" /
"Bloqueado" + botón toggle). Formulario de ajustes: inputs agrupados por
sección (Datos generales, Envío, Redes sociales), botón "Guardar cambios".
