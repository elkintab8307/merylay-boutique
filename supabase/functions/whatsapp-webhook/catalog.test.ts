import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

// pdf-render.ts le pide a un endpoint de Vercel que renderice el PDF (ver
// pdf-render.test.ts para la cobertura real de esa llamada HTTP) -- aqui
// solo se mockea generarPdfTarjetas, el UNICO export que catalog.ts
// realmente importa de ese modulo.
vi.mock("./pdf-render.ts", () => ({
  generarPdfTarjetas: vi.fn(async () => new Uint8Array([1])),
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

describe("agruparPorProducto", () => {
  it("agrupa varias filas (una por variante) del mismo producto en una sola, juntando tallas/colores distintos", async () => {
    const { agruparPorProducto } = await import("./catalog.ts");
    const resultado = agruparPorProducto([
      { productId: "p1", variantId: "v1", nombre: "Camiseta Mariposa", talla: "S", color: "Blanco", precio: 40000, stock: 3, imageId: null, fotoUrl: "https://x/a.jpg", categoria: "Camisetas" },
      { productId: "p1", variantId: "v2", nombre: "Camiseta Mariposa", talla: "M", color: "Blanco", precio: 40000, stock: 2, imageId: null, fotoUrl: null, categoria: "Camisetas" },
      { productId: "p1", variantId: "v3", nombre: "Camiseta Mariposa", talla: "L", color: "Blanco", precio: 42000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      productId: "p1", nombre: "Camiseta Mariposa", categoria: "Camisetas",
      fotoUrl: "https://x/a.jpg", tallas: ["S", "M", "L"], colores: ["Blanco"],
      precioMin: 40000, precioMax: 42000, stockTotal: 6,
    });
  });

  it("agrupa por NOMBRE incluso si vienen con distinto productId (bug real: cada talla es un producto separado en el catalogo, no una variante)", async () => {
    const { agruparPorProducto } = await import("./catalog.ts");
    const resultado = agruparPorProducto([
      { productId: "p1", variantId: null, nombre: "Camiseta algodón licrado manga doblada", talla: "S", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/s.jpg", categoria: "Camisetas" },
      { productId: "p2", variantId: null, nombre: "Camiseta algodón licrado manga doblada", talla: "XL", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
      { productId: "p3", variantId: null, nombre: "Camiseta algodón licrado manga doblada", talla: "M", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].tallas).toEqual(["S", "XL", "M"]);
    expect(resultado[0].stockTotal).toBe(3);
  });

  it("deja productos distintos en filas separadas", async () => {
    const { agruparPorProducto } = await import("./catalog.ts");
    const resultado = agruparPorProducto([
      { productId: "p1", variantId: null, nombre: "Camiseta A", talla: null, color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
      { productId: "p2", variantId: null, nombre: "Camiseta B", talla: null, color: null, precio: 42000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
    ]);

    expect(resultado.map((p) => p.productId).sort()).toEqual(["p1", "p2"]);
  });

  it("usa la primera foto no nula entre las variantes del producto (el orden de llegada decide)", async () => {
    const { agruparPorProducto } = await import("./catalog.ts");
    const resultado = agruparPorProducto([
      { productId: "p1", variantId: "v1", nombre: "Camiseta A", talla: "S", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: null },
      { productId: "p1", variantId: "v2", nombre: "Camiseta A", talla: "M", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/segunda.jpg", categoria: null },
    ]);

    expect(resultado[0].fotoUrl).toBe("https://x/segunda.jpg");
  });

  it("sin productos, devuelve un arreglo vacio", async () => {
    const { agruparPorProducto } = await import("./catalog.ts");
    expect(agruparPorProducto([])).toEqual([]);
  });
});

describe("construirTarjetasProductos", () => {
  it("cuenta productos/categorias distintas y lista las tallas ordenadas en las estadisticas", async () => {
    const { construirTarjetasProductos } = await import("./catalog.ts");
    const { estadisticas } = construirTarjetasProductos([
      { productId: "p1", variantId: "v1", nombre: "Camiseta A", talla: "M", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
      { productId: "p1", variantId: "v2", nombre: "Camiseta A", talla: "S", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: "Camisetas" },
      { productId: "p2", variantId: null, nombre: "Pijama Rosa", talla: null, color: null, precio: 89900, stock: 2, imageId: null, fotoUrl: null, categoria: "Pijamas" },
    ]);

    expect(estadisticas).toEqual([
      { valor: "2", etiqueta: "PRODUCTOS" },
      { valor: "2", etiqueta: "CATEGORÍAS" },
      { valor: "M - S", etiqueta: "TALLAS" },
    ]);
  });

  it("cada tarjeta lleva las insignias de Tallas y Categoría solo cuando hay dato real", async () => {
    const { construirTarjetasProductos } = await import("./catalog.ts");
    const { tarjetas } = construirTarjetasProductos([
      { productId: "p1", variantId: "v1", nombre: "Camiseta A", talla: "M", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: "https://x/a.jpg", categoria: "Camisetas" },
      { productId: "p2", variantId: null, nombre: "Producto suelto", talla: null, color: null, precio: 10000, stock: 1, imageId: null, fotoUrl: null, categoria: null },
    ]);

    expect(tarjetas).toEqual([
      { fotoUrl: "https://x/a.jpg", nombre: "Camiseta A", pills: [{ etiqueta: "Tallas", valores: ["M"] }, { etiqueta: "Categoría", valores: ["Camisetas"] }], precio: 40000, nota: "stock: 1" },
      { fotoUrl: null, nombre: "Producto suelto", pills: [], precio: 10000, nota: "stock: 1" },
    ]);
  });

  it("si un producto tiene variantes con precios distintos, el precio queda null y la nota muestra 'desde'", async () => {
    const { construirTarjetasProductos } = await import("./catalog.ts");
    const { tarjetas } = construirTarjetasProductos([
      { productId: "p1", variantId: "v1", nombre: "Camiseta A", talla: "M", color: null, precio: 40000, stock: 1, imageId: null, fotoUrl: null, categoria: null },
      { productId: "p1", variantId: "v2", nombre: "Camiseta A", talla: "L", color: null, precio: 45000, stock: 1, imageId: null, fotoUrl: null, categoria: null },
    ]);

    expect(tarjetas[0].precio).toBeNull();
    expect(tarjetas[0].nota).toBe("desde $40.000 — stock: 2");
  });

  it("la foto destacada (fotoHero) es la primera foto real entre todos los productos", async () => {
    const { construirTarjetasProductos } = await import("./catalog.ts");
    const { fotoHero } = construirTarjetasProductos([
      { productId: "p1", variantId: null, nombre: "Sin foto", talla: null, color: null, precio: 1000, stock: 1, imageId: null, fotoUrl: null, categoria: null },
      { productId: "p2", variantId: null, nombre: "Con foto", talla: null, color: null, precio: 1000, stock: 1, imageId: null, fotoUrl: "https://x/hero.jpg", categoria: null },
    ]);

    expect(fotoHero).toBe("https://x/hero.jpg");
  });

  it("sin ningun producto con foto, fotoHero es null", async () => {
    const { construirTarjetasProductos } = await import("./catalog.ts");
    const { fotoHero } = construirTarjetasProductos([
      { productId: "p1", variantId: null, nombre: "Sin foto", talla: null, color: null, precio: 1000, stock: 1, imageId: null, fotoUrl: null, categoria: null },
    ]);

    expect(fotoHero).toBeNull();
  });
});

describe("generarCatalogoPdf", () => {
  it("sin filtros, usa el catalogo completo de productos activos (misma consulta que buscarCatalogo, sin el guard de filtros) y sube el PDF firmado", async () => {
    const productos = [
      { id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, categories: { name: "Pijamas" }, product_variants: [], product_images: [] },
    ];
    const { supabase, select } = mockCatalogo(productos);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-firmado.pdf" }, error: null }));
    (supabase as unknown as { storage: unknown }).storage = { from: vi.fn(() => ({ upload, createSignedUrl })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf();

    expect(url).toBe("https://x/catalogo-firmado.pdf");
    expect(select).toHaveBeenCalled();
    expect(upload).toHaveBeenCalled();
  });

  it("con un objeto de filtros sin ningun campo realmente seteado, usa el catalogo completo igual que sin argumentos", async () => {
    // Este es exactamente el objeto que arma handler.ts para
    // "generar_catalogo_pdf" cuando el cliente no pide ningun filtro:
    // {texto: undefined, talla: undefined, color: undefined}. No debe
    // lanzar el error de buscarCatalogo ("requiere al menos un filtro"),
    // porque este informe pasa por buscarCatalogoInterno, no por
    // buscarCatalogo.
    const productos = [
      { id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, categories: { name: "Pijamas" }, product_variants: [], product_images: [] },
    ];
    const { supabase, select } = mockCatalogo(productos);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-completo.pdf" }, error: null }));
    (supabase as unknown as { storage: unknown }).storage = { from: vi.fn(() => ({ upload, createSignedUrl })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf({ texto: undefined, talla: undefined, color: undefined });

    expect(url).toBe("https://x/catalogo-completo.pdf");
    expect(select).toHaveBeenCalled();
  });

  it("con filtros, los aplica a la misma consulta (talla usa product_variants!inner)", async () => {
    const productos = [
      { id: "p1", name: "Camiseta Azul", price: 40000, stock: 2, categories: { name: "Camisetas" }, product_variants: [{ id: "v1", talla: "M", color: null, price_override: null, stock: 2 }], product_images: [] },
    ];
    const { supabase, select } = mockCatalogo(productos);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-filtrado.pdf" }, error: null }));
    (supabase as unknown as { storage: unknown }).storage = { from: vi.fn(() => ({ upload, createSignedUrl })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf({ talla: "M" });

    expect(url).toBe("https://x/catalogo-filtrado.pdf");
    expect(select).toHaveBeenCalledWith(expect.stringContaining("product_variants!inner"));
  });

  it("si la consulta de productos falla, buscarCatalogoInterno la trata como catalogo vacio (no lanza) -- sube un PDF de 0 tarjetas en vez de reventar", async () => {
    // Comportamiento DISTINTO al de antes de este cambio: la version vieja
    // de este informe tenia su propia consulta con un throw explicito en
    // caso de error. Ahora reutiliza buscarCatalogoInterno (la misma
    // consulta de buscarCatalogo), que ya es fail-soft por diseño (un
    // error de Supabase se trata igual que "sin resultados", devolviendo
    // [] en vez de lanzar) -- se documenta aqui para que el cambio sea
    // explicito, no un olvido.
    const resultado = { data: null, error: { message: "fallo de red" } };
    const query: Record<string, unknown> = {};
    const encadenable = vi.fn(() => query);
    query.eq = encadenable;
    query.ilike = encadenable;
    query.gte = encadenable;
    (query as { then: unknown }).then = (resolve: (v: typeof resultado) => void) => resolve(resultado);
    const select = vi.fn(() => query);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-vacio.pdf" }, error: null }));
    const supabase = {
      from: vi.fn(() => ({ select })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    await expect(generarCatalogoPdf()).resolves.toBe("https://x/catalogo-vacio.pdf");
    expect(upload).toHaveBeenCalled();
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

  it("cuando product_images tiene una foto para el item, la resuelve y se la pasa a generarPdfTarjetas en la tarjeta", async () => {
    // La descarga/incrustacion real de la foto vive en pdf-render.ts
    // (mockeado a nivel de archivo), asi que aqui solo se verifica que
    // obtenerFotoPrincipal resuelve la URL correcta y que llega intacta
    // hasta la tarjeta -- no que fetch() se haya llamado.
    const { generarPdfTarjetas } = await import("./pdf-render.ts");
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
    expect(generarPdfTarjetas).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), "https://x/foto.jpg", expect.any(Array),
      expect.arrayContaining([expect.objectContaining({ fotoUrl: "https://x/foto.jpg" })]),
    );
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
