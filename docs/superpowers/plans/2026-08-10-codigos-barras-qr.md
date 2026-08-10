# Código de barras y QR automáticos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar, en la página de editar producto, un código de barras y
un código QR generados automáticamente a partir del SKU del producto, sin
captura manual ni almacenamiento en base de datos.

**Architecture:** Dos funciones puras en `src/lib/codigos.ts`
(`generarCodigoQr`, `generarCodigoBarras`) que codifican un texto a una
imagen PNG en base64, usando `qrcode` y `bwip-js` (ambas ya instaladas y
verificadas en vivo). La página de editar producto las invoca con
`producto.sku` y pasa el resultado a `ProductoForm`, que las muestra de
solo lectura junto al SKU ya existente.

**Tech Stack:** Next.js Server Components, `qrcode`, `bwip-js`, vitest.

## Global Constraints

- Todo el producto en español (UI).
- Nada se guarda en la base de datos — las imágenes se generan al vuelo
  en cada carga de la página de editar.
- Solo aplica al SKU del producto general, no a las variantes.
- Solo se muestra en modo edición (`ProductoForm` con `productoId`
  definido) — en `/admin/productos/nuevo` el SKU todavía no existe.
- Las imágenes se renderizan con `next/image` y la prop `unoptimized`
  (son data URIs generados en el momento, no assets para el pipeline de
  optimización de Next).

---

## Task 1: Funciones de generación de código de barras y QR

**Files:**
- Create: `src/lib/codigos.ts`
- Create: `src/lib/__tests__/codigos.test.ts`

**Interfaces:**
- Consumes: `qrcode`, `bwip-js` (ya instaladas).
- Produces: `generarCodigoQr(texto: string): Promise<string>`,
  `generarCodigoBarras(texto: string): Promise<string>` — ambas devuelven
  un data URI `data:image/png;base64,...` — consumidas por la página de
  editar producto (Task 2).

- [ ] **Step 1: Escribir los tests (deben fallar)**

```ts
import { describe, expect, it } from "vitest";
import { generarCodigoBarras, generarCodigoQr } from "../codigos";

describe("generarCodigoQr", () => {
  it("genera una imagen PNG en base64 a partir del SKU", async () => {
    const resultado = await generarCodigoQr("PIJ-000001");
    expect(resultado.startsWith("data:image/png;base64,")).toBe(true);
    expect(resultado.length).toBeGreaterThan(100);
  });
});

describe("generarCodigoBarras", () => {
  it("genera una imagen PNG en base64 a partir del SKU", async () => {
    const resultado = await generarCodigoBarras("PIJ-000001");
    expect(resultado.startsWith("data:image/png;base64,")).toBe(true);
    expect(resultado.length).toBeGreaterThan(100);
  });

  it("acepta SKU con letras, numeros y guiones (formato Code128)", async () => {
    const resultado = await generarCodigoBarras("GEN-000042");
    expect(resultado.startsWith("data:image/png;base64,")).toBe(true);
  });
});
```

Run: `pnpm test src/lib/__tests__/codigos.test.ts`
Expected: FAIL con "Cannot find module '../codigos'".

- [ ] **Step 2: Implementar `codigos.ts`**

```ts
import QRCode from "qrcode";
import bwipjs from "bwip-js";

export async function generarCodigoQr(texto: string): Promise<string> {
  return QRCode.toDataURL(texto);
}

export async function generarCodigoBarras(texto: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: texto,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: "center",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
```

