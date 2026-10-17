# Agente de WhatsApp — memoria persistente de clientas

> Extensión del agente de WhatsApp ya en producción (ver
> `2026-10-06-agente-whatsapp-design.md` y los documentos posteriores de
> esa serie). Hoy el bot solo tiene memoria de corto plazo: los últimos
> 10 mensajes de `whatsapp_messages` (`cargarHistorial` en
> `sessions.ts`), reinyectados en cada llamada a OpenAI. En cuanto la
> conversación pasa esas 10 líneas, o la clienta vuelve días después, el
> bot pierde todo el contexto — nombre, talla, dirección, gustos. Este
> documento define una memoria de largo plazo, estructurada por clienta,
> que persiste entre conversaciones.

## Objetivo

1. El bot recuerda, de forma persistente y entre conversaciones
   distintas, datos de cada clienta: preferencias de producto, datos de
   contacto/entrega, un resumen de conversaciones pasadas, y notas
   libres que la dueña (Elkin/Mary) le pida recordar sobre una clienta
   puntual.
2. Cuando una clienta escribe por primera vez, el bot la saluda con
   calidez y le pregunta su nombre y desde dónde escribe (ciudad). A
   partir de ese momento, el bot se dirige a ella por su nombre en
   cualquier conversación futura, sin volver a preguntarlo.
3. Los datos de envío (`fullName`/`phone`/`address`/`city`) que ya se
   piden hoy en `confirmar_pedido` quedan memorizados automáticamente,
   para que un pedido futuro no tenga que volver a pedirlos desde cero.

## Fuera de alcance

- Panel web/admin para ver o editar esta memoria manualmente — por
  ahora es solo para que el propio bot la use; una UI de superadmin
  sobre `customer_memory` queda para una fase futura si se necesita.
- Resúmenes con embeddings/búsqueda semántica — el "resumen de
  conversación" es un solo texto que se va actualizando (ver Sección 3),
  no una bitácora histórica completa ni un sistema de recuperación
  semántica.
- Poda/expiración automática de memoria vieja — no hay límite de
  tamaño ni borrado automático en esta primera versión; si en el futuro
  la tabla crece demasiado, se revisita.
- Memoria para el rol `owner` (Elkin/Mary) — este documento es
  memoria sobre las *clientas*, no sobre los dueños.

## Modelo de datos (tabla vertical)

```sql
create table public.customer_memory (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  categoria text not null check (categoria in ('preferencia','contacto','nota','resumen')),
  clave text not null,
  valor text not null,
  origen text not null default 'bot' check (origen in ('bot','dueño')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, clave)
);

create index customer_memory_customer_id_idx on public.customer_memory (customer_id);

alter table public.customer_memory enable row level security;

create policy "customer_memory_select" on public.customer_memory
  for select using (customer_id = auth.uid() or is_admin() or is_superadmin());

create policy "customer_memory_write" on public.customer_memory
  for all using (is_admin() or is_superadmin());
```

Es un modelo **vertical/EAV** (una fila = un hecho) en vez de ir
agregando columnas a `profiles` cada vez que aparece un nuevo tipo de
dato que recordar. `unique (customer_id, clave)` hace que cada hecho se
actualice en su lugar (upsert), no se acumule — la fila con clave
`talla_preferida` siempre tiene el valor más reciente.

Las políticas de RLS siguen el mismo patrón que el resto del esquema
(sección 6 de `CLAUDE.md`): lectura para la propia clienta o
admin/superadmin; escritura reservada a admin/superadmin desde el
panel. El Edge Function escribe con `service_role` y no pasa por RLS,
igual que ya hace con `whatsapp_messages`/`whatsapp_sessions`.

### Vocabulario cerrado de `clave`

Para `categoria = 'preferencia'` o `'contacto'`, el modelo solo puede
usar estas claves (evita que "talla", "talla_preferida" y "size" creen
tres hechos distintos para lo mismo):

- `nombre_completo`, `ciudad_habitual`, `direccion_habitual`,
  `metodo_pago_preferido` (`contacto`)
- `talla_preferida`, `color_favorito`, `estilo_preferido`,
  `ocasion_tipica` (`preferencia`)

Para `categoria = 'resumen'` la clave es siempre fija:
`resumen_conversacion` (un solo hecho que se reescribe, no una lista).

