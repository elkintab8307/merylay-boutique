# Registro de clientes y "Mi cuenta" — Diseño

> Spec para: sistema de registro simplificado de clientes (nombre, dirección,
> WhatsApp, email opcional), y una página "Mi cuenta" donde el cliente ve sus
> pedidos, cuánto ha pagado en la tienda, y puede crear/editar su propia
> reseña de la empresa (con estrellas), que se publica en la sección de
> reseñas del frontend tras aprobación del admin.

## Contexto actual (confirmado en el código)

- El checkout (`/checkout`) **ya exige** sesión iniciada — redirige a
  `/login?redirectTo=/checkout` si no hay usuario. `orders.user_id` es
  `NOT NULL`: no existen pedidos de invitado en la base de datos.
- El registro actual (`/registro`) pide: nombre completo, email (obligatorio),
  contraseña, confirmar contraseña. `src/lib/validation/auth.ts` →
  `registroSchema`.
- `profiles` (migración `001_roles_y_profiles.sql`) tiene `id`, `username`,
  `full_name`, `role`, `phone`, `created_at`. No tiene dirección ni un campo
  de WhatsApp dedicado.
- El trigger `handle_new_user()` genera `username` a partir del email
  (`split_part(new.email, '@', 1)`), con reintento numérico ante colisión.
- El login (`/login`) ya acepta un `identifier` que puede ser email o
  username — si no es un email válido, se resuelve por `username` en
  `profiles` (comportamiento ya usado por el superadmin `adminsu`).
- "Mis pedidos" (`/cuenta/pedidos` y `/cuenta/pedidos/[id]`) ya existen y
  muestran estado + total por pedido. No se tocan, salvo agregar un enlace de
  entrada desde la nueva página `/cuenta`.
- `reviews` (sin migración local encontrada, tabla ya existe en Supabase) no
  tiene `user_id`; las reseñas hoy las escribe el admin a mano
  (`customer_name` es texto libre). RLS actual: `SELECT` público si
  `is_active` o admin; `INSERT`/`UPDATE`/`DELETE` solo admin. La tabla está
  vacía (0 filas) — no hay datos que migrar.
- El checkout (`checkout-form.tsx` + `checkout.ts` schema) pide de nuevo en
  cada compra: nombre completo, teléfono, dirección, ciudad, notas. Es un
  formulario independiente del perfil.
- `destinoPorRol()` no da ningún destino de panel a `customer` (devuelve
  `/`), así que el menú móvil hoy no muestra un enlace "Panel" para clientes
  — solo "Mis pedidos" y "Favoritos".

## Decisiones (confirmadas con el usuario)

1. **Login sin email**: si el cliente no da email, su WhatsApp funciona como
   su "usuario" de acceso (mismo patrón que ya usa el superadmin).
2. **Nombre**: un solo campo "Nombre completo" (no se separa en
   nombre/apellido).
3. **Checkout**: si el perfil tiene dirección/WhatsApp guardados, el
   checkout llega precargado con esos valores (nombre, teléfono, dirección);
   siguen siendo editables por pedido sin afectar lo guardado en el perfil.
   La ciudad se sigue pidiendo aparte (el perfil no la separa de la
   dirección).
4. **Moderación de reseñas de clientes**: se guardan con `is_active = false`
   hasta que un admin las apruebe desde `/admin/resenas` (mismo flujo que ya
   existe para las reseñas cargadas por el equipo).
5. **Quién puede reseñar**: cualquier cliente registrado, sin exigir compra
   previa.
6. **"Total pagado"**: suma de `orders.total` para pedidos en estado
   `pagado`, `enviado` o `entregado` (excluye `pendiente` y `cancelado`).

## Modelo de datos (migración `031_registro_clientes.sql`)

```sql
-- profiles: nuevos campos de contacto/envio
alter table public.profiles
  add column address text,
  add column whatsapp text;

-- reviews: vinculo opcional a un cliente + una resena por cliente
alter table public.reviews
  add column user_id uuid references public.profiles(id) on delete cascade;

create unique index reviews_user_id_unique
  on public.reviews (user_id)
  where user_id is not null;

-- RLS: el cliente puede insertar/editar/leer SU PROPIA resena (ademas de
-- los permisos de admin ya existentes, que no se tocan). auth.uid() va
-- envuelto en (select ...) y las politicas se limitan a "authenticated",
-- mismo patron ya usado en la tabla favorites (migracion 007).
create policy "reviews_insert_own"
  on public.reviews for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "reviews_update_own"
  on public.reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reviews_select_own"
  on public.reviews for select
  to authenticated
  using (user_id = (select auth.uid()));
```

