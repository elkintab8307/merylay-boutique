# Agente de WhatsApp v2: catálogo abierto, fotos, botón de compra y voz — Plan de implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para implementar este plan tarea por
> tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Objetivo:** Ampliar el agente de WhatsApp ya en producción para que los
dueños puedan buscar inventario por categoría/talla/color/texto libre con
fotos e informes PDF, los clientes reciban tarjetas de producto con foto
y un botón "Agregar al carrito", y ambos puedan mandar notas de voz que
el bot transcribe y procesa igual que un mensaje escrito.

**Arquitectura:** Todo vive en `supabase/functions/whatsapp-webhook/` y
`supabase/functions/_shared/`, sin tocar el modelo de datos ni agregar
secretos. Una función de búsqueda compartida (`buscarCatalogo`) alimenta
tanto las respuestas en vivo (fotos/botones) como los PDF con fotos. Los
mensajes entrantes se clasifican en `texto`/`audio`/`boton`; el toque de
un botón nunca pasa por el modelo de IA.

**Tech Stack:** Deno, TypeScript, Vitest, `@supabase/supabase-js`, `zod`,
`pdf-lib`, Meta Cloud API (Graph API v21.0 — mensajes de texto, imagen,
documento, interactivos de botón, y descarga de medios), OpenAI
(`gpt-4o-mini` para decisiones, `whisper-1` para transcripción).

**Spec:**
`docs/superpowers/specs/2026-10-07-agente-whatsapp-v2-catalogo-fotos-voz-design.md`
(y el spec v1, `2026-10-06-agente-whatsapp-design.md`, para todo lo que
no cambia: firma del webhook, idempotencia, identidad de clientes, pago
Wompi, notificación de venta nueva).

## Global Constraints

- Todo el texto orientado al usuario (mensajes del bot, captions, títulos
  de PDF) en español — sección 0 de `CLAUDE.md`.
- Cero migraciones nuevas, cero columnas/tablas nuevas — todo el diseño
  usa el esquema ya existente.
- Cero secretos nuevos — reutilizar `META_ACCESS_TOKEN`,
  `META_PHONE_NUMBER_ID`, `OPENAI_API_KEY` ya configurados.
- Ninguna acción de escritura del dueño se ejecuta sin la confirmación
  previa que ya exige el flujo actual (`pendingConfirmation`) — nada en
  este plan toca ese *gate*; el botón de "Agregar al carrito" nunca es
  una acción de escritura del dueño, solo del carrito conversacional del
  cliente.
- El `id` de un botón de WhatsApp nunca se usa para precio/stock/nombre —
  siempre se revalida contra la base de datos real
  (`obtenerProductoParaCarrito`) antes de tocar el carrito.
- Un mensaje transcrito desde audio se trata exactamente igual que un
  mensaje de texto del usuario, sin excepciones ni atajos.
- TDD en cada paso: el test se escribe y se corre en rojo antes de
  escribir la implementación.
- Nombres de funciones/variables nuevas en español, siguiendo la
  convención ya usada en este directorio (`buscarProductos`,
  `consultarVentas`, etc.).

## Review Focus

- Doble toque del botón "Agregar al carrito" (dos mensajes `interactive`
  distintos, no un reintento de Meta con el mismo `message_id`) debe
  sumar cantidad igual que agregarlo dos veces por texto, no fallar ni
  duplicar la fila del carrito — cubierto en la Tarea 10.
- Un producto que se agota o se desactiva entre que se manda la foto con
  botón y el cliente lo toca debe responder "agotado"/"no encontrado" sin
  agregarlo, porque siempre revalida contra la base de datos real — cubierto
  en la Tarea 10.
- Una nota de voz en silencio o con un formato que Whisper no puede
  transcribir no debe ejecutar ninguna acción ni lanzar una excepción sin
  capturar — debe responder el mensaje de fallback sin llamar a
  `decidirAccion` — cubierto en la Tarea 11.
- `buscarCatalogo` sin ningún filtro (el modelo decide mal los params)
  debe fallar de forma clara en vez de devolver todo el catálogo activo
  sin querer — cubierto en la Tarea 2.
- Una foto puntual que falla al descargarse durante la generación de un
  PDF no debe abortar el documento completo — esa fila se dibuja sin
  imagen — cubierto en la Tarea 3.

---

### Tarea 1: Helpers de medios y botón interactivo en `_shared/meta.ts`

**Files:**
- Modify: `supabase/functions/_shared/meta.ts`
- Test: `supabase/functions/_shared/meta.test.ts`

**Interfaces:**
- Produce: `obtenerUrlMedia(mediaId: string): Promise<string>`,
  `descargarMedia(url: string): Promise<Uint8Array>`,
  `enviarBotonProducto(to: string, opts: { fotoUrl: string; cuerpo: string; botonId: string; botonTitulo: string }): Promise<void>`.
- Consume: `credenciales()` ya existente en el mismo archivo (no se
  exporta, se reusa tal cual).

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar al final de `supabase/functions/_shared/meta.test.ts`:

```ts
describe("obtenerUrlMedia", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pide la url real del medio a la Graph API con el token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ url: "https://graph.facebook.com/medio-real.ogg" }),
      { status: 200 },
    )));
    const { obtenerUrlMedia } = await import("./meta.ts");

    const url = await obtenerUrlMedia("media-123");

    expect(url).toBe("https://graph.facebook.com/medio-real.ogg");
    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/media-123",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token-de-prueba" }) }),
    );
  });

  it("lanza un error si la Graph API responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no autorizado", { status: 401 })));
    const { obtenerUrlMedia } = await import("./meta.ts");
    await expect(obtenerUrlMedia("media-123")).rejects.toThrow(/401/);
  });
});

describe("descargarMedia", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("descarga los bytes del medio con el token de autorizacion", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200 })));
    const { descargarMedia } = await import("./meta.ts");

    const resultado = await descargarMedia("https://graph.facebook.com/medio-real.ogg");

    expect(new Uint8Array(resultado)).toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/medio-real.ogg",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token-de-prueba" }) }),
    );
  });

  it("lanza un error si la descarga falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no encontrado", { status: 404 })));
    const { descargarMedia } = await import("./meta.ts");
    await expect(descargarMedia("https://graph.facebook.com/no-existe.ogg")).rejects.toThrow(/404/);
  });
});

describe("enviarBotonProducto", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("manda un mensaje interactivo con imagen, cuerpo y un boton de respuesta", async () => {
    const { enviarBotonProducto } = await import("./meta.ts");

    await enviarBotonProducto("573001234567", {
      fotoUrl: "https://x/foto.jpg",
      cuerpo: "Pijama Rosa\nTalla M\n$89.900\nStock: 5",
      botonId: "add:11111111-1111-4111-8111-111111111111:-",
      botonTitulo: "Agregar al carrito",
    });

    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toMatchObject({
      to: "573001234567",
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "image", image: { link: "https://x/foto.jpg" } },
        body: { text: "Pijama Rosa\nTalla M\n$89.900\nStock: 5" },
        action: { buttons: [{ type: "reply", reply: { id: "add:11111111-1111-4111-8111-111111111111:-", title: "Agregar al carrito" } }] },
      },
    });
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/_shared/meta.test.ts`
Expected: FAIL — `obtenerUrlMedia`, `descargarMedia` y `enviarBotonProducto` no existen todavía.

- [ ] **Paso 3: Implementar**

Agregar en `supabase/functions/_shared/meta.ts`, después de `credenciales()`:

```ts
export async function obtenerUrlMedia(mediaId: string): Promise<string> {
  const { token } = credenciales();
  const respuesta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    throw new Error(`Graph API respondio ${respuesta.status} al pedir la url del medio ${mediaId}.`);
  }
  const cuerpo = await respuesta.json();
  return cuerpo.url as string;
}

export async function descargarMedia(url: string): Promise<Uint8Array> {
  const { token } = credenciales();
  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar el medio: la Graph API respondio ${respuesta.status}.`);
  }
  return new Uint8Array(await respuesta.arrayBuffer());
}

