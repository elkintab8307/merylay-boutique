# Nueva Colección — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin marca una variante como "Nueva Colección" (dura 5 días, se apaga sola); el home muestra un overlay animado de pantalla completa con esas variantes, una vez por sesión, cuyas fotos llevan al producto.

**Architecture:** Una columna `timestamptz` guarda cuándo se activó; el estado "activo" se calcula al leer (sin cron) mediante funciones puras compartidas por el formulario admin, las acciones de guardado y el fetch del home. El overlay reutiliza el hook de carrusel táctil y el patrón de portal/cierre ya construidos para el lightbox de producto.

**Tech Stack:** Next.js App Router + React 19 + TypeScript, Supabase (Postgres/RLS vía MCP), Tailwind v4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-14-nueva-coleccion-design.md`

## Global Constraints

- Todo el texto visible en **español**.
- Sin `pg_cron` ni ningún job programado — el apagado a los 5 días se calcula al leer, nunca se escribe automáticamente.
- `DURACION_NUEVA_COLECCION_DIAS = 5` vive en un solo lugar (`src/lib/admin/nueva-coleccion.ts`) y todo lo demás lo importa — nunca se repite el número `5` en otro archivo.
- El overlay se muestra **una vez por sesión de navegador** (`sessionStorage`), solo si hay ≥1 ítem, y nunca si `items.length === 0`.
- El overlay respeta `prefers-reduced-motion` (clase `motion-reduce:animate-none`, mismo patrón que `marquesina-promocional.tsx`).
- No se agregan dependencias npm.
- El checkbox "Nueva Colección" no toca `stock` ni `vendida` — es puramente informativo/de marketing.
- Commits atómicos en español. Trabajo en el worktree `.worktrees/rediseno-backend`, rama `rediseno-backend`.
- Migraciones se aplican con el MCP de Supabase (`mcp__supabase__apply_migration`), nunca a mano.

---

## File Structure

- **Create** `supabase/migrations/052_nueva_coleccion.sql` — columna `nueva_coleccion_desde`. (Task 1)
- **Create** `src/lib/admin/nueva-coleccion.ts` — 3 funciones puras. (Task 2)
- **Create** `src/lib/admin/__tests__/nueva-coleccion.test.ts`. (Task 2)
- **Modify** `src/lib/validation/producto.ts` — `varianteSchema` gana `nuevaColeccion`. (Task 3)
- **Modify** `src/app/admin/productos/producto-form.tsx` — checkbox + texto de expiración + prop nueva. (Task 3)
- **Modify** `src/app/admin/productos/nuevo/page.tsx`, `src/components/pos/inventario-pos-modal.tsx` — variante por defecto con `nuevaColeccion: false`. (Task 3)
- **Modify** `src/app/admin/productos/__tests__/producto-form.test.tsx` — arreglar literales existentes + 2 casos nuevos. (Task 3)
- **Modify** `src/app/admin/productos/actions.ts` — `createProducto`/`updateProducto` calculan `nueva_coleccion_desde`. (Task 4)
- **Modify** `src/app/admin/productos/__tests__/actions.test.ts` — nuevo describe block. (Task 4)
- **Modify** `src/app/admin/productos/[id]/editar/page.tsx` — trae la columna y arma las dos props nuevas. (Task 5)
- **Create** `src/lib/store/fetch-nueva-coleccion.ts`. (Task 6)
- **Create** `src/lib/store/__tests__/fetch-nueva-coleccion.test.ts`. (Task 6)
- **Create** `src/components/store/nueva-coleccion-overlay.tsx`. (Task 7)
- **Create** `src/components/store/__tests__/nueva-coleccion-overlay.test.tsx`. (Task 7)
- **Modify** `src/app/globals.css` — keyframe `nueva-coleccion-in`. (Task 7)
- **Modify** `src/app/(store)/page.tsx` — fetch + montaje del overlay. (Task 8)

---

## Task 1: Migración 052 — columna `nueva_coleccion_desde`

**Files:**
- Create: `supabase/migrations/052_nueva_coleccion.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `product_variants.nueva_coleccion_desde timestamptz null`. Todas las tareas siguientes la leen/escriben.

- [ ] **Step 1: Escribir el archivo de migración**

```sql
-- Marca temporal de "Nueva Coleccion" por variante. No hay trigger de
-- apagado: una variante esta "activa" mientras
-- ahora() - nueva_coleccion_desde < 5 dias (calculado al leer, ver
-- src/lib/admin/nueva-coleccion.ts). Sin pg_cron ni jobs programados.
alter table public.product_variants
  add column nueva_coleccion_desde timestamptz null;
```

- [ ] **Step 2: Aplicar con el MCP de Supabase**

Usar `mcp__supabase__apply_migration` con `name: "nueva_coleccion"` y el contenido del Step 1.
Expected: sin error.

- [ ] **Step 3: Verificar con `mcp__supabase__execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'product_variants' and column_name = 'nueva_coleccion_desde';
```

Expected: 1 fila, `data_type = 'timestamp with time zone'`, `is_nullable = 'YES'`.

- [ ] **Step 4: Regenerar tipos (verificación)**

Usar `mcp__supabase__generate_typescript_types`. Confirmar que `product_variants.Row`/`Insert`/`Update` en el resultado incluyen `nueva_coleccion_desde: string | null`. Si `src/lib/supabase/database.types.ts` no refleja esto, actualizarlo con el resultado.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/052_nueva_coleccion.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): agrega product_variants.nueva_coleccion_desde