Notas:
- El índice único parcial (`where user_id is not null`) permite múltiples
  filas con `user_id = null` (las reseñas del admin, sin dueño) pero como
  mucho una fila por cliente real — la restricción de "una reseña por
  cliente" queda garantizada en la base de datos, no solo en la app.
- `reviews_select_own` es necesaria porque una reseña recién creada por el
  cliente tiene `is_active = false`; sin esta política el cliente no podría
  ver su propia reseña pendiente de aprobación en "Mi cuenta".
- No se toca `profiles_update_own_or_superadmin` (ya existente): ya permite
  que el cliente edite su propia fila, cubriendo los nuevos campos
  `address`/`whatsapp` sin cambios de política.

### Trigger `handle_new_user()` (se reemplaza)

Se ajusta para generar el `username` desde el WhatsApp cuando el email es el
interno sintético (ver siguiente sección), en vez de siempre partir del
email:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate_username text;
  suffix int := 1;
  base_source text;
begin
  base_source := coalesce(new.raw_user_meta_data->>'whatsapp', split_part(new.email, '@', 1));
  base_username := lower(regexp_replace(base_source, '[^a-z0-9]', '', 'g'));
  if base_username = '' then
    base_username := 'usuario';
  end if;

  candidate_username := base_username;

  while exists (select 1 from public.profiles where username = candidate_username) loop
    suffix := suffix + 1;
    candidate_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, full_name, address, whatsapp, role)
  values (
    new.id,
    candidate_username,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'whatsapp',
    'customer'
  );

  return new;
end;
$$;
```

El trigger pasa a leer `full_name`/`address`/`whatsapp` desde
`raw_user_meta_data` (ya se usaba `full_name` así) para poblar `profiles` en
un solo paso, evitando un segundo `UPDATE` desde la Server Action tras el
`signUp`.

## Registro (`/registro`)

**Schema** (`src/lib/validation/auth.ts`, `registroSchema`):

```ts
export const registroSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
    whatsapp: z.string().trim().min(7, "Ingresa un número de WhatsApp válido"),
    address: z.string().trim().min(5, "Ingresa una dirección válida"),
    email: z.email("Ingresa un correo electrónico válido").trim().optional().or(z.literal("")),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });
```

**Formulario** (`registro-form.tsx`): reemplaza el campo único de email
obligatorio por WhatsApp (obligatorio) + Dirección (obligatorio) + Email
(opcional, con texto de ayuda "opcional"). El resto del componente
(manejo de éxito, merge de carrito de invitado) no cambia.

**Server Action** (`registro/actions.ts`) — cambio de fondo: cuando no hay
email real, **no** se puede usar `supabase.auth.signUp()` desde el cliente,
porque Supabase intentaría enviar un correo de confirmación a una dirección
inventada y el cliente quedaría con una cuenta atrapada en "sin confirmar"
sin ninguna forma de completarla. En su lugar, cuando `email` viene vacío se
usa el mismo mecanismo que ya usa el seed del superadmin
(`scripts/seed-superadmin.ts`): un cliente de Supabase con el
`SUPABASE_SERVICE_ROLE_KEY` y `auth.admin.createUser({ email_confirm: true,
... })`, que crea la cuenta ya confirmada sin depender de un correo real.
Cuando sí hay email real, se mantiene el flujo actual sin cambios
(`auth.signUp`, con su correo de confirmación normal si el proyecto lo
exige).

```ts
const emailFinal = parsed.data.email || `${parsed.data.whatsapp.replace(/\D/g, "")}@merylay.local`;
const metadata = {
  full_name: parsed.data.fullName,
  address: parsed.data.address,
  whatsapp: parsed.data.whatsapp,
};

