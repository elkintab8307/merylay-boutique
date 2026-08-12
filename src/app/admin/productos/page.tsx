import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleProductoButton } from "./toggle-producto-button";

export default async function ProductosPage() {
  const supabase = await createClient();
  const [{ data: productos }, { data: categorias }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, stock, is_active, category_id")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name"),
  ]);

  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Productos</h1>
        <Link href="/admin/productos/nuevo">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nuevo producto
          </Button>
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Nombre</th>
              <th className="py-2">SKU</th>
              <th className="py-2">Categoría</th>
              <th className="py-2">Precio</th>
              <th className="py-2">Stock</th>
              <th className="py-2">Activo</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos?.map((producto) => (
              <tr key={producto.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{producto.name}</td>
                <td className="py-2 text-brand-ciruela/70">{producto.sku}</td>
                <td className="py-2">
                  {producto.category_id
                    ? (categoriaPorId.get(producto.category_id) ?? "—")
                    : "—"}
                </td>
                <td className="py-2">${producto.price}</td>
                <td className="py-2">{producto.stock}</td>
                <td className="py-2">{producto.is_active ? "Sí" : "No"}</td>
                <td className="flex gap-3 py-2">
                  <Link
                    href={`/admin/productos/${producto.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleProductoButton id={producto.id} isActive={producto.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
