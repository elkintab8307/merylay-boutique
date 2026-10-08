# Consultas flexibles de productos, créditos y abonos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalizar la búsqueda de productos del bot de WhatsApp (más
filtros, más formatos de respuesta) y agregar dos informes nuevos
(créditos y abonos) sobre datos que ya existen en la base pero que el bot
nunca expone.

**Architecture:** `consultar_productos` reemplaza `buscar_inventario` +
`generar_informe_pdf` con una sola acción más flexible. `informe_creditos`
e `informe_abonos` siguen el mismo patrón ya establecido por los otros 5
informes (`informeVentas`, `productosMasVendidos`, `informeClientes`,
`historialCliente`, `informeGastos`): el servidor consulta y calcula todo,
el modelo solo elige la acción y sus parámetros. `generarPdfTabla` se
mueve de `reports.ts` a `pdf-marca.ts` para que tanto `reports.ts` como
`owner-actions.ts` puedan reutilizarlo sin crear un import circular entre
ambos.

**Tech Stack:** Deno Edge Functions, Supabase (Postgres/PostgREST),
pdf-lib + `@pdf-lib/fontkit` (ya en el proyecto), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-agente-whatsapp-consultas-flexibles-design.md`

## Global Constraints

- **Ninguna consulta usa SQL generado por el modelo** (regla ya escrita
  para los informes de negocio; este plan la mantiene explícitamente —
  ver "Motivación" del spec).
- Todos los montos/conteos/saldos los calcula el servidor; el modelo
  nunca hace aritmética de negocio.
- Fechas en columnas `timestamptz` (`pos_sales.created_at`,
  `credit_payments.created_at`) se muestran en `America/Bogota`; fechas
  en columnas `date` se fijan a `UTC` explícito — mismo criterio ya
  establecido en `pdf-marca.ts`/`reports.ts`.
- Reutilizar `escaparValorFiltro`, `candidatosSingularPlural` y
  `formatoMoneda` ya existentes — no reimplementar.
- Topes explícitos: 10 líneas en texto/lista, 50 filas en PDF de ranking,
  200 filas en PDF de detalle (mismos topes ya usados en todo el bot).
- **Este plan depende de que el PR `fix-busqueda-singular-plural` ya esté
  fusionado a `master`** (reutiliza `candidatosSingularPlural` de
  `catalog.ts`). Si el worktree de este plan se crea desde un `master`
  que todavía no lo tiene, es un bloqueo real a resolver antes de la
  Tarea 1, no un detalle a ignorar.
- `pnpm test` y `npx deno check --import-map=supabase/functions/deno.json
  <archivos>` deben quedar en verde al final de cada tarea.

## Review Focus

- Un filtro de `agregadoDesdeDias` combinado con `talla`/`color` a la vez
  (variantesEmbed con `!inner`) — confirmar que el filtro de fecha no
  rompe esa combinación.
- `informe_creditos`/`informe_abonos` cuando `pos_sales.customer_id` es
  `null` (venta de mostrador sin cliente) — no debe reventar, debe
  mostrar un nombre genérico en vez de lanzar.
- `consultar_productos` con `formato: "pdf_tabla"` (o `"pdf_fotos"`) y
  `conFotos: true` a la vez — `conFotos` debe ignorarse en silencio, sin
  mandar fotos en vivo además del PDF.
- El wiring de `handler.ts`: los casos viejos `"buscar_inventario"` y
  `"generar_informe_pdf"` deben quedar **completamente eliminados** del
  switch (no solo agregar el nuevo caso) — si quedan ambos, el modelo
  puede confundirse sobre cuál usar.
- Fechas de `informe_creditos`/`informe_abonos`: `created_at` de
  `pos_sales`/`credit_payments` es `timestamptz` → deben mostrarse en
  `America/Bogota`, igual que el resto de informes (no UTC).

---

### Task 1: Mover `generarPdfTabla` de `reports.ts` a `pdf-marca.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/pdf-marca.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Produce: `generarPdfTabla(titulo: string, encabezados: string[], filas:
  string[][]): Promise<Uint8Array>`, ahora exportada desde
  `pdf-marca.ts` (antes era una función privada de `reports.ts`).
- Consume (Tareas 3, 4, 5): `owner-actions.ts` y las nuevas funciones de
  `reports.ts` importan `generarPdfTabla` desde `./pdf-marca.ts`.

Este refactor es puro (no cambia ningún comportamiento observable) y
existe para que la Tarea 3 (`owner-actions.ts`) pueda generar PDFs de
tabla sin crear un import circular `owner-actions.ts → reports.ts →
owner-actions.ts` (hoy `reports.ts` ya importa de `owner-actions.ts`).

- [ ] **Paso 1: Mover la función a `pdf-marca.ts`**

Editar `supabase/functions/whatsapp-webhook/pdf-marca.ts`:

1. Cambiar el import de pdf-lib (hoy `PDFDocument` es un import de SOLO
   TIPO; `generarPdfTabla` necesita llamarlo como valor real):

```ts
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from "pdf-lib";
```

2. Agregar al final del archivo (después de `dibujarPiePagina`):

```ts
const ANCHO_PAGINA_TABLA = 780; // horizontal (landscape) -- mismo ancho que catalog.ts
const ALTO_FILA_TABLA = 20;
const MARGEN_LATERAL_TABLA = 24;
const ALTO_PIE_TABLA = 30;

// Genera un PDF de marca con una tabla simple (encabezados de columna +
// filas de texto, bandas alternadas). Sin logica de negocio: solo recibe
// texto ya formateado -- usado por los informes de negocio (reports.ts)
// y por el informe de productos sin fotos (owner-actions.ts).
export async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const altoContenido = (filas.length + 1) * ALTO_FILA_TABLA;
  const altoPagina = 140 + altoContenido + ALTO_PIE_TABLA;
  const pagina = pdf.addPage([ANCHO_PAGINA_TABLA, altoPagina]);

  const [fuentes, logo] = await Promise.all([cargarFuentesMarca(pdf), cargarLogoMarca(pdf)]);
  let y = dibujarEncabezado(pagina, { titulo, fuentes, logo, anchoPagina: ANCHO_PAGINA_TABLA, altoPagina });

  const anchoColumna = (ANCHO_PAGINA_TABLA - MARGEN_LATERAL_TABLA * 2) / encabezados.length;

  pagina.drawRectangle({ x: 0, y: y - 4, width: ANCHO_PAGINA_TABLA, height: ALTO_FILA_TABLA + 4, color: COLORES_MARCA.rosaFuerte });
  encabezados.forEach((encabezado, i) => {
    pagina.drawText(encabezado, { x: MARGEN_LATERAL_TABLA + i * anchoColumna, y, size: 10, font: fuentes.textoNegrita, color: COLORES_MARCA.blanco });
  });
  y -= ALTO_FILA_TABLA;

  filas.forEach((fila, indiceFila) => {
    if (indiceFila % 2 === 1) {
      pagina.drawRectangle({ x: 0, y: y - 4, width: ANCHO_PAGINA_TABLA, height: ALTO_FILA_TABLA, color: COLORES_MARCA.rosaClaro });
    }
    fila.forEach((valor, i) => {
      pagina.drawText(valor, { x: MARGEN_LATERAL_TABLA + i * anchoColumna, y, size: 9, font: fuentes.texto, color: COLORES_MARCA.ciruela });
    });
    y -= ALTO_FILA_TABLA;
  });

  dibujarPiePagina(pagina, { fuentes, anchoPagina: ANCHO_PAGINA_TABLA });

  return pdf.save();
}
```