if (parsed.data.email) {
  // flujo actual: supabase.auth.signUp({ email, password, options: { data: metadata } })
} else {
  // flujo nuevo: cliente admin (service role) -> auth.admin.createUser({
  //   email: emailFinal, password, email_confirm: true, user_metadata: metadata })
  // luego auth.signInWithPassword({ email: emailFinal, password }) para dejar
  // al cliente con sesion iniciada, igual que el flujo con session actual.
}
```

El correo de bienvenida (`enviarCorreo`) solo se envía cuando
`parsed.data.email` es real (nunca a la dirección `@merylay.local`
sintética).

## Login (`/login`)

**Sin cambios de código.** El campo `identifier` ya intenta resolver por
`username` cuando no es un email (mismo camino que usa `adminsu`). Un
cliente sin email inicia sesión escribiendo su número de WhatsApp tal como
lo escribió al registrarse (se normaliza igual que el username: minúsculas,
solo alfanuméricos) — la copia del campo en `login-form.tsx` pasa de
"Correo electrónico" a "Correo electrónico o WhatsApp" para que quede claro.

## Checkout (precarga desde el perfil)

`checkout/page.tsx` (Server Component) ya consulta `auth.getUser()`; se
agrega una consulta a `profiles` (`full_name, address, whatsapp`) del mismo
usuario, y esos valores se pasan como `defaultValues` a
`<CheckoutForm defaultValues={...} />`. `CheckoutForm` pasa esos valores al
`useForm({ defaultValues: { ...defaultValues, paymentMethod: "transferencia" } })`
en vez de solo `paymentMethod`. La ciudad no se precarga (no existe en el
perfil). Nada cambia en la Server Action `confirmarPedido`/`iniciarPagoWompi`
— siguen usando lo que el cliente confirme en el formulario para ese pedido,
no lo guardado en el perfil.

## Página "Mi cuenta" (`/cuenta`, nueva)

Server Component que:

1. Exige sesión (`redirect("/login?redirectTo=/cuenta")` si no hay usuario),
   igual que `/cuenta/pedidos`.
2. Lee el perfil (`full_name`, `address`, `whatsapp`) y lo pasa a un
   formulario de edición simple (mismos 3 campos del registro, sin
   contraseña) que hace `update` directo sobre `profiles` vía Server Action.
3. Calcula el resumen: cuenta de pedidos y suma de `total` en pedidos
   `pagado`/`enviado`/`entregado`.
4. Enlaza a `/cuenta/pedidos` ("Ver mis pedidos").
5. Muestra el formulario de reseña (`estrellas` 1-5 + texto), precargado si
   el cliente ya tiene una fila en `reviews` (vía `reviews_select_own`).
   Guardar hace `upsert` sobre `reviews` con `user_id = auth.uid()`,
   `is_active = false` siempre (tanto al crear como al editar — una edición
   vuelve a pedir aprobación, para que el admin no publique un cambio sin
   revisar). Si el cliente no tiene aún un `customer_name`/`full_name`
   guardado en su perfil, se usa `profile.full_name` como `customer_name` de
   la reseña automáticamente (el cliente no lo vuelve a escribir).

**Menú** (`site-menu-sheet.tsx`): se agrega un enlace "Mi cuenta" → `/cuenta`
en la sección "Mi cuenta" del sheet, antes de "Mis pedidos" (hoy esa sección
no tiene ningún enlace de panel para clientes, solo pedidos/favoritos).

## Fuera de alcance (YAGNI, no se construye ahora)

- Edición de contraseña / recuperación de contraseña vía WhatsApp (fuera de
  alcance; ya existe el flujo estándar de Supabase por email para quien sí
  tiene correo real).
- Notificaciones por WhatsApp (solo se guarda el número; no se integra
  ningún proveedor de mensajería).
- Historial de ediciones de reseña o límite de frecuencia de edición.
- Filtro de pedidos por estado en `/cuenta/pedidos` (ya lista todo,
  ordenado por fecha; no se pidió).

## Pruebas

- `registroSchema`: email opcional válido en ambos casos (vacío y con
  valor), WhatsApp/dirección requeridos.
- `registro/actions.ts`: rama con email real (mock de `auth.signUp`) y rama
  sin email (mock de `auth.admin.createUser` + `signInWithPassword`).
- Migración: constraint único parcial de `reviews.user_id` (dos filas con
  `user_id = null` no chocan; dos filas con el mismo `user_id` sí).
- `/cuenta`: cálculo del total pagado (unit test de la función que agrega
  por estado, no del componente completo).
- Verificación en navegador: registro sin email → login con WhatsApp;
  checkout precargado tras tener perfil guardado; reseña de cliente
  aparece en `/admin/resenas` como inactiva y, tras activarla el admin,
  aparece en la home pública.