export async function enviarBotonProducto(
  to: string,
  opts: { fotoUrl: string; cuerpo: string; botonId: string; botonTitulo: string },
): Promise<void> {
  await enviarMensaje({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "image", image: { link: opts.fotoUrl } },
      body: { text: opts.cuerpo },
      action: { buttons: [{ type: "reply", reply: { id: opts.botonId, title: opts.botonTitulo } }] },
    },
  });
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/_shared/meta.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/_shared/meta.ts supabase/functions/_shared/meta.test.ts
git commit -m "feat: helpers de descarga de medios y boton interactivo en meta.ts"
```

---

### Tarea 2: `buscarCatalogo` generalizado en `catalog.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/catalog.ts`
- Modify: `supabase/functions/whatsapp-webhook/catalog.test.ts`

**Interfaces:**
- Produce: `interface FiltrosCatalogo { texto?: string; talla?: string; color?: string }`,
  `buscarCatalogo(filtros: FiltrosCatalogo): Promise<ProductoEncontrado[]>`.
- Consume: `ProductoEncontrado`, `escaparPatronLike`, `getSupabase` ya
  existentes en el mismo archivo.
- **No elimina `buscarProductos` todavía** — `handler.ts` sigue
  llamándola hasta que la Tarea 7 reescribe `buscar_producto` para usar
  `buscarCatalogo` en su lugar. Borrarla ahora dejaría `handler.ts` sin
  compilar entre esta tarea y la Tarea 7. `buscarProductos` y sus tests
  quedan intactos; `buscarCatalogo` se agrega al lado.

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar (sin tocar el `describe("buscarProductos", ...)` existente,
líneas 12-79) un nuevo `describe` en `catalog.test.ts`, después de ese
bloque:

```ts
function mockCatalogo(productos: unknown[]) {
  const resultado = { data: productos, error: null };
  const query: Record<string, unknown> = {};
  const encadenable = vi.fn(() => query);
  query.eq = encadenable;
  query.ilike = encadenable;
  (query as { then: unknown }).then = (resolve: (v: typeof resultado) => void) => resolve(resultado);
  const select = vi.fn(() => query);
  const supabase = { from: vi.fn(() => ({ select })) };
  return { supabase, select, query };
}

describe("buscarCatalogo", () => {
  it("sin ningun filtro lanza un error claro", async () => {
    const { buscarCatalogo } = await import("./catalog.ts");
    await expect(buscarCatalogo({})).rejects.toThrow(/al menos un filtro/);
  });

  it("con texto, filtra por nombre del producto O nombre de categoria (en memoria, case-insensitive)", async () => {
    const productos = [
      { id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, categories: { name: "Pijamas" }, product_variants: [], product_images: [] },
      { id: "p2", name: "Camiseta Blanca", price: 40000, stock: 3, categories: { name: "Camiseta algodón licrado" }, product_variants: [], product_images: [] },
      { id: "p3", name: "Bata Dorada", price: 120000, stock: 2, categories: { name: "Batas" }, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "camiseta" });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Camiseta Blanca");
  });

  it("con talla, usa product_variants!inner y filtra por talla", async () => {
    const productos = [
      {
        id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, categories: { name: "Pijamas" },
        product_variants: [{ id: "v1", talla: "M", color: "Rosa", price_override: null, stock: 4 }],
        product_images: [],
      },
    ];
    const { supabase, select } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ talla: "M" });

    expect(select).toHaveBeenCalledWith(expect.stringContaining("product_variants!inner"));
    expect(resultado).toEqual([{
      productId: "p1", variantId: "v1", nombre: "Pijama Rosa", talla: "M", color: "Rosa",
      precio: 89900, stock: 4, imageId: null, fotoUrl: null,
    }]);
  });

  it("devuelve como maximo 50 filas", async () => {
    const productos = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, name: `Camiseta ${i}`, price: 40000, stock: 1,
      categories: { name: "Camisetas" }, product_variants: [], product_images: [],
    }));
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "camiseta" });

    expect(resultado).toHaveLength(50);
  });
});
```

Dejar intacto el resto del archivo de test (`obtenerProductoParaCarrito`,
`generarCatalogoPdf`, `generarCotizacionPdf` se tocan en la Tarea 3).

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: FAIL — `buscarCatalogo` no existe.

- [ ] **Paso 3: Implementar**

En `catalog.ts`, agregar después de la interfaz `VarianteProducto`:

```ts
export interface FiltrosCatalogo {
  texto?: string;
  talla?: string;
  color?: string;
}

const TOPE_BUSCAR_CATALOGO = 50;

export async function buscarCatalogo(filtros: FiltrosCatalogo): Promise<ProductoEncontrado[]> {
  if (!filtros.texto && !filtros.talla && !filtros.color) {
    throw new Error("buscarCatalogo requiere al menos un filtro (texto, talla o color).");
  }

  const supabase = getSupabase();
  // product_variants!inner: cuando se filtra por talla/color, Postgres solo
  // devuelve las variantes que cumplen el filtro (no todas las del
  // producto) -- exactamente lo que se quiere expandir despues. Sin
  // talla/color no se usa !inner: un producto sin ninguna variante que
  // "coincida" (porque no se esta filtrando por variante) no debe excluirse.
  const variantesEmbed = (filtros.talla || filtros.color)
    ? "product_variants!inner(id, talla, color, price_override, stock)"
    : "product_variants(id, talla, color, price_override, stock)";

  let query = supabase
    .from("products")
    .select(`id, name, price, stock, categories(name), ${variantesEmbed}, product_images(id, url, is_primary, variant_id, vendida)`)
    .eq("is_active", true);

  if (filtros.talla) query = query.ilike("product_variants.talla", `%${escaparPatronLike(filtros.talla)}%`);
  if (filtros.color) query = query.ilike("product_variants.color", `%${escaparPatronLike(filtros.color)}%`);

  const { data, error } = await query;
  if (error || !data) return [];

  const productos = data as unknown as Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    categories: { name: string } | null;
    product_variants: VarianteProducto[] | null;
    product_images: ImagenProducto[] | null;
  }>;

  // El texto se filtra en memoria (no en la consulta) porque PostgREST no
  // compone de forma simple un .or() entre una columna propia (name) y una
  // columna de una tabla relacionada (categories.name) dentro de la misma
  // llamada -- a esta escala de catalogo (decenas de productos activos) el
  // costo es insignificante.
  const textoNormalizado = filtros.texto?.toLowerCase();
  const filtrados = textoNormalizado
    ? productos.filter((p) =>
        p.name.toLowerCase().includes(textoNormalizado) ||
        (p.categories?.name ?? "").toLowerCase().includes(textoNormalizado))
    : productos;

  const expandido = filtrados.flatMap((producto): ProductoEncontrado[] => {
    const variantes = producto.product_variants ?? [];
    if (variantes.length === 0) {
      const imagen = elegirImagen(producto.product_images, null);
      return [{
        productId: producto.id,
        variantId: null,
        nombre: producto.name,
        talla: null,
        color: null,
        precio: producto.price,
        stock: producto.stock,
        imageId: imagen?.id ?? null,
        fotoUrl: imagen?.url ?? null,
      }];
    }
    return variantes.map((variante) => {
      const imagen = elegirImagen(producto.product_images, variante.id);
      return {
        productId: producto.id,
        variantId: variante.id,
        nombre: producto.name,
        talla: variante.talla ?? null,
        color: variante.color ?? null,
        precio: variante.price_override ?? producto.price,
        stock: variante.stock,
        imageId: imagen?.id ?? null,
        fotoUrl: imagen?.url ?? null,
      };
    });
  });

  return expandido.slice(0, TOPE_BUSCAR_CATALOGO);
}
```

`buscarProductos` queda sin tocar, debajo de esta función nueva.

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: PASS (el `describe("buscarProductos", ...)` original sigue
intacto y en verde; `buscarCatalogo` es una función nueva al lado).

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/catalog.test.ts
git commit -m "feat: agrega buscarCatalogo generalizado (texto/talla/color) junto a buscarProductos"
```

---