Run: `pnpm test src/lib/__tests__/codigos.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Verificar build y lint**

Run: `pnpm build && pnpm lint`
Expected: ambos exitosos (el archivo no se usa todavía en ninguna otra
parte).

- [ ] **Step 4: Commit**

```bash
git add src/lib/codigos.ts src/lib/__tests__/codigos.test.ts
git commit -m "feat: funciones de generacion de codigo de barras y QR (codigos de producto)"
```

---

## Task 2: Mostrar los códigos en la página de editar producto

**Files:**
- Modify: `src/app/admin/productos/[id]/editar/page.tsx`
- Modify: `src/app/admin/productos/producto-form.tsx`

**Interfaces:**
- Consumes: `generarCodigoQr`, `generarCodigoBarras` (Task 1).
- Produces: nada consumido por otras tasks.

- [ ] **Step 1: Editar `[id]/editar/page.tsx`**

Agrega el import y las dos llamadas al `Promise.all` ya existente, y pasa
los resultados como props nuevas al `ProductoForm`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generarCodigoBarras, generarCodigoQr } from "@/lib/codigos";
import { ProductoForm } from "../../producto-form";

export default async function EditarProductoPage({
  params,
}: PageProps<"/admin/productos/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (!producto) {
    notFound();
  }

  const [
    { data: categorias },
    { data: variantes },
    { data: imagenes },
    { data: costo },
    codigoBarras,
    codigoQr,
  ] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase
      .from("product_variants")
      .select("talla, color, price_override, stock")
      .eq("product_id", id),
    supabase
      .from("product_images")
      .select("id, url, is_primary")
      .eq("product_id", id)
      .order("sort_order"),
    supabase
      .from("product_costs")
      .select("cost_price")
      .eq("product_id", id)
      .maybeSingle(),
    generarCodigoBarras(producto.sku),
    generarCodigoQr(producto.sku),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar producto</h1>
      <ProductoForm
        productoId={producto.id}
        skuActual={producto.sku}
        codigoBarras={codigoBarras}
        codigoQr={codigoQr}
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
    </div>
  );
}
```

- [ ] **Step 2: Editar `producto-form.tsx`**

Agrega las dos props nuevas a la firma del componente:

```tsx
export function ProductoForm({
  productoId,
  skuActual,
  codigoBarras,
  codigoQr,
  defaultValues,
  categoriasDisponibles,
  imagenesExistentes = [],
}: {
  productoId?: string;
  skuActual?: string;
  codigoBarras?: string;
  codigoQr?: string;
  defaultValues: ProductoInput;
  categoriasDisponibles: CategoriaOption[];
  imagenesExistentes?: ProductImage[];
}) {
```

Inmediatamente después del bloque que muestra `skuActual` (el `{skuActual && (...)}` que ya existe, justo antes del campo "Stock"), agrega:

```tsx
        {(codigoBarras || codigoQr) && (
          <div className="flex flex-wrap gap-6">
            {codigoBarras && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-brand-ciruela/60">Código de barras</p>
                <Image
                  src={codigoBarras}
                  alt={`Código de barras ${skuActual ?? ""}`}
                  width={300}
                  height={100}
                  unoptimized
                  className="h-20 w-auto rounded-md border border-brand-rosa-claro bg-white p-2"
                />
              </div>
            )}
            {codigoQr && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-brand-ciruela/60">Código QR</p>
                <Image
                  src={codigoQr}
                  alt={`Código QR ${skuActual ?? ""}`}
                  width={150}
                  height={150}
                  unoptimized
                  className="h-24 w-24 rounded-md border border-brand-rosa-claro bg-white p-2"
                />
              </div>
            )}
            <p className="w-full text-xs text-brand-ciruela/60">
              Para uso interno. Se usará más adelante para imprimir etiquetas.
            </p>
          </div>
        )}
```

(`Image` ya está importado en este archivo desde `next/image`, usado más
abajo para las imágenes del producto — no hace falta un import nuevo.)

- [ ] **Step 3: Verificar build, lint y tests completos**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: los tres exitosos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/productos/[id]/editar/page.tsx" src/app/admin/productos/producto-form.tsx
git commit -m "feat: muestra codigo de barras y QR en la pagina de editar producto (codigos de producto)"
```

- [ ] **Step 5: Nota para el reporte final**

Esta rama no toca Supabase (sin migración, sin RPC, sin tabla nueva), así
que no hace falta una tarea de verificación end-to-end contra la base de
datos como en fases anteriores. Deja anotado en tu reporte que la
visualización real de las imágenes en `/admin/productos/[id]/editar` no
se probó de forma interactiva en navegador (sin herramienta de Chrome
disponible) — recomienda al usuario abrir un producto existente en modo
edición y confirmar visualmente que ambas imágenes se ven correctamente
(no rotas, legibles, con el SKU correcto codificado).

---

## Cierre de fase

Al completar la Task 2, invocar `superpowers:finishing-a-development-branch`
sobre la rama de esta mini-fase (creada al iniciar la ejecución de este
plan, con base en `master`) para fusionar, verificar y subir.
