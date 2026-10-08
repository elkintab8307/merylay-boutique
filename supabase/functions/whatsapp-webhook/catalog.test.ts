import { describe, expect, it, vi } from "vitest";
import { rgb, StandardFonts } from "pdf-lib";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

// pdf-marca.ts descarga fuentes/logo por red -- se mockea por completo para
// que los tests de PDF de este archivo (que SI usan pdf-lib real para el
// resto del dibujo) no dependan de internet. Las fuentes que devuelve el
// mock son fuentes ESTANDAR reales incrustadas en el pdf de la prueba (no
// strings ni objetos falsos): pdf-lib real necesita un PDFFont real para
// poder dibujar texto. Su logica de descarga/cache/fallback real ya esta
// cubierta en pdf-marca.test.ts.
vi.mock("./pdf-marca.ts", () => ({
  cargarFuentesMarca: vi.fn(async (pdf: { embedFont: (f: string) => Promise<unknown> }) => {
    const texto = await pdf.embedFont(StandardFonts.Helvetica);
    const textoNegrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    return { texto, textoNegrita, titulo: textoNegrita };
  }),
  cargarLogoMarca: vi.fn(async () => null),
  dibujarEncabezado: vi.fn((_pagina: unknown, opts: { altoPagina: number }) => opts.altoPagina - 70),
  dibujarPiePagina: vi.fn(),
  COLORES_MARCA: {
    rosaFuerte: rgb(0xe9 / 255, 0x6a / 255, 0x9e / 255),
    dorado: rgb(0xd9 / 255, 0xa4 / 255, 0x41 / 255),
    rosaClaro: rgb(0xf8 / 255, 0xd4 / 255, 0xdd / 255),
    ciruela: rgb(0x6e / 255, 0x2a / 255, 0x44 / 255),
    crema: rgb(0xff / 255, 0xf8 / 255, 0xf4 / 255),
    blanco: rgb(1, 1, 1),
  },
}));

function mockCatalogo(productos: unknown[]) {
  const resultado = { data: productos, error: null };
  const query: Record<string, unknown> = {};
  const encadenable = vi.fn(() => query);
  query.eq = encadenable;
  query.ilike = encadenable;
  query.gte = encadenable;
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
      precio: 89900, stock: 4, imageId: null, fotoUrl: null, categoria: "Pijamas",
    }]);
  });

  it("con talla 'L', NO devuelve variantes 'XL' ni 'XXL' aunque el .ilike de la consulta las traiga (bug real: substring collision)", async () => {
    const productos = [
      {
        id: "p1", name: "Camiseta Blanca", price: 40000, stock: 10, categories: null,
        product_variants: [
          { id: "v1", talla: "L", color: null, price_override: null, stock: 3 },
          { id: "v2", talla: "XL", color: null, price_override: null, stock: 4 },
          { id: "v3", talla: "XXL", color: null, price_override: null, stock: 2 },
          { id: "v4", talla: "L-XL", color: null, price_override: null, stock: 1 },
        ],
        product_images: [],
      },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ talla: "L" });

    // Solo "L" y "L-XL" (talla compuesta que incluye L) deben quedar --
    // "XL" y "XXL" se excluyen aunque el .ilike("%L%") de la consulta
    // ya los haya traido en este mock.
    expect(resultado.map((p) => p.variantId).sort()).toEqual(["v1", "v4"]);
  });

  it("con texto en plural, encuentra productos cuyo nombre esta en singular (bug real: 'camisetas' no encontraba 'Camiseta...')", async () => {
    const productos = [
      { id: "p1", name: "Camiseta algodón licrado", price: 40000, stock: 5, categories: { name: "Camiseta algodón licrado" }, product_variants: [], product_images: [] },
      { id: "p2", name: "Bata Dorada", price: 120000, stock: 2, categories: { name: "Batas" }, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "camisetas" });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Camiseta algodón licrado");
  });

  it("con texto en singular, sigue encontrando una categoria cuyo nombre esta en plural (ej. 'Pijamas')", async () => {
    const productos = [
      { id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, categories: { name: "Pijamas" }, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "pijama" });

    expect(resultado).toHaveLength(1);
  });

  it("con texto que no coincide ni en singular ni en plural, no devuelve nada (no se vuelve demasiado permisivo)", async () => {
    const productos = [
      { id: "p1", name: "Camiseta algodón licrado", price: 40000, stock: 5, categories: { name: "Camiseta algodón licrado" }, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "bolsos" });

    expect(resultado).toHaveLength(0);
  });

  it("con texto en plural y SIN tildes, encuentra un nombre en singular CON tildes (bug real del dueño: 'Camisetas Algodon licrado')", async () => {
    const productos = [
      { id: "p1", name: "Camiseta algodón licrado", price: 40000, stock: 5, categories: { name: "Ropa" }, product_variants: [], product_images: [] },
      { id: "p2", name: "Bata Dorada", price: 120000, stock: 2, categories: { name: "Batas" }, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "Camisetas Algodon licrado" });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Camiseta algodón licrado");
  });

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

