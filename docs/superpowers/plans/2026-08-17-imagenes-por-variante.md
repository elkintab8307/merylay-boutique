# Imágenes por variante de producto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir imágenes específicas por variante de producto (además de las generales) y sincronizar en ambos sentidos la galería de la página pública de producto con la variante seleccionada.

**Architecture:** `product_images` gana `variant_id` nullable. El admin sube imágenes por variante en el mismo formulario de creación/edición de producto (un input de archivos por fila de variante, más el general ya existente). `updateProducto` deja de borrar-y-reinsertar variantes en cada guardado (rompía la estabilidad de `variant_id`) y pasa a un diff real por `id`. En la tienda pública, un nuevo componente cliente levanta el estado talla/color que hoy vive dentro de `ProductVariantSelector`, para que `ProductGallery` y el selector se coordinen.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres/Storage/RLS vía MCP), React Hook Form + Zod, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-17-imagenes-por-variante-design.md`

## Global Constraints

- Todo el texto de UI/errores en español (CLAUDE.md sección 0).
- `bodySizeLimit` del servidor ya está en `"20mb"`
  (`next.config.ts`); `MAX_IMAGENES_MB = 15` en el cliente
  (`producto-form.tsx`) — el total combinado de TODOS los grupos de
  imágenes de un envío (generales + cada variante) debe respetar ese
  límite.
- La imagen "principal" (`is_primary`) sigue siendo una sola por
  producto, sin importar si es general o de variante — no se toca esa
  lógica.
- `/admin/**` ya está protegido por middleware — las páginas nuevas o
  modificadas bajo `/admin/productos/**` no necesitan chequeo de rol
  propio, solo `requireAdmin()` dentro de las server actions (patrón ya
  usado en `actions.ts`).
- Migraciones se aplican con el MCP de Supabase
  (`mcp__supabase__apply_migration`), no a mano.
- Tras cualquier migración, regenerar
  `src/lib/supabase/database.types.ts` con
  `mcp__supabase__generate_typescript_types`.

---

### Task 1: Migración `variant_id` en `product_images`

**Files:**
- Create: `supabase/migrations/030_imagenes_por_variante.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)

**Interfaces:**
- Produces: columna `public.product_images.variant_id uuid null`
  (FK a `public.product_variants.id`, `on delete cascade`), índice
  `idx_product_images_variant_id`. Todo el código de tareas
  posteriores que lea/escriba `product_images` asume que esta columna
  existe.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Permite asociar una imagen de producto a una variante especifica
-- (talla/color). NULL significa "imagen general": se muestra siempre,
-- independientemente de la variante seleccionada en la tienda publica.
alter table public.product_images
  add column variant_id uuid references public.product_variants(id) on delete cascade;

create index idx_product_images_variant_id on public.product_images(variant_id);
```

- [ ] **Step 2: Aplicar la migración con el MCP de Supabase**

Usa la herramienta `mcp__supabase__apply_migration` con `name:
"imagenes_por_variante"` y el contenido exacto del Step 1 como `query`.

- [ ] **Step 3: Verificar la migración**

Con `mcp__supabase__execute_sql`, ejecuta:

```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_name = 'product_images' and column_name = 'variant_id';
```

Espera una fila: `variant_id | YES | uuid`.

- [ ] **Step 4: Revisar advisors de seguridad**

Usa `mcp__supabase__get_advisors` con `type: "security"`. No debe
aparecer ningún hallazgo nuevo relacionado con `product_images` (la
columna no necesita política RLS propia — las políticas existentes ya
filtran por `product_id`).

- [ ] **Step 5: Regenerar los tipos de TypeScript**

Usa `mcp__supabase__generate_typescript_types` y reemplaza el
contenido completo de `src/lib/supabase/database.types.ts` con el
resultado.

- [ ] **Step 6: Verificar que el proyecto sigue compilando**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores (los tipos regenerados no rompen ningún uso
existente, ya que solo se agrega un campo opcional nuevo).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/030_imagenes_por_variante.sql src/lib/supabase/database.types.ts
git commit -m "feat: agrega variant_id a product_images"
```

---

### Task 2: Función pura `diffVariantes`

**Files:**
- Create: `src/lib/admin/variant-diff.ts`
- Test: `src/lib/admin/__tests__/variant-diff.test.ts`

**Interfaces:**
- Produces: `diffVariantes<T extends { id?: string }>(variantesFormulario: T[], idsExistentes: string[]): { items: VarianteDiffItem<T>[]; borrarIds: string[] }`
  donde `VarianteDiffItem<T> = { tipo: "actualizar"; index: number; id: string; variante: T } | { tipo: "crear"; index: number; variante: T }`.
  Task 3 consume esta función y estos tipos exactos.

- [ ] **Step 1: Escribir los tests que deben fallar**

Crea `src/lib/admin/__tests__/variant-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffVariantes } from "../variant-diff";

describe("diffVariantes", () => {
  it("marca como 'crear' todas las variantes sin id", () => {
    const resultado = diffVariantes(
      [{ talla: "M", color: "Rosa" }, { talla: "L", color: "Rosa" }],
      [],
    );
    expect(resultado.items).toEqual([
      { tipo: "crear", index: 0, variante: { talla: "M", color: "Rosa" } },
      { tipo: "crear", index: 1, variante: { talla: "L", color: "Rosa" } },
    ]);
    expect(resultado.borrarIds).toEqual([]);
  });

  it("marca como 'actualizar' las variantes cuyo id ya existe", () => {
    const resultado = diffVariantes(
      [{ id: "v1", talla: "M", color: "Rosa" }],
      ["v1"],
    );
    expect(resultado.items).toEqual([
      { tipo: "actualizar", index: 0, id: "v1", variante: { id: "v1", talla: "M", color: "Rosa" } },
    ]);
    expect(resultado.borrarIds).toEqual([]);
  });

  it("mezcla actualizar, crear y borrar en un mismo diff", () => {
    const resultado = diffVariantes(
      [
        { id: "v1", talla: "M", color: "Rosa" },
        { talla: "XL", color: "Rosa" },
      ],
      ["v1", "v2"],
    );
    expect(resultado.items).toEqual([
      { tipo: "actualizar", index: 0, id: "v1", variante: { id: "v1", talla: "M", color: "Rosa" } },
      { tipo: "crear", index: 1, variante: { talla: "XL", color: "Rosa" } },
    ]);
    expect(resultado.borrarIds).toEqual(["v2"]);
  });

  it("trata un id que ya no existe en la base como 'crear'", () => {
    const resultado = diffVariantes(
      [{ id: "borrado-por-fuera", talla: "M", color: "Rosa" }],
      [],
    );
    expect(resultado.items).toEqual([
      {
        tipo: "crear",
        index: 0,
        variante: { id: "borrado-por-fuera", talla: "M", color: "Rosa" },
      },
    ]);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pnpm exec vitest run src/lib/admin/__tests__/variant-diff.test.ts`
Expected: FAIL — `Cannot find module '../variant-diff'`.

- [ ] **Step 3: Implementar `diffVariantes`**

Crea `src/lib/admin/variant-diff.ts`:

```ts
export type VarianteDiffItem<T> =
  | { tipo: "actualizar"; index: number; id: string; variante: T }
  | { tipo: "crear"; index: number; variante: T };

export type DiffVariantesResult<T> = {
  items: VarianteDiffItem<T>[];
  borrarIds: string[];
};

export function diffVariantes<T extends { id?: string }>(
  variantesFormulario: T[],
  idsExistentes: string[],
): DiffVariantesResult<T> {
  const idsExistentesSet = new Set(idsExistentes);
  const idsEnviados = new Set(
    variantesFormulario
      .map((v) => v.id)
      .filter((id): id is string => Boolean(id)),
  );

  const items: VarianteDiffItem<T>[] = variantesFormulario.map((variante, index) =>
    variante.id && idsExistentesSet.has(variante.id)
      ? { tipo: "actualizar", index, id: variante.id, variante }
      : { tipo: "crear", index, variante },
  );

  const borrarIds = idsExistentes.filter((id) => !idsEnviados.has(id));

  return { items, borrarIds };
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm exec vitest run src/lib/admin/__tests__/variant-diff.test.ts`
Expected: 4 tests, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/variant-diff.ts src/lib/admin/__tests__/variant-diff.test.ts
git commit -m "feat: agrega diffVariantes para actualizar variantes por id"
```

---

### Task 3: Diff de variantes + imágenes por variante en `actions.ts`

**Files:**
- Modify: `src/lib/validation/producto.ts`
- Modify: `src/lib/admin/upload-product-images.ts`
- Modify: `src/app/admin/productos/actions.ts`

**Interfaces:**
- Consumes: `diffVariantes` de `src/lib/admin/variant-diff.ts` (Task 2).
- Produces: `createProducto(input: ProductoInput, imageFiles: File[], variantImageFiles: File[][]): Promise<{ error?: string }>`,
  `updateProducto(id: string, input: ProductoInput, newImageFiles: File[], variantImageFiles: File[][]): Promise<{ error?: string }>`,
  `uploadProductImages(productId: string, files: File[], variantId?: string | null): Promise<{ error?: string }>`.
  `variantImageFiles[i]` corresponde al mismo índice que
  `input.variantes[i]`. Task 5 (el formulario) llama a estas tres
  funciones con esta firma exacta.

- [ ] **Step 1: Agregar `id` opcional a `varianteSchema`**

En `src/lib/validation/producto.ts`, dentro de `varianteSchema`
(antes del `.refine`), agrega el campo:

```ts
export const varianteSchema = z
  .object({
    id: z.string().uuid().optional(),
    talla: z.string().trim().optional(),
    color: z.string().trim().optional(),
    priceOverride: z.number().min(0).nullable(),
    stock: z.number().int().min(0),
  })
```

(Solo se agrega la línea `id: z.string().uuid().optional(),` como
primer campo del objeto; el resto del archivo no cambia.)

- [ ] **Step 2: Agregar `variantId` a `uploadProductImages`**

En `src/lib/admin/upload-product-images.ts`, cambia la firma y el
insert:

```ts
export async function uploadProductImages(
  productId: string,
  files: File[],
  variantId: string | null = null,
): Promise<{ error?: string }> {
```

Y en el `insert` de `product_images` (dentro del `for` existente),
agrega el campo:

```ts
    const { error: insertError } = await supabase.from("product_images").insert({
      product_id: productId,
      variant_id: variantId,
      url: publicUrl,
      sort_order: sortOrder,
      is_primary: !hasPrimaryAlready && index === 0,
    });
```

El resto del archivo (cálculo de `sortOrder`/`hasPrimaryAlready`
contando TODAS las imágenes del producto, sin filtrar por variante) no
cambia.

- [ ] **Step 3: Reescribir `createProducto` para capturar los ids de variante creados**

En `src/app/admin/productos/actions.ts`, agrega el import:

```ts
import { diffVariantes } from "@/lib/admin/variant-diff";
```

Reemplaza el bloque de inserción de variantes en `createProducto`
(el `if (parsed.data.variantes.length > 0) { ... }` actual) por:

```ts
  let variantIdPorIndice: (string | null)[] = [];
  if (parsed.data.variantes.length > 0) {
    const { data: variantesCreadas, error: variantesError } = await supabase
      .from("product_variants")
      .insert(
        parsed.data.variantes.map((variante) => ({
          product_id: producto.id,
          name: nombreVariante(variante.talla, variante.color),
          talla: variante.talla || null,
          color: variante.color || null,
          sku: generarSkuVariante(skuGenerado, variante.talla || null, variante.color || null),
          price_override: variante.priceOverride,
          stock: variante.stock,
        })),
      )
      .select("id");

    if (variantesError || !variantesCreadas) {
      return {
        error: "El producto se creo, pero hubo un error con las variantes.",
      };
    }

    variantIdPorIndice = variantesCreadas.map((v) => v.id);
  }
```

Y cambia la firma de la función:

```ts
export async function createProducto(
  input: ProductoInput,
  imageFiles: File[],
  variantImageFiles: File[][],
): Promise<{ error?: string }> {
```

Reemplaza el bloque final de subida de imágenes (`if
(imageFiles.length > 0) { ... }`) por:

```ts
  if (imageFiles.length > 0) {
    const uploadResult = await uploadProductImages(producto.id, imageFiles, null);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  for (const [index, files] of variantImageFiles.entries()) {
    if (files.length === 0) continue;
    const variantId = variantIdPorIndice[index];
    if (!variantId) continue;
    const uploadResult = await uploadProductImages(producto.id, files, variantId);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }
```

- [ ] **Step 4: Reescribir `updateProducto` con el diff real**

Cambia la firma:

```ts
export async function updateProducto(
  id: string,
  input: ProductoInput,
  newImageFiles: File[],
  variantImageFiles: File[][],
): Promise<{ error?: string }> {
```

Reemplaza el bloque completo de borrado-e-reinserción de variantes
(desde el comentario `// Nota: estrategia simple de "borrar y
reinsertar"...` hasta el cierre del `if (parsed.data.variantes.length
> 0) { ... }` que las reinserta) por:

```ts
  const { data: variantesExistentes } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", id);
  const idsExistentes = (variantesExistentes ?? []).map((v) => v.id);

  const diff = diffVariantes(parsed.data.variantes, idsExistentes);

  if (diff.borrarIds.length > 0) {
    const { error: borrarError } = await supabase
      .from("product_variants")
      .delete()
      .in("id", diff.borrarIds);

    if (borrarError) {
      return {
        error:
          "El producto se actualizo, pero no se pudieron quitar una o mas variantes porque ya tienen compras registradas.",
      };
    }
  }

  const variantIdPorIndice: (string | null)[] = new Array(parsed.data.variantes.length).fill(
    null,
  );

  const actualizarItems = diff.items.filter((item) => item.tipo === "actualizar");
  const crearItems = diff.items.filter((item) => item.tipo === "crear");

  if (actualizarItems.length > 0) {
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
        stock: item.variante.stock,
      })),
      { onConflict: "id" },
    );

    if (actualizarError) {
      return { error: "El producto se actualizo, pero hubo un error con las variantes." };
    }

    for (const item of actualizarItems) {
      variantIdPorIndice[item.index] = item.id;
    }
  }

  if (crearItems.length > 0) {
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
          stock: item.variante.stock,
        })),
      )
      .select("id");

    if (crearError || !variantesCreadas) {
      return { error: "El producto se actualizo, pero hubo un error con las variantes." };
    }

    crearItems.forEach((item, i) => {
      variantIdPorIndice[item.index] = variantesCreadas[i].id;
    });
  }
```

(`item.tipo === "actualizar"`/`"crear"` en los `.filter` de arriba no
angosta el tipo de `item` automáticamente en TypeScript dentro de un
callback separado — si `tsc` marca error de tipos accediendo a
`item.id` o `item.variante`, envuelve cada `.filter` con un type guard
inline: `(item): item is Extract<typeof diff.items[number], { tipo:
"actualizar" }> => item.tipo === "actualizar"`, mismo patrón para
`"crear"`.)

Reemplaza el bloque final de subida de imágenes (`if
(newImageFiles.length > 0) { ... }`) por:

```ts
  if (newImageFiles.length > 0) {
    const uploadResult = await uploadProductImages(id, newImageFiles, null);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  for (const [index, files] of variantImageFiles.entries()) {
    if (files.length === 0) continue;
    const variantId = variantIdPorIndice[index];
    if (!variantId) continue;
    const uploadResult = await uploadProductImages(id, files, variantId);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }
```

- [ ] **Step 5: Verificar tipos y suite completa**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

Run: `pnpm test`
Expected: todos los tests existentes en verde (ningún test unitario
nuevo en este task — la lógica de partición ya está cubierta por Task
2; esta integración con Supabase se verifica manualmente en Task 5 y
Task 7 con el flujo completo en el navegador).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/producto.ts src/lib/admin/upload-product-images.ts src/app/admin/productos/actions.ts
git commit -m "feat: reemplaza el borrado-reinsercion de variantes por un diff por id"
```

---

### Task 4: Loader de edición de producto pasa `id` de variante e imágenes con `variant_id`

**Files:**
- Modify: `src/app/admin/productos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `varianteSchema` con `id` opcional (Task 3).
- Produces: `defaultValues.variantes[i].id` con el id real de cada
  variante existente; `imagenesExistentes[i].variant_id: string |
  null`. Task 5 (el formulario) depende de ambos.

- [ ] **Step 1: Seleccionar `id` de las variantes y `variant_id` de las imágenes**

En `src/app/admin/productos/[id]/editar/page.tsx`, cambia las dos
queries dentro del `Promise.all`:

```ts
    supabase
      .from("product_variants")
      .select("id, talla, color, price_override, stock")
      .eq("product_id", id),
```

```ts
    supabase
      .from("product_images")
      .select("id, url, is_primary, variant_id")
      .eq("product_id", id)
      .order("sort_order"),
```

- [ ] **Step 2: Incluir el id en `defaultValues.variantes`**

En el mapeo de `variantes` dentro de `defaultValues`, agrega el campo
`id`:

```ts
          variantes: (variantes ?? []).map((v) => ({
            id: v.id,
            talla: v.talla ?? "",
            color: v.color ?? "",
            priceOverride: v.price_override,
            stock: v.stock,
          })),
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: error esperado en este punto — `ProductoForm` (Task 5) aún
no acepta `imagenesExistentes` con `variant_id`, así que este paso
puede mostrar un error de tipos en la prop `imagenesExistentes` hasta
que Task 5 actualice `ProductImage`. Si aparece, es correcto: continúa
con Task 5 antes de intentar mergear este task de forma aislada — dado
que ambos tasks tocan tipos compartidos, verifica `tsc` de nuevo al
final de Task 5, no aquí.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/productos/[id]/editar/page.tsx
git commit -m "feat: el loader de edicion de producto incluye id de variante y variant_id de imagenes"
```

---

### Task 5: Formulario admin — imágenes por variante

**Files:**
- Modify: `src/app/admin/productos/producto-form.tsx`
- Modify: `src/app/admin/productos/__tests__/producto-form.test.tsx`

**Interfaces:**
- Consumes: `createProducto`/`updateProducto` con la firma de Task 3;
  `defaultValues.variantes[i].id` e `imagenesExistentes[i].variant_id`
  de Task 4.
- Produces: ningún otro archivo depende de `producto-form.tsx`.

- [ ] **Step 1: Actualizar el tipo `ProductImage` y añadir `useWatch`**

En `src/app/admin/productos/producto-form.tsx`, cambia el import de
react-hook-form y el tipo:

```ts
import { useForm, useFieldArray, useWatch } from "react-hook-form";
```

```ts
type ProductImage = { id: string; url: string; is_primary: boolean; variant_id: string | null };
```

- [ ] **Step 2: Agregar estado de imágenes por variante**

Después de `const [existingImages, setExistingImages] =
useState(imagenesExistentes);`, agrega:

```ts
  const [variantImageFiles, setVariantImageFiles] = useState<File[][]>(
    defaultValues.variantes.map(() => []),
  );
```

Después de la declaración de `fields`/`append`/`remove` (el resultado
de `useFieldArray`), agrega:

```ts
  const variantesWatched = useWatch({ control, name: "variantes" }) ?? [];

  const handleAppendVariante = () => {
    append({ talla: "", color: "", priceOverride: null, stock: 0 });
    setVariantImageFiles((prev) => [...prev, []]);
  };

  const handleRemoveVariante = (index: number) => {
    remove(index);
    setVariantImageFiles((prev) => prev.filter((_, i) => i !== index));
  };
```

- [ ] **Step 3: Validar el tamaño combinado en ambos tipos de input**

Reemplaza `handleImageChange` por:

```ts
  const validarTamanoTotal = (general: File[], porVariante: File[][]) => {
    const total =
      [general, ...porVariante].flat().reduce((sum, file) => sum + file.size, 0) /
      (1024 * 1024);

    if (total > MAX_IMAGENES_MB) {
      setImageSizeError(
        `Las imágenes seleccionadas pesan ${total.toFixed(1)} MB en total — el máximo es ${MAX_IMAGENES_MB} MB. Elige menos imágenes o comprímelas antes de subirlas.`,
      );
      return false;
    }
    setImageSizeError(null);
    return true;
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!validarTamanoTotal(files, variantImageFiles)) {
      setImageFiles([]);
      e.target.value = "";
      return;
    }
    setImageFiles(files);
  };

  const handleVariantImageChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const siguiente = variantImageFiles.map((f, i) => (i === index ? files : f));
    if (!validarTamanoTotal(imageFiles, siguiente)) {
      e.target.value = "";
      return;
    }
    setVariantImageFiles(siguiente);
  };
```

- [ ] **Step 4: Enviar los archivos por variante al guardar**

En `onSubmit`, cambia las dos llamadas:

```ts
      const result = productoId
        ? await updateProducto(productoId, data, imageFiles, variantImageFiles)
        : await createProducto(data, imageFiles, variantImageFiles);
```

- [ ] **Step 5: Registrar el `id` oculto de cada variante y agregar la sección de imágenes por variante**

Reemplaza el bloque `{fields.map((field, index) => ( ... ))}` completo
(dentro de la sección "Variantes") por:

```tsx
        {fields.map((field, index) => {
          const variantId = variantesWatched[index]?.id;
          const imagenesDeVariante = variantId
            ? existingImages.filter((img) => img.variant_id === variantId)
            : [];

          return (
            <div
              key={field.id}
              className="flex flex-col gap-3 rounded-md border border-brand-rosa-claro p-3"
            >
              <input
                type="hidden"
                {...register(`variantes.${index}.id` as const, {
                  setValueAs: (v) => (v === "" ? undefined : v),
                })}
              />
              <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
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
                  onClick={() => handleRemoveVariante(index)}
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
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={`variant-images-${index}`}
                  className="text-xs text-brand-ciruela"
                >
                  Imágenes de esta variante
                </label>
                {imagenesDeVariante.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {imagenesDeVariante.map((image) => (
                      <div key={image.id} className="flex flex-col items-center gap-1">
                        <Image
                          src={image.url}
                          alt=""
                          width={80}
                          height={80}
                          className="h-20 w-20 rounded-md border border-brand-rosa-claro object-cover"
                        />
                        <span className="text-xs text-brand-ciruela">
                          {image.is_primary ? "Principal" : ""}
                        </span>
                        <div className="flex gap-2 text-xs">
                          {!image.is_primary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(image.id)}
                              className="text-brand-rosa hover:underline"
                            >
                              Marcar principal
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(image.id)}
                            className="text-red-600 hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  id={`variant-images-${index}`}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleVariantImageChange(index, e)}
                />
              </div>
            </div>
          );
        })}
```

Y en el botón "Agregar variante" (arriba del `.map`), cambia el
`onClick`:

```tsx
          <Button
            type="button"
            variant="outline"
            onClick={handleAppendVariante}
            className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
          >
            Agregar variante
          </Button>
```

- [ ] **Step 6: Renombrar la sección general y filtrar por `variant_id === null`**

En la sección "Imágenes" (fuera del bloque de variantes), cambia el
título y el filtro:

```tsx
        <h2 className="font-heading text-lg text-brand-ciruela">Imágenes generales</h2>
        {existingImages.filter((img) => img.variant_id === null).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {existingImages
              .filter((img) => img.variant_id === null)
              .map((image) => (
```

(El resto del `.map` — el `<Image>`, botones Marcar principal/Eliminar
— no cambia, solo se envuelve con el filtro anterior en vez de iterar
`existingImages` directo. Cierra el `.map(...)` y el `div` igual que
hoy.)

- [ ] **Step 7: Escribir el test de alineación de índices**

Agrega a `src/app/admin/productos/__tests__/producto-form.test.tsx`:

```tsx
  it("envia las imagenes de cada variante en el indice correcto al guardar", async () => {
    const { createProducto } = await import("../actions");
    vi.mocked(createProducto).mockResolvedValue({});

    render(
      <ProductoForm
        defaultValues={{
          name: "Pijama de prueba",
          slug: "pijama-de-prueba",
          description: "",
          categoryId: null,
          price: 10000,
          compareAtPrice: null,
          costPrice: null,
          stock: 5,
          isActive: true,
          isFeatured: false,
          variantes: [
            { talla: "M", color: "Rosa", priceOverride: null, stock: 1 },
            { talla: "L", color: "Rosa", priceOverride: null, stock: 2 },
          ],
        }}
        categoriasDisponibles={[]}
      />,
    );

    const inputsDeVariante = screen.getAllByLabelText(/imágenes de esta variante/i);
    const archivoVarianteL = new File(["contenido"], "variante-l.jpg", { type: "image/jpeg" });
    fireEvent.change(inputsDeVariante[1], { target: { files: [archivoVarianteL] } });

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(createProducto).toHaveBeenCalled();
    });

    const llamada = vi.mocked(createProducto).mock.calls[0];
    const variantImageFilesArg = llamada[2];
    expect(variantImageFilesArg[0]).toEqual([]);
    expect(variantImageFilesArg[1]).toEqual([archivoVarianteL]);
  });
```

- [ ] **Step 8: Correr los tests**

Run: `pnpm exec vitest run src/app/admin/productos/__tests__/producto-form.test.tsx`
Expected: 2 tests, PASS (el existente + el nuevo).

- [ ] **Step 9: Verificar tipos y build completo**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores (esto también confirma que Task 4 quedó
correctamente tipado ahora que `ProductImage` incluye `variant_id`).

Run: `pnpm test`
Expected: toda la suite en verde.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/productos/producto-form.tsx src/app/admin/productos/__tests__/producto-form.test.tsx
git commit -m "feat: permite subir imagenes por variante al crear o editar un producto"
```

---

### Task 6: Función pura `getImagesForVariant`

**Files:**
- Create: `src/lib/store/variant-images.ts`
- Test: `src/lib/store/__tests__/variant-images.test.ts`

**Interfaces:**
- Produces: `type ImagenProducto = { url: string; alt: string | null; variantId: string | null }`,
  `getImagesForVariant(images: ImagenProducto[], variantId: string | null): ImagenProducto[]`.
  Task 7 consume ambos.

- [ ] **Step 1: Escribir los tests que deben fallar**

Crea `src/lib/store/__tests__/variant-images.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getImagesForVariant, type ImagenProducto } from "../variant-images";

const generales: ImagenProducto[] = [
  { url: "general-1.jpg", alt: null, variantId: null },
  { url: "general-2.jpg", alt: null, variantId: null },
];
const deM: ImagenProducto[] = [{ url: "m-1.jpg", alt: null, variantId: "v-m" }];
const deL: ImagenProducto[] = [{ url: "l-1.jpg", alt: null, variantId: "v-l" }];
const todas = [...generales, ...deM, ...deL];

describe("getImagesForVariant", () => {
  it("muestra las imagenes de la variante primero, luego las generales", () => {
    expect(getImagesForVariant(todas, "v-m")).toEqual([...deM, ...generales]);
  });

  it("muestra solo las generales si la variante no tiene imagenes propias", () => {
    expect(getImagesForVariant(generales, "v-sin-fotos")).toEqual(generales);
  });

  it("muestra solo las generales si no hay variante seleccionada", () => {
    expect(getImagesForVariant(todas, null)).toEqual(generales);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pnpm exec vitest run src/lib/store/__tests__/variant-images.test.ts`
Expected: FAIL — `Cannot find module '../variant-images'`.

- [ ] **Step 3: Implementar `getImagesForVariant`**

Crea `src/lib/store/variant-images.ts`:

```ts
export type ImagenProducto = {
  url: string;
  alt: string | null;
  variantId: string | null;
};

export function getImagesForVariant(
  images: ImagenProducto[],
  variantId: string | null,
): ImagenProducto[] {
  const deVariante = variantId ? images.filter((img) => img.variantId === variantId) : [];
  const generales = images.filter((img) => img.variantId === null);
  return [...deVariante, ...generales];
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm exec vitest run src/lib/store/__tests__/variant-images.test.ts`
Expected: 3 tests, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/variant-images.ts src/lib/store/__tests__/variant-images.test.ts
git commit -m "feat: agrega getImagesForVariant para la galeria de la tienda publica"
```

---

### Task 7: Sincronizar galería y selector de variante en la tienda pública

**Files:**
- Modify: `src/app/(store)/producto/[slug]/product-gallery.tsx`
- Modify: `src/app/(store)/producto/[slug]/product-variant-selector.tsx`
- Create: `src/app/(store)/producto/[slug]/product-detail-interactive.tsx`
- Modify: `src/app/(store)/producto/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getImagesForVariant`/`ImagenProducto` de Task 6;
  `findMatchingVariant`/`VariantOption` de `src/lib/store/variants.ts`
  (sin cambios).
- Produces: ningún otro archivo depende de estos.

- [ ] **Step 1: `ProductGallery` acepta `variantId` por imagen y notifica selección**

Reemplaza el contenido completo de
`src/app/(store)/producto/[slug]/product-gallery.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export function ProductGallery({
  images,
  productName,
  selectedVariantId = null,
  onSelectVariant,
}: {
  images: { url: string; alt: string | null; variantId: string | null }[];
  productName: string;
  selectedVariantId?: string | null;
  onSelectVariant?: (variantId: string | null) => void;
}) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [selectedVariantId]);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-brand-rosa-claro text-brand-ciruela/50">
        Sin imagen
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-brand-rosa-claro">
        <Image
          src={images[selected].url}
          alt={images[selected].alt ?? productName}
          fill
          className="object-contain"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-script text-2xl text-brand-crema drop-shadow-[0_1px_3px_rgba(110,42,68,0.6)]">
          MeryLay
        </span>
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => {
                setSelected(index);
                onSelectVariant?.(image.variantId);
              }}
              className={`relative h-16 w-16 overflow-hidden rounded-md border ${
                index === selected ? "border-brand-rosa" : "border-brand-rosa-claro"
              }`}
            >
              <Image
                src={image.url}
                alt={image.alt ?? productName}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `ProductVariantSelector` recibe talla/color como props controladas**

Reemplaza el contenido completo de
`src/app/(store)/producto/[slug]/product-variant-selector.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getVariantOptions,
  findMatchingVariant,
  type VariantOption,
} from "@/lib/store/variants";
import { getLocalCart, saveLocalCart, mergeCartItem, type LocalCartItem } from "@/lib/cart/local-cart";
import { addToCart } from "@/app/(store)/carrito/actions";

export function ProductVariantSelector({
  productId,
  productSlug,
  productName,
  imageUrl,
  basePrice,
  variants,
  baseStock,
  currentUserId,
  talla,
  color,
  onTallaChange,
  onColorChange,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  basePrice: number;
  variants: VariantOption[];
  baseStock: number;
  currentUserId: string | null;
  talla: string | null;
  color: string | null;
  onTallaChange: (talla: string | null) => void;
  onColorChange: (color: string | null) => void;
}) {
  const { tallas, colores } = useMemo(() => getVariantOptions(variants), [variants]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasVariants = variants.length > 0;
  const variantSeleccionada = hasVariants
    ? findMatchingVariant(variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : baseStock;
  const agotado = stockDisponible <= 0;
  const unitPrice = variantSeleccionada?.priceOverride ?? basePrice;
  const variantLabel = [talla, color].filter(Boolean).join(" / ");
  const displayName = hasVariants && variantLabel ? `${productName} (${variantLabel})` : productName;

  const handleAddToCart = () => {
    setMessage(null);
    const item: LocalCartItem = {
      productId,
      variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
      slug: productSlug,
      name: displayName,
      unitPrice,
      qty: 1,
      imageUrl,
      stock: stockDisponible,
    };

    if (currentUserId) {
      startTransition(async () => {
        const result = await addToCart(item.productId, item.variantId, 1, item.unitPrice);
        setMessage(result?.error ?? "Agregado al carrito.");
      });
    } else {
      const current = getLocalCart();
      saveLocalCart(mergeCartItem(current, item));
      setMessage("Agregado al carrito.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {tallas.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Talla</label>
          <select
            value={talla ?? ""}
            onChange={(e) => onTallaChange(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {tallas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      {colores.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Color</label>
          <select
            value={color ?? ""}
            onChange={(e) => onColorChange(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {colores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-sm text-brand-ciruela/70">
        {agotado ? "Agotado" : `Stock disponible: ${stockDisponible}`}
      </p>

      <Button
        type="button"
        disabled={agotado || isPending}
        onClick={handleAddToCart}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
      >
        {isPending ? "Agregando..." : "Agregar al carrito"}
      </Button>
      {message && <p className="text-sm text-brand-oro">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Crear el componente que coordina galería y selector**

Crea `src/app/(store)/producto/[slug]/product-detail-interactive.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Truck, ShieldCheck, RefreshCw } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";
import { FavoriteButton } from "@/components/store/favorite-button";
import { findMatchingVariant, type VariantOption } from "@/lib/store/variants";
import { getImagesForVariant, type ImagenProducto } from "@/lib/store/variant-images";

export function ProductDetailInteractive({
  productId,
  productSlug,
  productName,
  description,
  price,
  compareAtPrice,
  images,
  variants,
  baseStock,
  currentUserId,
  initialFavorite,
  imagenPrincipal,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  images: ImagenProducto[];
  variants: VariantOption[];
  baseStock: number;
  currentUserId: string | null;
  initialFavorite: boolean;
  imagenPrincipal: string | null;
}) {
  const [talla, setTalla] = useState<string | null>(variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(variants[0]?.color ?? null);

  const variantSeleccionada =
    variants.length > 0 ? findMatchingVariant(variants, talla, color) : null;
  const imagenesGaleria = getImagesForVariant(images, variantSeleccionada?.id ?? null);

  const handleSelectVariant = (variantId: string | null) => {
    if (!variantId) return;
    const variante = variants.find((v) => v.id === variantId);
    if (!variante) return;
    setTalla(variante.talla);
    setColor(variante.color);
  };

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <ProductGallery
        images={imagenesGaleria}
        productName={productName}
        selectedVariantId={variantSeleccionada?.id ?? null}
        onSelectVariant={handleSelectVariant}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-heading text-3xl text-brand-ciruela">{productName}</h1>
          <FavoriteButton
            productId={productId}
            currentUserId={currentUserId}
            initialFavorite={initialFavorite}
            product={{
              slug: productSlug,
              name: productName,
              price,
              imageUrl: imagenPrincipal,
            }}
          />
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-2xl text-brand-rosa">{formatPrice(price)}</span>
          {compareAtPrice !== null && compareAtPrice > price && (
            <span className="text-brand-ciruela/50 line-through">
              {formatPrice(compareAtPrice)}
            </span>
          )}
        </div>
        {description && <p className="text-brand-ciruela/80">{description}</p>}
        <ProductVariantSelector
          productId={productId}
          productSlug={productSlug}
          productName={productName}
          imageUrl={imagenPrincipal}
          basePrice={price}
          variants={variants}
          baseStock={baseStock}
          currentUserId={currentUserId}
          talla={talla}
          color={color}
          onTallaChange={setTalla}
          onColorChange={setColor}
        />
        <div className="flex flex-wrap items-center gap-4 border-t border-brand-rosa-claro pt-4 text-xs text-brand-ciruela/70">
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-brand-rosa" />
            Envío a toda Colombia
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-brand-rosa" />
            Pago seguro
          </span>
          <span className="flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4 text-brand-rosa" />
            Cambios y devoluciones
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx` usa el nuevo componente**

En `src/app/(store)/producto/[slug]/page.tsx`:

Cambia el select de imágenes:

```ts
    supabase
      .from("product_images")
      .select("url, alt, variant_id")
      .eq("product_id", producto.id)
      .order("sort_order"),
```

Reemplaza los imports de `ProductGallery`, `ProductVariantSelector`,
`FavoriteButton` y los iconos `Truck, ShieldCheck, RefreshCw` (ya no se
usan directamente en este archivo) por:

```ts
import { ProductDetailInteractive } from "./product-detail-interactive";
import type { ImagenProducto } from "@/lib/store/variant-images";
```

(Deja intactos los demás imports: `notFound`, `createClient`,
`formatPrice`, `Breadcrumbs`, `RelatedProducts`, `ProductCardData`.)

Antes del `return`, agrega el mapeo de imágenes:

```ts
  const imagenesGaleria: ImagenProducto[] = (imagenes ?? []).map((img) => ({
    url: img.url,
    alt: img.alt,
    variantId: img.variant_id,
  }));
```

Reemplaza el bloque `<div className="grid gap-10 md:grid-cols-2">
... </div>` completo (todo lo que hoy contiene `ProductGallery` y la
columna de nombre/precio/`ProductVariantSelector`/envío) por:

```tsx
      <ProductDetailInteractive
        productId={producto.id}
        productSlug={producto.slug}
        productName={producto.name}
        description={producto.description}
        price={producto.price}
        compareAtPrice={producto.compare_at_price}
        images={imagenesGaleria}
        variants={variantesMapeadas}
        baseStock={producto.stock}
        currentUserId={user?.id ?? null}
        initialFavorite={Boolean(favorito)}
        imagenPrincipal={imagenPrincipal}
      />
```

El resto de `page.tsx` (breadcrumbs, cálculo de `relacionados`,
`RelatedProducts` al final) no cambia.

- [ ] **Step 5: Verificar tipos, lint y suite completa**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

Run: `pnpm test`
Expected: toda la suite en verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(store\)/producto/\[slug\]/product-gallery.tsx src/app/\(store\)/producto/\[slug\]/product-variant-selector.tsx src/app/\(store\)/producto/\[slug\]/product-detail-interactive.tsx src/app/\(store\)/producto/\[slug\]/page.tsx
git commit -m "feat: sincroniza la galeria de producto con la variante seleccionada"
```

- [ ] **Step 7: Verificación manual en navegador**

Con el servidor de desarrollo corriendo, usando un producto con al
menos 2 variantes con imágenes propias (crear uno de prueba si hace
falta vía `/admin/productos/nuevo`, limpiar después con
`mcp__supabase__execute_sql`):

1. Entrar a `/producto/<slug>` — la galería inicial muestra las fotos
   de la primera variante + las generales.
2. Elegir otra talla/color en el selector — la galería cambia a las
   fotos de esa variante + las generales, miniatura seleccionada
   vuelve al índice 0.
3. Hacer clic en una miniatura de OTRA variante (si el layout la
   muestra tras un cambio) — el selector de talla/color cambia a esa
   variante.
4. Hacer clic en una imagen general — el selector NO cambia.

---

## Self-Review

**Cobertura del spec:** los 6 puntos de "Alcance" del spec tienen
tarea propia — migración (Task 1), diff de variantes (Task 2 + 3),
formulario admin (Task 4 + 5), `uploadProductImages` (Task 3), galería
pública (Task 6 + 7), primaria sin cambios (verificado: ningún task
toca `is_primary` fuera de pasar `variantId` al insert existente).

**Placeholders:** ninguno — cada step trae el código completo a
escribir.

**Consistencia de tipos:** `createProducto`/`updateProducto` usan
`variantImageFiles: File[][]` en Task 3 y Task 5 (mismo nombre y
forma); `ImagenProducto`/`getImagesForVariant` de Task 6 se consumen
sin cambios de forma en Task 7; `ProductImage` gana `variant_id` en
Task 5, consistente con la query de Task 4.
