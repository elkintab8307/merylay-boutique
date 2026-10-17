# Memoria Persistente de Clientas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El agente de WhatsApp recuerda, entre conversaciones distintas, datos de cada clienta (nombre, ciudad, preferencias, dirección, notas de la dueña), y en el primer contacto pregunta su nombre y desde dónde escribe para dirigirse a ella por su nombre de ahí en adelante.

**Architecture:** Tabla vertical/EAV `customer_memory` (una fila por hecho, `unique(customer_id, clave)`). Un módulo nuevo `memory.ts` lee/escribe esa tabla. `decidirAccion` recibe la memoria existente para inyectarla en el prompt y devuelve, además de `action`/`params`/`response_message`, un campo opcional `memoria` con los hechos nuevos que detectó — todo en la misma llamada a OpenAI que ya existe, sin costo/latencia extra. `handler.ts` guarda esos hechos después de cada turno, y además guarda determinísticamente los datos de envío cuando `confirmar_pedido` se ejecuta con éxito (sin depender de que el modelo los transcriba). Una acción nueva (`agregar_nota_cliente`) deja que la dueña le pida al bot recordar algo de una clienta puntual.

**Tech Stack:** Deno + TypeScript (Supabase Edge Functions), Vitest, `@supabase/supabase-js` (mockeado en tests con `vi.mock("../_shared/db.ts", ...)`), Postgres/Supabase (RLS, migraciones vía MCP).

**Spec:** `docs/superpowers/specs/2026-10-17-agente-whatsapp-memoria-clientas-design.md`

## Global Constraints

- Vocabulario cerrado de `clave` para `preferencia`/`contacto`: `nombre_completo`, `ciudad_habitual`, `direccion_habitual`, `metodo_pago_preferido`, `talla_preferida`, `color_favorito`, `estilo_preferido`, `ocasion_tipica`. `resumen_conversacion` es la única clave válida para `categoria: "resumen"`.
- `categoria: "nota"` nunca se genera desde el modelo — solo la crea `agregar_nota_cliente` (acción de la dueña), con `clave` generada por código (`nota_<timestamp>`), nunca por el modelo.
- `unique (customer_id, clave)` en la tabla: cada hecho se actualiza en su lugar (upsert), nunca se duplica.
- La memoria nunca bloquea una respuesta a la clienta: `cargarMemoria` y `guardarMemoria` son fail-open (registran el error en consola y siguen) — **excepto** `guardarNota`, que si falla debe lanzar (es una acción de la dueña con confirmación explícita; decirle "listo" cuando no se guardó sería falso).
- RLS: lectura para la propia clienta o `admin`/`superadmin`; escritura solo `admin`/`superadmin` desde el panel (el Edge Function escribe con `service_role`, sin pasar por RLS — mismo patrón que `whatsapp_messages`/`whatsapp_sessions`).
- Todo el código, los mensajes al usuario y los mensajes de commit van en español (CLAUDE.md del proyecto). TDD en cada paso. Commits atómicos después de cada tarea.
- Simplificación respecto al spec (anotada aquí para que no se lea como un olvido): el spec menciona un parámetro `esClienteNueva` separado; en la implementación se omite porque es una condición idéntica a "no hay `nombre_completo` en memoria" — una clienta genuinamente nueva siempre tiene memoria vacía, así que un solo chequeo (ausencia de `nombre_completo`) cubre ambos casos sin un parámetro redundante.

## Review Focus

- Nota/nombre con coma, comillas o barra invertida (ej. `María, "la del centro"`) en `agregar_nota_cliente` → el filtro `.or()` de PostgREST debe escaparse igual que ya hace `buscarCliente`/`historialCliente` (bug real ya resuelto ahí con `escaparValorFiltro`); si `agregarNotaCliente` no reutiliza esa función, el filtro se rompe en silencio o deja pasar una inyección de cláusula.
- El modelo manda una `clave` fuera del vocabulario cerrado (ej. `"talla"` en vez de `"talla_preferida"`) → sin validar contra `CLAVES_VALIDAS`, crea un hecho huérfano que el prompt nunca vuelve a leer con la clave correcta, y la clienta queda respondiendo la misma pregunta una y otra vez.
- El modelo manda un `valor` vacío o solo espacios (ej. `{"clave": "nombre_completo", "valor": ""}`) → sin filtrar, se guardaría un "nombre" vacío, y el prompt trataría a la clienta como si ya se le hubiera preguntado y respondido.
- Una clienta cambia de ciudad/dirección en un segundo pedido (`confirmar_pedido` se ejecuta dos veces con datos distintos en la misma conversación) → debe sobrescribir el hecho anterior, no apilar direcciones viejas junto a la nueva en el prompt.
- Una clienta con años de notas/hechos acumulados → el bloque de memoria inyectado en el prompt debe tener un tope (igual que `TOPE_HISTORIAL`/`TOPE_CARRUSEL` en el resto del bot), o una cuenta vieja encarece/rompe la llamada a OpenAI con un prompt que crece sin límite.

---

### Task 1: Migración de base de datos — tabla `customer_memory`

**Files:**
- Migración vía `mcp__supabase__apply_migration` (no es un archivo de este repo; el proyecto gestiona migraciones de Supabase a través del MCP, según CLAUDE.md sección 10).