- [ ] **Paso 2: Quitar la función de `reports.ts` y usar la importada**

Editar `supabase/functions/whatsapp-webhook/reports.ts`:

1. Borrar la línea `import { PDFDocument } from "pdf-lib";` (ya no se usa
   pdf-lib directamente en este archivo).
2. Cambiar la línea de import de pdf-marca de:
   ```ts
   import { COLORES_MARCA, cargarFuentesMarca, cargarLogoMarca, dibujarEncabezado, dibujarPiePagina } from "./pdf-marca.ts";
   ```
   a:
   ```ts
   import { generarPdfTabla } from "./pdf-marca.ts";
   ```
3. Borrar por completo el bloque que define `ANCHO_PAGINA`, `ALTO_FILA`,
   `MARGEN_LATERAL`, `ALTO_PIE` y la función local
   `async function generarPdfTabla(...) { ... }` (las ~34 líneas entre el
   import y `export async function informeVentas`).
4. **No tocar nada más** — las 4 funciones (`informeVentas`,
   `productosMasVendidos`, `informeClientes`, `informeGastos`) siguen
   llamando `generarPdfTabla(...)` exactamente igual que antes; ahora es
   una función importada en vez de local, pero la llamada no cambia.

- [ ] **Paso 3: Actualizar el mock de pdf-lib/pdf-marca en `reports.test.ts`**

`reports.ts` ya no importa `pdf-lib` directamente (solo lo hace a través
de `pdf-marca.ts`, que sigue completamente mockeado). Editar
`supabase/functions/whatsapp-webhook/reports.test.ts`:

Reemplazar TODO este bloque (el mock de `pdf-lib` completo más el mock
de `./pdf-marca.ts`):

```ts
const pdfLibCapturado = vi.hoisted(() => ({ textos: [] as string[] }));
vi.mock("pdf-lib", () => ({
  StandardFonts: { Helvetica: "Helvetica", HelveticaBold: "HelveticaBold" },
  PDFDocument: {
    create: vi.fn(async () => ({
      addPage: vi.fn(() => ({
        getHeight: () => 800,
        drawText: vi.fn((texto: string) => {
          pdfLibCapturado.textos.push(texto);
        }),
        drawRectangle: vi.fn(),
        drawImage: vi.fn(),
      })),
      embedFont: vi.fn(async () => ({})),
      embedPng: vi.fn(async () => ({})),
      registerFontkit: vi.fn(),
      save: vi.fn(async () => new Uint8Array([1, 2, 3])),
    })),
  },
}));

vi.mock("./pdf-marca.ts", () => ({
  cargarFuentesMarca: vi.fn(async () => ({ texto: {}, textoNegrita: {}, titulo: {} })),
  cargarLogoMarca: vi.fn(async () => null),
  dibujarEncabezado: vi.fn(() => 700),
  dibujarPiePagina: vi.fn(),
  COLORES_MARCA: {
    rosaFuerte: {}, dorado: {}, rosaClaro: {}, ciruela: {}, crema: {}, blanco: {},
  },
}));
```

por esto (más simple: `reports.ts` ahora solo importa `generarPdfTabla`
de `pdf-marca.ts`, nada de `pdf-lib` directamente; el mock captura el
contenido de `filas` directamente en vez de interceptar `drawText`):

```ts
// generarPdfTabla ahora vive en pdf-marca.ts (Tarea 1 de este plan) y se
// mockea por completo -- reports.ts ya no importa pdf-lib directamente.
// El mock captura el contenido de `filas` tal cual se lo pasan las
// funciones de este archivo, para poder verificar (test de zona horaria,
// mas abajo) que la fecha de una fila sale en hora de Bogota y no en UTC.
const pdfLibCapturado = vi.hoisted(() => ({ textos: [] as string[] }));
vi.mock("./pdf-marca.ts", () => ({
  generarPdfTabla: vi.fn(async (_titulo: string, _encabezados: string[], filas: string[][]) => {
    filas.forEach((fila) => fila.forEach((valor) => pdfLibCapturado.textos.push(valor)));
    return new Uint8Array([1, 2, 3]);
  }),
}));
```

- [ ] **Paso 4: Correr la suite y verificar que nada se rompió**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS — los 28 tests existentes deben seguir pasando tal cual
(incluyendo el test de zona horaria de `informeVentas`, que ahora
depende del mock de `generarPdfTabla` en vez del mock de `pdf-lib`).

Run también: `pnpm test supabase/functions/whatsapp-webhook/pdf-marca.test.ts`
Expected: PASS — este archivo no debería verse afectado (no se tocó
`cargarFuentesMarca`/`cargarLogoMarca`/`dibujarEncabezado`/`dibujarPiePagina`).

- [ ] **Paso 5: Verificar tipos**

Run: `npx deno check --import-map=supabase/functions/deno.json supabase/functions/whatsapp-webhook/pdf-marca.ts supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: sin errores.

- [ ] **Paso 6: Commit**

```bash
git add supabase/functions/whatsapp-webhook/pdf-marca.ts supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "refactor: mueve generarPdfTabla a pdf-marca.ts para que owner-actions.ts tambien pueda usarlo"
```

---

### Task 2: `catalog.ts` — filtro `agregadoDesdeDias` y campo `categoria`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/catalog.ts`
- Modify: `supabase/functions/whatsapp-webhook/catalog.test.ts`

**Interfaces:**
- Produce: `FiltrosCatalogo` gana `agregadoDesdeDias?: number`.
  `ProductoEncontrado` gana `categoria: string | null`.