### Tarea 3: `generarPdfConFotos` y PDFs con fotos reales

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/catalog.ts`
- Modify: `supabase/functions/whatsapp-webhook/catalog.test.ts`

**Interfaces:**
- Produce: `interface FilaPdf { fotoUrl: string | null; nombre: string; detalle: string; precio: number; nota?: string }`,
  `generarPdfConFotos(titulo: string, filas: FilaPdf[]): Promise<Uint8Array>`.
- Modifica contrato: `generarCatalogoPdf(filtros?: FiltrosCatalogo): Promise<string>`
  (antes sin parámetros); `generarCotizacionPdf(items: ItemCarrito[]): Promise<string>`
  (mismo contrato externo, cambia la implementación interna).
- Elimina: `pdfDesdeLineas` (queda sin usos).
- Consume: `FiltrosCatalogo`/`buscarCatalogo` (Tarea 2), `PDFDocument`,
  `StandardFonts` de `pdf-lib`.

- [ ] **Paso 1: Escribir los tests que fallan**

Reemplazar los tres `describe` finales de `catalog.test.ts`
(`generarCatalogoPdf`, `generarCotizacionPdf`) por:

```ts
describe("generarPdfConFotos", () => {
  it("dibuja una fila por producto, con foto cuando la descarga funciona", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 })));
    const { generarPdfConFotos } = await import("./catalog.ts");

    const bytes = await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: "https://x/foto.jpg", nombre: "Pijama Rosa", detalle: "talla M", precio: 89900, nota: "stock: 5" },
    ]);

    expect(bytes.byteLength).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("si la descarga de una foto falla, esa fila se dibuja sin imagen (no aborta el PDF)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    const { generarPdfConFotos } = await import("./catalog.ts");

    const bytes = await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: "https://x/rota.jpg", nombre: "Pijama Rosa", detalle: "talla M", precio: 89900 },
    ]);

    expect(bytes.byteLength).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("una fila sin fotoUrl no intenta descargar nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfConFotos } = await import("./catalog.ts");

    await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: null, nombre: "Pijama Rosa", detalle: "talla M", precio: 89900 },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("generarCatalogoPdf", () => {
  it("sin filtros, usa el catalogo completo de productos activos y sube el PDF firmado", async () => {
    const order = vi.fn(async () => ({
      data: [{ name: "Pijama Rosa", price: 89900, stock: 5, categories: null, product_variants: [], product_images: [] }],
      error: null,
    }));
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-firmado.pdf" }, error: null }));
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf();

    expect(url).toBe("https://x/catalogo-firmado.pdf");
    expect(upload).toHaveBeenCalled();
  });

  it("con filtros, usa buscarCatalogo en vez del catalogo completo", async () => {
    const query: Record<string, unknown> = {};
    query.eq = vi.fn(() => query);
    (query as { then: unknown }).then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [{ id: "p1", name: "Camiseta Azul", price: 40000, stock: 2, categories: { name: "Camisetas" }, product_variants: [], product_images: [] }], error: null });
    const select = vi.fn(() => query);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-filtrado.pdf" }, error: null }));
    const supabase = {
      from: vi.fn(() => ({ select })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf({ texto: "camiseta" });

    expect(url).toBe("https://x/catalogo-filtrado.pdf");
    expect(select).toHaveBeenCalled();
  });

  it("lanza un error descriptivo si la consulta de productos falla (sin filtros)", async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: "fallo de red" } }));
    const upload = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl: vi.fn() })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    await expect(generarCatalogoPdf()).rejects.toThrow(/fallo de red/);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("generarCotizacionPdf", () => {
  it("sube un PDF con fotos de los items del carrito y devuelve una URL firmada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 })));
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/firmado.pdf" }, error: null }));
    const supabase = { storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCotizacionPdf } = await import("./catalog.ts");
    const url = await generarCotizacionPdf([
      { productId: "p1", variantId: null, imageId: null, qty: 2, unitPrice: 50000, nameSnapshot: "Pijama Rosa" },
    ]);

    expect(url).toBe("https://x/firmado.pdf");
    expect(upload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: FAIL — `generarPdfConFotos` no existe; `generarCatalogoPdf` no
acepta filtros; `ItemCarrito` no tiene foto asociada para el nuevo PDF.

- [ ] **Paso 3: Implementar**

Reemplazar `pdfDesdeLineas` en `catalog.ts` por:

```ts
export interface FilaPdf {
  fotoUrl: string | null;
  nombre: string;
  detalle: string;
  precio: number;
  nota?: string;
}

const ALTO_FILA_PDF = 70;

export async function generarPdfConFotos(titulo: string, filas: FilaPdf[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([450, 140 + filas.length * ALTO_FILA_PDF]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  let y = pagina.getHeight() - 40;
  pagina.drawText(titulo, { x: 20, y, size: 16, font: fuente });
  y -= 35;

  for (const fila of filas) {
    let anchoTexto = 20;
    if (fila.fotoUrl) {
      try {
        const bytes = await fetch(fila.fotoUrl).then((r) => {
          if (!r.ok) throw new Error(`descarga respondio ${r.status}`);
          return r.arrayBuffer();
        });
        const imagen = fila.fotoUrl.toLowerCase().endsWith(".png")
          ? await pdf.embedPng(bytes)
          : await pdf.embedJpg(bytes);
        const alto = 50;
        const ancho = (imagen.width / imagen.height) * alto;
        pagina.drawImage(imagen, { x: 20, y: y - alto + 10, width: ancho, height: alto });
        anchoTexto = 20 + ancho + 15;
      } catch (error) {
        console.error(`[catalog] No se pudo incrustar la foto de "${fila.nombre}" en el PDF:`, error);
      }
    }
    pagina.drawText(fila.nombre, { x: anchoTexto, y, size: 12, font: fuente });
    pagina.drawText(
      `${fila.detalle} — $${fila.precio.toLocaleString("es-CO")}${fila.nota ? ` — ${fila.nota}` : ""}`,
      { x: anchoTexto, y: y - 18, size: 10, font: fuente },
    );
    y -= ALTO_FILA_PDF;
  }

  return pdf.save();
}
```

Reescribir `generarCatalogoPdf` y `generarCotizacionPdf`:

```ts
export async function generarCatalogoPdf(filtros?: FiltrosCatalogo): Promise<string> {
  const productos = filtros
    ? await buscarCatalogo(filtros)
    : await (async () => {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("products")
          .select("name, price, stock")
          .eq("is_active", true)
          .order("name");
        if (error) {
          throw new Error(`No se pudo consultar los productos para el catalogo: ${error.message}`);
        }
        return ((data ?? []) as Array<{ name: string; price: number; stock: number }>).map((p) => ({
          productId: "", variantId: null, nombre: p.name, talla: null, color: null,
          precio: p.price, stock: p.stock, imageId: null, fotoUrl: null,
        }));
      })();

  const filas: FilaPdf[] = productos.map((p) => ({
    fotoUrl: p.fotoUrl,
    nombre: p.nombre,
    detalle: [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ") || "—",
    precio: p.precio,
    nota: `stock: ${p.stock}`,
  }));

  const bytes = await generarPdfConFotos("Catalogo MeryLay Boutique", filas);
  return subirYFirmar(bytes, "catalogo.pdf");
}

export async function generarCotizacionPdf(items: ItemCarrito[]): Promise<string> {
  const filas: FilaPdf[] = items.map((item) => ({
    fotoUrl: null,
    nombre: item.nameSnapshot,
    detalle: `x${item.qty}`,
    precio: item.unitPrice * item.qty,
  }));
  const bytes = await generarPdfConFotos("Cotizacion MeryLay Boutique", filas);
  return subirYFirmar(bytes, "cotizacion.pdf");
}
```

> Nota: `ItemCarrito` no trae la URL de la foto (solo `imageId`), así que
> la cotización se queda sin fotos por ahora — es una limitación conocida
> y aceptable: mostrar fotos ahí exigiría una consulta adicional por
> `imageId` que no aporta tanto como en el informe/catálogo (el cliente ya
> vio la foto cuando agregó el producto). `fotoUrl: null` en cada fila
> ejercita exactamente la rama "sin imagen" de `generarPdfConFotos`.

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/catalog.test.ts
git commit -m "feat: PDF con fotos reales para catalogo/cotizacion, con filtros opcionales"
```

---

### Tarea 4: `buscarInventario`/`generarInformePdf` del dueño en `owner-actions.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.ts`
- Modify: `supabase/functions/whatsapp-webhook/owner-actions.test.ts`

**Interfaces:**
- Produce: `interface RespuestaLectura { texto: string; fotos: { url: string; caption: string }[]; documentos: { link: string; filename: string }[] }`,
  `buscarInventario(filtros: FiltrosCatalogo): Promise<RespuestaLectura>`,
  `generarInformePdf(filtros: FiltrosCatalogo): Promise<RespuestaLectura>`.
- Consume: `FiltrosCatalogo`, `buscarCatalogo`, `generarPdfConFotos`,
  `FilaPdf` (Tareas 2-3), `subirYFirmar` (ya existe en `catalog.ts` —
  exportarla si no lo está, para que `generarInformePdf` la reuse en vez
  de duplicar la subida/firma).
- Elimina: `consultarProducto` (reemplazada por `buscarInventario`).

- [ ] **Paso 1: Escribir los tests que fallan**

Primero, en `catalog.ts`, agregar `export` a `subirYFirmar` (hoy es
privada) — sin cambiar su cuerpo.

Reemplazar el `describe("consultarProducto", ...)` completo de
`owner-actions.test.ts` por:

```ts
describe("buscarInventario", () => {
  it("resume cuantos productos coinciden y el total de unidades en stock, con hasta 10 fotos", async () => {
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => [
        { productId: "p1", variantId: null, nombre: "Camiseta A", talla: null, color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/a.jpg" },
        { productId: "p2", variantId: null, nombre: "Camiseta B", talla: null, color: null, precio: 40000, stock: 3, imageId: null, fotoUrl: "https://x/b.jpg" },
      ]),
    }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "camiseta" });

    expect(resultado.texto).toContain("Encontré 2 producto(s)");
    expect(resultado.texto).toContain("4 unidad(es) en stock en total");
    expect(resultado.fotos).toHaveLength(2);
    expect(resultado.fotos[0]).toEqual({ url: "https://x/a.jpg", caption: expect.stringContaining("Camiseta A") });
    vi.doUnmock("./catalog.ts");
  });

  it("avisa truncamiento y limita a 10 fotos cuando hay mas de 10 coincidencias", async () => {
    const productos = Array.from({ length: 15 }, (_, i) => ({
      productId: `p${i}`, variantId: null, nombre: `Producto ${i}`, talla: null, color: null,
      precio: 1000, stock: 1, imageId: null, fotoUrl: `https://x/${i}.jpg`,
    }));
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => productos) }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "producto" });

    expect(resultado.texto).toContain("Encontré 15 producto(s)");
    expect(resultado.fotos).toHaveLength(10);
    vi.doUnmock("./catalog.ts");
  });

  it("sin coincidencias, responde un mensaje claro y sin fotos", async () => {
    vi.doMock("./catalog.ts", () => ({ buscarCatalogo: vi.fn(async () => []) }));

    const { buscarInventario } = await import("./owner-actions.ts");
    const resultado = await buscarInventario({ texto: "inexistente" });

    expect(resultado.texto).toContain("No encontré ningún producto");
    expect(resultado.fotos).toHaveLength(0);
    vi.doUnmock("./catalog.ts");
  });
});