**Interfaces:**
- Consumes: funciones `is_admin()`/`is_superadmin()` ya existentes en la base de datos (confirmado: `select proname from pg_proc where proname in ('is_admin','is_superadmin')` devuelve ambas).
- Produces: tabla `public.customer_memory` con columnas `id, customer_id, categoria, clave, valor, origen, created_at, updated_at`, RLS activo. Las Tasks 2-5 la usan vía `getSupabase().from("customer_memory")`.

- [ ] **Step 1: Aplicar la migración**

Llamar a `mcp__supabase__apply_migration` con `name: "customer_memory"` y:

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

- [ ] **Step 2: Verificar que la tabla y las políticas quedaron activas**

Llamar a `mcp__supabase__execute_sql` con:

```sql
select tablename, rowsecurity from pg_tables where tablename = 'customer_memory';
select policyname from pg_policies where tablename = 'customer_memory';
```

Expected: `rowsecurity = true`, y dos políticas: `customer_memory_select`, `customer_memory_write`.

- [ ] **Step 3: Commit (sin cambios de archivos del repo — anotar en el mensaje)**

No hay archivo que commitear en este paso (la migración vive en Supabase, no en `supabase/migrations` de este repo — así maneja migraciones este proyecto, vía MCP). Continuar directo a la Task 2; no se requiere `git commit` vacío.

---

### Task 2: `memory.ts` — lectura y escritura de la memoria

**Files:**
- Create: `supabase/functions/whatsapp-webhook/memory.ts`
- Test: `supabase/functions/whatsapp-webhook/memory.test.ts`

