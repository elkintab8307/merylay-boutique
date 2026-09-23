import { describe, expect, it, vi } from "vitest";
import { cargarVentaEditable } from "../cargar-venta-editable";

// Cliente falso: cada tabla devuelve siempre sus filas, sin importar los
// filtros encadenados (.eq/.in/...). Solo interesa como se arma el resultado.
function crearSupabase(tablas: Record<string, unknown>) {
  const from = vi.fn((tabla: string) => {
    const resultado = { data: tablas[tabla] ?? null, error: null };
    const builder: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "in"]) builder[metodo] = () => builder;
    builder.single = () => Promise.resolve(resultado);
    builder.then = (resolve: (v: typeof resultado) => void) => resolve(resultado);
    return builder;
  });
  return { from } as never;
}

describe("cargarVentaEditable", () => {
  it("devuelve null si la venta no existe", async () => {
    const supabase = crearSupabase({});
    expect(await cargarVentaEditable(supabase, "no-existe")).toBeNull();
  });

  it("arma los items con nombre de variante y el stock editable (actual + lo ya vendido)", async () => {
    const supabase = crearSupabase({
      pos_sales: {
        id: "v1",
        discount: 0,
        payment_method: "efectivo",
        customer_id: null,
        total: 70000,
      },
      pos_sale_items: [
        { qty: 2, unit_price: 35000, product_id: "p1", variant_id: "var1", image_id: null },
      ],
      products: [{ id: "p1", name: "Camiseta", stock: 9 }],
      product_variants: [{ id: "var1", talla: "M", color: "Rosa", stock: 3 }],
    });

    const resultado = await cargarVentaEditable(supabase, "v1");

    expect(resultado?.itemsIniciales).toEqual([
      expect.objectContaining({
        productId: "p1",
        variantId: "var1",
        name: "Camiseta (M / Rosa)",
        unitPrice: 35000,
        qty: 2,
        stock: 5,
      }),
    ]);
    expect(resultado?.abonado).toBe(0);
    expect(resultado?.cliente).toBeNull();
  });

  it("en un credito suma los abonos y trae el cliente", async () => {
    const supabase = crearSupabase({
      pos_sales: {
        id: "v2",
        discount: 5000,
        payment_method: "credito",
        customer_id: "c1",
        total: 105000,
      },
      pos_sale_items: [],
      credit_payments: [{ amount: 20000 }, { amount: 15000 }],
      pos_customers: { id: "c1", nombre: "Carolina", telefono: "312823546" },
    });

    const resultado = await cargarVentaEditable(supabase, "v2");

    expect(resultado?.venta.payment_method).toBe("credito");
    expect(resultado?.abonado).toBe(35000);
    expect(resultado?.cliente).toEqual({ id: "c1", nombre: "Carolina", telefono: "312823546" });
  });
});