- Consume (Tarea 3): `owner-actions.ts` lee `p.categoria` para mostrarla
  en el PDF de productos.

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a `catalog.test.ts`, dentro de `describe("buscarCatalogo", ...)`
(después del test "con texto que no coincide ni en singular ni en
plural..." que ya existe de la Tarea del fix de plurales):

```ts
  it("incluye la categoria del producto en el resultado", async () => {
    const productos = [
      { id: "p1", name: "Camiseta Blanca", price: 40000, stock: 3, categories: { name: "Camiseta algodón licrado" }, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "camiseta" });

    expect(resultado[0].categoria).toBe("Camiseta algodón licrado");
  });

  it("sin categoria asignada, categoria queda en null (no revienta)", async () => {
    const productos = [
      { id: "p1", name: "Producto suelto", price: 10000, stock: 1, categories: null, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "producto" });

    expect(resultado[0].categoria).toBeNull();
  });

  it("con agregadoDesdeDias, filtra products por created_at", async () => {
    const productos = [
      { id: "p1", name: "Camiseta Nueva", price: 40000, stock: 3, categories: null, product_variants: [], product_images: [] },
    ];
    const { supabase, query } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ agregadoDesdeDias: 2 });

    expect(query.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(resultado).toHaveLength(1);
  });

  it("agregadoDesdeDias solo, sin texto/talla/color, es un filtro valido (no lanza)", async () => {
    const { supabase } = mockCatalogo([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    await expect(buscarCatalogo({ agregadoDesdeDias: 2 })).resolves.toEqual([]);
  });

  it("agregadoDesdeDias combinado con talla: ambos filtros se aplican (variantesEmbed sigue usando !inner por la talla)", async () => {
    const productos = [
      {
        id: "p1", name: "Camiseta Nueva", price: 40000, stock: 3, categories: null,
        product_variants: [{ id: "v1", talla: "M", color: null, price_override: null, stock: 2 }],
        product_images: [],
      },
    ];
    const { supabase, select, query } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ talla: "M", agregadoDesdeDias: 2 });

    // product_variants!inner se sigue usando porque hay talla -- confirma
    // que agregar el filtro de fecha no cambia esa decision.
    expect(select).toHaveBeenCalledWith(expect.stringContaining("product_variants!inner"));
    expect(query.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(resultado).toHaveLength(1);
    expect(resultado[0].talla).toBe("M");
  });
```

El helper `mockCatalogo` de este archivo ya expone `query` (el objeto
query encadenable mockeado) — revisar su definición al inicio del
archivo para confirmar que `query.gte` existe como `vi.fn()` encadenable
(si no, agregarlo ahí: el mock usa un `encadenable = vi.fn(() => query)`
asignado a `query.eq`/`query.ilike`; agregar también
`query.gte = encadenable;`).

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: FAIL — `categoria` no existe en `ProductoEncontrado`,
`agregadoDesdeDias` no existe en `FiltrosCatalogo`, y sin filtro
`buscarCatalogo` lanza en vez de aceptar `agregadoDesdeDias` solo.

- [ ] **Paso 3: Implementar**

Editar `supabase/functions/whatsapp-webhook/catalog.ts`:

1. `ProductoEncontrado` gana un campo:
```ts
export interface ProductoEncontrado {
  productId: string;
  variantId: string | null;
  nombre: string;
  talla: string | null;
  color: string | null;
  precio: number;
  stock: number;
  imageId: string | null;
  fotoUrl: string | null;
  categoria: string | null;
}
```

2. `FiltrosCatalogo` gana un campo:
```ts
export interface FiltrosCatalogo {
  texto?: string;
  talla?: string;
  color?: string;
  agregadoDesdeDias?: number;
}
```

3. En `buscarCatalogo`, cambiar la validación inicial:
```ts
  if (!filtros.texto && !filtros.talla && !filtros.color && !filtros.agregadoDesdeDias) {
    throw new Error("buscarCatalogo requiere al menos un filtro (texto, talla, color o agregadoDesdeDias).");
  }
```

4. Agregar `created_at` al `.select(...)` (en la plantilla del select que
   hoy dice `` `id, name, price, stock, categories(name), ${variantesEmbed}, product_images(...)` ``,
   agregar `created_at` después de `stock`):
```ts
    .select(`id, name, price, stock, created_at, categories(name), ${variantesEmbed}, product_images(id, url, is_primary, variant_id, vendida)`)
```

5. Aplicar el filtro de fecha junto a los de talla/color (antes de
   `const { data, error } = await query;`):
```ts
  if (filtros.talla) query = query.ilike("product_variants.talla", `%${escaparPatronLike(filtros.talla)}%`);
  if (filtros.color) query = query.ilike("product_variants.color", `%${escaparPatronLike(filtros.color)}%`);
  if (filtros.agregadoDesdeDias) {
    const desde = new Date(Date.now() - filtros.agregadoDesdeDias * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", desde);
  }
```

6. Poblar `categoria` en las DOS ramas de `expandido` (sin variantes y
   con variantes) — agregar `categoria: producto.categories?.name ??
   null,` a cada objeto literal devuelto dentro de `flatMap`.

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: PASS — todos los tests (los nuevos y los que ya existían).

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/catalog.test.ts
git commit -m "feat: buscarCatalogo gana filtro por fecha de alta y expone la categoria del producto"
```

---

### Task 3: `owner-actions.ts` — `consultarProductos` (reemplaza `buscarInventario`/`generarInformePdf`)

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.ts`
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.test.ts`

**Interfaces:**
- Consume: `buscarCatalogo`, `generarPdfConFotos`, `subirYFirmar`,
  `TOPE_BUSCAR_CATALOGO` de `catalog.ts` (ya se consumían);
  `generarPdfTabla` de `pdf-marca.ts` (Tarea 1).
- Produce: `consultarProductos(filtros: FiltrosCatalogo, formato:
  "conteo" | "lista" | "pdf_fotos" | "pdf_tabla", conFotos: boolean):
  Promise<RespuestaLectura>` — reemplaza a `buscarInventario` y
  `generarInformePdf`, que se ELIMINAN de este archivo.

- [ ] **Paso 1: Escribir los tests que fallan**

Primero, **borrar por completo** los bloques `describe("buscarInventario",
...)` y `describe("generarInformePdf", ...)` existentes en
`owner-actions.test.ts` (líneas 169-326 del archivo actual) — sus
funciones dejan de existir.

En su lugar, agregar (mismo estilo del archivo: `vi.doMock("./catalog.ts",
...)` + `vi.resetModules()` por test, más un nuevo mock de
`./pdf-marca.ts` cuando haga falta para el formato `"pdf_tabla"`):

```ts
describe("consultarProductos", () => {
  afterEach(() => {
    vi.doUnmock("./catalog.ts");
    vi.doUnmock("./pdf-marca.ts");
    vi.resetModules();
  });

  const PRODUCTOS_BASE = [
    { productId: "p1", variantId: null, nombre: "Camiseta A", talla: "M", color: "Rosa", precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/a.jpg", categoria: "Camisetas" },
    { productId: "p2", variantId: null, nombre: "Camiseta B", talla: "M", color: "Azul", precio: 42000, stock: 3, imageId: null, fotoUrl: "https://x/b.jpg", categoria: "Camisetas" },
  ];

  it("formato 'conteo' (por defecto): resume cuantos productos y el total de unidades, con fotos si conFotos=true", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => PRODUCTOS_BASE), TOPE_BUSCAR_CATALOGO: 50 }));

    const { consultarProductos } = await import("./owner-actions.ts");
    const resultado = await consultarProductos({ texto: "camiseta" }, "conteo", true);

    expect(resultado.texto).toContain("Encontré 2 producto(s)");
    expect(resultado.texto).toContain("4 unidad(es) en stock en total");
    expect(resultado.fotos).toHaveLength(2);
  });

  it("formato 'lista': un renglon por producto, con nombre/talla/color/precio/stock", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => PRODUCTOS_BASE), TOPE_BUSCAR_CATALOGO: 50 }));

    const { consultarProductos } = await import("./owner-actions.ts");
    const resultado = await consultarProductos({ texto: "camiseta" }, "lista", false);

    expect(resultado.texto).toContain("Camiseta A");
    expect(resultado.texto).toContain("Camiseta B");
    expect(resultado.texto).toContain("talla M");
    expect(resultado.texto).toContain("$40.000");
    expect(resultado.fotos).toHaveLength(0);
  });

  it("formato 'lista' con mas de 10 productos: corta en 10 y avisa cuantos mas hay", async () => {
    const productos = Array.from({ length: 13 }, (_, i) => ({
      productId: `p${i}`, variantId: null, nombre: `Producto ${i}`, talla: null, color: null,
      precio: 1000, stock: 1, imageId: null, fotoUrl: null, categoria: null,
    }));
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => productos), TOPE_BUSCAR_CATALOGO: 50 }));

    const { consultarProductos } = await import("./owner-actions.ts");
    const resultado = await consultarProductos({ texto: "producto" }, "lista", false);

    expect((resultado.texto.match(/Producto \d+/g) ?? []).length).toBe(10);
    expect(resultado.texto).toContain("y 3 producto(s) más");
  });

  it("formato 'pdf_fotos': genera el PDF con fotos, incluyendo la categoria en el detalle", async () => {
    vi.resetModules();
    const generarPdfConFotos = vi.fn(async () => new Uint8Array([1]));
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => PRODUCTOS_BASE),
      generarPdfConFotos,
      subirYFirmar: vi.fn(async () => "https://x/informe-firmado.pdf"),
      TOPE_BUSCAR_CATALOGO: 50,
    }));

    const { consultarProductos } = await import("./owner-actions.ts");
    const resultado = await consultarProductos({ texto: "camiseta" }, "pdf_fotos", false);

    expect(generarPdfConFotos).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ detalle: expect.stringContaining("Camisetas") })]),
    );
    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe.pdf" }]);
  });

  it("formato 'pdf_tabla': genera un PDF de tabla (sin fotos) via generarPdfTabla", async () => {
    vi.resetModules();
    const generarPdfTabla = vi.fn(async () => new Uint8Array([1]));
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => PRODUCTOS_BASE),
      subirYFirmar: vi.fn(async () => "https://x/informe-firmado.pdf"),
      TOPE_BUSCAR_CATALOGO: 50,
    }));
    vi.doMock("./pdf-marca.ts", () => ({ generarPdfTabla }));

    const { consultarProductos } = await import("./owner-actions.ts");
    const resultado = await consultarProductos({ texto: "camiseta" }, "pdf_tabla", true);

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["Categoría"]),
      expect.arrayContaining([expect.arrayContaining(["Camisetas"])]),
    );
    // conFotos=true se ignora cuando el formato ya es un PDF.
    expect(resultado.fotos).toHaveLength(0);
    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe-productos-merylay.pdf" }]);
  });

  it("sin coincidencias, responde un mensaje claro para cualquier formato", async () => {
    vi.resetModules();
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => []), TOPE_BUSCAR_CATALOGO: 50 }));

    const { consultarProductos } = await import("./owner-actions.ts");
    const resultado = await consultarProductos({ texto: "inexistente" }, "lista", false);

    expect(resultado.texto).toContain("No encontré ningún producto");
    expect(resultado.documentos).toHaveLength(0);
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: FAIL — `consultarProductos` no existe todavía.