describe("generarInformePdf", () => {
  it("genera el PDF con todas las coincidencias (sin el tope de 10) y lo manda como documento", async () => {
    const productos = Array.from({ length: 15 }, (_, i) => ({
      productId: `p${i}`, variantId: null, nombre: `Producto ${i}`, talla: null, color: null,
      precio: 1000, stock: 1, imageId: null, fotoUrl: null,
    }));
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => productos),
      generarPdfConFotos: vi.fn(async () => new Uint8Array([1])),
      subirYFirmar: vi.fn(async () => "https://x/informe-firmado.pdf"),
    }));

    const { generarInformePdf } = await import("./owner-actions.ts");
    const resultado = await generarInformePdf({ texto: "producto" });

    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe-merylay.pdf" }]);
    vi.doUnmock("./catalog.ts");
  });

  it("sin coincidencias, no genera ningun PDF", async () => {
    vi.doMock("./catalog.ts", () => ({
      buscarCatalogo: vi.fn(async () => []),
      generarPdfConFotos: vi.fn(),
      subirYFirmar: vi.fn(),
    }));

    const { generarInformePdf } = await import("./owner-actions.ts");
    const resultado = await generarInformePdf({ texto: "inexistente" });

    expect(resultado.texto).toContain("No encontré ningún producto");
    expect(resultado.documentos).toHaveLength(0);
    vi.doUnmock("./catalog.ts");
  });
});
```

> `vi.doMock`/`vi.doUnmock` (no `vi.mock` de nivel de módulo) porque este
> archivo ya mockea `../_shared/db.ts` a nivel de módulo para el resto de
> funciones; mockear `./catalog.ts` solo dentro de estos tests evita
> interferir con los demás `describe` del mismo archivo.

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: FAIL — `buscarInventario`/`generarInventario` no existen.

- [ ] **Paso 3: Implementar**

En `catalog.ts`, cambiar `async function subirYFirmar` a
`export async function subirYFirmar`.

En `owner-actions.ts`, importar lo necesario y reemplazar
`consultarProducto` (y su constante `LIMITE_CONSULTA_PRODUCTO`) por:

```ts
import { buscarCatalogo, generarPdfConFotos, subirYFirmar, type FiltrosCatalogo, type FilaPdf } from "./catalog.ts";

export interface RespuestaLectura {
  texto: string;
  fotos: { url: string; caption: string }[];
  documentos: { link: string; filename: string }[];
}

const TOPE_FOTOS_EN_VIVO = 10;

