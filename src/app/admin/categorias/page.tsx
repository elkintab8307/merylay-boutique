import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleCategoriaButton } from "./toggle-categoria-button";

export default async function CategoriasPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, is_active, parent_id")
    .order("sort_order", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Categorías
        </h1>
        <Link href="/admin/categorias/nueva">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nueva categoría
          </Button>
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Nombre</th>
              <th className="py-2">Slug</th>
              <th className="py-2">Orden</th>
              <th className="py-2">Activa</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {categorias?.map((categoria) => (
              <tr key={categoria.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{categoria.name}</td>
                <td className="py-2 text-brand-ciruela/70">{categoria.slug}</td>
                <td className="py-2">{categoria.sort_order}</td>
                <td className="py-2">{categoria.is_active ? "Sí" : "No"}</td>
                <td className="flex gap-3 py-2">
                  <Link
                    href={`/admin/categorias/${categoria.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleCategoriaButton
                    id={categoria.id}
                    isActive={categoria.is_active}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