- [ ] **Paso 3: Implementar**

Editar `supabase/functions/whatsapp-webhook/owner-actions.ts`:

1. Cambiar la línea de import de `catalog.ts` para incluir `type
   FiltrosCatalogo` (ya se importa) y agregar un nuevo import de
   `pdf-marca.ts`:
```ts
import { getSupabase } from "../_shared/db.ts";
import { buscarCatalogo, generarPdfConFotos, subirYFirmar, TOPE_BUSCAR_CATALOGO, type FiltrosCatalogo, type FilaPdf } from "./catalog.ts";
import { generarPdfTabla } from "./pdf-marca.ts";
```

2. **Borrar por completo** las funciones `buscarInventario` y
   `generarInformePdf` (dejar `TOPE_FOTOS_EN_VIVO` y `caption` — siguen
   haciendo falta).

3. Agregar, en su lugar:

```ts
export type FormatoConsultaProductos = "conteo" | "lista" | "pdf_fotos" | "pdf_tabla";

const TOPE_LISTA_TEXTO = 10;

function detalleVarianteTexto(p: { talla: string | null; color: string | null }): string {
  const detalle = [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ");
  return detalle ? ` (${detalle})` : "";
}

export async function consultarProductos(
  filtros: FiltrosCatalogo,
  formato: FormatoConsultaProductos,
  conFotos: boolean,
): Promise<RespuestaLectura> {
  const productos = await buscarCatalogo(filtros);
  if (productos.length === 0) {
    return { texto: `No encontré ningún producto que coincida con esa búsqueda.`, fotos: [], documentos: [] };
  }

  if (formato === "pdf_fotos") {
    return generarInformeProductosPdfFotos(productos);
  }
  if (formato === "pdf_tabla") {
    return generarInformeProductosPdfTabla(productos);
  }

  const productosUnicos = new Set(productos.map((p) => p.productId)).size;
  const totalUnidades = productos.reduce((suma, p) => suma + p.stock, 0);
  // buscarCatalogo tiene un tope interno (TOPE_BUSCAR_CATALOGO filas); si lo
  // alcanzamos exactamente, puede haber mas coincidencias reales de las que
  // se ven.
  const alcanzoElTope = productos.length === TOPE_BUSCAR_CATALOGO;
  const prefijoConteo = alcanzoElTope ? "al menos " : "";
  const avisoTope = alcanzoElTope ? " (alcancé el límite de búsqueda; podría haber más)" : "";

  const fotos = conFotos
    ? productos.slice(0, TOPE_FOTOS_EN_VIVO).filter((p) => p.fotoUrl).map((p) => ({ url: p.fotoUrl as string, caption: caption(p) }))
    : [];

  if (formato === "lista") {
    const lineas = productos.slice(0, TOPE_LISTA_TEXTO).map((p) => `${p.nombre}${detalleVarianteTexto(p)} — ${formatoMoneda(p.precio)}, stock ${p.stock}`);
    const notaTruncada = productos.length > TOPE_LISTA_TEXTO ? `\n… y ${productos.length - TOPE_LISTA_TEXTO} producto(s) más. Pide el informe en PDF para ver todos.` : "";
    const texto = `Encontré ${prefijoConteo}${productosUnicos} producto(s)${avisoTope}:\n${lineas.join("\n")}${notaTruncada}`;
    return { texto, fotos, documentos: [] };
  }

  // formato === "conteo" (default)
  const truncadoFotos = conFotos && productos.length > TOPE_FOTOS_EN_VIVO
    ? ` (mostrando ${TOPE_FOTOS_EN_VIVO} fotos; pide el informe en PDF para ver el resto)`
    : "";
  const texto = `Encontré ${prefijoConteo}${productosUnicos} producto(s) con ${totalUnidades} unidad(es) en stock en total${avisoTope}${truncadoFotos}.`;
  return { texto, fotos, documentos: [] };
}

async function generarInformeProductosPdfFotos(productos: Awaited<ReturnType<typeof buscarCatalogo>>): Promise<RespuestaLectura> {
  const filas: FilaPdf[] = productos.map((p) => ({
    fotoUrl: p.fotoUrl,
    nombre: p.nombre,
    detalle: [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null, p.categoria].filter(Boolean).join(", ") || "—",
    precio: p.precio,
    nota: `stock: ${p.stock}`,
  }));
  const bytes = await generarPdfConFotos("Informe de inventario — MeryLay Boutique", filas);
  const link = await subirYFirmar(bytes, "informe.pdf");
  return { texto: "Aquí tienes el informe 📋", fotos: [], documentos: [{ link, filename: "informe.pdf" }] };
}

async function generarInformeProductosPdfTabla(productos: Awaited<ReturnType<typeof buscarCatalogo>>): Promise<RespuestaLectura> {
  const filasTabla = productos.map((p) => [
    p.nombre,
    [p.talla, p.color].filter(Boolean).join(" / ") || "—",
    p.categoria ?? "—",
    formatoMoneda(p.precio),
    String(p.stock),
  ]);
  const bytes = await generarPdfTabla("Informe de productos — MeryLay Boutique", ["Producto", "Talla/Color", "Categoría", "Precio", "Stock"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-productos.pdf");
  return { texto: "Aquí tienes el informe 📋", fotos: [], documentos: [{ link, filename: "informe-productos-merylay.pdf" }] };
}
```

