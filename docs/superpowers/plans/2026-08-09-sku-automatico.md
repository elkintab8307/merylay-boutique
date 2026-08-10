# SKU automático de productos y variantes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la captura manual del SKU en el formulario de
productos; se genera solo, con prefijo por categoría + secuencial para el
producto, y derivado del SKU del producto para cada variante.

**Architecture:** Una función SQL `security definer` (`generar_sku_producto`)
incrementa de forma atómica un contador por prefijo (tabla nueva
`sku_counters`) y se invoca desde `createProducto` antes de insertar el
producto. El SKU de cada variante se deriva con una función TypeScript
pura a partir del SKU ya asignado al producto y su talla/color — sin
contador propio, sin llamada a la base de datos. El SKU del producto se
asigna una sola vez, al crear; `updateProducto` nunca lo recalcula.

**Tech Stack:** Next.js Server Actions, Supabase (RPC + RLS), zod,
react-hook-form, vitest.

## Global Constraints

- Todo el producto en español (UI, mensajes de error).
- La función `generar_sku_producto` sigue el mismo patrón de autorización
  que `create_purchase`/`create_pos_sale`: `security definer`, `is_admin()`
  verificado primero con `raise exception 'No autorizado.'`, y
  `revoke ... from public, anon; grant execute ... to authenticated;`.
- El incremento del contador por prefijo debe ser atómico (usar
  `insert ... on conflict do update ... returning`, nunca un `select max()`
  seguido de un `insert` separado — eso tendría condición de carrera).
- El SKU del producto se asigna **una sola vez, al crear** — `updateProducto`
  nunca debe escribir la columna `sku` de `products`.
- El SKU de variante se recalcula en cada guardado (es función pura de
  `sku del producto + talla + color`, no de un contador) — esto es
  intencional y seguro porque nada en el sistema referencia una variante
  por su `sku` (todo usa el `id` uuid).
- El campo SKU desaparece por completo del formulario (producto y
  variantes) — no queda como input, ni oculto, ni con valor por defecto
  vacío que el usuario deba llenar.
- Nueva validación: dos variantes con la misma combinación de talla+color
  (comparadas en minúsculas, recortando espacios) se rechazan antes de
  llegar a la base de datos.

---

## Task 1: Migración SQL — contador por prefijo y función de generación

**Files:**
- Create: `supabase/migrations/020_sku_automatico.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerar con el MCP de
  Supabase después de aplicar la migración)

**Interfaces:**
- Consumes: `is_admin()` (ya existe), tabla `categories` (ya existe).
- Produces: `generar_sku_producto(p_category_id uuid) returns text`,
  invocable vía `supabase.rpc(...)` — consumida por `createProducto`
  (Task 4).

- [ ] **Step 1: Crear la migración**

```sql
create table public.sku_counters (
  prefix text primary key,
  siguiente int not null default 1
);

alter table public.sku_counters enable row level security;

