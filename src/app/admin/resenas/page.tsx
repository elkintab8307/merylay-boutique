import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleResenaButton } from "./toggle-resena-button";

export default async function ResenasPage() {
  const supabase = await createClient();
  const { data: resenas } = await supabase
    .from("reviews")
    .select("id, customer_name, rating, sort_order, is_active")
    .order("sort_order", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Reseñas</h1>
        <Link href="/admin/resenas/nueva">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nueva reseña
          </Button>
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Clienta</th>
              <th className="py-2">Calificación</th>
              <th className="py-2">Orden</th>
              <th className="py-2">Activa</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {resenas?.map((resena) => (
              <tr key={resena.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{resena.customer_name}</td>
                <td className="py-2">{resena.rating} / 5</td>
                <td className="py-2">{resena.sort_order}</td>
                <td className="py-2">{resena.is_active ? "Sí" : "No"}</td>
                <td className="flex gap-3 py-2">
                  <Link
                    href={`/admin/resenas/${resena.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleResenaButton id={resena.id} isActive={resena.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