**Nota:** el nombre del archivo del PDF de fotos (`"informe.pdf"`) se
mantiene igual al que ya usaba `generarInformePdf` — confirmar contra el
test "formato 'pdf_fotos'..." arriba, que espera exactamente ese
filename.

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: PASS.

- [ ] **Paso 5: Verificar tipos**

Run: `npx deno check --import-map=supabase/functions/deno.json supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: sin errores. (Nota: `handler.ts` y `handler.test.ts` todavía
referencian `ownerActions.buscarInventario`/`generarInformePdf` en este
punto del plan — eso se corrige en la Tarea 6. Es normal que `deno check`
sobre `handler.ts` falle hasta entonces; no lo correr todavía sobre ese
archivo.)

- [ ] **Paso 6: Commit**

```bash
git add supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts
git commit -m "feat: consultarProductos reemplaza buscarInventario/generarInformePdf con 4 formatos de respuesta"
```

---

### Task 4: `reports.ts` — `informeCreditos`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Produce: `informeCreditos(dias: number, conPdf: boolean):
  Promise<RespuestaLectura>`.
- Produce (interno, no exportado fuera de este archivo salvo que la
  Tarea 5 lo necesite — SÍ lo necesita): `nombresClientesPos(customerIds:
  string[]): Promise<Map<string, string>>` — resuelve el nombre a
  mostrar de un `pos_customers.id`: el nombre real del perfil si está
  vinculado (`profile_id`), si no el nombre registrado en POS.

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a `reports.test.ts` (después del `describe("informeGastos", ...)`
que ya existe):

```ts
describe("informeCreditos", () => {
  it("desglosa total vendido a credito, cuantas ventas y cuantas con saldo pendiente", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [
          { id: "venta-1", sale_number: "POS-1", customer_id: "cli-1", total: 200000, created_at: "2026-10-05T10:00:00Z" },
          { id: "venta-2", sale_number: "POS-2", customer_id: "cli-2", total: 100000, created_at: "2026-10-06T10:00:00Z" },
        ],
        error: null,
      }],
      credit_installments: [{
        data: [
          { sale_id: "venta-1", amount: 100000, paid_amount: 50000, status: "parcial" },
          { sale_id: "venta-2", amount: 100000, paid_amount: 100000, status: "pagada" },
        ],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeCreditos } = await import("./reports.ts");
    const resultado = await informeCreditos(7, false);

    expect(resultado.texto).toContain("$300.000 en 2 venta(s)");
    expect(resultado.texto).toContain("1 con saldo pendiente");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("sin ventas a credito en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({ pos_sales: [{ data: [], error: null }] });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeCreditos } = await import("./reports.ts");
    const resultado = await informeCreditos(7, false);

    expect(resultado.texto).toContain("No hubo ventas a crédito");
  });

  it("con conPdf=true, el detalle incluye cliente (fusion de identidad), productos y saldo pendiente por venta", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [{ id: "venta-1", sale_number: "POS-1", customer_id: "cli-1", total: 200000, created_at: "2026-10-05T10:00:00Z" }],
        error: null,
      }],
      credit_installments: [{
        data: [{ sale_id: "venta-1", amount: 200000, paid_amount: 50000, status: "parcial" }],
        error: null,
      }],
      pos_customers: [{ data: [{ id: "cli-1", profile_id: "profile-1", nombre: "Juan (POS)" }], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_sale_items: [{ data: [{ sale_id: "venta-1", product_id: "prod-1" }, { sale_id: "venta-1", product_id: "prod-2" }], error: null }],
      products: [{ data: [{ id: "prod-1", name: "Pijama Rosa" }, { id: "prod-2", name: "Bata Dorada" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-marca.ts");

    const { informeCreditos } = await import("./reports.ts");
    await informeCreditos(7, true);

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      ["Fecha", "Cliente", "Productos", "Total", "Saldo pendiente"],
      [["5/10/2026", "Juan Pérez", "Pijama Rosa, Bata Dorada", "$200.000", "$150.000"]],
    );
  });

  it("una venta a credito sin customer_id (mostrador) no revienta: muestra un nombre generico", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [{ id: "venta-1", sale_number: "POS-1", customer_id: null, total: 50000, created_at: "2026-10-05T10:00:00Z" }],
        error: null,
      }],
      credit_installments: [{ data: [], error: null }],
      pos_sale_items: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-marca.ts");

    const { informeCreditos } = await import("./reports.ts");
    await expect(informeCreditos(7, true)).resolves.not.toThrow();

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      [["5/10/2026", "Cliente", "—", "$50.000", "$0"]],
    );
  });

  it("la fecha del PDF usa hora de Bogota, no UTC, para una venta tarde en la noche", async () => {
    // 2026-10-08T01:30:00Z son las 8:30pm del 7 de octubre en Bogota
    // (UTC-5). Si la fila usara UTC en vez de America/Bogota, mostraria
    // 8/10/2026 en lugar de 7/10/2026 -- mismo caso limite que ya se
    // prueba en informeVentas/historialCliente, repetido aqui porque
    // informeCreditos formatea la fecha con su propio codigo (no
    // comparte esa linea con los demas informes).
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [{ id: "venta-1", sale_number: "POS-1", customer_id: null, total: 50000, created_at: "2026-10-08T01:30:00Z" }],
        error: null,
      }],
      credit_installments: [{ data: [], error: null }],
      pos_sale_items: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-marca.ts");

    const { informeCreditos } = await import("./reports.ts");
    await informeCreditos(7, true);

    const [, , filas] = (generarPdfTabla as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[], string[][]];
    expect(filas[0][0]).toBe("7/10/2026");
    expect(filas[0][0]).not.toBe("8/10/2026");
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: FAIL — `informeCreditos` no existe.

- [ ] **Paso 3: Implementar**

Agregar a `reports.ts` (después de `informeGastos`):