Marca temporal de Nueva Coleccion por variante. Sin trigger de apagado:
el estado activo/inactivo se calcula al leer (ver
src/lib/admin/nueva-coleccion.ts, siguiente tarea), no hay pg_cron ni
job programado en el proyecto."
```

(Si `database.types.ts` no cambió, quitarlo del `git add`.)

---

## Task 2: `nueva-coleccion.ts` — reglas puras de los 5 días

**Files:**
- Create: `src/lib/admin/nueva-coleccion.ts`
- Test: `src/lib/admin/__tests__/nueva-coleccion.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export const DURACION_NUEVA_COLECCION_DIAS = 5;
  export function esNuevaColeccionActiva(desde: string | null, ahora?: Date): boolean;
  export function diasDesdeExpiracion(desde: string | null, ahora?: Date): number | null;
  export function resolverNuevaColeccionDesde(actual: string | null, deseado: boolean, ahora?: Date): string | null;
  ```
  Tasks 3, 4, 5 y 6 importan estas funciones.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/admin/__tests__/nueva-coleccion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DURACION_NUEVA_COLECCION_DIAS,
  esNuevaColeccionActiva,
  diasDesdeExpiracion,
  resolverNuevaColeccionDesde,
} from "../nueva-coleccion";

const AHORA = new Date("2026-09-14T12:00:00.000Z");
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function hace(dias: number): string {
  return new Date(AHORA.getTime() - dias * MS_POR_DIA).toISOString();
}

describe("DURACION_NUEVA_COLECCION_DIAS", () => {
  it("es 5", () => {
    expect(DURACION_NUEVA_COLECCION_DIAS).toBe(5);
  });
});

describe("esNuevaColeccionActiva", () => {
  it("es false si nunca se activo (null)", () => {
    expect(esNuevaColeccionActiva(null, AHORA)).toBe(false);
  });

  it("es true recien activada", () => {
    expect(esNuevaColeccionActiva(AHORA.toISOString(), AHORA)).toBe(true);
  });

  it("es true justo antes de cumplir 5 dias", () => {
    const desde = new Date(AHORA.getTime() - 5 * MS_POR_DIA + 1000).toISOString();
    expect(esNuevaColeccionActiva(desde, AHORA)).toBe(true);
  });

  it("es false justo despues de cumplir 5 dias", () => {
    const desde = new Date(AHORA.getTime() - 5 * MS_POR_DIA - 1000).toISOString();
    expect(esNuevaColeccionActiva(desde, AHORA)).toBe(false);
  });
});

describe("diasDesdeExpiracion", () => {
  it("es null si nunca se activo", () => {
    expect(diasDesdeExpiracion(null, AHORA)).toBeNull();
  });

  it("es null si sigue activa", () => {
    expect(diasDesdeExpiracion(hace(1), AHORA)).toBeNull();
  });

  it("calcula los dias completos desde que expiro", () => {
    // activada hace 8 dias -> expiro hace 3 dias (8 - 5)
    expect(diasDesdeExpiracion(hace(8), AHORA)).toBe(3);
  });

  it("es 0 el mismo dia en que expira", () => {
    const desde = new Date(AHORA.getTime() - 5 * MS_POR_DIA - 1000).toISOString();
    expect(diasDesdeExpiracion(desde, AHORA)).toBe(0);
  });
});

describe("resolverNuevaColeccionDesde", () => {
  it("activar algo apagado guarda la fecha actual", () => {
    expect(resolverNuevaColeccionDesde(null, true, AHORA)).toBe(AHORA.toISOString());
  });

  it("activar algo que ya estaba expirado reinicia el contador", () => {
    expect(resolverNuevaColeccionDesde(hace(8), true, AHORA)).toBe(AHORA.toISOString());
  });

  it("desactivar algo activo pone null", () => {
    expect(resolverNuevaColeccionDesde(hace(1), false, AHORA)).toBeNull();
  });

  it("dejar activo sin tocar conserva la fecha original", () => {
    const original = hace(1);
    expect(resolverNuevaColeccionDesde(original, true, AHORA)).toBe(original);
  });

  it("dejar apagado/expirado sin tocar conserva la fecha original", () => {
    const original = hace(8);
    expect(resolverNuevaColeccionDesde(original, false, AHORA)).toBe(original);
  });

  it("dejar sin tocar algo que nunca se activo sigue en null", () => {
    expect(resolverNuevaColeccionDesde(null, false, AHORA)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/admin/__tests__/nueva-coleccion.test.ts`
Expected: FAIL — `Failed to resolve import "../nueva-coleccion"`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/admin/nueva-coleccion.ts`:

```ts
/**
 * Regla de "Nueva Coleccion" por variante: una variante marcada queda
 * activa 5 dias y se apaga sola. No hay trigger ni job programado -- el
 * estado activo/inactivo se calcula aqui, al leer, siempre a partir de
 * `nueva_coleccion_desde` (columna en product_variants, migracion 052).
 * Este es el UNICO lugar donde vive el numero de dias.
 */

export const DURACION_NUEVA_COLECCION_DIAS = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function esNuevaColeccionActiva(
  desde: string | null,
  ahora: Date = new Date(),
): boolean {
  if (!desde) return false;
  const transcurridoMs = ahora.getTime() - new Date(desde).getTime();
  return transcurridoMs < DURACION_NUEVA_COLECCION_DIAS * MS_POR_DIA;
}

/**
 * Dias completos desde que expiro, o null si sigue activa o nunca se
 * activo. Se usa solo para el texto informativo del admin ("expiro hace
 * N dias").
 */
export function diasDesdeExpiracion(
  desde: string | null,
  ahora: Date = new Date(),
): number | null {
  if (!desde || esNuevaColeccionActiva(desde, ahora)) return null;
  const expiroEnMs =
    new Date(desde).getTime() + DURACION_NUEVA_COLECCION_DIAS * MS_POR_DIA;
  return Math.floor((ahora.getTime() - expiroEnMs) / MS_POR_DIA);
}

/**
 * Decide que guardar al enviar el formulario de producto. `actual` es el
 * valor real en la base de datos (nunca lo que mande el cliente);
 * `deseado` es el checkbox que llego en el envio. Si no hay cambio de
 * estado activo/inactivo, conserva `actual` tal cual -- para no
 * reiniciar el contador de una variante ya activa, ni perder la fecha
 * que permite mostrar "expiro hace N dias" de una ya expirada.
 */