**Interfaces:**
- Consumes: `getSupabase` de `../_shared/db.ts` (mismo patrón que `sessions.ts`/`customers.ts`).
- Produces (usado por las Tasks 3, 4 y 5):
  - `export interface RecuerdoCliente { categoria: string; clave: string; valor: string; origen: string }`
  - `export interface HechoMemoria { categoria: string; clave: string; valor: string }`
  - `export const CLAVES_VALIDAS: readonly string[]`
  - `export async function cargarMemoria(profileId: string): Promise<RecuerdoCliente[]>`
  - `export async function guardarMemoria(profileId: string, hechos: HechoMemoria[]): Promise<void>`
  - `export async function guardarNota(profileId: string, nota: string): Promise<void>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `supabase/functions/whatsapp-webhook/memory.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("cargarMemoria", () => {
  it("devuelve los hechos del cliente, pidiendo los mas recientes primero", async () => {
    const order = vi.fn(async () => ({
      data: [
        { categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" },
        { categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" },
      ],
      error: null,
    }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { cargarMemoria } = await import("./memory.ts");
    const resultado = await cargarMemoria("perfil-1");

    expect(eq).toHaveBeenCalledWith("customer_id", "perfil-1");
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(resultado).toEqual([
      { categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" },
      { categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" },
    ]);
  });

  it("devuelve una lista vacia (sin lanzar) si la consulta falla", async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: "fallo" } }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { cargarMemoria } = await import("./memory.ts");
    expect(await cargarMemoria("perfil-1")).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("guardarMemoria", () => {
  function mockUpsert() {
    const upsert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ upsert })) };
    return { supabase, upsert };
  }

  it("hace upsert de los hechos validos, con onConflict customer_id,clave", async () => {
    const { supabase, upsert } = mockUpsert();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }]);

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ customer_id: "perfil-1", categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" })],
      { onConflict: "customer_id,clave" },
    );
  });

  it("descarta hechos con una clave fuera del vocabulario conocido", async () => {
    const { supabase, upsert } = mockUpsert();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", [
      { categoria: "preferencia", clave: "talla", valor: "M" },
      { categoria: "preferencia", clave: "talla_preferida", valor: "M" },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ clave: "talla_preferida" })],
      { onConflict: "customer_id,clave" },
    );
  });

  it("descarta hechos con valor vacio o solo espacios", async () => {
    const { supabase, upsert } = mockUpsert();
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "   " }]);

    expect(upsert).not.toHaveBeenCalled();
  });

  it("no llama a la base de datos si no queda ningun hecho valido", async () => {
    const { getSupabase } = await import("../_shared/db.ts");
    const getSupabaseMock = getSupabase as unknown as ReturnType<typeof vi.fn>;
    getSupabaseMock.mockClear();

    const { guardarMemoria } = await import("./memory.ts");
    await guardarMemoria("perfil-1", []);

    expect(getSupabaseMock).not.toHaveBeenCalled();
  });

  it("registra el error en consola si el upsert falla, sin lanzar", async () => {
    const upsert = vi.fn(async () => ({ error: { message: "fallo" } }));
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { guardarMemoria } = await import("./memory.ts");
    await expect(guardarMemoria("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }])).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("guardarNota", () => {
  it("inserta una fila con categoria nota, origen dueño, y una clave nueva", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarNota } = await import("./memory.ts");
    await guardarNota("perfil-1", "es mayorista, paga con transferencia");

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: "perfil-1",
      categoria: "nota",
      origen: "dueño",
      valor: "es mayorista, paga con transferencia",
      clave: expect.stringMatching(/^nota_\d+$/),
    }));
  });

  it("lanza un error si la insercion falla (a diferencia de guardarMemoria, esta SI debe fallar visiblemente)", async () => {
    const insert = vi.fn(async () => ({ error: { message: "fallo de red" } }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { guardarNota } = await import("./memory.ts");
    await expect(guardarNota("perfil-1", "nota")).rejects.toThrow(/fallo de red/);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/memory.test.ts`
Expected: FAIL — `Cannot find module './memory.ts'` (el archivo todavía no existe).

- [ ] **Step 3: Escribir `memory.ts`**

```ts
import { getSupabase } from "../_shared/db.ts";

export interface RecuerdoCliente {
  categoria: string;
  clave: string;
  valor: string;
  origen: string;
}

export interface HechoMemoria {
  categoria: string;
  clave: string;
  valor: string;
}

// Vocabulario cerrado para categoria 'preferencia'/'contacto': evita que el
// modelo invente tres nombres distintos ("talla", "talla_preferida", "size")
// para el mismo hecho. "resumen_conversacion" es la unica clave valida para
// categoria 'resumen'. agent.ts reutiliza esta misma lista para documentarle
// el vocabulario al modelo, en vez de mantener dos copias.
export const CLAVES_VALIDAS: readonly string[] = [
  "nombre_completo",
  "ciudad_habitual",
  "direccion_habitual",
  "metodo_pago_preferido",
  "talla_preferida",
  "color_favorito",
  "estilo_preferido",
  "ocasion_tipica",
  "resumen_conversacion",
];

const CATEGORIAS_MEMORIA_LLM = new Set(["preferencia", "contacto", "resumen"]);

// Los mas recientes primero: si en el futuro hay que recortar (ej. una
// cuenta con años de hechos acumulados), lo mas reciente es lo mas
// relevante para la conversacion de hoy.
export async function cargarMemoria(profileId: string): Promise<RecuerdoCliente[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("customer_memory")
    .select("categoria, clave, valor, origen")
    .eq("customer_id", profileId)
    .order("updated_at", { ascending: false });

  if (error || !data) {
    console.error(`[memory] No se pudo cargar la memoria de ${profileId}:`, error);
    return [];
  }
  return data as RecuerdoCliente[];
}

// Memoria extraida por el modelo: es contexto best-effort, nunca debe
// bloquear la respuesta a la clienta. Un hecho con una clave fuera del
// vocabulario, o con un valor vacio, se descarta en silencio en vez de
// corromper la memoria con un dato que el prompt nunca vuelve a leer
// correctamente (clave desconocida) o que se mostraria como si ya se
// hubiera preguntado algo que en realidad no se sabe (valor vacio).
export async function guardarMemoria(profileId: string, hechos: HechoMemoria[]): Promise<void> {
  const validos = hechos.filter(
    (h) => CATEGORIAS_MEMORIA_LLM.has(h.categoria) && CLAVES_VALIDAS.includes(h.clave) && h.valor.trim().length > 0,
  );
  if (validos.length === 0) return;

  const supabase = getSupabase();
  const ahora = new Date().toISOString();
  const filas = validos.map((h) => ({
    customer_id: profileId,
    categoria: h.categoria,
    clave: h.clave,
    valor: h.valor.trim(),
    origen: "bot",
    updated_at: ahora,
  }));

  const { error } = await supabase.from("customer_memory").upsert(filas, { onConflict: "customer_id,clave" });
  if (error) {
    console.error(`[memory] No se pudo guardar memoria de ${profileId}:`, error);
  }
}

// A diferencia de guardarMemoria: esto lo dispara una accion explicita de
// la dueña (agregar_nota_cliente), con una confirmacion que le llega por
// WhatsApp -- si la insercion falla, debe lanzar para que esa confirmacion
// no mienta diciendo "listo" cuando en realidad no se guardo nada.
export async function guardarNota(profileId: string, nota: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("customer_memory").insert({
    customer_id: profileId,
    categoria: "nota",
    clave: `nota_${Date.now()}`,
    valor: nota,
    origen: "dueño",
  });

  if (error) {
    throw new Error(`No se pudo guardar la nota: ${error.message}`);
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/memory.test.ts`
Expected: PASS (9/9).

- [ ] **Step 5: Lint**

Run: `npx eslint supabase/functions/whatsapp-webhook/memory.ts supabase/functions/whatsapp-webhook/memory.test.ts`
Expected: sin salida (limpio).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/whatsapp-webhook/memory.ts supabase/functions/whatsapp-webhook/memory.test.ts
git commit -m "feat: memory.ts para leer y escribir la memoria persistente de clientas"
```

---

### Task 3: `agent.ts` + `_shared/types.ts` — memoria en el prompt y en `AgentDecision`

**Files:**
- Modify: `supabase/functions/_shared/types.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.test.ts`

**Interfaces:**
- Consumes: `RecuerdoCliente`, `CLAVES_VALIDAS` de `./memory.ts` (Task 2).
- Produces (usado por la Task 4):
  - `AgentDecision.memoria?: { categoria: string; clave: string; valor: string }[]` (en `types.ts`)
  - `decidirAccion(opts: { rol: RolRemitente; nombreDueno?: "Elkin" | "Mary"; historial: {...}[]; mensajeEntrante: string; memoriaCliente?: RecuerdoCliente[] }): Promise<AgentDecision>`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `supabase/functions/whatsapp-webhook/agent.test.ts`, dentro de `describe("decidirAccion", ...)` (junto a los tests existentes de `gpt-4o`/tono, usando el mismo `fetchMock` que ya se usa en esos tests):

```ts
  it("devuelve la memoria que el modelo incluya en el JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        action: "chat",
        params: {},
        response_message: "Hola Camila",
        memoria: [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }],
      }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "me llamo Camila" });

    expect(resultado.memoria).toEqual([{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }]);
  });

  it("memoria queda undefined si el modelo no la manda", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    expect(resultado.memoria).toBeUndefined();
  });

  it("el prompt de cliente incluye lo que ya sabe de la clienta", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({
      rol: "customer",
      historial: [],
      mensajeEntrante: "hola",
      memoriaCliente: [
        { categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" },
        { categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" },
        { categoria: "nota", clave: "nota_1", valor: "es mayorista", origen: "dueño" },
      ],
    });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    expect(prompt).toContain("nombre_completo: Camila");
    expect(prompt).toContain("talla_preferida: M");
    expect(prompt).toContain("(nota de la dueña) es mayorista");
  });

  it("si no hay nombre_completo en memoria, el prompt pide preguntarlo con naturalidad", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola", memoriaCliente: [] });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    expect(prompt).toContain("No sabes el nombre de esta clienta todavía");
  });

  it("si ya hay nombre_completo en memoria, el prompt pide dirigirse a ella por su nombre y no volver a preguntarlo", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({
      rol: "customer",
      historial: [],
      mensajeEntrante: "hola",
      memoriaCliente: [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila", origen: "bot" }],
    });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    expect(prompt).toContain("Dirígete a ella por su nombre, Camila");
    expect(prompt).toContain("Nunca vuelvas a preguntarle el nombre ni la ciudad");
  });

  it("el prompt de cliente documenta el campo memoria y su vocabulario cerrado de claves", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola", memoriaCliente: [] });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    for (const clave of ["talla_preferida", "color_favorito", "ciudad_habitual", "resumen_conversacion"]) {
      expect(prompt).toContain(clave);
    }
    expect(prompt).toContain("memoria");
  });

  it("el bloque de memoria se recorta a los 20 hechos mas recientes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const memoriaCliente = Array.from({ length: 25 }, (_, i) => ({
      categoria: "nota", clave: `nota_${i}`, valor: `nota numero ${i}`, origen: "dueño",
    }));

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola", memoriaCliente });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    expect(prompt).toContain("nota numero 0");
    expect(prompt).not.toContain("nota numero 20");
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: FAIL — los 7 tests nuevos fallan (`resultado.memoria` es `undefined` cuando se esperaba el arreglo; el prompt no contiene los textos nuevos).

- [ ] **Step 3: Agregar `memoria` a `AgentDecision`**

En `supabase/functions/_shared/types.ts`, modificar:

```ts
export interface AgentDecision {
  action: string;
  params: Record<string, unknown>;
  response_message: string;
  memoria?: { categoria: string; clave: string; valor: string }[];
}
```

- [ ] **Step 4: Actualizar `agent.ts`**

Agregar el import al principio del archivo:

```ts
import type { AgentDecision, RolRemitente } from "../_shared/types.ts";
import { CLAVES_VALIDAS, type RecuerdoCliente } from "./memory.ts";
```

Agregar, antes de `function promptSistema(...)`:

```ts
const TOPE_MEMORIA = 20;

function bloqueMemoria(memoria: RecuerdoCliente[]): string {
  if (memoria.length === 0) return "";
  const lineas = memoria.slice(0, TOPE_MEMORIA).map((m) =>
    m.categoria === "nota" ? `(nota de la dueña) ${m.valor}` : `- ${m.clave}: ${m.valor}`
  );
  return `Lo que ya sabes de esta clienta:\n${lineas.join("\n")}\n`;
}

function reglaNombre(memoria: RecuerdoCliente[]): string {
  const nombre = memoria.find((m) => m.clave === "nombre_completo")?.valor;
  return nombre
    ? `Dirígete a ella por su nombre, ${nombre}, de forma natural (no en cada frase, pero que se note que la reconoces). Nunca vuelvas a preguntarle el nombre ni la ciudad. `
    : `No sabes el nombre de esta clienta todavía — pregúntaselo con naturalidad, junto con desde dónde escribe (ciudad), antes de seguir. No la interrogues: si ya te pidió algo puntual, respóndele primero y pregunta de forma natural en el mismo mensaje, no antes. `;
}

const VOCABULARIO_MEMORIA_TEXTO = CLAVES_VALIDAS.filter((c) => c !== "resumen_conversacion").join(", ");

const INSTRUCCION_MEMORIA =
  `Si la clienta menciona su nombre, de dónde escribe, su talla, un color que le encanta, una ocasión para la que compra, o cualquier dato que valga la pena recordar para la próxima vez, inclúyelo además en "memoria": un arreglo de {"categoria": "contacto"|"preferencia"|"resumen", "clave": string, "valor": string}. Usa EXACTAMENTE una de estas claves — nunca inventes otras — para "contacto"/"preferencia": ${VOCABULARIO_MEMORIA_TEXTO}. Si quieres dejar actualizado un resumen de en qué va la conversación, usa categoria "resumen" y clave fija "resumen_conversacion". Si no hay nada nuevo que recordar, omite "memoria" o mándala vacía.`;
```

Modificar la firma y el cuerpo de `promptSistema` (rol `customer`):

```ts
function promptSistema(rol: RolRemitente, nombreDueno?: "Elkin" | "Mary", memoriaCliente: RecuerdoCliente[] = []): string {
  if (rol === "owner") {
    return `Eres el asistente interno de MeryLay Boutique, hablando con ${nombreDueno}, dueño del negocio. ` +
      `Tiene acceso total de lectura y escritura sobre el negocio. ` +
      `Responde de forma cordial y natural, como lo haria una persona del equipo: cuando ${nombreDueno} te pida algo que puedas hacer, ejecutalo de verdad (nunca digas que lo harias sin hacerlo) y confirma el resultado con datos reales, no con una respuesta generica. ` +
      `${FORMATO_RESPUESTA}\n` +
      `Acciones disponibles y sus params:${ACCIONES_DUENO}`;
  }
  return bloqueMemoria(memoriaCliente) +
    reglaNombre(memoriaCliente) +
    `Eres Mery, la asesora de ventas de MeryLay Boutique ("Inspiración Femenina"), atendiendo a una clienta por WhatsApp. ` +
    `Trabaja con la actitud de una buena "appointment setter": cercana, atenta y resolutiva — nunca como un catálogo automático que solo dispara fotos sin contexto. ` +
    `Antes de decidir una acción, LEE con atención qué te escribió o qué producto le interesó, y arma un response_message que lo reconozca específicamente (nombra el producto o lo que pidió) en vez de un saludo genérico. ` +
    `Si el mensaje ya trae información suficiente para actuar (un producto puntual, una talla, "quiero ver pijamas"), ejecuta la acción correspondiente de una vez — no le hagas perder tiempo con preguntas que no necesitas, eso también aleja a la clienta. Si en cambio el pedido es muy abierto y una sola pregunta corta te ayudaría a dar una mejor recomendación (ej. "busco algo para regalar" sin más detalle), usa "chat" para preguntar ANTES de buscar — nunca más de una pregunta a la vez. ` +
    `${FORMATO_RESPUESTA}\n` +
    `Acciones disponibles y sus params:${ACCIONES_CLIENTE}\n` +
    `${INSTRUCCION_MEMORIA}\n` +
    `Los precios, nombres y stock los obtiene el sistema de la base de datos: nunca los incluyas en params ni los inventes en response_message. ` +
    `Saluda con cordialidad SOLO en el primer mensaje de la conversación; después de eso ve directo a lo que la clienta necesita, sin repetir el saludo. Mantén siempre un tono cálido y personal, acorde a "Inspiración Femenina", nunca robótico ni de plantilla. ` +
    `Sé mucho más humana y conversacional: no sueltes solo la respuesta funcional, genera conversación real — haz una pequeña observación o pregunta de seguimiento genuina cuando venga al caso (ej. si pregunta por un vestido para una ocasión, interésate por la ocasión), celebra sus gustos, y deja que se note que disfrutas ayudarla, no que estás ejecutando un guion. Usa emojis con naturalidad en cada response_message (💕🎀✨👗😊, etc. — los que calcen con lo que dice, sin forzar ni abusar) y enriquece el texto con un poco más de contenido útil (un detalle del producto, un tip de combinación, por qué te encanta esa prenda) en vez de frases cortas y secas, siempre dentro de 2-4 líneas como máximo para que se lea natural en WhatsApp, no como un párrafo largo.`;
}
```

Modificar la firma de `decidirAccion` y el armado de `mensajes`:

```ts
export async function decidirAccion(opts: {
  rol: RolRemitente;
  nombreDueno?: "Elkin" | "Mary";
  historial: { direction: "inbound" | "outbound"; message_body: string }[];
  mensajeEntrante: string;
  memoriaCliente?: RecuerdoCliente[];
}): Promise<AgentDecision> {
  const mensajes = [
    { role: "system", content: promptSistema(opts.rol, opts.nombreDueno, opts.memoriaCliente ?? []) },
    ...opts.historial.map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.message_body,
    })),
    { role: "user", content: opts.mensajeEntrante },
  ];

  try {
    const contenido = await llamarOpenAI(mensajes);
    const decision = JSON.parse(contenido) as AgentDecision;
    if (typeof decision.action !== "string" || typeof decision.response_message !== "string") {
      throw new Error("Respuesta de OpenAI sin el formato esperado.");
    }
    return {
      action: decision.action,
      params: decision.params ?? {},
      response_message: decision.response_message,
      memoria: Array.isArray(decision.memoria) ? decision.memoria : undefined,
    };
  } catch (error) {
    console.error("[agent] Error llamando a OpenAI o parseando su respuesta:", error);
    return {
      action: "error",
      params: {},
      response_message: "Disculpa, tuve un problema para procesar tu mensaje. ¿Puedes intentarlo de nuevo en un momento?",
    };
  }
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: PASS (todos, incluyendo los existentes de antes de esta tarea).

- [ ] **Step 6: Lint**

Run: `npx eslint supabase/functions/_shared/types.ts supabase/functions/whatsapp-webhook/agent.ts supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/types.ts supabase/functions/whatsapp-webhook/agent.ts supabase/functions/whatsapp-webhook/agent.test.ts
git commit -m "feat: el agente inyecta la memoria de la clienta en el prompt y devuelve hechos nuevos a recordar"
```

---

### Task 4: `handler.ts` — cargar/guardar memoria y captura automática en `confirmar_pedido`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.test.ts`

**Interfaces:**
- Consumes: `cargarMemoria`, `guardarMemoria` de `./memory.ts` (Task 2); `decidirAccion(..., memoriaCliente)` devolviendo `AgentDecision.memoria` (Task 3).
- Produces: comportamiento interno de `generarRespuesta`/`ejecutarAccionCliente` (sin nuevos exports).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir, en `supabase/functions/whatsapp-webhook/handler.test.ts`, al bloque `vi.hoisted` de `mocks` las claves `cargarMemoria: vi.fn()` y `guardarMemoria: vi.fn()`; registrar el mock del módulo nuevo junto a los demás `vi.mock`:

```ts
vi.mock("./memory.ts", () => ({
  cargarMemoria: mocks.cargarMemoria,
  guardarMemoria: mocks.guardarMemoria,
}));
```

Y en el `beforeEach` existente, junto a `mocks.cargarHistorial.mockResolvedValue([]);`, agregar:

```ts
  mocks.cargarMemoria.mockResolvedValue([]);
```

Agregar estos tests dentro de `describe("procesarMensajeEntrante", ...)`:

```ts
  it("carga la memoria de la clienta y la pasa a decidirAccion (rol customer)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem1", from: "573001234567", texto: "hola" });
    mocks.cargarMemoria.mockResolvedValue([{ categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" }]);
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola de nuevo" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).toHaveBeenCalledWith(expect.objectContaining({
      memoriaCliente: [{ categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" }],
    }));
  });

  it("no carga memoria para el rol owner", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem2", from: "573215879805", texto: "ventas de hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola Elkin" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.cargarMemoria).not.toHaveBeenCalled();
  });

  it("si decidirAccion devuelve memoria nueva, la guarda", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem3", from: "573001234567", texto: "me llamo Camila" });
    mocks.decidirAccion.mockResolvedValue({
      action: "chat",
      params: {},
      response_message: "Mucho gusto, Camila",
      memoria: [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }],
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarMemoria).toHaveBeenCalledWith("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }]);
  });

  it("si decidirAccion no devuelve memoria, no llama a guardarMemoria", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem4", from: "573001234567", texto: "hola" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarMemoria).not.toHaveBeenCalled();
  });

  it("confirmar_pedido exitoso guarda nombre/direccion/ciudad en memoria sin pasar por el modelo", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [{ productId: PRODUCTO_ID, variantId: null, imageId: null, qty: 1, unitPrice: 50000, nameSnapshot: "Pijama Rosa" }], pendingConfirmation: null },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem5", from: "573001234567", texto: "confirmo mi pedido" });
    mocks.decidirAccion.mockResolvedValue({
      action: "confirmar_pedido",
      params: { fullName: "Camila Restrepo", phone: "573001234567", address: "Calle 10 #5-20", city: "Medellín" },
      response_message: "Listo",
    });
    clienteMocks.crearPedidoWompiDesdeCarrito.mockResolvedValue({ linkPago: "https://pago.test/x", orderNumber: "ML-1" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarMemoria).toHaveBeenCalledWith("perfil-1", [
      { categoria: "contacto", clave: "nombre_completo", valor: "Camila Restrepo" },
      { categoria: "contacto", clave: "direccion_habitual", valor: "Calle 10 #5-20" },
      { categoria: "contacto", clave: "ciudad_habitual", valor: "Medellín" },
    ]);
  });

  it("un segundo confirmar_pedido con una ciudad distinta manda la ciudad NUEVA, no la vieja cacheada", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [{ productId: PRODUCTO_ID, variantId: null, imageId: null, qty: 1, unitPrice: 50000, nameSnapshot: "Pijama Rosa" }], pendingConfirmation: null },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem6", from: "573001234567", texto: "confirmo, ahora envien a Bogotá" });
    mocks.decidirAccion.mockResolvedValue({
      action: "confirmar_pedido",
      params: { fullName: "Camila Restrepo", phone: "573001234567", address: "Carrera 7 #45-10", city: "Bogotá" },
      response_message: "Listo",
    });
    clienteMocks.crearPedidoWompiDesdeCarrito.mockResolvedValue({ linkPago: "https://pago.test/y", orderNumber: "ML-2" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    // Un unico hecho "ciudad_habitual" en la llamada, con el valor nuevo -- no
    // se acumula junto al de un confirmar_pedido anterior (eso lo resuelve el
    // upsert con onConflict de guardarMemoria/la unique constraint de la
    // tabla, pero aqui se confirma que handler.ts siempre manda el dato
    // ACTUAL de params, nunca uno cacheado de una llamada previa).
    expect(mocks.guardarMemoria).toHaveBeenCalledWith("perfil-1", expect.arrayContaining([
      { categoria: "contacto", clave: "ciudad_habitual", valor: "Bogotá" },
    ]));
    expect(mocks.guardarMemoria).not.toHaveBeenCalledWith("perfil-1", expect.arrayContaining([
      expect.objectContaining({ clave: "ciudad_habitual", valor: "Medellín" }),
    ]));
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: FAIL — los 6 tests nuevos fallan (`mocks.decidirAccion`/`mocks.guardarMemoria` no reciben las llamadas esperadas; `cargarMemoria`/`guardarMemoria` aún no existen como import real en `handler.ts`, así que el mock del módulo tampoco se está usando todavía).

- [ ] **Step 3: Agregar el import en `handler.ts`**

Modificar la línea 5 (`import { obtenerOCrearSesion, guardarSesion, cargarHistorial } from "./sessions.ts";`) agregando, justo debajo:

```ts
import { cargarMemoria, guardarMemoria } from "./memory.ts";
```

- [ ] **Step 4: Cargar memoria y pasarla a `decidirAccion`, guardar la memoria nueva**

En `generarRespuesta`, reemplazar:

```ts
  const historial = await cargarHistorial(telefono, entrante.messageId);
  const decision = await decidirAccion({
    rol,
    nombreDueno: nombreDueno ?? undefined,
    historial,
    mensajeEntrante: entrante.texto,
  });

  // "chat" es una respuesta libre y "error" trae la disculpa que ya armo
  // decidirAccion: en ambos casos se usa response_message tal cual.
  if (decision.action === "chat" || decision.action === "error") {
```

por:

```ts
  const historial = await cargarHistorial(telefono, entrante.messageId);
  const memoria = rol === "customer" ? await cargarMemoria(profileId) : [];
  const decision = await decidirAccion({
    rol,
    nombreDueno: nombreDueno ?? undefined,
    historial,
    mensajeEntrante: entrante.texto,
    memoriaCliente: memoria,
  });

  // Mejor-esfuerzo: la memoria nunca debe impedir que la clienta reciba
  // respuesta (guardarMemoria ya es fail-open internamente), asi que esto
  // va ANTES del switch de acciones, no envuelto en su propio try/catch.
  if (rol === "customer" && decision.memoria && decision.memoria.length > 0) {
    await guardarMemoria(profileId, decision.memoria);
  }

  // "chat" es una respuesta libre y "error" trae la disculpa que ya armo
  // decidirAccion: en ambos casos se usa response_message tal cual.
  if (decision.action === "chat" || decision.action === "error") {
```

- [ ] **Step 5: Captura automática en `confirmar_pedido`**

En `ejecutarAccionCliente`, dentro del `case "confirmar_pedido":`, reemplazar:

```ts
      const { linkPago, orderNumber } = await crearPedidoWompiDesdeCarrito(profileId, sessionData.cart, direccion.data);
      sessionData.cart = [];
      return {
        texto: `Tu pedido ${orderNumber} quedó listo. Paga aquí para confirmarlo: ${linkPago}`,
        documentos: [],
        carrusel: null,
      };
```

por:

```ts
      const { linkPago, orderNumber } = await crearPedidoWompiDesdeCarrito(profileId, sessionData.cart, direccion.data);
      sessionData.cart = [];
      // Determinista, no depende de que el modelo transcriba bien la
      // direccion: si confirmar_pedido ya se ejecuto con exito, estos
      // cuatro datos son reales y van directo a memoria.
      await guardarMemoria(profileId, [
        { categoria: "contacto", clave: "nombre_completo", valor: direccion.data.fullName },
        { categoria: "contacto", clave: "direccion_habitual", valor: direccion.data.address },
        { categoria: "contacto", clave: "ciudad_habitual", valor: direccion.data.city },
      ]);
      return {
        texto: `Tu pedido ${orderNumber} quedó listo. Paga aquí para confirmarlo: ${linkPago}`,
        documentos: [],
        carrusel: null,
      };
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: PASS (todos, incluyendo los existentes de antes de esta tarea).

- [ ] **Step 7: Lint**

Run: `npx eslint supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: sin salida.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts
git commit -m "feat: handler.ts carga y guarda la memoria de la clienta, y memoriza la direccion al confirmar un pedido"
```

---

### Task 5: `agregar_nota_cliente` — acción de la dueña

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.ts`
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.test.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.ts`

**Interfaces:**
- Consumes: `guardarNota` de `./memory.ts` (Task 2); `escaparValorFiltro` (ya existe en `owner-actions.ts`).
- Produces: `ownerActions.agregarNotaCliente(nombreOTelefono: string, nota: string): Promise<string>`; caso `"agregar_nota_cliente"` en `ejecutarAccionLectura`; línea nueva en el bloque `ACCIONES_DUENO` de `agent.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `supabase/functions/whatsapp-webhook/owner-actions.test.ts`:

```ts
describe("agregarNotaCliente", () => {
  function mockBusqueda(filas: unknown[], error: unknown = null) {
    const limit = vi.fn(async () => ({ data: filas, error }));
    const or = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) };
    return { supabase, or, limit };
  }

  afterEach(() => {
    vi.doUnmock("./memory.ts");
    vi.resetModules();
  });

  it("si no encuentra ningun cliente, responde que no lo encontro", async () => {
    const { supabase } = mockBusqueda([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { agregarNotaCliente } = await import("./owner-actions.ts");
    const resultado = await agregarNotaCliente("Camila Noexiste", "es mayorista");

    expect(resultado).toContain("No encontré ningún cliente");
  });

  it("si hay varios clientes que coinciden, pide un dato mas exacto en vez de adivinar", async () => {
    const { supabase } = mockBusqueda([
      { id: "p1", full_name: "Camila Restrepo", username: "camila1" },
      { id: "p2", full_name: "Camila Gómez", username: "camila2" },
    ]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { agregarNotaCliente } = await import("./owner-actions.ts");
    const resultado = await agregarNotaCliente("Camila", "es mayorista");

    expect(resultado).toContain("Encontré varios clientes");
    expect(resultado).toContain("Camila Restrepo");
    expect(resultado).toContain("Camila Gómez");
  });

  it("escapa caracteres especiales del filtro igual que buscarCliente", async () => {
    const { supabase, or } = mockBusqueda([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { agregarNotaCliente } = await import("./owner-actions.ts");
    await agregarNotaCliente('a\\"b,x', "nota");

    const literal = '"%a\\\\\\"b,x%"';
    expect(or).toHaveBeenCalledWith(`full_name.ilike.${literal},username.ilike.${literal},whatsapp.ilike.${literal},phone.ilike.${literal}`);
  });

  it("con exactamente un cliente encontrado, guarda la nota y confirma con su nombre", async () => {
    vi.resetModules();
    const guardarNota = vi.fn(async () => undefined);
    vi.doMock("./memory.ts", () => ({ guardarNota }));

    const { supabase } = mockBusqueda([{ id: "p1", full_name: "Camila Restrepo", username: "camila1" }]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { agregarNotaCliente } = await import("./owner-actions.ts");
    const resultado = await agregarNotaCliente("Camila Restrepo", "es mayorista, paga con transferencia");

    expect(guardarNota).toHaveBeenCalledWith("p1", "es mayorista, paga con transferencia");
    expect(resultado).toContain("Camila Restrepo");
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: FAIL — `agregarNotaCliente` no existe todavía en `owner-actions.ts`.

- [ ] **Step 3: Implementar `agregarNotaCliente` en `owner-actions.ts`**

Agregar el import al principio del archivo:

```ts
import { guardarNota } from "./memory.ts";
```

Agregar, después de `buscarCliente`:

```ts
// La memoria se ata a customer_id -> profiles.id, asi que la resolucion
// busca SOLO en profiles (a diferencia de historialCliente, que tambien
// fusiona pos_customers): una clienta de POS sin perfil vinculado no tiene
// profiles.id y por lo tanto no puede tener memoria.
export async function agregarNotaCliente(nombreOTelefono: string, nota: string): Promise<string> {
  const supabase = getSupabase();
  const patron = escaparValorFiltro(`%${nombreOTelefono}%`);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, whatsapp, phone")
    .or(`full_name.ilike.${patron},username.ilike.${patron},whatsapp.ilike.${patron},phone.ilike.${patron}`)
    .limit(5);

  if (error) throw new Error(`No se pudo buscar el cliente: ${error.message}`);

  const filas = (data ?? []) as { id: string; full_name: string | null; username: string }[];
  if (filas.length === 0) return `No encontré ningún cliente que coincida con "${nombreOTelefono}".`;
  if (filas.length > 1) {
    const nombres = filas.map((p) => p.full_name ?? p.username);
    return `Encontré varios clientes que coinciden: ${nombres.join(", ")}. ¿Puedes darme el nombre completo o el teléfono exacto?`;
  }

  const cliente = filas[0];
  await guardarNota(cliente.id, nota);
  return `Listo, voy a recordar eso de ${cliente.full_name ?? cliente.username}.`;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: PASS (todos, incluyendo los existentes de antes de esta tarea).

- [ ] **Step 5: Conectar la acción en `handler.ts`**

En `ejecutarAccionLectura`, agregar después del `case "buscar_cliente":`:

```ts
    case "agregar_nota_cliente":
      return { texto: await ownerActions.agregarNotaCliente(params.nombreOTelefono as string, params.nota as string), fotos: [], documentos: [] };
```

- [ ] **Step 6: Documentar la acción en `agent.ts`**

En `ACCIONES_DUENO`, agregar esta línea al bloque "Lectura (se ejecutan de inmediato)", después de la línea de `informe_abonos`:

```
- agregar_nota_cliente: params {"nombreOTelefono": string, "nota": string} — guarda una nota permanente sobre un cliente puntual (ej. "es mayorista", "siempre paga tarde") para que el bot la recuerde en conversaciones futuras con esa clienta. Resuelve el cliente por nombre o teléfono, igual que buscar_cliente/historial_cliente; si hay más de uno que coincide, pide un dato más exacto en vez de adivinar.
```

- [ ] **Step 7: Correr toda la suite del proyecto**

Run: `npx vitest run`
Expected: PASS (todos los tests del proyecto, sin regresiones).

- [ ] **Step 8: Lint de todos los archivos tocados en esta tarea**

Run: `npx eslint supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/agent.ts`
Expected: sin salida.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/agent.ts
git commit -m "feat: agregar_nota_cliente para que la dueña le pida al bot recordar algo de una clienta puntual"
```

---

## Después de este plan (fuera de su alcance)

Desplegar `whatsapp-webhook` a producción vía la CLI de Supabase (`supabase functions deploy whatsapp-webhook --project-ref umnyolwszwvavwcxzyfy --import-map supabase/functions/deno.json --no-verify-jwt`) no es una tarea de este plan — es el paso operativo de siempre después de mergear, y en la sesión actual está bloqueado porque la CLI local no tiene una sesión válida para la cuenta de Supabase dueña del proyecto (pendiente de que el usuario corra `supabase login`). Una vez el código de este plan esté mergeado, ese deploy aplica igual que los anteriores.