```ts
// Resuelve el nombre a mostrar de uno o mas pos_customers.id: el nombre
// real del perfil si esta vinculado (profile_id), si no el nombre
// registrado en POS. Mismo criterio de fusion de identidad que
// informeClientes/historialCliente, pero como resolucion de nombre
// simple (no suma montos) -- lo reutilizan informeCreditos e
// informeAbonos para mostrar el cliente de cada venta/abono individual.
async function nombresClientesPos(customerIds: string[]): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map();
  const supabase = getSupabase();
  const { data: posCustomers, error } = await supabase.from("pos_customers").select("id, profile_id, nombre").in("id", customerIds);
  if (error) throw new Error(`No se pudieron consultar los clientes de POS: ${error.message}`);
  const filas = (posCustomers ?? []) as { id: string; profile_id: string | null; nombre: string }[];

  const idsConPerfil = filas.filter((f) => f.profile_id).map((f) => f.profile_id as string);
  const { data: perfiles, error: errorPerfiles } = idsConPerfil.length > 0
    ? await supabase.from("profiles").select("id, full_name, username").in("id", idsConPerfil)
    : { data: [] as { id: string; full_name: string | null; username: string }[], error: null };
  if (errorPerfiles) throw new Error(`No se pudieron consultar los nombres de clientes: ${errorPerfiles.message}`);
  const nombrePorProfile = new Map(((perfiles ?? []) as { id: string; full_name: string | null; username: string }[]).map((p) => [p.id, p.full_name ?? p.username]));

  return new Map(filas.map((f) => [f.id, (f.profile_id && nombrePorProfile.get(f.profile_id)) || f.nombre]));
}

export async function informeCreditos(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("pos_sales")
    .select("id, sale_number, customer_id, total, created_at")
    .eq("payment_method", "credito")
    .gte("created_at", desde);
  if (error) throw new Error(`No se pudieron consultar las ventas a crédito: ${error.message}`);

  const ventas = (data ?? []) as { id: string; sale_number: string; customer_id: string | null; total: number; created_at: string }[];
  if (ventas.length === 0) {
    return { texto: `No hubo ventas a crédito en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const idsVenta = ventas.map((v) => v.id);
  const { data: cuotas, error: errorCuotas } = await supabase
    .from("credit_installments")
    .select("sale_id, amount, paid_amount, status")
    .in("sale_id", idsVenta);
  if (errorCuotas) throw new Error(`No se pudieron consultar las cuotas de crédito: ${errorCuotas.message}`);
  const filasCuotas = (cuotas ?? []) as { sale_id: string; amount: number; paid_amount: number; status: string }[];

  const saldoPorVenta = new Map<string, number>();
  const pendientePorVenta = new Map<string, boolean>();
  for (const c of filasCuotas) {
    saldoPorVenta.set(c.sale_id, (saldoPorVenta.get(c.sale_id) ?? 0) + Number(c.amount) - Number(c.paid_amount));
    if (c.status !== "pagada") pendientePorVenta.set(c.sale_id, true);
  }

  const totalVendido = ventas.reduce((suma, v) => suma + Number(v.total), 0);
  const conSaldoPendiente = ventas.filter((v) => pendientePorVenta.get(v.id)).length;

  const texto = `Ventas a crédito de los últimos ${dias} día(s): ${formatoMoneda(totalVendido)} en ${ventas.length} venta(s), ${conSaldoPendiente} con saldo pendiente.`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const idsCliente = [...new Set(ventas.map((v) => v.customer_id).filter((id): id is string => Boolean(id)))];
  const nombrePorCliente = await nombresClientesPos(idsCliente);

  const { data: items, error: errorItems } = await supabase
    .from("pos_sale_items")
    .select("sale_id, product_id")
    .in("sale_id", idsVenta);
  if (errorItems) throw new Error(`No se pudieron consultar los productos de las ventas a crédito: ${errorItems.message}`);
  const filasItems = (items ?? []) as { sale_id: string; product_id: string | null }[];

  const idsProductos = [...new Set(filasItems.map((i) => i.product_id).filter((id): id is string => Boolean(id)))];
  const { data: productosData, error: errorProductos } = idsProductos.length > 0
    ? await supabase.from("products").select("id, name").in("id", idsProductos)
    : { data: [] as { id: string; name: string }[], error: null };
  if (errorProductos) throw new Error(`No se pudieron consultar los nombres de productos: ${errorProductos.message}`);
  const nombrePorProducto = new Map(((productosData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const productosPorVenta = new Map<string, string[]>();
  for (const it of filasItems) {
    const lista = productosPorVenta.get(it.sale_id) ?? [];
    lista.push(it.product_id ? (nombrePorProducto.get(it.product_id) ?? "(producto eliminado)") : "(producto eliminado)");
    productosPorVenta.set(it.sale_id, lista);
  }

  const filasTabla = [...ventas]
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .slice(0, TOPE_FILAS_PDF_DETALLE)
    .map((v) => [
      new Date(v.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }),
      v.customer_id ? (nombrePorCliente.get(v.customer_id) ?? "Cliente") : "Cliente",
      (productosPorVenta.get(v.id) ?? []).join(", ") || "—",
      formatoMoneda(Number(v.total)),
      formatoMoneda(Math.max(0, saldoPorVenta.get(v.id) ?? 0)),
    ]);

  const bytes = await generarPdfTabla(`Ventas a crédito — últimos ${dias} día(s)`, ["Fecha", "Cliente", "Productos", "Total", "Saldo pendiente"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-creditos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-creditos-merylay.pdf" }] };
}
```

**Nota de fecha:** `2026-10-05T10:00:00Z` son las 5:00am en Bogotá (UTC-5)
del mismo día 5 — por eso el test espera `"5/10/2026"` sin ambigüedad de
cambio de día (a diferencia de los tests de zona horaria de otros
informes, que usan deliberadamente una hora nocturna para probar el caso
límite; aquí no hace falta repetir esa prueba porque `generarPdfTabla` ya
se mockea por completo en este archivo y no vuelve a ejecutar
`toLocaleDateString` — lo que se está probando aquí es que
`informeCreditos` arma la fila con `America/Bogota`, no el caso límite de
medianoche, que ya está cubierto en `informeVentas`/`historialCliente`).

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "feat: agrega informeCreditos (ventas a credito, con cliente/productos/saldo pendiente en PDF)"
```

---

### Task 5: `reports.ts` — `informeAbonos`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/reports.ts`
- Modify: `supabase/functions/whatsapp-webhook/reports.test.ts`

**Interfaces:**
- Produce: `informeAbonos(dias: number, conPdf: boolean):
  Promise<RespuestaLectura>`.
- Consume: `nombresClientesPos` (Tarea 4, misma archivo).

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a `reports.test.ts` (después de `describe("informeCreditos",
...)`):

```ts
describe("informeAbonos", () => {
  it("desglosa el total abonado y lista cada abono con su cliente (a diferencia de otros informes, el texto SI lista cada uno)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      credit_payments: [{
        data: [
          { id: "pago-1", sale_id: "venta-1", amount: 50000, payment_method: "efectivo", created_at: "2026-10-05T15:00:00Z" },
        ],
        error: null,
      }],
      pos_sales: [{ data: [{ id: "venta-1", sale_number: "POS-1", customer_id: "cli-1" }], error: null }],
      pos_customers: [{ data: [{ id: "cli-1", profile_id: null, nombre: "Ana López" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeAbonos } = await import("./reports.ts");
    const resultado = await informeAbonos(1, false);

    expect(resultado.texto).toContain("$50.000 en 1 abono(s)");
    expect(resultado.texto).toContain("Ana López");
    expect(resultado.texto).toContain("$50.000");
  });

  it("sin abonos en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({ credit_payments: [{ data: [], error: null }] });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeAbonos } = await import("./reports.ts");
    const resultado = await informeAbonos(1, false);

    expect(resultado.texto).toContain("No hubo abonos registrados");
  });

  it("con mas de 10 abonos, el texto corta en 10 y avisa cuantos mas hay", async () => {
    const abonos = Array.from({ length: 12 }, (_, i) => ({
      id: `pago-${i}`, sale_id: `venta-${i}`, amount: 10000, payment_method: "efectivo", created_at: `2026-10-0${(i % 9) + 1}T15:00:00Z`,
    }));
    const supabase = mockSupabaseDesdeTablas({
      credit_payments: [{ data: abonos, error: null }],
      pos_sales: [{ data: abonos.map((a) => ({ id: a.sale_id, sale_number: "POS-X", customer_id: null })), error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeAbonos } = await import("./reports.ts");
    const resultado = await informeAbonos(9, false);

    expect(resultado.texto).toContain("y 2 abono(s) más");
  });

  it("con conPdf=true, cada fila liga el abono a su venta (sale_number)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      credit_payments: [{
        data: [{ id: "pago-1", sale_id: "venta-1", amount: 50000, payment_method: "nequi", created_at: "2026-10-05T15:00:00Z" }],
        error: null,
      }],
      pos_sales: [{ data: [{ id: "venta-1", sale_number: "POS-7", customer_id: null }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-marca.ts");

    const { informeAbonos } = await import("./reports.ts");
    await informeAbonos(1, true);

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      ["Fecha", "Cliente", "Monto", "Método", "Venta"],
      [["5/10/2026", "Cliente", "$50.000", "nequi", "POS-7"]],
    );
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: FAIL — `informeAbonos` no existe.

- [ ] **Paso 3: Implementar**

Agregar a `reports.ts` (después de `informeCreditos`):

```ts
export async function informeAbonos(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("credit_payments")
    .select("id, sale_id, amount, payment_method, created_at")
    .gte("created_at", desde);
  if (error) throw new Error(`No se pudieron consultar los abonos: ${error.message}`);

  const abonos = (data ?? []) as { id: string; sale_id: string; amount: number; payment_method: string; created_at: string }[];
  if (abonos.length === 0) {
    return { texto: `No hubo abonos registrados en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const idsVenta = [...new Set(abonos.map((a) => a.sale_id))];
  const { data: ventasData, error: errorVentas } = await supabase
    .from("pos_sales")
    .select("id, sale_number, customer_id")
    .in("id", idsVenta);
  if (errorVentas) throw new Error(`No se pudieron consultar las ventas de los abonos: ${errorVentas.message}`);
  const ventas = (ventasData ?? []) as { id: string; sale_number: string; customer_id: string | null }[];
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]));

  const idsCliente = [...new Set(ventas.map((v) => v.customer_id).filter((id): id is string => Boolean(id)))];
  const nombrePorCliente = await nombresClientesPos(idsCliente);

  const totalAbonado = abonos.reduce((suma, a) => suma + Number(a.amount), 0);

  // A diferencia de los otros informes, aqui el texto SI lista cada abono
  // individual (no solo el total): es la pregunta literal que motivo este
  // informe ("que cliente hizo abonos hoy"), y con "dias" cortos (ej. 1)
  // en la practica siempre son pocos -- mismo tope de 10 que el resto.
  const TOPE_ABONOS_TEXTO = 10;
  const ordenados = [...abonos].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  const nombreClienteDeAbono = (a: { sale_id: string }) => {
    const venta = ventaPorId.get(a.sale_id);
    return venta?.customer_id ? (nombrePorCliente.get(venta.customer_id) ?? "Cliente") : "Cliente";
  };
  const detalle = ordenados.slice(0, TOPE_ABONOS_TEXTO)
    .map((a) => `${new Date(a.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} — ${nombreClienteDeAbono(a)}: ${formatoMoneda(Number(a.amount))}`)
    .join("\n");
  const notaTruncado = abonos.length > TOPE_ABONOS_TEXTO ? `\n… y ${abonos.length - TOPE_ABONOS_TEXTO} abono(s) más.` : "";

  const texto = `Abonos de los últimos ${dias} día(s): ${formatoMoneda(totalAbonado)} en ${abonos.length} abono(s).\n${detalle}${notaTruncado}`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = ordenados.slice(0, TOPE_FILAS_PDF_DETALLE).map((a) => {
    const venta = ventaPorId.get(a.sale_id);
    return [
      new Date(a.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }),
      nombreClienteDeAbono(a),
      formatoMoneda(Number(a.amount)),
      a.payment_method,
      venta?.sale_number ?? "—",
    ];
  });

  const bytes = await generarPdfTabla(`Abonos — últimos ${dias} día(s)`, ["Fecha", "Cliente", "Monto", "Método", "Venta"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-abonos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-abonos-merylay.pdf" }] };
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: PASS.

- [ ] **Paso 5: Verificar tipos**

Run: `npx deno check --import-map=supabase/functions/deno.json supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts`
Expected: sin errores.

- [ ] **Paso 6: Commit**

```bash
git add supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/reports.test.ts
git commit -m "feat: agrega informeAbonos (pagos contra ventas a credito, con cliente)"
```

---

### Task 6: Conectar `handler.ts` y `agent.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.test.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.test.ts`

**Interfaces:**
- Consume: `consultarProductos` (Tarea 3), `informeCreditos`,
  `informeAbonos` (Tareas 4, 5).

- [ ] **Paso 1: Escribir los tests que fallan**

En `handler.test.ts`:

1. En el objeto `mocks` del `vi.hoisted`, quitar `buscarInventario` y
   `generarInformePdf` (ya no existen), y agregar:
```ts
  consultarProductos: vi.fn(),
  informeCreditos: vi.fn(),
  informeAbonos: vi.fn(),
```

2. En `vi.mock("./owner-actions.ts", () => ({...}))`, quitar
   `buscarInventario: mocks.buscarInventario,` y `generarInformePdf:
   mocks.generarInformePdf,`, agregar `consultarProductos:
   mocks.consultarProductos,`.

3. En `vi.mock("./reports.ts", () => ({...}))`, agregar:
```ts
  informeCreditos: mocks.informeCreditos,
  informeAbonos: mocks.informeAbonos,
```

4. **Borrar** los tests existentes que ejercitan los casos
   `"buscar_inventario"` y `"generar_informe_pdf"` (buscar las pruebas
   que llaman `mocks.buscarInventario`/`mocks.generarInformePdf` o que
   usan `decidirAccion` con `action: "buscar_inventario"` /
   `"generar_informe_pdf"` — reemplazarlas por las de abajo).

5. Agregar, dentro de `describe("acciones de lectura del dueño con
   fotos/documentos", ...)`:

```ts
  it("consultar_productos: sin ningun filtro, pregunta en vez de llamar a la base de datos", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6a", from: "573215879805", texto: "muestrame productos" });
    mocks.decidirAccion.mockResolvedValue({ action: "consultar_productos", params: {}, response_message: "" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).not.toHaveBeenCalled();
    expect(clienteMocks.enviarDocumentoPorLink).not.toHaveBeenCalled();
  });

  it("consultar_productos: pasa filtros, formato y conFotos a owner-actions tal cual", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6b", from: "573215879805", texto: "lista de camisetas talla M agregadas en los ultimos 2 dias, sin foto" });
    mocks.decidirAccion.mockResolvedValue({
      action: "consultar_productos",
      params: { texto: "camisetas", talla: "M", agregadoDesdeDias: 2, formato: "lista", conFotos: false },
      response_message: "",
    });
    mocks.consultarProductos.mockResolvedValue({ texto: "Encontré 3 producto(s)...", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).toHaveBeenCalledWith(
      { texto: "camisetas", talla: "M", color: undefined, agregadoDesdeDias: 2 },
      "lista",
      false,
    );
  });

  it("consultar_productos: un formato desconocido/ausente cae a 'conteo'", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6c", from: "573215879805", texto: "cuantas camisetas hay" });
    mocks.decidirAccion.mockResolvedValue({ action: "consultar_productos", params: { texto: "camisetas" }, response_message: "" });
    mocks.consultarProductos.mockResolvedValue({ texto: "Encontré...", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).toHaveBeenCalledWith(expect.anything(), "conteo", false);
  });

  it("informe_creditos llama a reports.informeCreditos con dias y conPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6d", from: "573215879805", texto: "cuantos creditos hay" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_creditos", params: { dias: 30, conPdf: true }, response_message: "" });
    mocks.informeCreditos.mockResolvedValue({ texto: "Ventas a crédito: $500.000", fotos: [], documentos: [{ link: "https://x/c.pdf", filename: "informe-creditos-merylay.pdf" }] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeCreditos).toHaveBeenCalledWith(30, true);
    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573215879805", "https://x/c.pdf", "informe-creditos-merylay.pdf");
  });

  it("informe_abonos llama a reports.informeAbonos con dias y conPdf (default dias=1 si el modelo no lo manda)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6e", from: "573215879805", texto: "que cliente abono hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_abonos", params: {}, response_message: "" });
    mocks.informeAbonos.mockResolvedValue({ texto: "Abonos: $50.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeAbonos).toHaveBeenCalledWith(1, false);
  });
```

En `agent.test.ts`, dentro del test que documenta los parámetros exactos
de cada acción, agregar `"agregadoDesdeDias", "formato"` a la lista de
claves verificadas, y después del `for`:

```ts
    expect(prompt).toContain("consultar_productos");
    expect(prompt).toContain("informe_creditos");
    expect(prompt).toContain("informe_abonos");
    expect(prompt).not.toContain("buscar_inventario:");
    expect(prompt).not.toContain("generar_informe_pdf:");
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar**

En `handler.ts`:

1. Cambiar el import de `reports.ts`:
```ts
import { informeVentas, productosMasVendidos, informeClientes, historialCliente, informeGastos, informeCreditos, informeAbonos } from "./reports.ts";
```

2. En `ejecutarAccionLectura`, **reemplazar** los casos
   `"buscar_inventario"` y `"generar_informe_pdf"` (los dos bloques
   completos) por:

```ts
    case "consultar_productos": {
      const filtros = {
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
        agregadoDesdeDias: params.agregadoDesdeDias as number | undefined,
      };
      if (!filtros.texto && !filtros.talla && !filtros.color && !filtros.agregadoDesdeDias) {
        return { texto: "¿Qué producto o categoría quieres que busque? Dime el nombre, la talla, el color, o desde cuándo se agregó.", fotos: [], documentos: [] };
      }
      const formatosValidos = ["conteo", "lista", "pdf_fotos", "pdf_tabla"];
      const formato = formatosValidos.includes(params.formato as string)
        ? (params.formato as "conteo" | "lista" | "pdf_fotos" | "pdf_tabla")
        : "conteo";
      return ownerActions.consultarProductos(filtros, formato, Boolean(params.conFotos));
    }
    case "informe_creditos": {
      const dias = diasValidos(params.dias, 30);
      return informeCreditos(dias, Boolean(params.conPdf));
    }
    case "informe_abonos": {
      const dias = diasValidos(params.dias, 1);
      return informeAbonos(dias, Boolean(params.conPdf));
    }
```

**No tocar ningún otro caso del switch** (`informe_ventas`,
`productos_mas_vendidos`, `informe_clientes`, `historial_cliente`,
`informe_gastos`, `consultar_stock_bajo`, `buscar_cliente`,
`consultar_pedido`, `default`) — quedan exactamente igual.

En `agent.ts`, en `ACCIONES_DUENO`, **reemplazar** las dos líneas de
`buscar_inventario` y `generar_informe_pdf` por estas tres:

```
- consultar_productos: params {"texto": string | null, "talla": string | null, "color": string | null, "agregadoDesdeDias": entero >= 1 | null, "formato": "conteo" | "lista" | "pdf_fotos" | "pdf_tabla", "conFotos": boolean} — al menos uno de texto/talla/color/agregadoDesdeDias es obligatorio. "formato": "conteo" (por defecto) para preguntas de cantidad/existencia ("cuantas camisetas hay"); "lista" cuando el dueño pide un listado de nombres sin fotos ni PDF ("dame la lista de...", "cuales son"); "pdf_fotos" cuando pide fotos/imagenes en un informe; "pdf_tabla" cuando pide un informe o tabla SIN fotos (ej. "sin foto"). "agregadoDesdeDias" filtra por cuando se agrego el producto al catalogo (ej. "agregadas en los ultimos 2 dias" = 2). "conFotos" solo aplica con formato "conteo"/"lista": true si el dueño pidio ver imagenes en vivo ademas del texto (se ignora si formato ya es un PDF).
- informe_creditos: params {"dias": entero >= 1, "conPdf": boolean} — ventas a credito del periodo: total, cuantas, cuantas con saldo pendiente. Con conPdf, el detalle incluye cliente, productos y saldo pendiente por venta.
- informe_abonos: params {"dias": entero >= 1, "conPdf": boolean} — abonos (pagos contra ventas a credito) del periodo: total, cuantos, y quien abono cada uno. "hoy" = dias:1 (ej. "que cliente hizo abonos hoy").
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: PASS.

- [ ] **Paso 5: Correr la suite completa**

Run: `pnpm test`
Expected: PASS en todos los archivos (confirma que nada de `catalog.ts`,
`owner-actions.ts`, `reports.ts` quedó con una referencia rota).

- [ ] **Paso 6: Verificar tipos de todo lo tocado**

Run: `npx deno check --import-map=supabase/functions/deno.json supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/agent.ts supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: sin errores (aparte de los 14 errores ya preexistentes y no
relacionados en `agent.test.ts`, documentados en plans anteriores —
confirmar que el conteo sigue siendo 14, no más).

- [ ] **Paso 7: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/agent.ts supabase/functions/whatsapp-webhook/agent.test.ts
git commit -m "feat: conecta consultar_productos/informe_creditos/informe_abonos al dispatcher del dueño y al prompt"
```

---

### Task 7: Limpieza final y verificación

**Files:**
- Modify: cualquier archivo con referencias residuales a
  `buscarInventario`/`generarInformePdf`.

- [ ] **Paso 1: Buscar referencias residuales**

```bash
grep -rn "buscarInventario\|generarInformePdf\|buscar_inventario\|generar_informe_pdf" supabase/functions --include="*.ts"
```

Expected: sin resultados en código (solo aceptable en `docs/`, si
acaso, como documentos históricos).

- [ ] **Paso 2: Correr la suite completa**

Run: `pnpm test`
Expected: PASS en todos los archivos.

- [ ] **Paso 3: Verificar tipos con `deno check`**

Run (desde la raíz del repo):
```bash
npx deno check --import-map=supabase/functions/deno.json supabase/functions/whatsapp-webhook/pdf-marca.ts supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/reports.ts supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/agent.ts
```
Expected: sin errores. (`npx deno` tarda unos segundos en resolver la
primera vez — si el comando no devuelve nada de inmediato, no asumir que
`deno` no está disponible; esperar la respuesta completa antes de
concluir que falló.)

- [ ] **Paso 4: Commit (solo si el paso 1 encontró algo que corregir)**

```bash
git add -A
git commit -m "chore: limpieza final de referencias a buscarInventario/generarInformePdf"
```

---

## Después de este plan

Con la suite en verde, fusionar a `master` (una vez el PR
`fix-busqueda-singular-plural` ya esté fusionado — ver Global
Constraints), pushear, y redesplegar `whatsapp-webhook` vía
`mcp__supabase__deploy_edge_function` incluyendo `pdf-marca.ts`
actualizado junto con todos los demás archivos ya desplegados.