-- Genera el siguiente SKU de producto: prefijo de hasta 3 letras
-- derivado del nombre de la categoria (sin tildes, solo letras;
-- "GEN" si no hay categoria o su nombre no aporta letras utilizables)
-- mas un secuencial de 6 digitos que solo sube, nunca se repite. El
-- incremento del contador usa upsert con ON CONFLICT para que dos
-- llamadas concurrentes con el mismo prefijo nunca reciban el mismo
-- numero (mismo principio de atomicidad que create_purchase).
create function public.generar_sku_producto(p_category_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre_categoria text;
  v_prefijo text;
  v_numero int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_category_id is not null then
    select name into v_nombre_categoria
    from public.categories
    where id = p_category_id;
  end if;

  v_prefijo := upper(left(
    regexp_replace(
      translate(
        coalesce(v_nombre_categoria, 'General'),
        'áéíóúÁÉÍÓÚñÑ',
        'aeiouAEIOUnN'
      ),
      '[^a-zA-Z]', '', 'g'
    ),
    3
  ));

  if v_prefijo = '' then
    v_prefijo := 'GEN';
  end if;

  insert into public.sku_counters (prefix, siguiente)
  values (v_prefijo, 1)
  on conflict (prefix) do update set siguiente = sku_counters.siguiente + 1
  returning siguiente into v_numero;

  return v_prefijo || '-' || lpad(v_numero::text, 6, '0');
end;
$$;

revoke execute on function public.generar_sku_producto(uuid) from public, anon;
grant execute on function public.generar_sku_producto(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar la migración**

Aplícala a la base de datos real con la herramienta MCP de Supabase
`apply_migration` (nombre: `sku_automatico`, con el SQL completo de
arriba).

- [ ] **Step 3: Regenerar tipos**

Usa `generate_typescript_types` del MCP de Supabase y sobrescribe
`src/lib/supabase/database.types.ts` completo con el resultado.

- [ ] **Step 4: Verificar en vivo**

Con una transacción `DO $$ ... RAISE EXCEPTION ... END $$;` que revierta
todo (sin dejar residuo), confirma: (a) llamar la función sin ser admin
falla con "No autorizado."; (b) dos llamadas seguidas con el mismo
`p_category_id` (una categoría de prueba llamada, por ejemplo, "Pijamas
de Prueba") devuelven `PIJ-000001` y luego `PIJ-000002` (números
consecutivos, sin salto); (c) una llamada con otra categoría de prueba
distinta (por ejemplo "Blusas de Prueba") devuelve `BLU-000001` — un
contador independiente, no continúa la secuencia de "PIJ"; (d) una
llamada con `p_category_id = null` devuelve un SKU con prefijo `GEN`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/020_sku_automatico.sql src/lib/supabase/database.types.ts
git commit -m "feat: migracion de SKU automatico - contador por prefijo y RPC (SKU automatico)"
```

---

## Task 2: Función pura de SKU de variante

**Files:**
- Create: `src/lib/sku.ts`
- Create: `src/lib/__tests__/sku.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `generarSkuVariante(skuProducto: string, talla: string | null, color: string | null): string`
  — consumida por `createProducto`/`updateProducto` (Task 4).

- [ ] **Step 1: Escribir los tests (deben fallar)**

```ts
import { describe, expect, it } from "vitest";
import { generarSkuVariante } from "../sku";

describe("generarSkuVariante", () => {
  it("combina talla y color cuando ambos existen", () => {
    expect(generarSkuVariante("PIJ-000001", "M", "Rosa")).toBe(
      "PIJ-000001-M-ROSA",
    );
  });

  it("usa solo la talla cuando no hay color", () => {
    expect(generarSkuVariante("PIJ-000001", "M", null)).toBe(
      "PIJ-000001-M",
    );
  });

  it("usa solo el color cuando no hay talla", () => {
    expect(generarSkuVariante("PIJ-000001", null, "Rosa")).toBe(
      "PIJ-000001-ROSA",
    );
  });

  it("normaliza tildes y espacios en el color", () => {
    expect(generarSkuVariante("PIJ-000001", null, "Azul Marino")).toBe(
      "PIJ-000001-AZUL-MARINO",
    );
  });

  it("quita tildes de la talla", () => {
    expect(generarSkuVariante("PIJ-000001", "Único", null)).toBe(
      "PIJ-000001-UNICO",
    );
  });
});
```

Run: `pnpm test src/lib/__tests__/sku.test.ts`
Expected: FAIL con "Cannot find module '../sku'".

- [ ] **Step 2: Implementar `sku.ts`**

```ts
function normalizarParteSku(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generarSkuVariante(
  skuProducto: string,
  talla: string | null,
  color: string | null,
): string {
  const partes = [talla, color]
    .filter((valor): valor is string => Boolean(valor))
    .map(normalizarParteSku)
    .filter(Boolean);
  return [skuProducto, ...partes].join("-");
}
```

Run: `pnpm test src/lib/__tests__/sku.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos (el archivo no se usa todavía en ninguna otra
parte).

- [ ] **Step 4: Commit**

```bash
git add src/lib/sku.ts src/lib/__tests__/sku.test.ts
git commit -m "feat: funcion pura de SKU de variante (SKU automatico)"
```

---

## Task 3: Schema de validación — quitar SKU, agregar validación de duplicados

**Files:**
- Modify: `src/lib/validation/producto.ts`
- Modify: `src/lib/validation/__tests__/producto.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `ProductoInput`/`VarianteInput` sin campo `sku` — consumido
  por `ProductoForm` (Task 5) y `createProducto`/`updateProducto`
  (Task 4).

- [ ] **Step 1: Reescribir `producto.ts`**

```ts
import { z } from "zod";

export const varianteSchema = z
  .object({
    talla: z.string().trim().optional(),
    color: z.string().trim().optional(),
    priceOverride: z.number().min(0).nullable(),
    stock: z.number().int().min(0),
  })
  .refine((data) => Boolean(data.talla) || Boolean(data.color), {
    message: "Ingresa talla, color, o ambos",
    path: ["talla"],
  });

export type VarianteInput = z.infer<typeof varianteSchema>;

export const productoSchema = z
  .object({
    name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
    slug: z.string().trim().min(2, "El slug debe tener al menos 2 caracteres"),
    description: z.string().trim().optional(),
    categoryId: z.string().uuid().nullable(),
    price: z.number().min(0, "El precio no puede ser negativo"),
    compareAtPrice: z.number().min(0).nullable(),
    costPrice: z.number().min(0, "El costo no puede ser negativo").nullable(),
    stock: z.number().int().min(0),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    variantes: z.array(varianteSchema),
  })
  .refine(
    (data) => {
      const combinaciones = data.variantes.map(
        (v) =>
          `${(v.talla ?? "").trim().toLowerCase()}|${(v.color ?? "").trim().toLowerCase()}`,
      );
      return new Set(combinaciones).size === combinaciones.length;
    },
    {
      message: "Ya existe una variante con esa talla y color.",
      path: ["variantes"],
    },
  );

export type ProductoInput = z.infer<typeof productoSchema>;
```

- [ ] **Step 2: Reescribir `producto.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { productoSchema, varianteSchema } from "../producto";

describe("varianteSchema", () => {
  it("acepta variante con solo talla", () => {
    expect(
      varianteSchema.safeParse({
        talla: "M",
        color: "",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(true);
  });

  it("acepta variante con solo color", () => {
    expect(
      varianteSchema.safeParse({
        talla: "",
        color: "Rosa",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(true);
  });

  it("rechaza variante sin talla ni color", () => {
    expect(
      varianteSchema.safeParse({
        talla: "",
        color: "",
        priceOverride: null,
        stock: 5,
      }).success,
    ).toBe(false);
  });
});

describe("productoSchema", () => {
  const base = {
    name: "Pijama Rosa",
    slug: "pijama-rosa",
    description: "",
    categoryId: null,
    price: 89900,
    compareAtPrice: null,
    costPrice: null,
    stock: 10,
    isActive: true,
    isFeatured: false,
    variantes: [] as const,
  };

  it("acepta un producto sin variantes", () => {
    expect(productoSchema.safeParse(base).success).toBe(true);
  });

  it("acepta un producto con variantes validas", () => {
    expect(
      productoSchema.safeParse({
        ...base,
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, stock: 3 }],
      }).success,
    ).toBe(true);
  });

  it("rechaza precio negativo", () => {
    expect(productoSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
  });

  it("rechaza dos variantes con la misma talla y color", () => {
    const result = productoSchema.safeParse({
      ...base,
      variantes: [
        { talla: "M", color: "Rosa", priceOverride: null, stock: 3 },
        { talla: "M", color: "Rosa", priceOverride: null, stock: 5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza dos variantes con la misma combinacion aunque cambien mayusculas o espacios", () => {
    const result = productoSchema.safeParse({
      ...base,
      variantes: [
        { talla: "M", color: "Rosa", priceOverride: null, stock: 3 },
        { talla: " m ", color: "ROSA", priceOverride: null, stock: 5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("acepta variantes con talla o color distintos", () => {
    const result = productoSchema.safeParse({
      ...base,
      variantes: [
        { talla: "M", color: "Rosa", priceOverride: null, stock: 3 },
        { talla: "L", color: "Rosa", priceOverride: null, stock: 5 },
      ],
    });
    expect(result.success).toBe(true);
  });
});
```

Run: `pnpm test src/lib/validation/__tests__/producto.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: fallará el build porque `producto-form.tsx` y `actions.ts`
todavía usan el campo `sku` que este schema ya no tiene — **esto es
esperado en este punto del plan**, se corrige en las Tasks 4 y 5. Si tu
entorno de ejecución exige build limpio antes de commitear, anota el
error exacto en tu reporte y continúa (no es tuyo que arreglar en esta
tarea).

- [ ] **Step 4: Commit**

```bash
git add src/lib/validation/producto.ts src/lib/validation/__tests__/producto.test.ts
git commit -m "feat: quita el campo SKU del schema y valida variantes duplicadas (SKU automatico)"
```

---

## Task 4: `createProducto`/`updateProducto` — generar y usar los SKU

**Files:**
- Modify: `src/app/admin/productos/actions.ts`

**Interfaces:**
- Consumes: `generar_sku_producto` (Task 1), `generarSkuVariante`
  (Task 2), `productoSchema` sin `sku` (Task 3).
- Produces: nada consumido por otras tasks (Task 5 no depende de la
  implementación interna de estas funciones, solo de que sigan aceptando
  `ProductoInput`).

- [ ] **Step 1: Editar `createProducto`**

Reemplaza la función completa:

```ts
export async function createProducto(
  input: ProductoInput,
  imageFiles: File[],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name));

  const { data: skuGenerado, error: skuError } = await supabase.rpc(
    "generar_sku_producto",
    { p_category_id: parsed.data.categoryId },
  );

  if (skuError || !skuGenerado) {
    return { error: "No se pudo generar el SKU del producto." };
  }

  const { data: producto, error } = await supabase
    .from("products")
    .insert({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      compare_at_price: parsed.data.compareAtPrice,
      sku: skuGenerado,
      stock: parsed.data.stock,
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .select("id")
    .single();

  if (error || !producto) {
    return { error: "No se pudo crear el producto." };
  }

  if (parsed.data.variantes.length > 0) {
    const { error: variantesError } = await supabase.from("product_variants").insert(
      parsed.data.variantes.map((variante) => ({
        product_id: producto.id,
        name: nombreVariante(variante.talla, variante.color),
        talla: variante.talla || null,
        color: variante.color || null,
        sku: generarSkuVariante(
          skuGenerado,
          variante.talla || null,
          variante.color || null,
        ),
        price_override: variante.priceOverride,
        stock: variante.stock,
      })),
    );

    if (variantesError) {
      return {
        error: "El producto se creo, pero hubo un error con las variantes.",
      };
    }
  }

  if (parsed.data.costPrice !== null) {
    const { error: costoError } = await supabase.from("product_costs").upsert({
      product_id: producto.id,
      cost_price: parsed.data.costPrice,
      updated_at: new Date().toISOString(),
    });

    if (costoError) {
      return { error: "El producto se creo, pero hubo un error al guardar el costo." };
    }
  }

  if (imageFiles.length > 0) {
    const uploadResult = await uploadProductImages(producto.id, imageFiles);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  revalidatePath("/admin/productos");
  return {};
}
```

- [ ] **Step 2: Editar `updateProducto`**

Reemplaza la función completa:

```ts
export async function updateProducto(
  id: string,
  input: ProductoInput,
  newImageFiles: File[],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), id);

  const { data: productoActualizado, error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      compare_at_price: parsed.data.compareAtPrice,
      stock: parsed.data.stock,
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .eq("id", id)
    .select("sku")
    .single();

  if (error || !productoActualizado) {
    return { error: "No se pudo actualizar el producto." };
  }

  // Nota: estrategia simple de "borrar y reinsertar" variantes. Es segura
  // mientras no existan cart_items/order_items referenciando variant_id
  // (eso ocurre a partir de la Fase 7); si en el futuro una variante ya
  // vendida se elimina aqui, el DELETE fallara por la FK sin ON DELETE
  // CASCADE en esas tablas — revisar entonces una estrategia de diff en vez
  // de reemplazo total.
  const { error: deleteVariantesError } = await supabase
    .from("product_variants")
    .delete()
    .eq("product_id", id);

  if (deleteVariantesError) {
    return {
      error:
        "El producto se actualizo, pero no se pudieron modificar las variantes porque una de ellas ya tiene compras registradas.",
    };
  }

  if (parsed.data.variantes.length > 0) {
    const { error: variantesError } = await supabase.from("product_variants").insert(
      parsed.data.variantes.map((variante) => ({
        product_id: id,
        name: nombreVariante(variante.talla, variante.color),
        talla: variante.talla || null,
        color: variante.color || null,
        sku: generarSkuVariante(
          productoActualizado.sku,
          variante.talla || null,
          variante.color || null,
        ),
        price_override: variante.priceOverride,
        stock: variante.stock,
      })),
    );

    if (variantesError) {
      return { error: "El producto se actualizo, pero hubo un error con las variantes." };
    }
  }

  if (parsed.data.costPrice !== null) {
    const { error: costoError } = await supabase.from("product_costs").upsert({
      product_id: id,
      cost_price: parsed.data.costPrice,
      updated_at: new Date().toISOString(),
    });

    if (costoError) {
      return { error: "El producto se actualizo, pero hubo un error al guardar el costo." };
    }
  }

  if (newImageFiles.length > 0) {
    const uploadResult = await uploadProductImages(id, newImageFiles);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${id}/editar`);
  return {};
}
```

- [ ] **Step 3: Agregar el import de `generarSkuVariante`**

Al inicio del archivo, junto a los demás imports:

```ts
import { generarSkuVariante } from "@/lib/sku";
```

- [ ] **Step 4: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: seguirá fallando por `producto-form.tsx` (Task 5 pendiente) —
mismo criterio que en la Task 3, anota el error y continúa. Si quieres
una señal más precisa de que `actions.ts` en sí está bien, corre
`pnpm tsc --noEmit 2>&1 | grep actions.ts` y confirma que no aparecen
errores de ese archivo específico (los errores restantes deben ser todos
de `producto-form.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/productos/actions.ts
git commit -m "feat: genera SKU de producto y variantes al guardar (SKU automatico)"
```

---

## Task 5: Formulario y páginas — quitar los inputs de SKU

**Files:**
- Modify: `src/app/admin/productos/producto-form.tsx`
- Modify: `src/app/admin/productos/nuevo/page.tsx`
- Modify: `src/app/admin/productos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `ProductoInput` sin `sku` (Task 3).
- Produces: nada consumido por otras tasks.

- [ ] **Step 1: Editar `producto-form.tsx`**

Cambia la firma de `ProductoForm` para agregar la prop `skuActual`:

```tsx
export function ProductoForm({
  productoId,
  skuActual,
  defaultValues,
  categoriasDisponibles,
  imagenesExistentes = [],
}: {
  productoId?: string;
  skuActual?: string;
  defaultValues: ProductoInput;
  categoriasDisponibles: CategoriaOption[];
  imagenesExistentes?: ProductImage[];
}) {
```

Reemplaza el bloque que hoy tiene el `grid grid-cols-2` con los inputs de
SKU y Stock (justo después del grid de precio/comparación/costo) por
esto — quita el input de SKU, deja Stock como campo suelto, y agrega la
línea de solo lectura cuando `skuActual` viene definido:

```tsx
        {skuActual && (
          <p className="text-xs text-brand-ciruela/60">
            SKU:{" "}
            <span className="font-medium text-brand-ciruela">{skuActual}</span>
          </p>
        )}
        <div>
          <label htmlFor="stock" className="text-sm text-brand-ciruela">
            Stock
          </label>
          <Input
            id="stock"
            type="number"
            {...register("stock", { valueAsNumber: true })}
          />
          {errors.stock && (
            <p className="text-sm text-red-600">{errors.stock.message}</p>
          )}
        </div>
```

En el botón "Agregar variante", quita `sku: ""` del objeto que se agrega:

```tsx
            onClick={() =>
              append({ talla: "", color: "", priceOverride: null, stock: 0 })
            }
```

Dentro de cada fila de variante, cambia `grid-cols-5` a `grid-cols-4` y
quita por completo el bloque del input de SKU:

```tsx
          <div
            key={field.id}
            className="grid grid-cols-4 items-end gap-2 rounded-md border border-brand-rosa-claro p-3"
          >
            <div>
              <label className="text-xs text-brand-ciruela">Talla</label>
              <Input {...register(`variantes.${index}.talla` as const)} />
            </div>
            <div>
              <label className="text-xs text-brand-ciruela">Color</label>
              <Input {...register(`variantes.${index}.color` as const)} />
            </div>
            <div>
              <label className="text-xs text-brand-ciruela">Stock</label>
              <Input
                type="number"
                {...register(`variantes.${index}.stock` as const, {
                  valueAsNumber: true,
                })}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => remove(index)}
              className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
            >
              Quitar
            </Button>
            {errors.variantes?.[index]?.talla && (
              <p className="col-span-4 text-sm text-red-600">
                {errors.variantes[index]?.talla?.message}
              </p>
            )}
          </div>
        ))}
        {errors.variantes?.message && (
          <p className="text-sm text-red-600">{errors.variantes.message}</p>
        )}
      </div>
```

(El `{errors.variantes?.message && (...)}` reemplaza el cierre anterior
del `</div>` de la sección de variantes — va después del `.map(...)` y
antes del `</div>` que cierra `<div className="flex flex-col gap-3">` de
esa sección; sigue el mismo patrón ya usado en `compra-form.tsx` para
`errors.items?.message`.)

- [ ] **Step 2: Editar `nuevo/page.tsx`**

Quita `sku: "",` de `defaultValues` y `sku: ""` del ítem inicial de
`variantes`:

```tsx
      <ProductoForm
        defaultValues={{
          name: "",
          slug: "",
          description: "",
          categoryId: null,
          price: 0,
          compareAtPrice: null,
          costPrice: null,
          stock: 0,
          isActive: true,
          isFeatured: false,
          variantes: [
            { talla: "", color: "", priceOverride: null, stock: 0 },
          ],
        }}
        categoriasDisponibles={categorias ?? []}
      />
```

- [ ] **Step 3: Editar `[id]/editar/page.tsx`**

Quita `sku: producto.sku,` de `defaultValues`, quita `sku: v.sku,` del
`.map()` de variantes, y agrega la prop `skuActual`:

```tsx
      <ProductoForm
        productoId={producto.id}
        skuActual={producto.sku}
        defaultValues={{
          name: producto.name,
          slug: producto.slug,
          description: producto.description ?? "",
          categoryId: producto.category_id,
          price: producto.price,
          compareAtPrice: producto.compare_at_price,
          costPrice: costo?.cost_price ?? null,
          stock: producto.stock,
          isActive: producto.is_active,
          isFeatured: producto.is_featured,
          variantes: (variantes ?? []).map((v) => ({
            talla: v.talla ?? "",
            color: v.color ?? "",
            priceOverride: v.price_override,
            stock: v.stock,
          })),
        }}
        categoriasDisponibles={categorias ?? []}
        imagenesExistentes={imagenes ?? []}
      />
```

La consulta `.select("talla, color, sku, price_override, stock")` de
variantes puede dejarse tal cual (seguir trayendo `sku` de la base no
hace daño aunque el formulario ya no lo use) o ajustarse a
`.select("talla, color, price_override, stock")` — cualquiera de las dos
es correcta; si TypeScript se queja de una propiedad no usada, quita
`sku` del `.select()`.

- [ ] **Step 4: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos — este es el primer punto del plan donde el
build debe quedar limpio de nuevo.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/productos/producto-form.tsx src/app/admin/productos/nuevo/page.tsx "src/app/admin/productos/[id]/editar/page.tsx"
git commit -m "feat: quita los inputs de SKU del formulario de productos (SKU automatico)"
```

---

## Task 6: Verificación de integración end-to-end

**Files:** ninguno nuevo (script desechable, no se commitea).

**Interfaces:**
- Consumes: todo lo construido en Tasks 1-5.

- [ ] **Step 1: Confirmar que el servidor de desarrollo está limpio**

Verificar que no hay un proceso `next dev` obsoleto (revisa el puerto
3000 en Windows con `Stop-Process` si hace falta). Si no hay ninguno,
arrancar uno limpio con `pnpm dev` en segundo plano.

- [ ] **Step 2: Verificar rutas con `curl`**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/productos/nuevo
```

Expected: redirige (307/302) hacia `/login` sin sesión.

- [ ] **Step 3: Script de verificación de negocio (`.mjs` desechable)**

Crea `scripts/tmp-verify-sku.mjs` (fuera de `src/`, para borrar al
final) que, con `dotenv` + `.env.local`, un cliente de service role para
setup/limpieza, y un cliente autenticado como `admin` real
(`signInWithPassword`) para ejercer RLS al invocar la RPC:

1. Cree un usuario de prueba `staff` (mismo patrón de fases anteriores:
   crear con el cliente admin, asignar `profiles.role = 'staff'`).
2. Con el cliente autenticado como `staff`, invoque `generar_sku_producto`
   con cualquier `p_category_id` (incluido `null`) — debe fallar con
   "No autorizado.".
3. Con el cliente autenticado como `admin`, cree dos categorías de
   prueba con nombres distintos (por ejemplo "SKU Test Uno" y "SKU Test
   Dos") y llame `generar_sku_producto` dos veces para la primera
   categoría y una vez para la segunda — confirme que las dos primeras
   llamadas devuelven números consecutivos con el mismo prefijo
   (derivado de "SKU Test Uno" → "SKU"), y que la tercera llamada
   devuelve un prefijo distinto (derivado de "SKU Test Dos" → "SKU" —
   ojo, si ambos nombres de prueba producen el mismo prefijo de 3
   letras, elige nombres de prueba que produzcan prefijos distintos,
   por ejemplo "Abrigos Prueba" y "Zapatos Prueba" → "ABR" y "ZAP").
4. Llame `generar_sku_producto` con `p_category_id = null` y confirme
   que el prefijo es "GEN".
5. Limpie las categorías de prueba, las filas de `sku_counters` que haya
   creado (identificables por los prefijos de prueba), y el usuario
   `staff` de prueba.

Run: `node scripts/tmp-verify-sku.mjs`
Expected: todos los pasos imprimen `OK`.

- [ ] **Step 4: Limpieza**

```bash
rm -f scripts/tmp-verify-sku.mjs
```

Detener el servidor de desarrollo si se levantó en el Step 1. No hay
commit en esta tarea.

- [ ] **Step 5: Nota para verificación manual**

En tu reporte final, deja anotado explícitamente que la creación real de
un producto con variantes a través del formulario (`/admin/productos/nuevo`)
no se probó de forma interactiva en navegador (sin herramienta de Chrome
disponible) — la Task 6 solo verifica la RPC de forma aislada y el
schema/función pura ya están cubiertos por tests unitarios (Tasks 2 y 3).
Recomienda al usuario crear un producto de prueba con dos variantes
desde el panel real para confirmar visualmente que el SKU aparece
correcto y que la sección de variantes ya no pide SKU.

---

## Cierre de fase

Al completar la Task 6, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta sub-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
