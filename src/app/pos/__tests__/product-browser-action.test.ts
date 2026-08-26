// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/admin/low-stock", () => ({
  obtenerUmbralStockBajo: vi.fn(() => Promise.resolve(7)),
}));

function crearQueryBuilderMock(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = ["select", "eq", "or", "is", "order", "limit", "in"];
  for (const metodo of chain) {
    builder[metodo] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data, error: null });
  return builder;
}

function crearSupabaseMock(tablas: {
  products?: unknown[];
  product_variants?: unknown[];
  product_images?: unknown[];
  categories?: unknown[];
}) {
  const builders = {
    products: crearQueryBuilderMock(tablas.products ?? []),
    product_variants: crearQueryBuilderMock(tablas.product_variants ?? []),
    product_images: crearQueryBuilderMock(tablas.product_images ?? []),
    categories: crearQueryBuilderMock(tablas.categories ?? []),
  };
  const from = vi.fn((tabla: keyof typeof builders) => builders[tabla]);
  return { from, builders };
}

const PRODUCTO_BASE = {
  id: "prod-1",
  name: "Pijama Rosa",
  sku: "PIJ-001",
  price: 80000,
  promo_price: null,
  stock: 12,
  category_id: "cat-1",
};

describe("buscarProductosPos", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("query vacio y sin categoria: trae el catalogo activo, sin aplicar .or()", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(supabase.builders.products.or).not.toHaveBeenCalled();
    expect(supabase.builders.products.eq).toHaveBeenCalledWith("is_active", true);
    expect(supabase.builders.products.limit).toHaveBeenCalledWith(60);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("prod-1");
  });

  it("con categoria: filtra por category_id exacto", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "", categoryId: "cat-1" });

    expect(supabase.builders.products.eq).toHaveBeenCalledWith("category_id", "cat-1");
  });

  it("con texto: aplica .or() con nombre y sku", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "pijama", categoryId: null });

    expect(supabase.builders.products.or).toHaveBeenCalledWith(
      expect.stringContaining("name.ilike.%pijama%"),
    );
  });

  it("texto y categoria combinados: aplica ambos filtros a la vez", async () => {
    const supabase = crearSupabaseMock({ products: [PRODUCTO_BASE] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "pijama", categoryId: "cat-1" });

    expect(supabase.builders.products.or).toHaveBeenCalled();
    expect(supabase.builders.products.eq).toHaveBeenCalledWith("category_id", "cat-1");
  });

  it("siempre filtra por is_active, sin importar los demas filtros", async () => {
    const supabase = crearSupabaseMock({ products: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    await buscarProductosPos({ query: "algo", categoryId: "cat-9" });

    expect(supabase.builders.products.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("mapea imagen principal y variantes al resultado", async () => {
    const supabase = crearSupabaseMock({
      products: [PRODUCTO_BASE],
      product_variants: [
        {
          id: "var-1",
          product_id: "prod-1",
          talla: "M",
          color: "Rosa",
          sku: "PIJ-001-M-ROS",
          stock: 5,
          price_override: null,
        },
      ],
      product_images: [
        { id: "img-0", product_id: "prod-1", url: "https://cdn.example.com/img.jpg", variant_id: null, is_primary: true },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado[0].imageUrl).toBe("https://cdn.example.com/img.jpg");
    expect(resultado[0].variants).toEqual([
      {
        id: "var-1",
        talla: "M",
        color: "Rosa",
        sku: "PIJ-001-M-ROS",
        stock: 5,
        priceOverride: null,
        images: [],
      },
    ]);
  });

  it("agrupa las imagenes de cada variante por variant_id", async () => {
    const supabase = crearSupabaseMock({
      products: [PRODUCTO_BASE],
      product_variants: [
        {
          id: "var-1",
          product_id: "prod-1",
          talla: "M",
          color: "Rosa",
          sku: "PIJ-001-M-ROS",
          stock: 5,
          price_override: null,
        },
      ],
      product_images: [
        { id: "img-1", product_id: "prod-1", url: "https://cdn.example.com/1.jpg", alt: null, variant_id: "var-1", is_primary: true },
        { id: "img-2", product_id: "prod-1", url: "https://cdn.example.com/2.jpg", alt: null, variant_id: "var-1", is_primary: false },
        { id: "img-3", product_id: "prod-1", url: "https://cdn.example.com/3.jpg", alt: null, variant_id: null, is_primary: false },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado[0].imageUrl).toBe("https://cdn.example.com/1.jpg");
    expect(resultado[0].variants[0].images).toEqual([
      { imageId: "img-1", url: "https://cdn.example.com/1.jpg", alt: null },
      { imageId: "img-2", url: "https://cdn.example.com/2.jpg", alt: null },
    ]);
  });

  it("excluye un producto sin variantes cuyo stock es 0", async () => {
    const supabase = crearSupabaseMock({
      products: [{ ...PRODUCTO_BASE, id: "prod-agotado", stock: 0 }, PRODUCTO_BASE],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado.map((p) => p.id)).toEqual(["prod-1"]);
  });

  it("excluye un producto con variantes cuando TODAS sus variantes tienen stock 0", async () => {
    const supabase = crearSupabaseMock({
      products: [PRODUCTO_BASE],
      product_variants: [
        { id: "var-1", product_id: "prod-1", talla: "M", color: "Rosa", sku: "PIJ-001-M-ROS", stock: 0, price_override: null },
        { id: "var-2", product_id: "prod-1", talla: "L", color: "Rosa", sku: "PIJ-001-L-ROS", stock: 0, price_override: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado).toEqual([]);
  });

  it("incluye un producto con variantes si al menos una tiene stock, aunque el stock del producto sea 0", async () => {
    const supabase = crearSupabaseMock({
      products: [{ ...PRODUCTO_BASE, stock: 0 }],
      product_variants: [
        { id: "var-1", product_id: "prod-1", talla: "M", color: "Rosa", sku: "PIJ-001-M-ROS", stock: 0, price_override: null },
        { id: "var-2", product_id: "prod-1", talla: "L", color: "Rosa", sku: "PIJ-001-L-ROS", stock: 3, price_override: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado.map((p) => p.id)).toEqual(["prod-1"]);
  });

  it("sin productos, retorna [] sin consultar variantes ni imagenes", async () => {
    const supabase = crearSupabaseMock({ products: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { buscarProductosPos } = await import("../product-browser-action");
    const resultado = await buscarProductosPos({ query: "", categoryId: null });

    expect(resultado).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalledWith("product_variants");
  });
});

describe("listarCategoriasPos", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filtra activas, sin parent_id, ordenadas por sort_order", async () => {
    const supabase = crearSupabaseMock({
      categories: [{ id: "cat-1", name: "Pijamas", image_url: "https://cdn.example.com/cat.jpg" }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { listarCategoriasPos } = await import("../product-browser-action");
    const resultado = await listarCategoriasPos();

    expect(supabase.builders.categories.eq).toHaveBeenCalledWith("is_active", true);
    expect(supabase.builders.categories.is).toHaveBeenCalledWith("parent_id", null);
    expect(supabase.builders.categories.order).toHaveBeenCalledWith("sort_order");
    expect(resultado).toEqual([
      { id: "cat-1", name: "Pijamas", imageUrl: "https://cdn.example.com/cat.jpg" },
    ]);
  });

  it("mapea image_url null a imageUrl: null", async () => {
    const supabase = crearSupabaseMock({
      categories: [{ id: "cat-2", name: "Vestidos", image_url: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { listarCategoriasPos } = await import("../product-browser-action");
    const resultado = await listarCategoriasPos();

    expect(resultado).toEqual([{ id: "cat-2", name: "Vestidos", imageUrl: null }]);
  });
});

describe("obtenerUmbralStockBajoPos", () => {
  it("retorna el umbral de obtenerUmbralStockBajo", async () => {
    const { obtenerUmbralStockBajoPos } = await import("../product-browser-action");
    const resultado = await obtenerUmbralStockBajoPos();

    expect(resultado).toBe(7);
  });
});