export function resolverNuevaColeccionDesde(
  actual: string | null,
  deseado: boolean,
  ahora: Date = new Date(),
): string | null {
  const activaActualmente = esNuevaColeccionActiva(actual, ahora);
  if (deseado && !activaActualmente) return ahora.toISOString();
  if (!deseado && activaActualmente) return null;
  return actual;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/admin/__tests__/nueva-coleccion.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/lib/admin/nueva-coleccion.ts src/lib/admin/__tests__/nueva-coleccion.test.ts`
Run: `npx tsc --noEmit 2>&1 | grep -E "nueva-coleccion" || echo "sin errores"`

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/nueva-coleccion.ts src/lib/admin/__tests__/nueva-coleccion.test.ts
git commit -m "feat: reglas puras de Nueva Coleccion (activa 5 dias, sin cron)"
```

---

## Task 3: Formulario de producto — checkbox "Nueva Colección"

**Files:**
- Modify: `src/lib/validation/producto.ts`
- Modify: `src/app/admin/productos/producto-form.tsx`
- Modify: `src/app/admin/productos/nuevo/page.tsx`
- Modify: `src/components/pos/inventario-pos-modal.tsx`
- Modify: `src/app/admin/productos/__tests__/producto-form.test.tsx`
- Modify: `src/app/admin/productos/__tests__/actions.test.ts` (solo para que siga compilando — ver Step 6)

**Interfaces:**
- Consumes: `diasDesdeExpiracion` de `@/lib/admin/nueva-coleccion` (Task 2).
- Produces: `varianteSchema` con `nuevaColeccion: boolean`; `ProductoForm` acepta la prop nueva `nuevaColeccionInfoPorVariante?: Record<string, { expiroHaceDias: number }>`. Task 5 la usa.

- [ ] **Step 1: `varianteSchema` — agregar el campo**

En `src/lib/validation/producto.ts`, dentro de `varianteSchema`:

```ts
export const varianteSchema = z
  .object({
    id: z.string().uuid().optional(),
    talla: z.string().trim().optional(),
    color: z.string().trim().optional(),
    priceOverride: z.number().min(0).nullable(),
    nuevaColeccion: z.boolean(),
  })
```

(el resto del archivo no cambia).

- [ ] **Step 2: Arreglar los 3 sitios que construyen una variante por defecto**

`src/app/admin/productos/nuevo/page.tsx`, línea 27:

```ts
          variantes: [
            { talla: "", color: "", priceOverride: null, nuevaColeccion: false },
          ],
```

`src/app/admin/productos/producto-form.tsx`, línea 100 (dentro de `handleAppendVariante`):

```ts
    append({ talla: "", color: "", priceOverride: null, nuevaColeccion: false });
```

`src/components/pos/inventario-pos-modal.tsx`, línea 240:

```ts
                    variantes: [{ talla: "", color: "", priceOverride: null, nuevaColeccion: false }],
```

- [ ] **Step 3: Escribir los tests que fallan (formulario)**

En `src/app/admin/productos/__tests__/producto-form.test.tsx`, agregar estos 2 casos dentro del `describe("ProductoForm", ...)` existente (usa `defaultValuesBase` y el patrón de mocks ya presentes en el archivo):

```tsx
  it("con una variante en Nueva Coleccion activa, el checkbox aparece marcado", () => {
    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: /nueva colección/i });
    expect(checkbox).toBeChecked();
  });

  it("muestra el texto de expiracion para una variante que ya vencio", () => {
    render(
      <ProductoForm
        defaultValues={{
          ...defaultValuesBase,
          variantes: [
            { id: "v1", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
          ],
        }}
        categoriasDisponibles={[]}
        nuevaColeccionInfoPorVariante={{ v1: { expiroHaceDias: 3 } }}
      />,
    );
    expect(screen.getByText(/expiró hace 3 días/i)).toBeInTheDocument();
  });
```

- [ ] **Step 4: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/admin/productos/__tests__/producto-form.test.tsx -t "Nueva Coleccion|expiracion"`
Expected: FAIL — no existe el checkbox "Nueva Colección" ni el texto de expiración; también falla el typecheck de la prop `nuevaColeccionInfoPorVariante` (no existe todavía en `ProductoForm`).

- [ ] **Step 5: Implementar en `producto-form.tsx`**

Agregar la prop nueva a la firma del componente (junto a `imagenesExistentes`):

```tsx
export function ProductoForm({
  productoId,
  skuActual,
  codigoBarras,
  codigoQr,
  defaultValues,
  categoriasDisponibles,
  imagenesExistentes = [],
  nuevaColeccionInfoPorVariante = {},
  onGuardado,
}: {
  productoId?: string;
  skuActual?: string;
  codigoBarras?: string;
  codigoQr?: string;
  defaultValues: ProductoInput;
  categoriasDisponibles: CategoriaOption[];
  imagenesExistentes?: ProductImage[];
  nuevaColeccionInfoPorVariante?: Record<string, { expiroHaceDias: number }>;
  onGuardado?: () => void;
}) {
```

Dentro del `fields.map((field, index) => { ... })`, justo después del `<div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">...</div>` que contiene Talla/Color/Disponibles/Quitar (el bloque termina en el `{errors.variantes?.[index]?.talla && (...)}`) y ANTES del `<div className="flex flex-col gap-2">` de "Imágenes de esta variante", insertar:

```tsx
              <label className="flex items-center gap-2 text-xs text-brand-ciruela">
                <input
                  type="checkbox"
                  {...register(`variantes.${index}.nuevaColeccion` as const)}
                />
                Nueva Colección
              </label>
              {variantId && nuevaColeccionInfoPorVariante[variantId] && (
                <p className="text-xs text-brand-ciruela/60">
                  Estuvo activo, expiró hace{" "}
                  {nuevaColeccionInfoPorVariante[variantId].expiroHaceDias} día
                  {nuevaColeccionInfoPorVariante[variantId].expiroHaceDias === 1 ? "" : "s"}.
                </p>
              )}
```

(`variantId` ya está definido más arriba en ese mismo `.map` como `const variantId = variantesWatched[index]?.id;`.)

- [ ] **Step 6: Arreglar los literales de variante en los tests existentes**

Estos archivos construyen objetos de variante que ahora deben incluir `nuevaColeccion` para seguir compilando:

`src/app/admin/productos/__tests__/producto-form.test.tsx` — en cada `variantes: [...]` que ya existe en el archivo (4 tests, 8 objetos en total, todos con la forma `{ talla: "...", color: "...", priceOverride: null }`), agregar `, nuevaColeccion: false` a cada uno.

`src/app/admin/productos/__tests__/actions.test.ts`:
- Línea ~168, el tipo de `inputBase.variantes`:
  ```ts
  variantes: [] as Array<{
    talla?: string;
    color?: string;
    priceOverride: number | null;
    nuevaColeccion: boolean;
  }>,
  ```
- Líneas ~222 y ~288, los dos literales `{ talla: "M", color: "Rosa", priceOverride: null }` → agregar `, nuevaColeccion: false`.

- [ ] **Step 7: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/admin/productos/__tests__/producto-form.test.tsx`
Expected: PASS (todos, incluidos los 2 nuevos).

Run: `npx vitest run src/app/admin/productos/__tests__/actions.test.ts`
Expected: PASS (sigue en verde; todavía no se tocó `actions.ts`, esto solo confirma que los literales ajustados no rompieron nada).

- [ ] **Step 8: Lint + typecheck**

Run: `npx eslint src/lib/validation/producto.ts src/app/admin/productos/producto-form.tsx src/app/admin/productos/nuevo/page.tsx src/components/pos/inventario-pos-modal.tsx src/app/admin/productos/__tests__/producto-form.test.tsx src/app/admin/productos/__tests__/actions.test.ts`
Run: `npx tsc --noEmit 2>&1 | grep -E "producto|inventario-pos-modal" || echo "sin errores"` (ignorar ruido preexistente no relacionado en `.next/types`, `src/app/pos/**`, `src/app/admin/informes/creditos`)

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/producto.ts src/app/admin/productos/producto-form.tsx src/app/admin/productos/nuevo/page.tsx src/components/pos/inventario-pos-modal.tsx src/app/admin/productos/__tests__/producto-form.test.tsx src/app/admin/productos/__tests__/actions.test.ts
git commit -m "feat: checkbox Nueva Coleccion por variante en el formulario de producto

Muestra si esta activa (marcado) o, si ya vencio, 'Estuvo activo,
expiro hace N dias'. Todavia no guarda nada -- eso lo hace la
siguiente tarea en actions.ts."
```

---

## Task 4: `actions.ts` — guardar/limpiar `nueva_coleccion_desde`

**Files:**
- Modify: `src/app/admin/productos/actions.ts`
- Modify: `src/app/admin/productos/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `resolverNuevaColeccionDesde` de `@/lib/admin/nueva-coleccion` (Task 2).
- Produces: nada nuevo para otras tareas.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/app/admin/productos/__tests__/actions.test.ts` un describe nuevo (usa el mismo patrón de mocks que el describe `"createProducto / updateProducto — stock segun variantes"` ya presente en ese archivo):

```ts
describe("createProducto / updateProducto — nueva coleccion", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const inputBase = {
    name: "Pijama test",
    slug: "pijama-test",
    description: "",
    categoryId: null,
    price: 10000,
    promoPrice: null,
    costPrice: null,
    stock: 9,
    isActive: true,
    isFeatured: false,
    variantes: [] as Array<{
      id?: string;
      talla?: string;
      color?: string;
      priceOverride: number | null;
      nuevaColeccion: boolean;
    }>,
  };

  function mockParaCreate() {
    const variantesInsertSpy = vi.fn(() => ({
      select: () => Promise.resolve({ data: [{ id: "v1" }], error: null }),
    }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { id: "p1" }, error: null }) }),
          }),
        };
      }
      if (tabla === "product_variants") {
        return { insert: variantesInsertSpy };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    const rpc = vi.fn(() => Promise.resolve({ data: "SKU-1", error: null }));
    return { supabase: { from, rpc }, variantesInsertSpy };
  }

  it("createProducto con el checkbox marcado guarda nueva_coleccion_desde no nulo", async () => {
    const { supabase, variantesInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto(
      {
        ...inputBase,
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true }],
      },
      [],
      [],
    );

    const payload = variantesInsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).not.toBeNull();
    expect(typeof payload[0].nueva_coleccion_desde).toBe("string");
  });

  it("createProducto con el checkbox sin marcar guarda nueva_coleccion_desde null", async () => {
    const { supabase, variantesInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto(
      {
        ...inputBase,
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false }],
      },
      [],
      [],
    );

    const payload = variantesInsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).toBeNull();
  });

  function mockParaUpdate(nuevaColeccionDesdeExistente: string | null) {
    const variantesUpsertSpy = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({ single: () => Promise.resolve({ data: { sku: "SKU-1" }, error: null }) }),
            }),
          }),
        };
      }
      if (tabla === "product_variants") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "v1", nueva_coleccion_desde: nuevaColeccionDesdeExistente }],
                error: null,
              }),
          }),
          upsert: variantesUpsertSpy,
          delete: () => ({ in: () => Promise.resolve({ error: null }) }),
        };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    return { supabase: { from, rpc: vi.fn() }, variantesUpsertSpy };
  }

  it("updateProducto: variante ya activa que se guarda sin tocar el checkbox conserva la fecha", async () => {
    const desdeExistente = "2026-09-10T00:00:00.000Z";
    const { supabase, variantesUpsertSpy } = mockParaUpdate(desdeExistente);
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto(
      "p1",
      {
        ...inputBase,
        variantes: [
          { id: "v1", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true },
        ],
      },
      [],
      [],
    );

    const payload = variantesUpsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).toBe(desdeExistente);
  });

  it("updateProducto: desmarcar una variante activa pone nueva_coleccion_desde en null", async () => {
    const { supabase, variantesUpsertSpy } = mockParaUpdate("2026-09-10T00:00:00.000Z");
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto(
      "p1",
      {
        ...inputBase,
        variantes: [
          { id: "v1", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
        ],
      },
      [],
      [],
    );

    const payload = variantesUpsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).toBeNull();
  });

  it("updateProducto: marcar una variante que estaba inactiva guarda una fecha nueva", async () => {
    const { supabase, variantesUpsertSpy } = mockParaUpdate(null);
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto(
      "p1",
      {
        ...inputBase,
        variantes: [
          { id: "v1", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true },
        ],
      },
      [],
      [],
    );

    const payload = variantesUpsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).not.toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/admin/productos/__tests__/actions.test.ts -t "nueva coleccion"`
Expected: FAIL en los 5 casos — hoy `product_variants.insert`/`upsert` no mandan `nueva_coleccion_desde`.

- [ ] **Step 3: Modificar `createProducto`**

En `src/app/admin/productos/actions.ts`, agregar el import junto a los demás:

```ts
import { resolverNuevaColeccionDesde } from "@/lib/admin/nueva-coleccion";
```

En `createProducto`, dentro del `.insert(...)` de `product_variants`, el `.map` de variantes gana un campo:

```ts
      .insert(
        parsed.data.variantes.map((variante) => ({
          product_id: producto.id,
          name: nombreVariante(variante.talla, variante.color),
          talla: variante.talla || null,
          color: variante.color || null,
          sku: generarSkuVariante(skuGenerado, variante.talla || null, variante.color || null),
          price_override: variante.priceOverride,
          nueva_coleccion_desde: resolverNuevaColeccionDesde(null, variante.nuevaColeccion),
        })),
      )
```

- [ ] **Step 4: Modificar `updateProducto`**

Ampliar el `select` de `variantesExistentes` (hoy `.select("id")`) para traer también la columna nueva:

```ts
  const { data: variantesExistentes, error: variantesExistentesError } = await supabase
    .from("product_variants")
    .select("id, nueva_coleccion_desde")
    .eq("product_id", id);
```

Justo después de calcular `idsExistentes`, construir un mapa para consultarlo por id:

```ts
  const idsExistentes = (variantesExistentes ?? []).map((v) => v.id);
  const nuevaColeccionDesdePorId = new Map(
    (variantesExistentes ?? []).map((v) => [v.id, v.nueva_coleccion_desde]),
  );
```

En el `upsert` de `actualizarItems`, agregar el campo usando el mapa:

```ts
    const { error: actualizarError } = await supabase.from("product_variants").upsert(
      actualizarItems.map((item) => ({
        id: item.id,
        product_id: id,
        name: nombreVariante(item.variante.talla, item.variante.color),
        talla: item.variante.talla || null,
        color: item.variante.color || null,
        sku: generarSkuVariante(
          productoActualizado.sku,
          item.variante.talla || null,
          item.variante.color || null,
        ),
        price_override: item.variante.priceOverride,
        nueva_coleccion_desde: resolverNuevaColeccionDesde(
          nuevaColeccionDesdePorId.get(item.id) ?? null,
          item.variante.nuevaColeccion,
        ),
      })),
      { onConflict: "id" },
    );
```

En el `insert` de `crearItems` (variantes nuevas agregadas durante la edición), agregar el mismo campo con `actual = null` (nunca existieron):

```ts
    const { data: variantesCreadas, error: crearError } = await supabase
      .from("product_variants")
      .insert(
        crearItems.map((item) => ({
          product_id: id,
          name: nombreVariante(item.variante.talla, item.variante.color),
          talla: item.variante.talla || null,
          color: item.variante.color || null,
          sku: generarSkuVariante(
            productoActualizado.sku,
            item.variante.talla || null,
            item.variante.color || null,
          ),
          price_override: item.variante.priceOverride,
          nueva_coleccion_desde: resolverNuevaColeccionDesde(null, item.variante.nuevaColeccion),
        })),
      )
      .select("id");
```

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/admin/productos/__tests__/actions.test.ts`
Expected: PASS (todos, incluidos los de stock ya existentes y los 5 nuevos).

- [ ] **Step 6: Lint + typecheck**

Run: `npx eslint src/app/admin/productos/actions.ts src/app/admin/productos/__tests__/actions.test.ts`
Run: `npx tsc --noEmit 2>&1 | grep -E "actions\.ts|actions\.test" || echo "sin errores"`

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/productos/actions.ts src/app/admin/productos/__tests__/actions.test.ts
git commit -m "feat: createProducto/updateProducto guardan nueva_coleccion_desde

Compara siempre contra el estado real en la base (nunca contra lo que
mande el formulario) usando resolverNuevaColeccionDesde: activar algo
apagado pone la fecha actual, desactivar algo activo la limpia, y
dejar algo sin tocar conserva su valor tal cual."
```

---

## Task 5: `[id]/editar/page.tsx` — traer el estado real al formulario

**Files:**
- Modify: `src/app/admin/productos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `esNuevaColeccionActiva`, `diasDesdeExpiracion` de `@/lib/admin/nueva-coleccion` (Task 2); prop `nuevaColeccionInfoPorVariante` de `ProductoForm` (Task 3).
- Produces: nada nuevo (última pieza de wiring del lado admin).

- [ ] **Step 1: Ampliar el `select` de variantes**

En `src/app/admin/productos/[id]/editar/page.tsx`, cambiar:

```ts
    supabase
      .from("product_variants")
      .select("id, talla, color, price_override, stock")
      .eq("product_id", id),
```

por:

```ts
    supabase
      .from("product_variants")
      .select("id, talla, color, price_override, stock, nueva_coleccion_desde")
      .eq("product_id", id),
```

- [ ] **Step 2: Calcular el checkbox inicial y el mapa de expiración**

Agregar el import junto a los demás:

```ts
import { esNuevaColeccionActiva, diasDesdeExpiracion } from "@/lib/admin/nueva-coleccion";
```

Antes del `return (`, agregar:

```ts
  const nuevaColeccionInfoPorVariante: Record<string, { expiroHaceDias: number }> = {};
  for (const v of variantes ?? []) {
    const dias = diasDesdeExpiracion(v.nueva_coleccion_desde);
    if (dias !== null) {
      nuevaColeccionInfoPorVariante[v.id] = { expiroHaceDias: dias };
    }
  }
```

- [ ] **Step 3: Pasar ambas cosas a `ProductoForm`**

Cambiar el mapeo de `variantes` dentro de `defaultValues` de:

```ts
          variantes: (variantes ?? []).map((v) => ({
            id: v.id,
            talla: v.talla ?? "",
            color: v.color ?? "",
            priceOverride: v.price_override,
          })),
```

a:

```ts
          variantes: (variantes ?? []).map((v) => ({
            id: v.id,
            talla: v.talla ?? "",
            color: v.color ?? "",
            priceOverride: v.price_override,
            nuevaColeccion: esNuevaColeccionActiva(v.nueva_coleccion_desde),
          })),
```

Y agregar la prop nueva al `<ProductoForm ...>` (junto a `imagenesExistentes`):

```tsx
        imagenesExistentes={imagenes ?? []}
        nuevaColeccionInfoPorVariante={nuevaColeccionInfoPorVariante}
```

- [ ] **Step 4: Typecheck + lint (no hay test unitario para este archivo — server page, mismo criterio que el resto del proyecto)**

Run: `npx tsc --noEmit 2>&1 | grep -E "\[id\]/editar" || echo "sin errores"`
Run: `npx eslint "src/app/admin/productos/[id]/editar/page.tsx"`

- [ ] **Step 5: Suite completa + build**

Run: `npx vitest run` → debe seguir en verde.
Run: `npx next build` → debe compilar (limpia `.next` primero si el build previo dejó caché stale: `rm -rf .next && npx next build`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/productos/[id]/editar/page.tsx"
git commit -m "feat: la pagina de editar producto pasa el estado real de Nueva Coleccion al formulario"
```

---

## Task 6: `fetch-nueva-coleccion.ts` — datos para el overlay del home

**Files:**
- Create: `src/lib/store/fetch-nueva-coleccion.ts`
- Test: `src/lib/store/__tests__/fetch-nueva-coleccion.test.ts`

**Interfaces:**
- Consumes: `esNuevaColeccionActiva` de `@/lib/admin/nueva-coleccion` (Task 2).
- Produces:
  ```ts
  export type NuevaColeccionItem = {
    variantId: string;
    productSlug: string;
    productName: string;
    price: number;
    promoPrice: number | null;
    imageUrl: string;
  };
  export async function fetchNuevaColeccion(
    supabase: Awaited<ReturnType<typeof createClient>>,
  ): Promise<NuevaColeccionItem[]>;
  ```
  Task 8 la usa en el home.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/store/__tests__/fetch-nueva-coleccion.test.ts` (mismo patrón de mocks que `src/lib/store/__tests__/fetch-catalog.test.ts`, ya existente en el repo):

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchNuevaColeccion } from "../fetch-nueva-coleccion";

function crearQueryBuilderMock(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = ["select", "eq", "in", "not"];
  for (const metodo of chain) {
    builder[metodo] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data, error: null });
  return builder;
}

function crearSupabaseMock(tablas: {
  product_variants?: unknown[];
  products?: unknown[];
  product_images?: unknown[];
}) {
  const builders = {
    product_variants: crearQueryBuilderMock(tablas.product_variants ?? []),
    products: crearQueryBuilderMock(tablas.products ?? []),
    product_images: crearQueryBuilderMock(tablas.product_images ?? []),
  };
  const from = vi.fn((tabla: keyof typeof builders) => builders[tabla]);
  return { from };
}

const AHORA_ISO = new Date().toISOString();
function hace(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

describe("fetchNuevaColeccion", () => {
  it("incluye una variante activa con producto activo y foto propia", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    const resultado = await fetchNuevaColeccion(supabase as never);

    expect(resultado).toEqual([
      {
        variantId: "v1",
        productSlug: "pijama-1",
        productName: "Pijama 1",
        price: 50000,
        promoPrice: null,
        imageUrl: "https://cdn.test/v1.jpg",
      },
    ]);
  });

  it("excluye variantes cuya fecha ya paso los 5 dias", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: hace(8) },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    expect(await fetchNuevaColeccion(supabase as never)).toEqual([]);
  });

  it("excluye variantes sin ninguna foto propia", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [],
    });

    expect(await fetchNuevaColeccion(supabase as never)).toEqual([]);
  });

  it("excluye variantes de productos inactivos", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: false },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    expect(await fetchNuevaColeccion(supabase as never)).toEqual([]);
  });

  it("usa price_override cuando existe", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: 42000, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    const resultado = await fetchNuevaColeccion(supabase as never);
    expect(resultado[0].price).toBe(42000);
  });

  it("respeta el tope de 12 items", async () => {
    const variantes = Array.from({ length: 15 }, (_, i) => ({
      id: `v${i}`,
      product_id: `p${i}`,
      price_override: null,
      nueva_coleccion_desde: AHORA_ISO,
    }));
    const productos = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      slug: `producto-${i}`,
      name: `Producto ${i}`,
      price: 10000,
      promo_price: null,
      is_active: true,
    }));
    const imagenes = Array.from({ length: 15 }, (_, i) => ({
      variant_id: `v${i}`,
      url: `https://cdn.test/${i}.jpg`,
      sort_order: 0,
      is_primary: true,
    }));
    const supabase = crearSupabaseMock({
      product_variants: variantes,
      products: productos,
      product_images: imagenes,
    });

    const resultado = await fetchNuevaColeccion(supabase as never);
    expect(resultado).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/store/__tests__/fetch-nueva-coleccion.test.ts`
Expected: FAIL — módulo no resuelto.

- [ ] **Step 3: Implementar**

Crear `src/lib/store/fetch-nueva-coleccion.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { esNuevaColeccionActiva } from "@/lib/admin/nueva-coleccion";

export type NuevaColeccionItem = {
  variantId: string;
  productSlug: string;
  productName: string;
  price: number;
  promoPrice: number | null;
  imageUrl: string;
};

const MAX_ITEMS_NUEVA_COLECCION = 12;

/**
 * Variantes marcadas "Nueva Coleccion" que siguen activas (dentro de los
 * 5 dias, ver src/lib/admin/nueva-coleccion.ts), de productos activos,
 * y con al menos una foto propia no vendida. Sin esa foto no hay nada
 * que animar en el overlay del home, asi que se descartan.
 */
export async function fetchNuevaColeccion(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<NuevaColeccionItem[]> {
  const { data: variantesCandidatas } = await supabase
    .from("product_variants")
    .select("id, product_id, price_override, nueva_coleccion_desde")
    .not("nueva_coleccion_desde", "is", null);

  const variantesActivas = (variantesCandidatas ?? []).filter((v) =>
    esNuevaColeccionActiva(v.nueva_coleccion_desde),
  );
  if (variantesActivas.length === 0) return [];

  const productIds = Array.from(new Set(variantesActivas.map((v) => v.product_id)));
  const { data: productos } = await supabase
    .from("products")
    .select("id, slug, name, price, promo_price, is_active")
    .eq("is_active", true)
    .in("id", productIds);
  const productoPorId = new Map((productos ?? []).map((p) => [p.id, p]));

  const variantIds = variantesActivas.map((v) => v.id);
  const { data: imagenes } = await supabase
    .from("product_images")
    .select("variant_id, url, sort_order, is_primary")
    .eq("vendida", false)
    .in("variant_id", variantIds);

  const imagenesPorVariante = new Map<
    string,
    { url: string; sortOrder: number; isPrimary: boolean }[]
  >();
  for (const img of imagenes ?? []) {
    if (!img.variant_id) continue;
    const lista = imagenesPorVariante.get(img.variant_id) ?? [];
    lista.push({ url: img.url, sortOrder: img.sort_order, isPrimary: img.is_primary });
    imagenesPorVariante.set(img.variant_id, lista);
  }

  const items: NuevaColeccionItem[] = [];
  for (const variante of variantesActivas) {
    const producto = productoPorId.get(variante.product_id);
    if (!producto) continue;

    const fotos = imagenesPorVariante.get(variante.id) ?? [];
    if (fotos.length === 0) continue;
    fotos.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

    items.push({
      variantId: variante.id,
      productSlug: producto.slug,
      productName: producto.name,
      price: variante.price_override ?? producto.price,
      promoPrice: producto.promo_price,
      imageUrl: fotos[0].url,
    });
  }

  return items.slice(0, MAX_ITEMS_NUEVA_COLECCION);
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/store/__tests__/fetch-nueva-coleccion.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/lib/store/fetch-nueva-coleccion.ts src/lib/store/__tests__/fetch-nueva-coleccion.test.ts`
Run: `npx tsc --noEmit 2>&1 | grep -E "fetch-nueva-coleccion" || echo "sin errores"`

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/fetch-nueva-coleccion.ts src/lib/store/__tests__/fetch-nueva-coleccion.test.ts
git commit -m "feat: fetchNuevaColeccion trae las variantes activas con foto para el home"
```

---

## Task 7: `NuevaColeccionOverlay` — el overlay animado

**Files:**
- Create: `src/components/store/nueva-coleccion-overlay.tsx`
- Test: `src/components/store/__tests__/nueva-coleccion-overlay.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `useCarruselTactil` (`@/lib/store/use-carrusel-tactil`, ya existe); `NuevaColeccionItem` (Task 6); `formatPrice` (`@/lib/format`); `precioEfectivo`, `calcularDescuento` (`@/lib/store/discount`).
- Produces: `export function NuevaColeccionOverlay({ items }: { items: NuevaColeccionItem[] })`. Task 8 lo monta.

- [ ] **Step 1: Agregar el keyframe a `globals.css`**

En `src/app/globals.css`, dentro del bloque `@theme inline { ... }` (junto a `--animate-caer-nieve` y `--animate-marquesina`):

```css
  --animate-nueva-coleccion-in: nueva-coleccion-in 450ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
```

Y, junto a los `@keyframes` existentes (`marquesina`, `caer-nieve`):

```css
/* Entrada con rebote del overlay de Nueva Coleccion y, con animation-delay
   escalonado, de cada tarjeta dentro del carrusel. `both` mantiene el
   estado inicial antes de que empiece el delay y el final despues. */
@keyframes nueva-coleccion-in {
  0% {
    transform: scale(0.85);
    opacity: 0;
  }
  60% {
    transform: scale(1.03);
    opacity: 1;
  }
  100% {
    transform: scale(1);
  }
}
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `src/components/store/__tests__/nueva-coleccion-overlay.test.tsx` (mismo patrón de mocks jsdom que `src/components/store/__tests__/lightbox-imagenes.test.tsx`, ya existente):

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NuevaColeccionOverlay } from "../nueva-coleccion-overlay";
import type { NuevaColeccionItem } from "@/lib/store/fetch-nueva-coleccion";

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 100 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const item = (over: Partial<NuevaColeccionItem>): NuevaColeccionItem => ({
  variantId: "v1",
  productSlug: "pijama-1",
  productName: "Pijama 1",
  price: 50000,
  promoPrice: null,
  imageUrl: "https://cdn.test/v1.jpg",
  ...over,
});

describe("NuevaColeccionOverlay", () => {
  it("sin items no renderiza nada ni toca sessionStorage", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<NuevaColeccionOverlay items={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("con items y sesion nueva, se muestra y marca sessionStorage", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sessionStorage.getItem("nueva-coleccion-vista")).toBe("1");
  });

  it("si sessionStorage ya tiene la marca, no se muestra", () => {
    sessionStorage.setItem("nueva-coleccion-vista", "1");
    render(<NuevaColeccionOverlay items={[item({})]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra con Escape", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra con el boton Cerrar", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra al tocar el fondo", () => {
    render(<NuevaColeccionOverlay items={[item({})]} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cada tarjeta enlaza al producto correcto", () => {
    render(
      <NuevaColeccionOverlay
        items={[item({ variantId: "v1", productSlug: "pijama-uno" }), item({ variantId: "v2", productSlug: "pijama-dos" })]}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/producto/pijama-uno",
      "/producto/pijama-dos",
    ]);
  });
});
```

- [ ] **Step 3: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/components/store/__tests__/nueva-coleccion-overlay.test.tsx`
Expected: FAIL — módulo no resuelto.

- [ ] **Step 4: Implementar**

Crear `src/components/store/nueva-coleccion-overlay.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { calcularDescuento, precioEfectivo } from "@/lib/store/discount";
import { useCarruselTactil } from "@/lib/store/use-carrusel-tactil";
import type { NuevaColeccionItem } from "@/lib/store/fetch-nueva-coleccion";

const CLAVE_SESSION_STORAGE = "nueva-coleccion-vista";

export function NuevaColeccionOverlay({ items }: { items: NuevaColeccionItem[] }) {
  const [mostrar, setMostrar] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  const { ref } = useCarruselTactil({ total: items.length, autoAvanceMs: 2500 });

  useEffect(() => {
    if (items.length === 0) return;
    if (sessionStorage.getItem(CLAVE_SESSION_STORAGE)) return;
    sessionStorage.setItem(CLAVE_SESSION_STORAGE, "1");
    setMostrar(true);
  }, [items.length]);

  useEffect(() => {
    if (!mostrar) return;
    cerrarRef.current?.focus();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMostrar(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", onKey);
    };
  }, [mostrar]);

  if (!mostrar || items.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva Colección"
      onClick={(e) => {
        if (e.target === e.currentTarget) setMostrar(false);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="relative w-full max-w-2xl animate-nueva-coleccion-in rounded-2xl border border-brand-oro bg-brand-crema p-6 shadow-brand-lg motion-reduce:animate-none">
        <button
          ref={cerrarRef}
          type="button"
          aria-label="Cerrar"
          onClick={() => setMostrar(false)}
          className="absolute right-3 top-3 rounded-full bg-black/10 p-2 text-brand-ciruela"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-4 text-center font-heading text-2xl bg-gradient-to-r from-brand-oro via-brand-rosa to-brand-oro bg-clip-text text-transparent">
          ✨ Nueva Colección ✨
        </h2>

        <div
          ref={ref}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => {
            const descuento = calcularDescuento(item.price, item.promoPrice);
            const precioMostrado = precioEfectivo(item.price, item.promoPrice);
            return (
              <Link
                key={item.variantId}
                href={`/producto/${item.productSlug}`}
                style={{ animationDelay: `${i * 80}ms` }}
                className="w-40 shrink-0 snap-start animate-nueva-coleccion-in rounded-xl bg-white p-2 shadow-brand-sm motion-reduce:animate-none"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-brand-rosa-claro">
                  <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="160px" />
                  <span className="absolute left-1 top-1 animate-pulse rounded-full bg-brand-rosa px-2 py-0.5 text-[10px] font-semibold text-brand-crema">
                    NUEVO
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-brand-ciruela">{item.productName}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-heading text-brand-rosa">{formatPrice(precioMostrado)}</span>
                  {descuento !== null && (
                    <span className="text-[10px] text-brand-ciruela/50 line-through">
                      {formatPrice(item.price)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/components/store/__tests__/nueva-coleccion-overlay.test.tsx`
Expected: PASS (7 tests). Si el test de "cierra al tocar el fondo" falla porque el clic cae en un hijo en vez del `div[role=dialog]` raíz, usar `fireEvent.click(screen.getByRole("dialog"))` tal cual está (dispara el evento directamente en ese nodo, `e.target === e.currentTarget` se cumple) — no requiere cambios en el componente si el test ya apunta al nodo correcto.

- [ ] **Step 6: Lint + typecheck**

Run: `npx eslint src/components/store/nueva-coleccion-overlay.tsx src/components/store/__tests__/nueva-coleccion-overlay.test.tsx src/app/globals.css`
Run: `npx tsc --noEmit 2>&1 | grep -E "nueva-coleccion-overlay" || echo "sin errores"`

- [ ] **Step 7: Commit**

```bash
git add src/components/store/nueva-coleccion-overlay.tsx src/components/store/__tests__/nueva-coleccion-overlay.test.tsx src/app/globals.css
git commit -m "feat: NuevaColeccionOverlay — ventana emergente animada con las variantes activas

Pantalla completa, entrada con rebote (panel + tarjetas en cascada),
carrusel tactil con useCarruselTactil, una vez por sesion via
sessionStorage. Cada tarjeta lleva al producto. Respeta
prefers-reduced-motion."
```

---

## Task 8: Montar el overlay en el home

**Files:**
- Modify: `src/app/(store)/page.tsx`

**Interfaces:**
- Consumes: `fetchNuevaColeccion` (Task 6), `NuevaColeccionOverlay` (Task 7).
- Produces: nada nuevo.

- [ ] **Step 1: Import y fetch**

En `src/app/(store)/page.tsx`, agregar los imports:

```ts
import { fetchNuevaColeccion } from "@/lib/store/fetch-nueva-coleccion";
import { NuevaColeccionOverlay } from "@/components/store/nueva-coleccion-overlay";
```

Agregar la consulta junto a las demás independientes (después del bloque de `carruselesCategoria`, antes de `settingsByKey`, ya que necesita `supabase` pero nada que dependa de ella):

```ts
  const nuevaColeccionItems = await fetchNuevaColeccion(supabase);
```

- [ ] **Step 2: Montar el componente**

Dentro del `<main>`, como hijo directo (no ocupa espacio en el documento — es un overlay), justo después de `<HeroSection hero={hero} />`:

```tsx
      <HeroSection hero={hero} />
      <NuevaColeccionOverlay items={nuevaColeccionItems} />
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit 2>&1 | grep -E "\(store\)/page" || echo "sin errores"`
Run: `npx eslint "src/app/(store)/page.tsx"`
Run: `rm -rf .next && npx next build` → debe compilar.

- [ ] **Step 4: Suite completa**

Run: `npx vitest run` → todo verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(store)/page.tsx"
git commit -m "feat: monta el overlay de Nueva Coleccion en el home"
```

---

## Task 9: Verificación manual en navegador

**Files:** ninguno.

- [ ] **Step 1:** En `/admin/productos/nuevo`, crear un producto con una variante y marcar "Nueva Colección". Guardar. Entrar a editarlo → el checkbox sigue marcado.
- [ ] **Step 2:** Subir al menos una foto a esa variante (si no tenía). Sin foto, la variante no debe aparecer en el overlay del home (verificarlo).
- [ ] **Step 3:** Abrir el home en una **pestaña nueva** → aparece el overlay de pantalla completa con esa variante, con la entrada animada (panel con rebote, tarjeta con insignia "NUEVO" pulsante).
- [ ] **Step 4:** Tocar la tarjeta → navega a `/producto/<slug>` de ese producto.
- [ ] **Step 5:** Volver al home en la **misma pestaña** → el overlay NO vuelve a aparecer.
- [ ] **Step 6:** Abrir el home en una pestaña **realmente nueva** (nueva sesión de navegador, o modo incógnito) → el overlay vuelve a aparecer.
- [ ] **Step 7:** Cerrar con la X, con `Esc`, y tocando el fondo — las 3 formas cierran.
- [ ] **Step 8:** Con DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce" activo, recargar en pestaña nueva → el overlay aparece sin la animación de rebote/cascada, pero el carrusel se puede deslizar igual.
- [ ] **Step 9:** En el formulario de producto, desmarcar el checkbox de una variante activa, guardar, volver a entrar a editar → queda desmarcado y sin texto de expiración (se limpió la fecha).
- [ ] **Step 10:** Verificar en la base (`mcp__supabase__execute_sql`) que una variante activada hace más de 5 días ya no aparece en el resultado de una consulta manual equivalente a `fetchNuevaColeccion`, y que el formulario de esa variante muestra "Estuvo activo, expiró hace N días".

---

## Self-Review

**Spec coverage:**
- Migración + columna → Task 1. ✓
- Funciones puras de la regla de 5 días → Task 2. ✓
- Checkbox + texto de expiración en el formulario → Task 3. ✓
- Guardado/limpieza en `actions.ts` comparando contra la base → Task 4. ✓
- Wiring de `[id]/editar/page.tsx` (única página que necesita leer el estado real) → Task 5. ✓
- `fetchNuevaColeccion` (activas, producto activo, con foto, tope 12, `price_override`) → Task 6. ✓
- `NuevaColeccionOverlay` (portal, una vez por sesión, animación con rebote/cascada, cierre X/Esc/fondo, `prefers-reduced-motion`, link al producto) → Task 7. ✓
- Montaje en el home → Task 8. ✓
- Verificación manual completa (incluye el caso de "Bolsos dama"-equivalente: sin foto no aparece) → Task 9. ✓
- Fuera de alcance (filtro de catálogo, insignia en tarjeta normal, config de días/tope, zoom/sonido, no tocar stock/vendida) → ninguna tarea lo toca. ✓

**Placeholder scan:** sin "TBD"/"agregar validación"/etc. Todo el código SQL/TS/TSX está escrito literal.

**Type consistency:** `esNuevaColeccionActiva(desde: string | null, ahora?: Date): boolean`, `diasDesdeExpiracion(...): number | null`, `resolverNuevaColeccionDesde(actual, deseado, ahora?): string | null` — definidas en Task 2, usadas con la misma firma en Tasks 3 (vía la prop `nuevaColeccionInfoPorVariante`, que en verdad no llama estas funciones sino que recibe su resultado ya calculado por Task 5), 4, 5 y 6. `NuevaColeccionItem` definido en Task 6, importado igual en Task 7. `varianteSchema.nuevaColeccion: boolean` (Task 3) es el mismo campo que lee `actions.ts` en Task 4 (`item.variante.nuevaColeccion`) y que escribe Task 5 (`esNuevaColeccionActiva(v.nueva_coleccion_desde)`).

**Gap detectado y resuelto:** el `select` de `variantesExistentes` en `updateProducto` pasa de `.select("id")` a `.select("id, nueva_coleccion_desde")` (Task 4) — esto no rompe el uso existente de `idsExistentes` (sigue siendo `.map((v) => v.id)`), solo agrega el mapa nuevo `nuevaColeccionDesdePorId`. Verificado contra el código real del archivo antes de escribir el plan.