function caption(p: { nombre: string; talla: string | null; color: string | null; precio: number; stock: number }): string {
  const detalle = [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ");
  return `${p.nombre}${detalle ? ` (${detalle})` : ""} — ${formatoMoneda(p.precio)}, stock ${p.stock}`;
}

export async function buscarInventario(filtros: FiltrosCatalogo): Promise<RespuestaLectura> {
  const productos = await buscarCatalogo(filtros);
  if (productos.length === 0) {
    return { texto: `No encontré ningún producto que coincida con esa búsqueda.`, fotos: [], documentos: [] };
  }

  const totalUnidades = productos.reduce((suma, p) => suma + p.stock, 0);
  const truncado = productos.length > TOPE_FOTOS_EN_VIVO ? ` (mostrando ${TOPE_FOTOS_EN_VIVO}; pide el informe en PDF para ver el resto)` : "";
  const texto = `Encontré ${productos.length} producto(s) con ${totalUnidades} unidad(es) en stock en total${truncado}.`;

  const fotos = productos
    .slice(0, TOPE_FOTOS_EN_VIVO)
    .filter((p) => p.fotoUrl)
    .map((p) => ({ url: p.fotoUrl as string, caption: caption(p) }));

  return { texto, fotos, documentos: [] };
}

export async function generarInformePdf(filtros: FiltrosCatalogo): Promise<RespuestaLectura> {
  const productos = await buscarCatalogo(filtros);
  if (productos.length === 0) {
    return { texto: `No encontré ningún producto que coincida con esa búsqueda.`, fotos: [], documentos: [] };
  }

  const filas: FilaPdf[] = productos.map((p) => ({
    fotoUrl: p.fotoUrl,
    nombre: p.nombre,
    detalle: [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ") || "—",
    precio: p.precio,
    nota: `stock: ${p.stock}`,
  }));

  const bytes = await generarPdfConFotos("Informe de inventario — MeryLay Boutique", filas);
  const link = await subirYFirmar(bytes, "informe.pdf");

  return { texto: "Aquí tienes el informe 📋", fotos: [], documentos: [{ link, filename: "informe-merylay.pdf" }] };
}
```

Eliminar `consultarProducto`, `LIMITE_CONSULTA_PRODUCTO` y
`escaparValorFiltro` si ya no las usa ninguna otra función del archivo
(revisar: `buscarCliente` también usa `escaparValorFiltro` — **no**
eliminarla, solo `consultarProducto`/`LIMITE_CONSULTA_PRODUCTO`).

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/owner-actions.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/owner-actions.ts supabase/functions/whatsapp-webhook/owner-actions.test.ts
git commit -m "feat: buscarInventario y generarInformePdf reemplazan consultarProducto"
```

---

### Tarea 5: Prompts de `agent.ts` (acciones nuevas + tono de cliente)

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/agent.ts`
- Modify: `supabase/functions/whatsapp-webhook/agent.test.ts`

**Interfaces:** Ninguna nueva — solo texto de los prompts (`ACCIONES_DUENO`,
`ACCIONES_CLIENTE`, `promptSistema`).

- [ ] **Paso 1: Escribir los tests que fallan**

En `agent.test.ts`, dentro de
`it("documenta en el prompt del dueño los parametros exactos de cada accion", ...)`
(usa `fetchMock`, extrae `prompt` de `cuerpo.messages[0].content` — ver
el cuerpo exacto de este test ya existente en el archivo), agregar tras
el `for` existente:

```ts
    expect(prompt).toContain("buscar_inventario");
    expect(prompt).toContain("generar_informe_pdf");
    expect(prompt).not.toContain("consultar_producto:");
```

y agregar `"talla", "color"` a la lista del `for` de
`it("documenta en el prompt de cliente los parametros exactos de cada accion", ...)`,
más, después de ese `for`:

```ts
    expect(prompt).toContain("buscar_producto");
    expect(prompt).toContain("generar_catalogo_pdf");
```

Y agregar un test nuevo al final del mismo `describe`:

```ts
  it("el prompt de cliente instruye saludar con cordialidad y preguntar que necesita", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    expect(prompt).toMatch(/saluda|cordial/i);
  });
```

(Seguir exactamente el patrón de `fetchMock`/`vi.stubGlobal("fetch", ...)`
ya usado por los dos tests `"documenta en el prompt..."` de este mismo
archivo — sin `afterEach` de `vi.unstubAllGlobals()` en este archivo
porque no lo usan las pruebas vigentes; replicar tal cual su estilo.)

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: FAIL — el prompt todavía dice `consultar_producto` y no
documenta `talla`/`color` ni el tono cordial.

- [ ] **Paso 3: Implementar**

En `agent.ts`, reemplazar la línea de `buscar_producto` dentro de
`ACCIONES_CLIENTE` por:

```
- buscar_producto: params {"consulta": string, "talla": string | null, "color": string | null} — "consulta" es texto libre (nombre o categoria, ej. "pijama" o "camisetas"); "talla"/"color" son opcionales. El sistema manda hasta 10 tarjetas con foto, precio, stock y un boton de "Agregar al carrito" por cada coincidencia — nunca describas tu ni inventes la lista en response_message, solo confirma que las vas a mandar o pide mas detalle si "consulta" quedo vacio.
```

y la línea de `generar_catalogo_pdf` por:

```
- generar_catalogo_pdf: params {"texto": string | null, "talla": string | null, "color": string | null} — envia el catalogo en PDF con fotos; sin ningun parametro, manda el catalogo completo. Usala cuando el cliente pida "el catalogo"/"todo lo que tengan" de una categoria o en general.
```

Agregar al final del `return` de cliente en `promptSistema` (antes del
`.` final, como una frase más de la instrucción):

```
`Saluda con cordialidad en el primer mensaje de la conversación y pregunta qué necesita el cliente antes de asumir una acción. Mantén un tono cálido, acorde a "Inspiración Femenina".`
```

En `ACCIONES_DUENO`, reemplazar la línea de `consultar_producto` por:

```
- buscar_inventario: params {"texto": string | null, "talla": string | null, "color": string | null} — al menos uno de los tres es obligatorio. Usala para "cuantos/cuantas tenemos de X", "que stock hay de X/en talla Y", o para pedir ver productos de una categoria con fotos. Responde con el conteo, el stock total y hasta 10 fotos.
- generar_informe_pdf: params {"texto": string | null, "talla": string | null, "color": string | null} — mismos filtros que buscar_inventario, pero manda TODAS las coincidencias en un PDF con fotos (no solo 10). Usala cuando el dueño pida "el informe"/"todas las fotos"/"mandamelo en pdf".
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/agent.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/agent.ts supabase/functions/whatsapp-webhook/agent.test.ts
git commit -m "feat: prompts documentan buscar_inventario/generar_informe_pdf y tono cordial de cliente"
```

---

### Tarea 6: `agregarAlCarrito` compartido + `RespuestaLectura` en `handler.ts` (dueño)

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.test.ts`

**Interfaces:**
- Produce (internas, no exportadas): `agregarAlCarrito(sessionData, productId, variantId, qty): Promise<string>`.
- Modifica contrato interno: `ejecutarAccionLectura(accion, params): Promise<RespuestaLectura>`
  (antes `Promise<string>`); el branch de dueño en `generarRespuesta`
  manda `fotos`/`documentos` antes de devolver `resultado.texto`.
- Consume: `RespuestaLectura` (Tarea 4), `ownerActions.buscarInventario`,
  `ownerActions.generarInformePdf`, `enviarImagenPorLink` (ya exportada
  por `_shared/meta.ts`, hoy sin uso en este archivo).

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar a los mocks de `handler.test.ts` (sección `vi.mock("./owner-actions.ts", ...)`):

```ts
vi.mock("./owner-actions.ts", () => ({
  consultarStockBajo: mocks.consultarStockBajo,
  actualizarPrecioProducto: mocks.actualizarPrecioProducto,
  buscarInventario: mocks.buscarInventario,
  generarInformePdf: mocks.generarInformePdf,
  ACCIONES_ESCRITURA: new Set(["actualizar_precio_producto"]),
}));
```

(agregando `buscarInventario: vi.fn()` y `generarInformePdf: vi.fn()` al
objeto `mocks` del `vi.hoisted` del comienzo del archivo), y agregar
`enviarImagenPorLink: mocks.enviarImagenPorLink` al mock de
`"../_shared/meta.ts"` (con `enviarImagenPorLink: vi.fn()` también en
`mocks`).

Agregar estos tests dentro de
`describe("manejo de errores en procesarMensajeEntrante", ...)` o como un
nuevo `describe`:

```ts
describe("acciones de lectura del dueño con fotos/documentos", () => {
  it("buscar_inventario manda las fotos antes del texto final", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.1", from: "573215879805", texto: "cuantas camisetas hay" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_inventario", params: { texto: "camiseta" }, response_message: "" });
    mocks.buscarInventario.mockResolvedValue({
      texto: "Encontré 2 producto(s) con 4 unidad(es) en stock en total.",
      fotos: [{ url: "https://x/a.jpg", caption: "Camiseta A" }],
      documentos: [],
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarImagenPorLink).toHaveBeenCalledWith("573215879805", "https://x/a.jpg", "Camiseta A");
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", "Encontré 2 producto(s) con 4 unidad(es) en stock en total.");
  });

  it("generar_informe_pdf manda el documento", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.2", from: "573215879805", texto: "mandame el informe" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_informe_pdf", params: { texto: "camiseta" }, response_message: "" });
    mocks.generarInformePdf.mockResolvedValue({
      texto: "Aquí tienes el informe 📋",
      fotos: [],
      documentos: [{ link: "https://x/informe.pdf", filename: "informe-merylay.pdf" }],
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573215879805", "https://x/informe.pdf", "informe-merylay.pdf");
  });
});
```

> El campo `kind: "texto"` en estos dos mocks nuevos no lo usa todavía
> ningún código de esta tarea (el código de `handler.ts` sigue leyendo
> `entrante.texto` directo hasta la Tarea 10) — se incluye desde ya solo
> para que esta prueba quede en la forma final y no haya que tocarla de
> nuevo en la Tarea 10.

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: FAIL — `enviarImagenPorLink` no se llama todavía;
`ejecutarAccionLectura` devuelve un string plano.

- [ ] **Paso 3: Implementar**

En `handler.ts`, agregar el import de `enviarImagenPorLink` junto a los
demás de `_shared/meta.ts`, y los de `buscarInventario`/`generarInformePdf`
junto a los de `owner-actions.ts`.

Extraer de dentro de `ejecutarAccionCliente` el cuerpo del caso
`"agregar_al_carrito"` a una función compartida, colocada antes de
`ejecutarAccionCliente`:

```ts
async function agregarAlCarrito(
  sessionData: SessionData,
  productId: string,
  variantId: string | null,
  qty: number,
): Promise<string> {
  const producto = await catalog.obtenerProductoParaCarrito(productId, variantId);
  if (!producto) {
    return "No encontré ese producto (o esa talla/color) en el catálogo. ¿Me dices de nuevo cuál quieres?";
  }

  const existente = sessionData.cart.find(
    (i) => i.productId === producto.productId && i.variantId === producto.variantId,
  );
  const qtyTotal = (existente?.qty ?? 0) + qty;
  if (qtyTotal > producto.stock) {
    return producto.stock > 0
      ? `Solo nos quedan ${producto.stock} unidad(es) de ${producto.nombre}.`
      : `${producto.nombre} está agotado en este momento.`;
  }

  if (existente) {
    existente.qty = qtyTotal;
    existente.unitPrice = producto.precio;
    existente.nameSnapshot = producto.nombre;
  } else {
    sessionData.cart.push({
      productId: producto.productId,
      variantId: producto.variantId,
      imageId: producto.imageId,
      qty,
      unitPrice: producto.precio,
      nameSnapshot: producto.nombre,
    });
  }
  const total = sessionData.cart.reduce((suma, i) => suma + i.unitPrice * i.qty, 0);
  return `Agregado: ${producto.nombre} x${qtyTotal}. Tu carrito tiene ${sessionData.cart.length} producto(s), total $${total.toLocaleString("es-CO")}.`;
}
```

Y reemplazar el caso `"agregar_al_carrito"` dentro de
`ejecutarAccionCliente` por:

```ts
case "agregar_al_carrito": {
  const validacion = agregarAlCarritoSchema.safeParse(params);
  if (!validacion.success) {
    return { texto: "Perdona, no entendí qué producto quieres agregar, ¿puedes repetirlo?", documentos: [] };
  }
  const { productId, variantId, qty } = validacion.data;
  const texto = await agregarAlCarrito(sessionData, productId, variantId ?? null, qty);
  return { texto, documentos: [] };
}
```

Cambiar `ejecutarAccionLectura` para que devuelva `RespuestaLectura`:

```ts
async function ejecutarAccionLectura(accion: string, params: Record<string, unknown>): Promise<ownerActions.RespuestaLectura> {
  switch (accion) {
    case "consultar_ventas":
      return { texto: await ownerActions.consultarVentas((params.dias as number) ?? 1), fotos: [], documentos: [] };
    case "consultar_stock_bajo":
      return { texto: await ownerActions.consultarStockBajo((params.umbral as number) ?? 5), fotos: [], documentos: [] };
    case "buscar_cliente":
      return { texto: await ownerActions.buscarCliente(params.consulta as string), fotos: [], documentos: [] };
    case "consultar_pedido":
      return { texto: await ownerActions.consultarPedido(params.numeroOId as string), fotos: [], documentos: [] };
    case "buscar_inventario":
      return ownerActions.buscarInventario({
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
      });
    case "generar_informe_pdf":
      return ownerActions.generarInformePdf({
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
      });
    default:
      return { texto: "No reconozco esa consulta todavia.", fotos: [], documentos: [] };
  }
}
```

Y en `generarRespuesta`, cambiar el branch de dueño (la rama que hoy hace
`return ejecutarAccionLectura(decision.action, decision.params);`) por:

```ts
const resultadoLectura = await ejecutarAccionLectura(decision.action, decision.params);
for (const foto of resultadoLectura.fotos) {
  await enviarImagenPorLink(telefono, foto.url, foto.caption);
}
for (const documento of resultadoLectura.documentos) {
  await enviarDocumentoPorLink(telefono, documento.link, documento.filename);
}
return resultadoLectura.texto;
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts
git commit -m "feat: agregarAlCarrito compartido y respuestas de lectura del dueño con fotos/documentos"
```

---

### Tarea 7: `buscar_producto` con tarjetas de foto+botón y `generar_catalogo_pdf` con filtros (cliente)

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.test.ts`

**Interfaces:**
- Modifica contrato interno: `ejecutarAccionCliente` devuelve
  `{ texto: string; documentos: {...}[]; botones: { fotoUrl: string; cuerpo: string; botonId: string; botonTitulo: string }[] }`
  (antes `{ texto, documentos }`); el branch de cliente en
  `generarRespuesta` manda `botones` con `enviarBotonProducto` antes de
  `documentos`.
- Consume: `catalog.buscarCatalogo` (Tarea 2), `meta.enviarBotonProducto`
  (Tarea 1).

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar `buscarCatalogo: clienteMocks.buscarCatalogo` al mock de
`./catalog.ts` (y `buscarCatalogo: vi.fn()` al objeto `clienteMocks`),
quitando `buscarProductos` del mock (ya no existe). Agregar
`enviarBotonProducto: mocks.enviarBotonProducto` al mock de
`../_shared/meta.ts` (y `enviarBotonProducto: vi.fn()` a `mocks`).

```ts
describe("buscar_producto con tarjetas de foto y boton", () => {
  it("manda hasta 10 tarjetas con foto, cuerpo y boton 'Agregar al carrito'", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", talla: "M", color: "Rosa", precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/pijama.jpg" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarBotonProducto).toHaveBeenCalledWith("573001234567", {
      fotoUrl: "https://x/pijama.jpg",
      cuerpo: expect.stringContaining("Pijama Rosa"),
      botonId: `add:${PRODUCTO_ID}:${VARIANTE_ID}`,
      botonTitulo: "Agregar al carrito",
    });
  });

  it("sin coincidencias, responde un mensaje claro sin mandar ningun boton", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.4", from: "573001234567", texto: "algo raro" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "algo raro" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarBotonProducto).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("No encontré"));
  });
});

