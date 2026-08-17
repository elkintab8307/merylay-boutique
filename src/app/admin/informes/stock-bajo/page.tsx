import { createClient } from "@/lib/supabase/server";
import { obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

export default async function InformeStockBajoPage() {
  const supabase = await createClient();
  const umbral = await obtenerUmbralStockBajo();

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Producto</TableHeaderCell>
              <TableHeaderCell>SKU</TableHeaderCell>
              <TableHeaderCell>Stock</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {productosSinVariante.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.sku}</TableCell>
                <TableCell>{p.stock}</TableCell>
              </TableRow>
            ))}
            {(variantes ?? []).map((v) => (
              <TableRow key={v.id}>
                <TableCell>{nombrePorProductoId.get(v.product_id) ?? "-"} — {v.name}</TableCell>
                <TableCell>{v.sku}</TableCell>
                <TableCell>{v.stock}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