describe("obtenerProductoParaCarrito", () => {
  function mockProductoYVariante(producto: unknown, variante: unknown) {
    const eqVariante2 = vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: variante, error: null })) }));
    const eqVariante1 = vi.fn(() => ({ eq: eqVariante2 }));
    const eqProducto2 = vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: producto, error: null })) }));
    const eqProducto1 = vi.fn(() => ({ eq: eqProducto2 }));
    const supabase = {
      from: vi.fn((tabla: string) => ({
        select: vi.fn(() => ({ eq: tabla === "product_variants" ? eqVariante1 : eqProducto1 })),
      })),
    };
    return { supabase, eqVariante1, eqVariante2 };
  }

  const producto = {
    id: "p2", name: "Bata Dorada", price: 120000, stock: 7,
    product_variants: [] as { id: string }[],
    product_images: [{ id: "img-gen", url: "https://x/gen.jpg", is_primary: true, variant_id: null, vendida: false }],
  };

  it("devuelve nombre, precio, stock e imagen reales de la base de datos para una variante del producto", async () => {
    const { supabase, eqVariante1, eqVariante2 } = mockProductoYVariante(producto, {
      id: "v2", name: "Talla M / Rosa", price_override: 130000, stock: 4, product_id: "p2",
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    const resultado = await obtenerProductoParaCarrito("p2", "v2");

    expect(eqVariante1).toHaveBeenCalledWith("id", "v2");
    expect(eqVariante2).toHaveBeenCalledWith("product_id", "p2");
    expect(resultado).toEqual({
      productId: "p2", variantId: "v2", nombre: "Bata Dorada (Talla M / Rosa)", precio: 130000, stock: 4, imageId: null,
    });
  });

  it("devuelve null si la variante no pertenece al producto indicado", async () => {
    const { supabase } = mockProductoYVariante(producto, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p2", "v-de-otro-producto")).toBeNull();
  });

  it("devuelve null si el producto no existe o no esta activo", async () => {
    const { supabase } = mockProductoYVariante(null, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p-inexistente", null)).toBeNull();
  });

  it("usa el precio y stock del producto base cuando no hay variante", async () => {
    const { supabase } = mockProductoYVariante(producto, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p2", null)).toEqual({
      productId: "p2", variantId: null, nombre: "Bata Dorada", precio: 120000, stock: 7, imageId: null,
    });
  });

  it("devuelve null si se pide el producto base sin variante pero el producto si tiene variantes", async () => {
    const { supabase } = mockProductoYVariante({ ...producto, product_variants: [{ id: "v1" }] }, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p2", null)).toBeNull();
  });
});

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

  it("con un total, agrega una fila extra con el gran total (y no revienta)", async () => {
    const { generarPdfConFotos } = await import("./catalog.ts");

    const conTotal = await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: null, nombre: "Pijama Rosa", detalle: "x2", precio: 100000 },
    ], 150000);
    const sinTotal = await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: null, nombre: "Pijama Rosa", detalle: "x2", precio: 100000 },
    ]);

    expect(conTotal.byteLength).toBeGreaterThan(0);
    // La pagina con total es mas alta (una fila extra), asi que el PDF
    // resultante no deberia ser mas pequeño que el que no lo lleva.
    expect(conTotal.byteLength).toBeGreaterThanOrEqual(sinTotal.byteLength);
  });

  it("sin total, no dibuja ninguna fila de total (comportamiento igual al de antes)", async () => {
    const { generarPdfConFotos } = await import("./catalog.ts");
    const bytes = await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: null, nombre: "Pijama Rosa", detalle: "x2", precio: 100000 },
    ]);
    expect(bytes.byteLength).toBeGreaterThan(0);
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

  it("con un objeto de filtros sin ningun campo realmente seteado, usa el catalogo completo (no llama a buscarCatalogo)", async () => {
    // Este es exactamente el objeto que arma handler.ts para
    // "generar_catalogo_pdf" cuando el cliente no pide ningun filtro:
    // {texto: undefined, talla: undefined, color: undefined}. Un objeto
    // truthy, pero sin contenido real -- debe comportarse igual que
    // llamar generarCatalogoPdf() sin argumentos, no lanzar el error de
    // buscarCatalogo ("requiere al menos un filtro").
    const order = vi.fn(async () => ({
      data: [{ name: "Pijama Rosa", price: 89900, stock: 5, categories: null, product_variants: [], product_images: [] }],
      error: null,
    }));
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ order })) }));
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-completo.pdf" }, error: null }));
    const supabase = {
      from: vi.fn(() => ({ select })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf({ texto: undefined, talla: undefined, color: undefined });

    expect(url).toBe("https://x/catalogo-completo.pdf");
    expect(order).toHaveBeenCalled();
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

// Mock minimo de la consulta `supabase.from("product_images").select(...).eq("product_id", X)`
// que usa obtenerFotoPrincipal. `imagenesPorProducto` mapea productId -> filas
// de product_images (o deja sin mapear para simular "sin coincidencias").
function mockProductImages(imagenesPorProducto: Record<string, unknown[]>) {
  const eq = vi.fn(async (_columna: string, productId: string) => ({
    data: imagenesPorProducto[productId] ?? [],
    error: null,
  }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq };
}

describe("generarCotizacionPdf", () => {
  it("sube un PDF de los items del carrito (sin fotos cuando product_images no tiene coincidencias) y devuelve una URL firmada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/firmado.pdf" }, error: null }));
    const { select: selectImagenes, eq: eqImagenes } = mockProductImages({});
    const from = vi.fn((tabla: string) => {
      if (tabla === "product_images") return { select: selectImagenes };
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    const supabase = { from, storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCotizacionPdf } = await import("./catalog.ts");
    const url = await generarCotizacionPdf([
      { productId: "p1", variantId: null, imageId: null, qty: 2, unitPrice: 50000, nameSnapshot: "Pijama Rosa" },
    ]);

    expect(url).toBe("https://x/firmado.pdf");
    expect(upload).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("product_images");
    expect(eqImagenes).toHaveBeenCalledWith("product_id", "p1");
    // Sin coincidencias en product_images, generarPdfConFotos no intenta
    // descargar nada -- pero sigue produciendo un PDF valido (fila de texto).
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("cuando product_images tiene una foto para el item, la resuelve e intenta incrustarla en el PDF", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/firmado-foto.pdf" }, error: null }));
    const { select: selectImagenes } = mockProductImages({
      p1: [{ id: "img1", url: "https://x/foto.jpg", is_primary: true, variant_id: null, vendida: false }],
    });
    const from = vi.fn((tabla: string) => {
      if (tabla === "product_images") return { select: selectImagenes };
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    const supabase = { from, storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCotizacionPdf } = await import("./catalog.ts");
    const url = await generarCotizacionPdf([
      { productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 50000, nameSnapshot: "Pijama Rosa" },
    ]);

    expect(url).toBe("https://x/firmado-foto.pdf");
    expect(fetchMock).toHaveBeenCalledWith("https://x/foto.jpg");
    vi.unstubAllGlobals();
  });
});

describe("obtenerFotoPrincipal", () => {
  it("devuelve la url de la foto principal cuando existe", async () => {
    const { select } = mockProductImages({
      p1: [
        { id: "img1", url: "https://x/general.jpg", is_primary: false, variant_id: null, vendida: false },
        { id: "img2", url: "https://x/principal.jpg", is_primary: true, variant_id: null, vendida: false },
      ],
    });
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerFotoPrincipal } = await import("./catalog.ts");
    expect(await obtenerFotoPrincipal("p1", null)).toBe("https://x/principal.jpg");
  });

  it("con variantId, devuelve la foto especifica de esa variante cuando existe", async () => {
    const { select } = mockProductImages({
      p1: [
        { id: "img1", url: "https://x/general.jpg", is_primary: true, variant_id: null, vendida: false },
        { id: "img2", url: "https://x/variante.jpg", is_primary: true, variant_id: "v1", vendida: false },
      ],
    });
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerFotoPrincipal } = await import("./catalog.ts");
    expect(await obtenerFotoPrincipal("p1", "v1")).toBe("https://x/variante.jpg");
  });

  it("devuelve null cuando no hay ninguna imagen que coincida", async () => {
    const { select } = mockProductImages({ p1: [] });
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerFotoPrincipal } = await import("./catalog.ts");
    expect(await obtenerFotoPrincipal("p1", null)).toBeNull();
  });

  it("devuelve null si la consulta a Supabase falla", async () => {
    const eq = vi.fn(async () => ({ data: null, error: { message: "fallo de red" } }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerFotoPrincipal } = await import("./catalog.ts");
    expect(await obtenerFotoPrincipal("p1", null)).toBeNull();
  });
});
