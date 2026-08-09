import { createClient } from "@/lib/supabase/server";
import { STORE_SETTINGS_KEYS } from "@/lib/validation/store-settings";

const UMBRAL_POR_DEFECTO = 5;

export default async function InformeStockBajoPage() {
  const supabase = await createClient();

  const { data: ajuste } = await supabase
    .from("store_settings")
    .select("value")
    .eq("key", STORE_SETTINGS_KEYS.stockBajoUmbral)
    .maybeSingle();
  const umbral = Number(ajuste?.value ?? UMBRAL_POR_DEFECTO);

  const { data: productos, error: errorProductos } = await supabase
    .from("products")
    .select("id, name, sku, stock")
    .eq("is_active", true)
    .lte("stock", umbral)
    .order("stock");

  const { data: variantes, error: errorVariantes } = await supabase
    .from("product_variants")
    .select("id, name, sku, stock, product_id")
    .lte("stock", umbral)
    .order("stock");

  const error = errorProductos || errorVariantes;

  const idsCandidatos = Array.from(
    new Set([
      ...(productos ?? []).map((p) => p.id),
      ...(variantes ?? []).map((v) => v.product_id),
    ]),
  );

  const idsConVariante = new Set<string>();
  const nombrePorProductoId = new Map<string, string>();

  if (idsCandidatos.length > 0) {
    const { data: productosConVariante } = await supabase
      .from("product_variants")
      .select("product_id")
      .in("product_id", idsCandidatos);
    for (const v of productosConVariante ?? []) {
      idsConVariante.add(v.product_id);
    }

    const { data: productosRelacionados } = await supabase
      .from("products")
      .select("id, name")
      .in("id", idsCandidatos);
    for (const p of productosRelacionados ?? []) {
      nombrePorProductoId.set(p.id, p.name);
    }
  }

  const productosSinVariante = (productos ?? []).filter(
    (p) => !idsConVariante.has(p.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Stock bajo
      </h1>
      <p className="text-sm text-brand-ciruela/70">
        Productos y variantes con {umbral} unidades o menos. El umbral se
        edita en Ajustes de tienda.
      </p>
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de stock bajo.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Producto</th>
              <th className="py-2">SKU</th>
              <th className="py-2">Stock</th>
            </tr>
          </thead>
          <tbody>
            {productosSinVariante.map((p) => (
              <tr key={p.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{p.name}</td>
                <td className="py-2">{p.sku}</td>
                <td className="py-2">{p.stock}</td>
              </tr>
            ))}
            {(variantes ?? []).map((v) => (
              <tr key={v.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">
                  {nombrePorProductoId.get(v.product_id) ?? "-"} — {v.name}
                </td>
                <td className="py-2">{v.sku}</td>
                <td className="py-2">{v.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