describe("generar_catalogo_pdf con filtros", () => {
  it("pasa consulta/talla/color a generarCatalogoPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.5", from: "573001234567", texto: "catalogo de camisetas en talla M" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_catalogo_pdf", params: { texto: "camiseta", talla: "M" }, response_message: "" });
    clienteMocks.generarCatalogoPdf.mockResolvedValue("https://x/catalogo.pdf");

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.generarCatalogoPdf).toHaveBeenCalledWith({ texto: "camiseta", talla: "M", color: undefined });
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: FAIL — `buscar_producto` todavía devuelve una lista de texto.

- [ ] **Paso 3: Implementar**

En `handler.ts`, cambiar la firma de `ejecutarAccionCliente` para que su
tipo de retorno incluya `botones`, y reemplazar el caso
`"buscar_producto"` por:

```ts
case "buscar_producto": {
  const consulta = typeof params.consulta === "string" ? params.consulta.trim() : "";
  const talla = typeof params.talla === "string" ? params.talla : undefined;
  const color = typeof params.color === "string" ? params.color : undefined;
  if (!consulta && !talla && !color) {
    return { texto: "¿Qué producto estás buscando?", documentos: [], botones: [] };
  }
  const productos = await catalog.buscarCatalogo({ texto: consulta || undefined, talla, color });
  if (productos.length === 0) {
    return { texto: `No encontré productos para esa búsqueda.`, documentos: [], botones: [] };
  }
  const TOPE = 10;
  const botones = productos.slice(0, TOPE).filter((p) => p.fotoUrl).map((p) => ({
    fotoUrl: p.fotoUrl as string,
    cuerpo: formatearCuerpoProducto(p),
    botonId: `add:${p.productId}:${p.variantId ?? "-"}`,
    botonTitulo: "Agregar al carrito",
  }));
  const truncado = productos.length > TOPE
    ? ` Encontré ${productos.length} en total — si quieres verlos todos, pídeme el catálogo en PDF.`
    : "";
  return { texto: `Te mando las opciones que encontré.${truncado}`, documentos: [], botones };
}
```

`formatearResultadoBusqueda` quedaba pensada para que el **modelo**
copiara los ids de una lista de texto (incluye `[productId:... variantId:...]`
al final) — mostrarle esos uuids en crudo a un cliente real dentro del
cuerpo de la tarjeta sería un defecto de UX, no una reutilización válida.
En su lugar, agregar una función nueva (sin el sufijo de ids), colocada
junto a `formatearResultadoBusqueda`:

```ts
function formatearCuerpoProducto(p: catalog.ProductoEncontrado): string {
  const detalles = [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean);
  const sufijo = detalles.length > 0 ? ` (${detalles.join(", ")})` : "";
  return `${p.nombre}${sufijo}\n$${p.precio.toLocaleString("es-CO")} — stock: ${p.stock}`;
}
```

`formatearResultadoBusqueda` deja de tener llamadores en este archivo
(era solo para el caso de texto de `buscar_producto`, que esta tarea
reemplaza) — eliminarla.

Actualizar el caso `"generar_catalogo_pdf"`:

```ts
case "generar_catalogo_pdf": {
  const link = await catalog.generarCatalogoPdf({
    texto: params.texto as string | undefined,
    talla: params.talla as string | undefined,
    color: params.color as string | undefined,
  });
  return {
    texto: "Aquí tienes nuestro catálogo 💕",
    documentos: [{ link, filename: "catalogo-merylay.pdf" }],
    botones: [],
  };
}
```

Agregar `botones: []` a los `return` de todos los demás casos de
`ejecutarAccionCliente` (`quitar_del_carrito`, `generar_cotizacion_pdf`,
`confirmar_pedido`, `generar_acceso_web`, `default`, y el nuevo
`agregar_al_carrito` de la Tarea 6).

En `generarRespuesta`, en el branch de cliente, después de
`const resultado = await ejecutarAccionCliente(...)` y antes de iterar
`resultado.documentos`:

```ts
for (const boton of resultado.botones) {
  await enviarBotonProducto(telefono, boton);
}
```

(agregar el import de `enviarBotonProducto` desde `_shared/meta.ts`).

`buscarProductos` ya no tiene ningún llamador — eliminarla de
`catalog.ts` junto con su `describe("buscarProductos", ...)` en
`catalog.test.ts` (el que se dejó intacto en la Tarea 2).

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/catalog.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts supabase/functions/whatsapp-webhook/catalog.ts supabase/functions/whatsapp-webhook/catalog.test.ts
git commit -m "feat: buscar_producto manda tarjetas con foto y boton; generar_catalogo_pdf acepta filtros"
```

---

### Tarea 8: `MensajeEntrante` como unión discriminada en `adapters.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/adapters.ts`
- Modify: `supabase/functions/whatsapp-webhook/adapters.test.ts`

**Interfaces:**
- Produce:
  ```ts
  export type MensajeEntrante =
    | { kind: "texto"; messageId: string; from: string; texto: string }
    | { kind: "audio"; messageId: string; from: string; mediaId: string }
    | { kind: "boton"; messageId: string; from: string; botonId: string };
  ```
  `parsearMensajeEntrante(payload: unknown): MensajeEntrante | null`
  (mismo nombre, nuevo shape de retorno — todos los llamadores se
  actualizan en la Tarea 10).

- [ ] **Paso 1: Escribir los tests que fallan**

Reemplazar `adapters.test.ts` completo:

```ts
import { describe, expect, it } from "vitest";
import { parsearMensajeEntrante } from "./adapters.ts";

function payloadMensaje(mensaje: Record<string, unknown>) {
  return { entry: [{ changes: [{ value: { messages: [mensaje] } }] }] };
}

describe("parsearMensajeEntrante", () => {
  it("extrae id, remitente y texto de un mensaje de texto", () => {
    const payload = payloadMensaje({ id: "wamid.ABC123", from: "573001234567", type: "text", text: { body: "Hola" } });
    expect(parsearMensajeEntrante(payload)).toEqual({ kind: "texto", messageId: "wamid.ABC123", from: "573001234567", texto: "Hola" });
  });

  it("extrae id, remitente y mediaId de una nota de voz", () => {
    const payload = payloadMensaje({ id: "wamid.AUDIO1", from: "573001234567", type: "audio", audio: { id: "media-999", mime_type: "audio/ogg" } });
    expect(parsearMensajeEntrante(payload)).toEqual({ kind: "audio", messageId: "wamid.AUDIO1", from: "573001234567", mediaId: "media-999" });
  });

  it("extrae id, remitente y botonId de un boton de respuesta interactivo", () => {
    const payload = payloadMensaje({
      id: "wamid.BOTON1", from: "573001234567", type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "add:p1:v1", title: "Agregar al carrito" } },
    });
    expect(parsearMensajeEntrante(payload)).toEqual({ kind: "boton", messageId: "wamid.BOTON1", from: "573001234567", botonId: "add:p1:v1" });
  });

  it("devuelve null para un status update (sin mensaje)", () => {
    expect(parsearMensajeEntrante({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.XYZ", status: "delivered" }] } }] }] })).toBeNull();
  });

  it("devuelve null para un payload vacio o malformado", () => {
    expect(parsearMensajeEntrante({})).toBeNull();
    expect(parsearMensajeEntrante(null)).toBeNull();
  });

  it("devuelve null para un tipo de mensaje no soportado (ej. ubicacion)", () => {
    const payload = payloadMensaje({ id: "wamid.LOC1", from: "573001234567", type: "location", location: {} });
    expect(parsearMensajeEntrante(payload)).toBeNull();
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/adapters.test.ts`
Expected: FAIL — hoy solo reconoce `type: "text"` y devuelve `{ messageId, from, texto }` sin `kind`.

- [ ] **Paso 3: Implementar**

Reemplazar `adapters.ts` completo:

```ts
export type MensajeEntrante =
  | { kind: "texto"; messageId: string; from: string; texto: string }
  | { kind: "audio"; messageId: string; from: string; mediaId: string }
  | { kind: "boton"; messageId: string; from: string; botonId: string };

export function parsearMensajeEntrante(payload: unknown): MensajeEntrante | null {
  const entry = (payload as Record<string, unknown> | null)?.entry as unknown[] | undefined;
  const primero = entry?.[0] as Record<string, unknown> | undefined;
  const cambios = primero?.changes as unknown[] | undefined;
  const valor = (cambios?.[0] as Record<string, unknown> | undefined)?.value as Record<string, unknown> | undefined;
  const mensajes = valor?.messages as Record<string, unknown>[] | undefined;
  const entrada = mensajes?.[0];

  if (!entrada || typeof entrada.id !== "string" || typeof entrada.from !== "string") {
    return null;
  }
  const { id: messageId, from } = entrada;

  if (entrada.type === "text") {
    const texto = (entrada.text as Record<string, unknown> | undefined)?.body;
    if (typeof texto !== "string") return null;
    return { kind: "texto", messageId, from, texto };
  }

  if (entrada.type === "audio") {
    const mediaId = (entrada.audio as Record<string, unknown> | undefined)?.id;
    if (typeof mediaId !== "string") return null;
    return { kind: "audio", messageId, from, mediaId };
  }

  if (entrada.type === "interactive") {
    const interactive = entrada.interactive as Record<string, unknown> | undefined;
    if (interactive?.type !== "button_reply") return null;
    const botonId = (interactive.button_reply as Record<string, unknown> | undefined)?.id;
    if (typeof botonId !== "string") return null;
    return { kind: "boton", messageId, from, botonId };
  }

  return null;
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/adapters.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/adapters.ts supabase/functions/whatsapp-webhook/adapters.test.ts
git commit -m "feat: parsearMensajeEntrante reconoce audio y botones interactivos (union discriminada)"
```

---

### Tarea 9: `transcribirAudio` en `voice.ts` (nuevo)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/voice.ts`
- Test: `supabase/functions/whatsapp-webhook/voice.test.ts`

**Interfaces:**
- Produce: `transcribirAudio(mediaId: string): Promise<string>`.
- Consume: `obtenerUrlMedia`, `descargarMedia` de `_shared/meta.ts`
  (Tarea 1); `Deno.env.get("OPENAI_API_KEY")`.

- [ ] **Paso 1: Escribir el test que falla**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  obtenerUrlMedia: vi.fn(),
  descargarMedia: vi.fn(),
}));
vi.mock("../_shared/meta.ts", () => ({
  obtenerUrlMedia: mocks.obtenerUrlMedia,
  descargarMedia: mocks.descargarMedia,
}));

describe("transcribirAudio", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "OPENAI_API_KEY" ? "clave-de-prueba" : undefined)) } });
    mocks.obtenerUrlMedia.mockResolvedValue("https://graph.facebook.com/audio-real.ogg");
    mocks.descargarMedia.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("descarga el audio y devuelve el texto transcrito por OpenAI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "cuántas camisetas hay" }), { status: 200 })));
    const { transcribirAudio } = await import("./voice.ts");

    const texto = await transcribirAudio("media-123");

    expect(texto).toBe("cuántas camisetas hay");
    expect(mocks.obtenerUrlMedia).toHaveBeenCalledWith("media-123");
    expect(mocks.descargarMedia).toHaveBeenCalledWith("https://graph.facebook.com/audio-real.ogg");
  });

  it("lanza un error descriptivo si OpenAI responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("clave invalida", { status: 401 })));
    const { transcribirAudio } = await import("./voice.ts");
    await expect(transcribirAudio("media-123")).rejects.toThrow(/401/);
  });

  it("lanza un error claro si falta OPENAI_API_KEY", async () => {
    vi.stubGlobal("Deno", { env: { get: vi.fn(() => undefined) } });
    const { transcribirAudio } = await import("./voice.ts");
    await expect(transcribirAudio("media-123")).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `pnpm test supabase/functions/whatsapp-webhook/voice.test.ts`
Expected: FAIL — `./voice.ts` no existe.

- [ ] **Paso 3: Implementar**

Crear `supabase/functions/whatsapp-webhook/voice.ts`:

```ts
import { obtenerUrlMedia, descargarMedia } from "../_shared/meta.ts";

export async function transcribirAudio(mediaId: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  const url = await obtenerUrlMedia(mediaId);
  const bytes = await descargarMedia(url);

  const formulario = new FormData();
  formulario.append("file", new Blob([bytes]), "audio.ogg");
  formulario.append("model", "whisper-1");

  const respuesta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formulario,
  });

  if (!respuesta.ok) {
    throw new Error(`OpenAI respondio ${respuesta.status} al transcribir el audio.`);
  }

  const cuerpo = await respuesta.json();
  return (cuerpo.text as string) ?? "";
}
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `pnpm test supabase/functions/whatsapp-webhook/voice.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/voice.ts supabase/functions/whatsapp-webhook/voice.test.ts
git commit -m "feat: transcribirAudio (OpenAI whisper-1) para notas de voz de WhatsApp"
```

---

### Tarea 10: Despacho por `kind` en `handler.ts` — botón determinístico y audio

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/handler.ts`
- Modify: `supabase/functions/whatsapp-webhook/handler.test.ts`

**Interfaces:**
- Modifica: `procesarMensajeEntrante` bifurca por `entrante.kind`
  (`"texto"` sigue el camino de hoy; `"audio"` transcribe antes de
  continuar o responde el *fallback*; `"boton"` ejecuta
  `agregarAlCarrito` directo, sin `decidirAccion`).
- Consume: `MensajeEntrante` (Tarea 8), `transcribirAudio` (Tarea 9),
  `agregarAlCarrito` (Tarea 6, ya interna a este archivo).

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar `transcribirAudio: mocks.transcribirAudio` al `vi.mock("./voice.ts", ...)`
nuevo (y `transcribirAudio: vi.fn()` a `mocks`). Actualizar **todos** los
mocks existentes de `parsearMensajeEntrante.mockReturnValue({...})` en
este archivo para incluir `kind: "texto"` (son los que ya usan
`{ messageId, from, texto }` sin `kind` de las tareas 6-7 y de las
pruebas originales).

Agregar:

```ts
describe("mensajes de audio", () => {
  it("transcribe el audio y procesa el texto resultante como un mensaje normal", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "audio", messageId: "wamid.AUDIO1", from: "573001234567", mediaId: "media-999" });
    mocks.transcribirAudio.mockResolvedValue("cuántas camisetas hay");
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).toHaveBeenCalledWith(expect.objectContaining({ mensajeEntrante: "cuántas camisetas hay" }));
  });

  it("si la transcripcion falla o sale vacia, responde el mensaje de fallback sin llamar a decidirAccion", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "audio", messageId: "wamid.AUDIO2", from: "573001234567", mediaId: "media-998" });
    mocks.transcribirAudio.mockRejectedValue(new Error("OpenAI respondio 500"));

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("nota de voz"));
  });
});

describe("boton 'Agregar al carrito'", () => {
  it("agrega el producto/variante al carrito sin llamar a decidirAccion", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON1", from: "573001234567", botonId: `add:${PRODUCTO_ID}:${VARIANTE_ID}` });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({ productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", precio: 89900, stock: 5, imageId: null });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("Agregado: Pijama Rosa"));
  });

  it("dos toques distintos del mismo boton suman cantidad (no fallan ni duplican la fila)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON2", from: "573001234567", botonId: `add:${PRODUCTO_ID}:${VARIANTE_ID}` });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({ productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", precio: 89900, stock: 5, imageId: null });
    const sessionData = { cart: [{ productId: PRODUCTO_ID, variantId: VARIANTE_ID, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }], pendingConfirmation: null };
    mocks.obtenerOCrearSesion.mockResolvedValue({ id: "sesion-1", sessionData });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("x2"));
  });

  it("producto agotado responde 'agotado' sin agregarlo al carrito", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON3", from: "573001234567", botonId: `add:${PRODUCTO_ID}:-` });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({ productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", precio: 89900, stock: 0, imageId: null });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("agotado"));
  });

  it("boton con id malformado responde un mensaje generico sin lanzar", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON4", from: "573001234567", botonId: "algo-inesperado" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await expect(procesarMensajeEntrante({})).resolves.not.toThrow();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.any(String));
    expect(clienteMocks.obtenerProductoParaCarrito).not.toHaveBeenCalled();
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: FAIL — `procesarMensajeEntrante` todavía asume `entrante.texto`
directo, sin bifurcar por `kind`.

- [ ] **Paso 3: Implementar**

Agregar el import `import { transcribirAudio } from "./voice.ts";` en
`handler.ts`.

Agregar las constantes y la función de manejo del botón, antes de
`procesarMensajeEntrante`:

```ts
const MENSAJE_AUDIO_NO_ENTENDIDO = "No pude entender tu nota de voz, ¿puedes escribirla o intentarlo de nuevo?";
const REGEX_BOTON_CARRITO = /^add:([0-9a-f-]{36}):(-|[0-9a-f-]{36})$/i;

async function manejarBoton(botonId: string, sessionData: SessionData): Promise<string> {
  const match = REGEX_BOTON_CARRITO.exec(botonId);
  if (!match) {
    return "No entendí esa acción, ¿puedes escribirme qué necesitas?";
  }
  const [, productId, variantIdCrudo] = match;
  const variantId = variantIdCrudo === "-" ? null : variantIdCrudo;
  return agregarAlCarrito(sessionData, productId, variantId, 1);
}
```

Reescribir `procesarMensajeEntrante`:

```ts
export async function procesarMensajeEntrante(payload: unknown): Promise<void> {
  const entrante = parsearMensajeEntrante(payload);
  if (!entrante) return;

  const telefono = normalizarTelefono(entrante.from);

  if (entrante.kind === "boton") {
    const esNuevo = await registrarMensaje(telefono, "inbound", `[boton] ${entrante.botonId}`, entrante.messageId);
    if (!esNuevo) return;

    let respuesta: string;
    try {
      const { profileId } = await buscarOCrearCliente(telefono);
      const { id: sessionId, sessionData } = await obtenerOCrearSesion(telefono, profileId);
      respuesta = await manejarBoton(entrante.botonId, sessionData);
      await guardarSesion(sessionId, sessionData);
    } catch (error) {
      console.error(`[handler] Error procesando el boton ${entrante.messageId} de ${telefono}:`, error);
      respuesta = MENSAJE_ERROR_GENERICO;
    }

    try {
      await enviarTexto(telefono, respuesta);
      await registrarMensaje(telefono, "outbound", respuesta);
    } catch (error) {
      console.error(`[handler] No se pudo enviar/registrar la respuesta a ${telefono}:`, error);
    }
    return;
  }

  let texto: string;
  if (entrante.kind === "audio") {
    try {
      texto = await transcribirAudio(entrante.mediaId);
    } catch (error) {
      console.error(`[handler] Error transcribiendo el audio ${entrante.messageId} de ${telefono}:`, error);
      texto = "";
    }
    if (!texto.trim()) {
      const esNuevo = await registrarMensaje(telefono, "inbound", "[nota de voz sin transcribir]", entrante.messageId);
      if (esNuevo) {
        try {
          await enviarTexto(telefono, MENSAJE_AUDIO_NO_ENTENDIDO);
          await registrarMensaje(telefono, "outbound", MENSAJE_AUDIO_NO_ENTENDIDO);
        } catch (error) {
          console.error(`[handler] No se pudo enviar/registrar la respuesta a ${telefono}:`, error);
        }
      }
      return;
    }
  } else {
    texto = entrante.texto;
  }

  const esNuevo = await registrarMensaje(telefono, "inbound", texto, entrante.messageId);
  if (!esNuevo) return;

  let respuesta: string;
  try {
    respuesta = await generarRespuesta(telefono, { messageId: entrante.messageId, texto });
  } catch (error) {
    console.error(`[handler] Error procesando el mensaje ${entrante.messageId} de ${telefono}:`, error);
    respuesta = MENSAJE_ERROR_GENERICO;
  }

  try {
    await enviarTexto(telefono, respuesta);
    await registrarMensaje(telefono, "outbound", respuesta);
  } catch (error) {
    console.error(`[handler] No se pudo enviar/registrar la respuesta a ${telefono}:`, error);
  }
}
```

`generarRespuesta` no cambia de firma (sigue recibiendo
`{ messageId, texto }`) — solo deja de ser quien decide "texto vs audio",
porque ahora `procesarMensajeEntrante` ya resolvió `texto` antes de
llamarla.

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `pnpm test supabase/functions/whatsapp-webhook/handler.test.ts`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handler.ts supabase/functions/whatsapp-webhook/handler.test.ts
git commit -m "feat: handler bifurca por tipo de mensaje (texto/audio/boton), boton nunca pasa por la IA"
```

---

### Tarea 11: Limpieza final y verificación de la suite completa

**Files:**
- Modify: cualquier archivo con referencias residuales a
  `buscarProductos`, `consultarProducto` o `pdfDesdeLineas`.

- [ ] **Paso 1: Buscar referencias residuales**

```bash
grep -rn "buscarProductos\|consultarProducto\|pdfDesdeLineas" supabase/functions --include="*.ts"
```

Expected: sin resultados fuera de comentarios/documentación (si aparece
alguno en código, es una llamada que quedó sin actualizar de una tarea
anterior — corregirla antes de seguir).

- [ ] **Paso 2: Correr la suite completa**

Run: `pnpm test`
Expected: PASS — todos los archivos, incluyendo los que no se tocaron en
este plan (orders.test.ts, index.test.ts, sessions.test.ts, etc.).

- [ ] **Paso 3: Verificar tipos de TypeScript**

Run: `pnpm tsc --noEmit` (o el comando de type-check que use el proyecto)
Expected: sin errores nuevos introducidos por este plan.

- [ ] **Paso 4: Commit (solo si el paso 1 encontró algo que corregir)**

```bash
git add -A
git commit -m "chore: limpieza final de referencias a funciones reemplazadas en el agente v2"
```

---

## Después de este plan

Con la suite en verde, usar `superpowers:finishing-a-development-branch`
para decidir cómo integrar el trabajo (merge local / PR), y luego
redesplegar `whatsapp-webhook` vía `mcp__supabase__deploy_edge_function`
con el código final (igual que se hizo para el fix de `consultarProducto`
en la sesión anterior — ahora hay que incluir también el nuevo archivo
`voice.ts`).