Para `categoria = 'nota'` la clave es generada por el código (no por el
modelo), con la forma `nota_<timestamp epoch ms>`, para que varias
notas de la dueña puedan coexistir sin pisarse entre sí ni chocar con
el `unique (customer_id, clave)`.

## Cómo se escribe la memoria

### 1. Extracción por el modelo (caso general)

`AgentDecision` (en `_shared/types.ts`) gana un campo opcional:

```ts
export interface AgentDecision {
  action: string;
  params: Record<string, unknown>;
  response_message: string;
  memoria?: { categoria: "preferencia" | "contacto" | "resumen"; clave: string; valor: string }[];
}
```

Nunca incluye `categoria: "nota"` desde el modelo — las notas solo se
crean vía la acción `agregar_nota_cliente` del dueño (ver más abajo),
nunca por inferencia libre del lado cliente.

El prompt de cliente (`agent.ts`) instruye: *"si la clienta menciona su
nombre, de dónde escribe, su talla, un color que le encanta, una
ocasión, o cualquier dato que valga la pena recordar para la próxima
vez, inclúyelo en `memoria` usando exactamente una de las claves del
vocabulario. Si quieres dejar actualizado el resumen de en qué va la
conversación, usa categoria 'resumen' y clave 'resumen_conversacion'."*

`handler.ts`, después de recibir la decisión (para rol `customer`), si
`decision.memoria` no está vacío, llama a `guardarMemoria(profileId,
decision.memoria)` (upsert por `clave`). Si `decision.memoria` es
`undefined` o `[]`, no se hace ninguna escritura — la mayoría de los
turnos no tienen nada nuevo que recordar.

### 2. Captura automática y determinística

Cuando `confirmar_pedido` se ejecuta con éxito en
`ejecutarAccionEscritura` (ya recibe `fullName`, `phone`, `address`,
`city` como parámetros obligatorios), `handler.ts` llama a
`guardarMemoria` directamente con esos cuatro valores mapeados a
`nombre_completo`/`direccion_habitual`/`ciudad_habitual` (categoría
`contacto`), **sin pasar por el modelo**. Así la dirección real nunca
depende de que la IA la transcriba bien desde el texto libre.

### 3. Notas de la dueña

Nueva acción en `ACCIONES_DUENO` (`owner-actions.ts` + doc en
`agent.ts`):

```
agregar_nota_cliente: params {"nombreOTelefono": string, "nota": string}
```

La memoria se ata a `customer_id → profiles.id`, así que la resolución
del cliente busca **solo en `profiles`** (`full_name`/`username`/
`whatsapp`/`phone` con `ilike`, igual patrón que el bloque de perfiles
de `historialCliente` en `reports.ts`, pero sin la fusión con
`pos_customers`): una clienta de POS sin perfil vinculado no tiene
`profiles.id` y por lo tanto no puede tener memoria. Si no hay ningún
perfil que coincida, o hay más de uno, la acción responde pidiendo el
nombre completo o el teléfono exacto (mismo criterio que
`historialCliente`). Con un único perfil encontrado, llama a
`agregarNotaCliente(profileId, nota)` en `memory.ts`, que inserta una
fila nueva (`categoria: "nota"`, `origen: "dueño"`, `clave` generada
por código). Es una acción de lectura inmediata (no de escritura con
confirmación) porque no modifica datos del negocio, solo memoria del
bot — sigue el mismo criterio que `informe_*`/`buscar_cliente` en
`ACCIONES_DUENO`.

## Cómo se lee/inyecta la memoria

En `generarRespuesta` (`handler.ts`), justo donde ya se tiene
`profileId` disponible (antes de construir `historial`), se agrega:

```ts
const memoria = await cargarMemoria(profileId);
```

Esa lista se pasa a `decidirAccion` junto con `historial`, y
`promptSistema` (solo para rol `customer`) arma un bloque de texto
antes de la lista de acciones:

```
Lo que ya sabes de esta clienta:
- nombre_completo: Camila
- ciudad_habitual: Medellín
- talla_preferida: M
- color_favorito: rosa
(nota de la dueña) es mayorista, paga con transferencia
```

Reglas que el prompt agrega según el contenido de `memoria`:

- Si **no** hay `nombre_completo`: *"No sabes el nombre de esta clienta
  todavía — pregúntaselo con naturalidad, junto con desde dónde escribe
  (ciudad), antes de seguir. No la interrogues: si ya te pidió algo
  puntual, respóndele primero y pregunta de forma natural en el mismo
  mensaje, no antes."*
