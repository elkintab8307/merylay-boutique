import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleCategoriaGastoButton } from "./toggle-categoria-gasto-button";

export default async function CategoriasGastoPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("expense_categories")
    .select("id, name, is_active")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Categorías de gasto
        </h1>
        <Link href="/admin/gastos/categorias/nueva">
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
              <th className="py-2">Activa</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(categorias ?? []).map((categoria) => (
              <tr key={categoria.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{categoria.name}</td>
                <td className="py-2">{categoria.is_active ? "Sí" : "No"}</td>
                <td className="flex gap-3 py-2">
                  <Link
                    href={`/admin/gastos/categorias/${categoria.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleCategoriaGastoButton
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