- Si **sí** hay `nombre_completo`: *"Dirígete a ella por su nombre,
  `<nombre_completo>`, de forma natural (no en cada frase, pero que se
  note que la reconoces). Nunca vuelvas a preguntarle el nombre ni la
  ciudad."*

### Primer contacto

`buscarOCrearCliente` (`customers.ts`) ya devuelve `esNuevo: boolean`
(`true` únicamente cuando se crea el usuario de WhatsApp por primera
vez — nunca había escrito). `generarRespuesta` pasa ese valor a
`decidirAccion` como `esClienteNueva`. Cuando es `true`, el prompt
refuerza la instrucción de preguntar nombre/ciudad en el saludo inicial
sin esperar a que falte memoria (en la práctica son la misma condición,
pero deja explícito el caso de clienta antigua — de antes de este
cambio — que todavía no tiene `nombre_completo` registrado, para la que
aplica la misma regla de "pregúntalo con naturalidad" sin tratarla como
cliente nueva).

## Manejo de fallos

Mismo criterio que `cargarHistorial`: la memoria es contexto que
mejora la respuesta, nunca algo que la bloquee.

- Si `cargarMemoria` falla (error de red/DB): se registra en consola
  (`console.error`) y se continúa con lista vacía — el bot responde
  igual, solo que sin recordar nada esa vez.
- Si `guardarMemoria`/`agregarNotaCliente` falla después de ya haber
  respondido a la clienta: se registra el error pero no se reintenta
  ni se le muestra nada a la clienta — perder un hecho nuevo no es
  crítico, perder la respuesta sí.

## Archivos nuevos/tocados

- `supabase/functions/whatsapp-webhook/memory.ts` (nuevo) —
  `cargarMemoria(profileId)`, `guardarMemoria(profileId, hechos[])`,
  `agregarNotaCliente(profileId, nota)`.
- `supabase/functions/whatsapp-webhook/memory.test.ts` (nuevo).
- `supabase/functions/_shared/types.ts` — `AgentDecision.memoria?`.
- `supabase/functions/whatsapp-webhook/agent.ts` — bloque de memoria +
  reglas de nombre/ciudad en el prompt de cliente; `esClienteNueva` en
  `decidirAccion`.
- `supabase/functions/whatsapp-webhook/handler.ts` — cargar memoria
  antes de `decidirAccion`; upsert después; captura automática en
  `confirmar_pedido`; nueva acción `agregar_nota_cliente` en
  `ejecutarAccionLectura`.
- `supabase/functions/whatsapp-webhook/owner-actions.ts` — doc de
  `agregar_nota_cliente` en `ACCIONES_DUENO`, y la propia acción:
  resuelve el perfil por nombre/teléfono (solo `profiles`, sin fusión
  con `pos_customers`) y llama a `agregarNotaCliente`.
- Migración vía MCP de Supabase para `customer_memory` (sección "Modelo
  de datos" arriba).

## Plan de pruebas (TDD, igual que el resto del proyecto)

- Cliente nueva (`esClienteNueva = true`) → el prompt instruye pedir
  nombre y ciudad.
- Cliente con `nombre_completo` ausente (antigua, sin ser "nueva") →
  misma instrucción de preguntar con naturalidad.
- Cliente con `talla_preferida`/`nombre_completo` en memoria → aparecen
  en el prompt; la instrucción dice dirigirse por el nombre y no volver
  a preguntar.
- `decidirAccion` devuelve `memoria` no vacío → `handler.ts` llama a
  `guardarMemoria` con esos hechos.
- `decidirAccion` devuelve `memoria` vacío/ausente → no se llama a
  `guardarMemoria`.
- `guardarMemoria` con una `clave` repetida → actualiza la fila
  existente (upsert), no duplica.
- `confirmar_pedido` exitoso → guarda `nombre_completo`/
  `direccion_habitual`/`ciudad_habitual` sin pasar por el modelo.
- Falla de `cargarMemoria` → `generarRespuesta` sigue sin memoria, sin
  lanzar error al usuario (igual patrón que el test existente de
  `cargarHistorial`).
- Falla de `guardarMemoria`/`agregarNotaCliente` → no interrumpe el
  envío de la respuesta ya generada.
- `agregar_nota_cliente` desde el dueño → nota insertada con
  `origen: "dueño"` y una `clave` nueva (no choca con notas previas).
